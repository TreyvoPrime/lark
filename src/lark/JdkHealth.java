package lark;

import java.nio.channels.Selector;

/**
 * Detects a damaged JDK before Lark opens sockets.
 * "Incompatible magic value 0" means a core class file was zeroed/truncated —
 * usually a half-deleted install or a bad unzip — not an application bug.
 */
public final class JdkHealth {
    private JdkHealth() {}

    public static void verifyOrThrow() {
        try {
            Selector.open().close();
        } catch (Throwable t) {
            throw new IllegalStateException(message(t), t);
        }
    }

    public static String message(Throwable t) {
        String detail = t == null ? "unknown error" : (t.getClass().getSimpleName() + ": " + t.getMessage());
        return """
                This computer's Java runtime is damaged (networking classes won't load).
                That usually means the Lark folder was only partly deleted or unzipped.

                Fix (Windows):
                  1. Close every Lark window
                  2. Delete these folders if they exist:
                       %LOCALAPPDATA%\\Lark
                       %LOCALAPPDATA%\\Programs\\Lark
                       the folder where you unzipped Lark (must contain lark.jar AND jdk\\)
                  3. Download a fresh Lark zip:
                       https://github.com/TreyvoPrime/lark/releases/latest/download/lark-windows.zip
                  4. Right-click → Extract All… to C:\\Users\\%USERNAME%\\Lark
                  5. Open THAT folder and run Start Lark.bat
                     (you must see Start Lark.bat, lark.jar, and jdk\\ together)

                Details: """ + detail;
    }

    public static boolean looksLikeCorruptJdk(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof ClassFormatError) return true;
            String msg = c.getMessage();
            if (msg != null && msg.toLowerCase().contains("incompatible magic value")) return true;
            if (c instanceof ExceptionInInitializerError) return true;
        }
        return false;
    }
}
