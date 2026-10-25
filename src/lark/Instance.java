package lark;

import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * One Lark process per channel (portable / desktop / executable / mobile).
 * Uses an advisory file lock under {@code ~/.lark} plus a port file so a second
 * launch focuses the running window instead of starting another JVM.
 */
public final class Instance {
    private static final int DEFAULT_PORT = 43123;
    private static RandomAccessFile lockRaf;
    private static FileLock lock;
    private static String channel = "portable";
    private static boolean replaceMode;

    private Instance() {}

    public static int defaultPort() {
        return DEFAULT_PORT;
    }

    public static void configure(String channelName, boolean replace) {
        channel = channelName == null || channelName.isBlank() ? "portable" : channelName.trim().toLowerCase(Locale.ROOT);
        replaceMode = replace;
    }

    public static String channel() {
        return channel;
    }

    public static boolean isReplaceMode() {
        return replaceMode;
    }

    private static Path dir() {
        return Settings.home().resolve("instance");
    }

    private static Path lockPath() {
        return dir().resolve(channel + ".lock");
    }

    private static Path portPath() {
        return dir().resolve(channel + ".port");
    }

    private static Path restartPath() {
        return dir().resolve(channel + ".restart");
    }

    /**
     * Acquire the single-instance lock. If another Lark is running and this is
     * not a post-update replace, focuses that window and returns false.
     */
    public static boolean acquireOrFocus(boolean openBrowser) throws Exception {
        Files.createDirectories(dir());
        if (replaceMode) {
            waitForPreviousExit(12_000);
        }
        lockRaf = new RandomAccessFile(lockPath().toFile(), "rw");
        FileChannel ch = lockRaf.getChannel();
        lock = ch.tryLock();
        if (lock == null) {
            if (replaceMode) {
                // Previous process still holding — wait a bit more.
                waitForPreviousExit(8_000);
                lock = ch.tryLock();
            }
        }
        if (lock == null) {
            Integer port = readPort();
            String url = runningUrl();
            if (url != null && port != null) {
                // Bump focus so a live tab can window.focus(); also try OS raise.
                signalFocus(port);
                boolean raised = AppWindow.focusExisting();
                if (raised) {
                    System.out.println("Lark is already open — bringing that window forward.");
                } else if (openBrowser) {
                    // Server is up but no visible window (common after an update when the
                    // old Chromium profile still holds the lock, or the UI was closed).
                    // Never exit silently — always reopen.
                    System.out.println("Lark is running — opening the window.");
                    AppWindow.open(url);
                } else {
                    System.out.println("Lark is already running at " + url);
                }
            } else {
                System.out.println("Another Lark seems to be running. Close it, then try again.");
            }
            try {
                lockRaf.close();
            } catch (IOException ignored) {
                // ignore
            }
            lockRaf = null;
            return false;
        }
        Runtime.getRuntime().addShutdownHook(new Thread(Instance::releaseQuietly, "lark-instance-unlock"));
        return true;
    }

    /**
     * Ask the running UI to come forward (bump focus seq for live tabs).
     * Returns true when the HTTP call succeeds — does <em>not</em> mean a
     * window was raised; callers must check {@link AppWindow#focusExisting()}.
     */
    public static boolean signalFocus(int port) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) URI.create("http://127.0.0.1:" + port + "/api/focus").toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(600);
            conn.setReadTimeout(900);
            conn.setDoOutput(true);
            conn.setRequestProperty("X-Lark", "1");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Content-Length", "2");
            try (OutputStream out = conn.getOutputStream()) {
                out.write("{}".getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Tray / Open: raise the existing window, or open one if none is visible. */
    public static void focusOrOpen(String url) {
        Integer port = readPort();
        if (port != null && healthOk(port)) {
            signalFocus(port);
            if (AppWindow.focusExisting()) return;
        }
        AppWindow.open(url);
    }

    public static void writePort(int port) {
        try {
            Files.createDirectories(dir());
            Files.writeString(portPath(), Integer.toString(port) + "\n", StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            // Best-effort.
        }
    }

    public static Integer readPort() {
        try {
            if (!Files.isRegularFile(portPath())) return null;
            String raw = Files.readString(portPath()).trim();
            if (raw.isBlank()) return null;
            int port = Integer.parseInt(raw.split("\\s+")[0]);
            if (port < 1 || port > 65535) return null;
            return port;
        } catch (Exception e) {
            return null;
        }
    }

    public static String runningUrl() {
        Integer port = readPort();
        if (port == null) return null;
        if (!portOpen(port)) return null;
        if (!healthOk(port)) return null;
        return "http://127.0.0.1:" + port + "/";
    }

    /** Mark that the next launch should reclaim this port after we exit. */
    public static void prepareRestart(int port) {
        try {
            Files.createDirectories(dir());
            Files.writeString(restartPath(),
                    "port=" + port + "\nchannel=" + channel + "\nts=" + System.currentTimeMillis() + "\n",
                    StandardCharsets.UTF_8);
            Files.writeString(portPath(), Integer.toString(port) + "\n", StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            // Best-effort.
        }
    }

    public static Integer consumeRestartPort() {
        try {
            Path path = restartPath();
            if (!Files.isRegularFile(path)) return null;
            String text = Files.readString(path);
            Files.deleteIfExists(path);
            for (String line : text.split("\n")) {
                if (line.startsWith("port=")) {
                    int port = Integer.parseInt(line.substring(5).trim());
                    if (port > 0 && port < 65536) return port;
                }
            }
        } catch (Exception ignored) {
            // ignore
        }
        return null;
    }

    public static void releaseQuietly() {
        try {
            if (lock != null) {
                lock.release();
                lock = null;
            }
        } catch (Exception ignored) {
            // ignore
        }
        try {
            if (lockRaf != null) {
                lockRaf.close();
                lockRaf = null;
            }
        } catch (Exception ignored) {
            // ignore
        }
    }

    private static void waitForPreviousExit(long maxMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + maxMs;
        while (System.currentTimeMillis() < deadline) {
            try (RandomAccessFile raf = new RandomAccessFile(lockPath().toFile(), "rw");
                 FileChannel ch = raf.getChannel()) {
                FileLock probe = ch.tryLock();
                if (probe != null) {
                    probe.release();
                    return;
                }
            } catch (IOException ignored) {
                // keep waiting
            }
            Thread.sleep(150);
        }
    }

    private static boolean portOpen(int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", port), 400);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private static boolean healthOk(int port) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) URI.create("http://127.0.0.1:" + port + "/api/health").toURL().openConnection();
            conn.setConnectTimeout(500);
            conn.setReadTimeout(800);
            conn.setRequestProperty("X-Lark", "1");
            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
