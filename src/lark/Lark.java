package lark;

import java.io.IOException;
import java.util.concurrent.CountDownLatch;

/** Starts Lark and opens it. One requirement: a JDK. */
public final class Lark {
    public static void main(String[] args) {
        for (String arg : args) {
            if ("--desktop".equals(arg)) {
                Desktop.main(args);
                return;
            }
            if ("--mobile".equals(arg)) {
                Mobile.main(args);
                return;
            }
        }
        try {
            boot(args);
        } catch (Throwable t) {
            System.err.println();
            System.err.println("========== Lark failed to start ==========");
            if (JdkHealth.looksLikeCorruptJdk(t)) {
                System.err.println(JdkHealth.message(t));
            } else {
                t.printStackTrace(System.err);
            }
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
        int port = Instance.defaultPort();
        boolean browser = true;
        boolean replace = "1".equals(System.getenv("LARK_REPLACE"));
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--help", "-h" -> {
                    help();
                    return;
                }
                case "--no-browser" -> browser = false;
                case "--replace" -> replace = true;
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

        String channel = Executable.isExecutable() ? Executable.CHANNEL : "portable";
        Instance.configure(channel, replace);
        Integer restartPort = Instance.consumeRestartPort();
        if (restartPort != null) {
            port = restartPort;
            Instance.configure(channel, true);
        } else {
            String envPort = System.getenv("LARK_PORT");
            if (envPort != null && !envPort.isBlank()) {
                try {
                    port = Integer.parseInt(envPort.trim());
                    Instance.configure(channel, true);
                } catch (NumberFormatException ignored) {
                    // keep parsed --port
                }
            }
        }

        System.out.println("Lark " + Settings.VERSION + " starting...");
        System.out.flush();
        JdkHealth.verifyOrThrow();

        if (!Instance.acquireOrFocus(browser)) {
            return;
        }

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
        try {
            WinTaskbar.stampKnownShortcuts();
        } catch (Throwable ignored) {
            // Best-effort taskbar identity (Executable / portable).
        }
        if (browser) {
            System.out.println("Opening your browser...");
            System.out.flush();
            AppWindow.openWithRetry(url);
        }
        // Keep the JVM alive while the (daemon) HTTP threads serve the IDE.
        new CountDownLatch(1).await();
    }

    private static void help() {
        System.out.println("""
                Lark — a small Java IDE

                Usage:
                  ./lark.sh [--port 43123] [--no-browser]
                  ./lark.sh --desktop          # Lark Desktop (app window)
                  ./lark.sh --mobile           # Lark Mobile (touch UI + phone pair)

                Projects are stored in ~/.lark/projects.
                Package one jar with ./package.sh, then: java -jar dist/lark.jar
                """);
    }
}
