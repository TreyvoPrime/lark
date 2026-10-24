package app.lark.mobile;

import android.os.Build;
import android.system.Os;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.tukaani.xz.XZInputStream;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Downloads an Android OpenJDK JRE, stages Lark + ECJ, and starts a local
 * Lark Mobile engine on 127.0.0.1. Host-pairing remains the fallback when
 * the OS blocks executing a downloaded binary (common on Android 10+).
 */
@CapacitorPlugin(name = "LarkEngine")
public class LarkEnginePlugin extends Plugin {
    private static final String TAG = "LarkEngine";
    private static final int PORT = 43127;
    private static final String POJAV_BASE =
            "https://github.com/PojavLauncherTeam/android-openjdk-build-multiarch/releases/download/jre17-ec28559/";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicReference<Process> engine = new AtomicReference<>();

    @PluginMethod
    public void status(PluginCall call) {
        JSObject out = new JSObject();
        File root = engineRoot();
        File javaBin = javaBinary(root);
        out.put("abi", abi());
        out.put("installed", javaBin.isFile());
        out.put("running", engine.get() != null && engine.get().isAlive());
        out.put("port", PORT);
        out.put("url", "http://127.0.0.1:" + PORT + "/");
        out.put("engineDir", root.getAbsolutePath());
        out.put("androidSdk", Build.VERSION.SDK_INT);
        call.resolve(out);
    }

    @PluginMethod
    public void install(PluginCall call) {
        io.execute(() -> {
            try {
                installEngine((pct, msg) -> {
                    JSObject progress = new JSObject();
                    progress.put("percent", pct);
                    progress.put("message", msg);
                    notifyListeners("engineProgress", progress);
                });
                JSObject out = new JSObject();
                out.put("ok", true);
                out.put("abi", abi());
                out.put("engineDir", engineRoot().getAbsolutePath());
                getActivity().runOnUiThread(() -> call.resolve(out));
            } catch (Exception e) {
                Log.e(TAG, "install failed", e);
                getActivity().runOnUiThread(() -> call.reject(e.getMessage() == null ? "Install failed" : e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void start(PluginCall call) {
        io.execute(() -> {
            try {
                String url = startEngine();
                JSObject out = new JSObject();
                out.put("ok", true);
                out.put("url", url);
                out.put("port", PORT);
                getActivity().runOnUiThread(() -> call.resolve(out));
            } catch (Exception e) {
                Log.e(TAG, "start failed", e);
                String msg = e.getMessage() == null ? "Could not start local engine" : e.getMessage();
                if (msg.toLowerCase(Locale.ROOT).contains("permission")
                        || msg.toLowerCase(Locale.ROOT).contains("denied")
                        || (e instanceof java.io.IOException && Build.VERSION.SDK_INT >= 29)) {
                    msg = msg + " — Android may block running a downloaded JDK. Use Wi‑Fi host pairing, "
                            + "or a future APK build that embeds the engine binaries.";
                }
                String finalMsg = msg;
                getActivity().runOnUiThread(() -> call.reject(finalMsg));
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopEngine();
        JSObject out = new JSObject();
        out.put("ok", true);
        call.resolve(out);
    }

    private interface Progress {
        void on(int percent, String message);
    }

    private File engineRoot() {
        return new File(getContext().getFilesDir(), "lark-engine");
    }

    private File jreDir(File root) {
        return new File(root, "jre");
    }

    private File javaBinary(File root) {
        // Prefer a copy in codeCache (sometimes executable); fall back to jre/bin/java.
        File cached = new File(getContext().getCodeCacheDir(), "lark-java");
        if (cached.isFile()) return cached;
        return new File(jreDir(root), "bin/java");
    }

    private static String abi() {
        String[] abis = Build.SUPPORTED_ABIS;
        if (abis == null || abis.length == 0) return "arm64-v8a";
        return abis[0];
    }

    private static String jreAssetName(String abi) {
        switch (abi) {
            case "armeabi-v7a":
            case "armeabi":
                return "jre17-arm-20210914-release.tar.xz";
            case "x86":
                return "jre17-x86-20220225-release.tar.xz";
            case "x86_64":
                return "jre17-x86_64-20210825-release.tar.xz";
            case "arm64-v8a":
            default:
                return "jre17-arm64-20210825-release.tar.xz";
        }
    }

    private void installEngine(Progress progress) throws Exception {
        File root = engineRoot();
        if (!root.exists() && !root.mkdirs()) {
            throw new IllegalStateException("Could not create engine folder.");
        }
        progress.on(5, "Copying Lark engine files…");
        copyAsset("engine/lark.jar", new File(root, "lark.jar"));
        copyAsset("engine/ecj.jar", new File(root, "ecj.jar"));

        File jre = jreDir(root);
        File marker = new File(jre, ".lark-jre-ok");
        if (!marker.isFile()) {
            String asset = jreAssetName(abi());
            File archive = new File(root, asset);
            progress.on(10, "Downloading Android JRE (" + abi() + ")…");
            download(POJAV_BASE + asset, archive, progress);
            progress.on(70, "Extracting JRE…");
            if (jre.exists()) deleteRecursive(jre);
            if (!jre.mkdirs()) throw new IllegalStateException("Could not create JRE folder.");
            extractTarXz(archive, jre);
            // Some archives nest one folder — flatten if needed.
            flattenIfSingleChild(jre);
            //noinspection ResultOfMethodCallIgnored
            marker.createNewFile();
            //noinspection ResultOfMethodCallIgnored
            archive.delete();
        }
        progress.on(90, "Preparing java launcher…");
        stageJavaLauncher(root);
        progress.on(100, "Engine ready.");
    }

    private void stageJavaLauncher(File root) throws Exception {
        File src = findJavaInJre(jreDir(root));
        if (src == null || !src.isFile()) {
            throw new IllegalStateException("Downloaded JRE is missing bin/java.");
        }
        File dest = new File(getContext().getCodeCacheDir(), "lark-java");
        copyFile(src, dest);
        try {
            Os.chmod(dest.getAbsolutePath(), 0700);
        } catch (Exception e) {
            // Best-effort; some devices still refuse exec.
            Log.w(TAG, "chmod java launcher: " + e.getMessage());
        }
        try {
            Os.chmod(src.getAbsolutePath(), 0700);
        } catch (Exception ignored) {
        }
    }

    private File findJavaInJre(File jre) {
        File direct = new File(jre, "bin/java");
        if (direct.isFile()) return direct;
        File[] kids = jre.listFiles();
        if (kids == null) return null;
        for (File kid : kids) {
            File nested = new File(kid, "bin/java");
            if (nested.isFile()) return nested;
        }
        return null;
    }

    private String startEngine() throws Exception {
        File root = engineRoot();
        File larkJar = new File(root, "lark.jar");
        File ecjJar = new File(root, "ecj.jar");
        File jre = jreDir(root);
        File javaBin = javaBinary(root);
        if (!larkJar.isFile() || !ecjJar.isFile() || !javaBin.isFile()) {
            throw new IllegalStateException("Engine not installed yet. Tap Install on-device engine first.");
        }

        stopEngine();

        File work = new File(root, "work");
        if (!work.exists() && !work.mkdirs()) {
            throw new IllegalStateException("Could not create work folder.");
        }

        File javaHome = findJavaHome(jre);
        ProcessBuilder pb = new ProcessBuilder(
                javaBin.getAbsolutePath(),
                "-Xmx384m",
                "-Dfile.encoding=UTF-8",
                "-Dlark.ecj=" + ecjJar.getAbsolutePath(),
                "-Dlark.mobile=true",
                "-Dlark.channel=mobile",
                "-Dlark.shell=false",
                "-cp",
                larkJar.getAbsolutePath(),
                "lark.Mobile",
                "--port",
                String.valueOf(PORT),
                "--no-browser",
                "--local-only"
        );
        pb.directory(work);
        pb.redirectErrorStream(true);
        String lib = new File(javaHome, "lib").getAbsolutePath();
        String server = new File(javaHome, "lib/server").getAbsolutePath();
        String j9vm = new File(javaHome, "lib/j9vm").getAbsolutePath();
        pb.environment().put("JAVA_HOME", javaHome.getAbsolutePath());
        pb.environment().put("LD_LIBRARY_PATH", lib + ":" + server + ":" + j9vm + ":" + lib);
        pb.environment().put("LANG", "C.UTF-8");

        Process proc = pb.start();
        engine.set(proc);
        // Drain output so the process cannot block on a full pipe.
        io.execute(() -> {
            try (InputStream in = proc.getInputStream()) {
                byte[] buf = new byte[4096];
                while (in.read(buf) >= 0) {
                    // intentionally discarded (boot logs)
                }
            } catch (Exception ignored) {
            }
        });

        // Wait until /api/health answers.
        long deadline = System.currentTimeMillis() + 45_000;
        Exception last = null;
        while (System.currentTimeMillis() < deadline) {
            if (!proc.isAlive()) {
                throw new IllegalStateException(
                        "Local Java exited immediately. This Android build may block executing the JDK.");
            }
            try {
                HttpURLConnection c = (HttpURLConnection)
                        new URL("http://127.0.0.1:" + PORT + "/api/health").openConnection();
                c.setConnectTimeout(800);
                c.setReadTimeout(800);
                c.connect();
                int code = c.getResponseCode();
                c.disconnect();
                if (code == 200) {
                    return "http://127.0.0.1:" + PORT + "/";
                }
            } catch (Exception e) {
                last = e;
            }
            try {
                Thread.sleep(400);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        stopEngine();
        throw new IllegalStateException(
                last == null ? "Engine started but never became ready." : last.getMessage());
    }

    private File findJavaHome(File jre) {
        if (new File(jre, "lib").isDirectory()) return jre;
        File[] kids = jre.listFiles();
        if (kids != null) {
            for (File kid : kids) {
                if (new File(kid, "lib").isDirectory()) return kid;
            }
        }
        return jre;
    }

    private void stopEngine() {
        Process proc = engine.getAndSet(null);
        if (proc != null) {
            proc.destroy();
            try {
                if (!proc.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)) {
                    proc.destroyForcibly();
                }
            } catch (Exception ignored) {
                proc.destroyForcibly();
            }
        }
    }

    private void copyAsset(String assetPath, File dest) throws Exception {
        File parent = dest.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("mkdir failed for " + parent);
        }
        try (InputStream in = getContext().getAssets().open(assetPath);
             OutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
        }
    }

    private void download(String url, File dest, Progress progress) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(30_000);
        conn.setReadTimeout(120_000);
        conn.connect();
        int code = conn.getResponseCode();
        if (code >= 300 && code < 400) {
            String loc = conn.getHeaderField("Location");
            conn.disconnect();
            download(loc, dest, progress);
            return;
        }
        if (code != 200) {
            conn.disconnect();
            throw new IllegalStateException("Download failed HTTP " + code);
        }
        long total = conn.getContentLengthLong();
        long read = 0;
        try (InputStream in = new BufferedInputStream(conn.getInputStream());
             OutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int n;
            int lastPct = 10;
            while ((n = in.read(buf)) >= 0) {
                out.write(buf, 0, n);
                read += n;
                if (total > 0) {
                    int pct = (int) (10 + (read * 55) / total);
                    if (pct >= lastPct + 5) {
                        lastPct = pct;
                        progress.on(pct, "Downloading… " + (read / (1024 * 1024)) + " MB");
                    }
                }
            }
        } finally {
            conn.disconnect();
        }
    }

    private void extractTarXz(File archive, File dest) throws Exception {
        try (InputStream fin = new BufferedInputStream(new java.io.FileInputStream(archive));
             XZInputStream xz = new XZInputStream(fin);
             TarArchiveInputStream tar = new TarArchiveInputStream(xz)) {
            TarArchiveEntry entry;
            while ((entry = tar.getNextEntry()) != null) {
                File out = new File(dest, entry.getName());
                if (entry.isDirectory()) {
                    if (!out.exists() && !out.mkdirs()) {
                        throw new IllegalStateException("mkdir " + out);
                    }
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) {
                    throw new IllegalStateException("mkdir " + parent);
                }
                try (OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = tar.read(buf)) >= 0) os.write(buf, 0, n);
                }
                if ((entry.getMode() & 0100) != 0) {
                    try {
                        Os.chmod(out.getAbsolutePath(), 0755);
                    } catch (Exception ignored) {
                    }
                }
            }
        }
    }

    private void flattenIfSingleChild(File jre) {
        File java = new File(jre, "bin/java");
        if (java.isFile()) return;
        File[] kids = jre.listFiles();
        if (kids == null || kids.length != 1 || !kids[0].isDirectory()) return;
        File nested = kids[0];
        if (!new File(nested, "bin/java").isFile() && !new File(nested, "lib").isDirectory()) return;
        File tmp = new File(jre.getParentFile(), "jre-flat-tmp");
        //noinspection ResultOfMethodCallIgnored
        deleteRecursive(tmp);
        //noinspection ResultOfMethodCallIgnored
        nested.renameTo(tmp);
        //noinspection ResultOfMethodCallIgnored
        deleteRecursive(jre);
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(jre);
    }

    private static void copyFile(File src, File dest) throws Exception {
        File parent = dest.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("mkdir " + parent);
        }
        try (InputStream in = new java.io.FileInputStream(src);
             OutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
        }
    }

    private static void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) {
            for (File k : kids) deleteRecursive(k);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    @Override
    protected void handleOnDestroy() {
        stopEngine();
        super.handleOnDestroy();
    }
}
