package lark;

import java.awt.Desktop;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/** Opens Lark in a dedicated browser app window (Chrome/Edge --app) when possible. */
public final class AppWindow {
    private AppWindow() {}

    public static void open(String url) {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            String local = System.getenv("LOCALAPPDATA");
            String program = System.getenv("ProgramFiles");
            String program86 = System.getenv("ProgramFiles(x86)");
            if (launchApp(url, local, "Microsoft", "Edge", "Application", "msedge.exe")) return;
            if (launchApp(url, program, "Microsoft", "Edge", "Application", "msedge.exe")) return;
            if (launchApp(url, local, "Google", "Chrome", "Application", "chrome.exe")) return;
            if (launchApp(url, program, "Google", "Chrome", "Application", "chrome.exe")) return;
            if (launchApp(url, program86, "Google", "Chrome", "Application", "chrome.exe")) return;
            try {
                new ProcessBuilder("cmd", "/c", "start", "", url).start();
                return;
            } catch (IOException ignored) {
                // Fall through.
            }
        } else if (os.contains("mac")) {
            if (macApp("Google Chrome", url)) return;
            if (macApp("Microsoft Edge", url)) return;
            if (macApp("Chromium", url)) return;
        } else {
            String[] browsers = {
                    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
                    "microsoft-edge", "microsoft-edge-stable"
            };
            for (String bin : browsers) {
                if (onPath(bin) && start(bin, "--app=" + url)) return;
            }
        }
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(url));
                return;
            }
        } catch (Exception ignored) {
            // Fall through to a platform opener.
        }
        try {
            if (os.contains("mac")) new ProcessBuilder("open", url).start();
            else if (os.contains("win")) new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
            else new ProcessBuilder("xdg-open", url).start();
        } catch (IOException e) {
            System.out.println("Open this address in a browser: " + url);
        }
    }

    private static boolean macApp(String name, String url) {
        try {
            Process process = new ProcessBuilder("open", "-na", name, "--args", "--app=" + url).start();
            return process.waitFor() == 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean launchApp(String url, String root, String... rest) {
        if (root == null || root.isBlank()) return false;
        Path path = Path.of(root, rest);
        if (!Files.isRegularFile(path)) return false;
        return start(path.toString(), "--app=" + url);
    }

    private static boolean start(String... command) {
        try {
            new ProcessBuilder(command).start();
            return true;
        } catch (IOException ignored) {
            return false;
        }
    }

    private static boolean onPath(String bin) {
        String path = System.getenv("PATH");
        if (path == null) return false;
        for (String dir : path.split(File.pathSeparator)) {
            if (Files.isExecutable(Path.of(dir, bin))) return true;
        }
        return false;
    }
}
