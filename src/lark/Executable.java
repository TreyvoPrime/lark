package lark;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Lark Executable — unzip and double-click {@code Lark.exe} (labs / USB).
 * Runtime lives under {@code app/} and {@code jdk/} (soft-hidden on Windows).
 * Older School-channel markers still resolve here so upgrades stay on this track.
 */
public final class Executable {
    static final String CHANNEL = "executable";

    private Executable() {}

    public static void main(String[] args) {
        System.setProperty("lark.executable", "true");
        System.setProperty("lark.channel", CHANNEL);
        if (System.getProperty("lark.ui") == null || System.getProperty("lark.ui").isBlank()) {
            System.setProperty("lark.ui", "jar");
        }
        Lark.main(args);
    }

    /** True for Executable installs and older School markers. */
    public static boolean isExecutable() {
        if (Boolean.parseBoolean(System.getProperty("lark.executable", "false"))) return true;
        String channel = System.getProperty("lark.channel", "");
        if (CHANNEL.equalsIgnoreCase(channel) || "school".equalsIgnoreCase(channel)) return true;
        String env = System.getenv("LARK_CHANNEL");
        if (env != null) {
            String e = env.trim();
            if (CHANNEL.equalsIgnoreCase(e) || "school".equalsIgnoreCase(e)) return true;
        }
        try {
            Path dir = Updates.installDir();
            if (dir == null) return false;
            if (Files.isRegularFile(dir.resolve("executable.marker"))) return true;
            if (Files.isRegularFile(dir.resolve("app").resolve("executable.marker"))) return true;
            if (Files.isRegularFile(dir.resolve("school.marker"))) return true;
            if (Files.isRegularFile(dir.resolve("app").resolve("school.marker"))) return true;
            if (Files.isRegularFile(dir.resolve("Lark.exe"))) return true;
        } catch (Throwable ignored) {
            // Install dir may not be ready yet.
        }
        return false;
    }
}
