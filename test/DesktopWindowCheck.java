package lark;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

/** Checks browser launch arguments without opening a browser. */
public final class DesktopWindowCheck {
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("lark-window-check");
        try {
            Method method = AppWindow.class.getDeclaredMethod("chromeArgs", String.class, boolean.class, Path.class);
            method.setAccessible(true);
            Path first = root.resolve("normal"), retry = root.resolve("recovery");
            String[] a = (String[]) method.invoke(null, "http://127.0.0.1:1234", false, first);
            String[] b = (String[]) method.invoke(null, "http://127.0.0.1:1234", false, retry);
            if (!Arrays.asList(a).contains("--user-data-dir=" + first.toAbsolutePath())) throw new AssertionError("primary profile");
            if (!Arrays.asList(b).contains("--user-data-dir=" + retry.toAbsolutePath())) throw new AssertionError("recovery profile");
            if (!Arrays.asList(b).contains("--app=http://127.0.0.1:1234")) throw new AssertionError("app URL");
            if (!Files.isDirectory(first) || !Files.isDirectory(retry)) throw new AssertionError("profile directories");
            System.out.println("Desktop browser profile arguments passed.");
        } finally { Projects.deleteTree(root); }
    }
}
