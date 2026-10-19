package lark;

import java.awt.Desktop;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;

/** Starts Lark and opens it. One requirement: a JDK. */
public final class Lark {
    public static void main(String[] args) {
        try {
            boot(args);
        } catch (Throwable t) {
            System.err.println();
            System.err.println("========== Lark failed to start ==========");
            t.printStackTrace(System.err);
            System.err.println("==========================================");
            System.err.println("Press Enter to close this window...");
            System.err.flush();
            try {
                System.in.read();
            } catch (IOException ignored) {
                // Ignore.
            }
            System.exit(1);
        }
    }

    private static void boot(String[] args) throws Exception {
        int port = 43123;
        boolean browser = true;
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--help", "-h" -> {
                    help();
                    return;
                }
                case "--no-browser" -> browser = false;
                case "--port" -> {
                    if (i + 1 >= args.length) {
                        help();
                        return;
                    }
                    port = Integer.parseInt(args[++i]);
                }
                default -> {
                    System.err.println("Unknown option: " + args[i]);
                    help();
                    return;
                }
            }
        }

        System.out.println("Lark " + Settings.VERSION + " starting...");
        System.out.flush();

        Settings settings = Settings.load();
        // Refresh launchers beside the install folder when possible.
        try {
            Updates.refreshLaunchers(Updates.installDir());
        } catch (Throwable t) {
            System.out.println("Note: could not refresh launchers (" + t.getMessage() + ")");
        }

        Projects projects = new Projects(settings);
        projects.ensureSample();
        Server server = Server.start(port, projects, new Runner(), new GitHub(settings), settings);
        Runtime.getRuntime().addShutdownHook(new Thread(server::stop));
        String url = "http://127.0.0.1:" + server.port();
        System.out.println();
        System.out.println("====================================");
        System.out.println("  Lark is running");
        System.out.println("  " + url);
        System.out.println("  Leave this window open.");
        System.out.println("====================================");
        System.out.println("Projects: " + settings.projectsDir());
        System.out.flush();
        if (browser) {
            System.out.println("Opening your browser...");
            System.out.flush();
            open(url);
        }
        // Keep the JVM alive while the (daemon) HTTP threads serve the IDE.
        new CountDownLatch(1).await();
    }

    private static void help() {
        System.out.println("""
                Lark — a small Java IDE

                Usage:
                  ./lark.sh [--port 43123] [--no-browser]

                Projects are stored in ~/.lark/projects.
                Package one jar with ./package.sh, then: java -jar dist/lark.jar
                """);
    }

    private static void open(String url) {
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
            // Last resort on Windows — always try the shell handler.
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
