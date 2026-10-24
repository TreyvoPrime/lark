package lark;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Compatibility shim for older Lark Enterprise installs. New builds ship as
 * {@link Desktop} (LarkDesktopSetup.exe). {@code enterprise.marker} still maps
 * to the desktop update channel.
 */
public final class Enterprise {
    static final String CHANNEL = "enterprise";

    private Enterprise() {}

    public static void main(String[] args) {
        System.setProperty("lark.enterprise", "true");
        // Prefer the Desktop experience going forward.
        System.setProperty("lark.desktop", "true");
        System.setProperty("lark.channel", Desktop.CHANNEL);
        Desktop.main(args);
    }

    /** True for older Enterprise markers / props (update channel aliases to Desktop). */
    public static boolean isEnterprise() {
        if (Boolean.parseBoolean(System.getProperty("lark.enterprise", "false"))) return true;
        String channel = System.getProperty("lark.channel", "");
        if (CHANNEL.equalsIgnoreCase(channel)) return true;
        String env = System.getenv("LARK_CHANNEL");
        if (env != null && CHANNEL.equalsIgnoreCase(env.trim())) return true;
        try {
            Path dir = Updates.installDir();
            if (dir != null && Files.isRegularFile(dir.resolve("enterprise.marker"))) return true;
        } catch (Throwable ignored) {
            // Install dir may not be ready yet.
        }
        return false;
    }
}
