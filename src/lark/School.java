package lark;

/**
 * Lark School — same portable IDE, started with Lark.exe so school PCs that
 * block .bat files can still run it. Detected via school.marker next to the install.
 */
public final class School {
    static final String CHANNEL = "school";

    private School() {}

    public static boolean isSchool() {
        String channel = System.getProperty("lark.channel", "");
        if (CHANNEL.equalsIgnoreCase(channel)) return true;
        String env = System.getenv("LARK_CHANNEL");
        if (env != null && CHANNEL.equalsIgnoreCase(env.trim())) return true;
        try {
            java.nio.file.Path dir = Updates.installDir();
            if (dir != null && java.nio.file.Files.isRegularFile(dir.resolve("school.marker"))) return true;
        } catch (Throwable ignored) {
            // Install dir may not be ready.
        }
        return false;
    }
}
