package app.lark.mobile;

import android.content.pm.ApplicationInfo;
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
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Runs Lark Mobile fully on-device inside the APK.
 *
 * Android 10+ blocks executing binaries from writable app dirs. The reliable
 * path is to ship {@code liblarkjava.so} (+ JRE {@code *.so}) in jniLibs so
 * they land in {@code nativeLibraryDir} (executable), extract JAVA_HOME support
 * files from assets, and start {@code lark.Mobile} on 127.0.0.1.
 *
 * Download + linker fallback remain for ABIs without bundled natives.
 */
@CapacitorPlugin(name = "LarkEngine")
public class LarkEnginePlugin extends Plugin {
    private static final String TAG = "LarkEngine";
    private static final int PORT = 43127;
    private static final String POJAV_BASE =
            "https://github.com/PojavLauncherTeam/android-openjdk-build-multiarch/releases/download/jre17-ec28559/";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicReference<Process> engine = new AtomicReference<>();
    private final AtomicReference<String> lastBootLog = new AtomicReference<>("");

    @PluginMethod
    public void status(PluginCall call) {
        JSObject out = new JSObject();
        File root = engineRoot();
        File javaBin = resolveJavaBinary(root);
        boolean bundled = bundledJava() != null;
        out.put("abi", abi());
        out.put("installed", javaBin != null && javaBin.isFile() && new File(root, "lark.jar").isFile());
        out.put("bundled", bundled);
        out.put("running", engine.get() != null && engine.get().isAlive());
        out.put("port", PORT);
        out.put("url", "http://127.0.0.1:" + PORT + "/");
        out.put("engineDir", root.getAbsolutePath());
        out.put("androidSdk", Build.VERSION.SDK_INT);
        out.put("javaPath", javaBin == null ? "" : javaBin.getAbsolutePath());
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
                out.put("bundled", bundledJava() != null);
                out.put("engineDir", engineRoot().getAbsolutePath());
                getActivity().runOnUiThread(() -> call.resolve(out));
            } catch (Exception e) {
                Log.e(TAG, "install failed", e);
                getActivity().runOnUiThread(() ->
                        call.reject(e.getMessage() == null ? "Install failed" : e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void start(PluginCall call) {
        io.execute(() -> {
            try {
                // First launch: stage bundled JRE automatically.
                if (!new File(engineRoot(), "lark.jar").isFile() || resolveJavaBinary(engineRoot()) == null) {
                    installEngine((pct, msg) -> {
                        JSObject progress = new JSObject();
                        progress.put("percent", pct);
                        progress.put("message", msg);
                        notifyListeners("engineProgress", progress);
                    });
                }
                String url = startEngine();
                JSObject out = new JSObject();
                out.put("ok", true);
                out.put("url", url);
                out.put("port", PORT);
                getActivity().runOnUiThread(() -> call.resolve(out));
            } catch (Exception e) {
                Log.e(TAG, "start failed", e);
                String msg = e.getMessage() == null ? "Could not start local engine" : e.getMessage();
                String boot = lastBootLog.get();
                if (boot != null && !boot.isBlank()) {
                    msg = msg + " — " + boot.trim();
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

    private File bundledJava() {
        try {
            ApplicationInfo info = getContext().getApplicationInfo();
            if (info.nativeLibraryDir == null) return null;
            File so = new File(info.nativeLibraryDir, "liblarkjava.so");
            return so.isFile() ? so : null;
        } catch (Exception e) {
            return null;
        }
    }

    private File resolveJavaBinary(File root) {
        File bundled = bundledJava();
        if (bundled != null) return bundled;
        File soNamed = new File(getContext().getCodeCacheDir(), "liblarkjava.so");
        if (soNamed.isFile()) return soNamed;
        File cached = new File(getContext().getCodeCacheDir(), "lark-java");
        if (cached.isFile()) return cached;
        File found = findJavaInJre(jreDir(root));
        return found != null && found.isFile() ? found : null;
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
            String abi = abi();
            String bundledAsset = "engine/jre-" + abi + ".tar.xz";
            File archive = new File(root, "jre-" + abi + ".tar.xz");
            if (assetExists(bundledAsset)) {
                progress.on(15, "Unpacking bundled Android JRE…");
                copyAsset(bundledAsset, archive);
            } else {
                String remote = jreAssetName(abi);
                progress.on(10, "Downloading Android JRE (" + abi + ")…");
                download(POJAV_BASE + remote, archive, progress);
            }
            progress.on(70, "Extracting JRE…");
            if (jre.exists()) deleteRecursive(jre);
            if (!jre.mkdirs()) throw new IllegalStateException("Could not create JRE folder.");
            extractTarXz(archive, jre);
            flattenIfSingleChild(jre);
            //noinspection ResultOfMethodCallIgnored
            marker.createNewFile();
            //noinspection ResultOfMethodCallIgnored
            archive.delete();
        }
        progress.on(85, "Linking native libraries…");
        chmodTree(jre);
        linkNativeLibsIntoJre(jre);
        progress.on(92, "Preparing java launcher…");
        stageJavaLauncher(root);
        progress.on(100, "Engine ready on this phone.");
    }

    /** Point JAVA_HOME lib/*.so at the executable copies in nativeLibraryDir when present. */
    private void linkNativeLibsIntoJre(File jre) {
        File nativeDir = bundledJava() == null ? null : bundledJava().getParentFile();
        if (nativeDir == null || !nativeDir.isDirectory()) return;
        File javaHome = findJavaHome(jre);
        File lib = new File(javaHome, "lib");
        if (!lib.isDirectory()) return;
        File[] sos = nativeDir.listFiles((dir, name) -> name.endsWith(".so") && !name.equals("liblarkjava.so"));
        if (sos == null) return;
        for (File so : sos) {
            File dest = new File(lib, so.getName());
            // Prefer real files already extracted; only fill gaps / replace with executable peers.
            try {
                if (dest.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    dest.delete();
                }
                Os.symlink(so.getAbsolutePath(), dest.getAbsolutePath());
            } catch (Exception e) {
                try {
                    copyFile(so, dest);
                } catch (Exception ignored) {
                }
            }
        }
        // HotSpot often wants lib/server/libjvm.so
        File server = new File(lib, "server");
        File jvm = new File(nativeDir, "libjvm.so");
        if (jvm.isFile()) {
            //noinspection ResultOfMethodCallIgnored
            server.mkdirs();
            File dest = new File(server, "libjvm.so");
            try {
                if (dest.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    dest.delete();
                }
                Os.symlink(jvm.getAbsolutePath(), dest.getAbsolutePath());
            } catch (Exception e) {
                try {
                    copyFile(jvm, dest);
                } catch (Exception ignored) {
                }
            }
        }
    }

    private void stageJavaLauncher(File root) throws Exception {
        // Bundled liblarkjava.so is preferred at start time; still stage codeCache copies
        // for ABIs that only have a downloaded JRE.
        if (bundledJava() != null) return;
        File src = findJavaInJre(jreDir(root));
        if (src == null || !src.isFile()) {
            throw new IllegalStateException("JRE is missing bin/java.");
        }
        File cache = getContext().getCodeCacheDir();
        if (!cache.exists() && !cache.mkdirs()) {
            throw new IllegalStateException("Could not create code cache.");
        }
        File plain = new File(cache, "lark-java");
        File soNamed = new File(cache, "liblarkjava.so");
        copyFile(src, plain);
        copyFile(src, soNamed);
        for (File dest : new File[] { plain, soNamed, src }) {
            try {
                Os.chmod(dest.getAbsolutePath(), 0700);
            } catch (Exception e) {
                Log.w(TAG, "chmod java launcher: " + e.getMessage());
            }
        }
    }

    private void chmodTree(File dir) {
        if (dir == null || !dir.exists()) return;
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File kid : kids) {
            if (kid.isDirectory()) {
                chmodTree(kid);
            } else {
                String name = kid.getName();
                boolean likelyExec = name.equals("java")
                        || name.endsWith(".so")
                        || (kid.getParentFile() != null && "bin".equals(kid.getParentFile().getName()));
                if (likelyExec) {
                    try {
                        Os.chmod(kid.getAbsolutePath(), 0755);
                    } catch (Exception ignored) {
                    }
                }
            }
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
        File javaBin = resolveJavaBinary(root);
        if (!larkJar.isFile() || !ecjJar.isFile() || javaBin == null || !javaBin.isFile()) {
            throw new IllegalStateException("Engine not ready. Tap Start on this phone once to install.");
        }

        stopEngine();
        linkNativeLibsIntoJre(jre);

        File work = new File(root, "work");
        if (!work.exists() && !work.mkdirs()) {
            throw new IllegalStateException("Could not create work folder.");
        }

        File javaHome = findJavaHome(jre);
        List<String> jvmArgs = List.of(
                "-Xmx384m",
                "-Dfile.encoding=UTF-8",
                "-Dlark.ecj=" + ecjJar.getAbsolutePath(),
                "-Dlark.mobile=true",
                "-Dlark.channel=mobile",
                "-Dlark.shell=false",
                "-Djava.home=" + javaHome.getAbsolutePath(),
                "-cp",
                larkJar.getAbsolutePath(),
                "lark.Mobile",
                "--port",
                String.valueOf(PORT),
                "--no-browser",
                "--local-only"
        );

        String lib = new File(javaHome, "lib").getAbsolutePath();
        String server = new File(javaHome, "lib/server").getAbsolutePath();
        String j9vm = new File(javaHome, "lib/j9vm").getAbsolutePath();
        String nativeDir = javaBin.getParentFile() != null ? javaBin.getParentFile().getAbsolutePath() : lib;
        String ld = nativeDir + ":" + lib + ":" + server + ":" + j9vm;

        List<List<String>> attempts = new ArrayList<>();
        // 1) Direct exec of bundled/native java (works when file is in nativeLibraryDir).
        List<String> direct = new ArrayList<>();
        direct.add(javaBin.getAbsolutePath());
        direct.addAll(jvmArgs);
        attempts.add(direct);
        // 2) System ELF linker — bypasses W^X on many Android 10–14 builds.
        for (File linker : linkerCandidates()) {
            if (!linker.isFile()) continue;
            List<String> viaLinker = new ArrayList<>();
            viaLinker.add(linker.getAbsolutePath());
            viaLinker.add(javaBin.getAbsolutePath());
            viaLinker.addAll(jvmArgs);
            attempts.add(viaLinker);
        }
        // 3) filesDir java via linker if different from javaBin.
        File filesJava = findJavaInJre(jre);
        if (filesJava != null && filesJava.isFile()
                && !filesJava.getAbsolutePath().equals(javaBin.getAbsolutePath())) {
            for (File linker : linkerCandidates()) {
                if (!linker.isFile()) continue;
                List<String> viaLinker = new ArrayList<>();
                viaLinker.add(linker.getAbsolutePath());
                viaLinker.add(filesJava.getAbsolutePath());
                viaLinker.addAll(jvmArgs);
                attempts.add(viaLinker);
            }
        }

        Exception last = null;
        for (List<String> cmd : attempts) {
            try {
                Process proc = launch(cmd, work, javaHome, ld);
                if (waitUntilHealthy(proc)) {
                    return "http://127.0.0.1:" + PORT + "/";
                }
                last = new IllegalStateException("Engine started but never became ready.");
            } catch (Exception e) {
                last = e;
                Log.w(TAG, "start attempt failed: " + cmd.get(0) + " → " + e.getMessage());
                stopEngine();
            }
        }
        throw last == null
                ? new IllegalStateException("Could not start on-device Java.")
                : last;
    }

    private Process launch(List<String> cmd, File work, File javaHome, String ldLibraryPath) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(work);
        pb.redirectErrorStream(true);
        pb.environment().put("JAVA_HOME", javaHome.getAbsolutePath());
        pb.environment().put("LD_LIBRARY_PATH", ldLibraryPath);
        pb.environment().put("LANG", "C.UTF-8");
        Process proc = pb.start();
        engine.set(proc);
        lastBootLog.set("");
        ByteArrayOutputStream boot = new ByteArrayOutputStream(8192);
        io.execute(() -> {
            try (InputStream in = proc.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) >= 0) {
                    if (boot.size() < 12_000) boot.write(buf, 0, Math.min(n, 12_000 - boot.size()));
                }
            } catch (Exception ignored) {
            } finally {
                lastBootLog.set(boot.toString());
            }
        });
        return proc;
    }

    private boolean waitUntilHealthy(Process proc) throws Exception {
        long deadline = System.currentTimeMillis() + 50_000;
        while (System.currentTimeMillis() < deadline) {
            if (!proc.isAlive()) {
                String boot = lastBootLog.get();
                throw new IllegalStateException(
                        "Local Java exited immediately"
                                + (boot == null || boot.isBlank() ? "" : ": " + trimBoot(boot)));
            }
            try {
                HttpURLConnection c = (HttpURLConnection)
                        new URL("http://127.0.0.1:" + PORT + "/api/health").openConnection();
                c.setConnectTimeout(800);
                c.setReadTimeout(800);
                c.connect();
                int code = c.getResponseCode();
                c.disconnect();
                if (code == 200) return true;
            } catch (Exception ignored) {
            }
            try {
                Thread.sleep(350);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        stopEngine();
        return false;
    }

    private static String trimBoot(String boot) {
        String t = boot.replace('\n', ' ').replace('\r', ' ').trim();
        return t.length() > 240 ? t.substring(t.length() - 240) : t;
    }

    private static File[] linkerCandidates() {
        return new File[] {
                new File("/system/bin/linker64"),
                new File("/apex/com.android.runtime/bin/linker64"),
                new File("/system/bin/linker"),
                new File("/apex/com.android.runtime/bin/linker")
        };
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
                if (!proc.waitFor(2, TimeUnit.SECONDS)) {
                    proc.destroyForcibly();
                }
            } catch (Exception ignored) {
                proc.destroyForcibly();
            }
        }
    }

    private boolean assetExists(String assetPath) {
        try (InputStream in = getContext().getAssets().open(assetPath)) {
            return in != null;
        } catch (Exception e) {
            return false;
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
