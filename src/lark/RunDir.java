package lark;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Shared run-folder helpers for the native shell launcher (port file, shell mode). */
public final class RunDir {
    private RunDir() {}

    /** True when a native host (WebView2 / hardened app window) owns the UI. */
    public static boolean shellMode() {
        return Boolean.parseBoolean(System.getProperty("lark.shell", "false"));
    }

    public static Path dir() {
        String prop = System.getProperty("lark.run.dir", "");
        if (prop != null && !prop.isBlank()) {
            return Path.of(prop);
        }
        return null;
    }

    /** Write the bound port so the Windows host can find the UI without guessing. */
    public static void writePort(int port) {
        Path run = dir();
        if (run == null) return;
        try {
            Files.createDirectories(run);
            Files.writeString(run.resolve("port"), Integer.toString(port), StandardCharsets.UTF_8);
            Files.writeString(run.resolve("url"), "http://127.0.0.1:" + port + "/", StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            // Launcher can still scan ports.
        }
    }
}
