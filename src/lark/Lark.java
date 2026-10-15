package lark;

import java.awt.Desktop;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/** Starts Lark and opens it. One requirement: a JDK. */
public final class Lark {
    public static void main(String[] args) throws Exception {
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

        Settings settings = Settings.load();
        Projects projects = new Projects(settings);
        projects.ensureSample();
        Server server = Server.start(port, projects, new Runner(), new GitHub(settings), settings);
        Runtime.getRuntime().addShutdownHook(new Thread(server::stop));
        String url = "http://127.0.0.1:" + server.port();
        System.out.println("Lark is running at " + url);
        System.out.println("Projects are stored in " + settings.projectsDir());
        if (browser) open(url);
        Thread.currentThread().join();
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
        String[] browsers = {"google-chrome", "google-chrome-stable", "chromium", "chromium-browser"};
        for (String bin : browsers) {
            if (!onPath(bin)) continue;
            try {
                new ProcessBuilder(bin, "--app=" + url).start();
                return;
            } catch (IOException ignored) {
                // Try the next browser.
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
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        try {
            if (os.contains("mac")) new ProcessBuilder("open", url).start();
            else if (os.contains("win")) new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
            else new ProcessBuilder("xdg-open", url).start();
        } catch (IOException e) {
            System.out.println("Open this address in a browser: " + url);
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
