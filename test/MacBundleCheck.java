package lark;

import java.nio.file.*;

/** Signed bundles must remain byte-identical across startup/update attempts. */
public final class MacBundleCheck {
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("lark-mac-bundle-");
        System.setProperty("lark.macos.signedBundle", "true");
        try {
            Updates.refreshLaunchers(root);
            Updates.refreshDesktopLaunchers(root);
            Updates.refreshMobileLaunchers(root);
            Updates.refreshExecutableMarkers(root);
            try (var files = Files.list(root)) {
                if (files.findAny().isPresent()) throw new AssertionError("Signed bundle was modified");
            }
            try { new Updates(Settings.load()).install("", false); throw new AssertionError("In-place update allowed"); }
            catch (RequestFail expected) { if (expected.status != 409) throw expected; }
            System.out.println("Mac signed-bundle immutability and update checks passed.");
        } finally { System.clearProperty("lark.macos.signedBundle"); Projects.deleteTree(root); }
    }
}
