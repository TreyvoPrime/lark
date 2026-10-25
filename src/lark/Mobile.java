package lark;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;

/**
 * Lark Mobile — a separate touch-first edition with its own UI and download.
 * Runs the Java engine on this machine (or tablet) and serves a phone-friendly
 * editor. With LAN pairing enabled (default), a phone on the same Wi‑Fi can
 * open the Mobile UI while compile/run stay on the host.
 */
public final class Mobile {
    static final String CHANNEL = "mobile";
    private static volatile String pairToken = "";
    private static volatile boolean lanEnabled = true;

    private Mobile() {}

    public static void main(String[] args) {
        System.setProperty("lark.mobile", "true");
        System.setProperty("lark.channel", CHANNEL);
        if (System.getProperty("lark.ui") == null || System.getProperty("lark.ui").isBlank()) {
            System.setProperty("lark.ui", "jar");
        }
        try {
            boot(args);
        } catch (Throwable t) {
            System.err.println();
            System.err.println("========== Lark Mobile failed to start ==========");
            if (JdkHealth.looksLikeCorruptJdk(t)) {
                System.err.println(JdkHealth.message(t));
            } else {
                t.printStackTrace(System.err);
            }
            System.err.println("=================================================");
            System.err.flush();
            try {
                System.in.read();
            } catch (IOException ignored) {
                // Ignore.
            }
            System.exit(1);
        }
    }

    public static boolean isMobile() {
        if (Boolean.parseBoolean(System.getProperty("lark.mobile", "false"))) return true;
        String channel = System.getProperty("lark.channel", "");
        if (CHANNEL.equalsIgnoreCase(channel)) return true;
        String env = System.getenv("LARK_CHANNEL");
        if (env != null && CHANNEL.equalsIgnoreCase(env.trim())) return true;
        try {
            java.nio.file.Path dir = Updates.installDir();
            if (dir != null && java.nio.file.Files.isRegularFile(dir.resolve("mobile.marker"))) return true;
        } catch (Throwable ignored) {
            // Install dir may not be ready yet.
        }
        return false;
    }

    public static String pairToken() {
        return pairToken == null ? "" : pairToken;
    }

    public static boolean lanEnabled() {
        return lanEnabled;
    }

    private static void boot(String[] args) throws Exception {
        int port = 43125;
        boolean browser = true;
        boolean replace = "1".equals(System.getenv("LARK_REPLACE"));
        lanEnabled = true;
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--help", "-h" -> {
                    help();
                    return;
                }
                case "--no-browser" -> browser = false;
                case "--replace" -> replace = true;
                case "--local-only" -> lanEnabled = false;
                case "--lan" -> lanEnabled = true;
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

        Instance.configure(CHANNEL, replace);
        Integer restartPort = Instance.consumeRestartPort();
        if (restartPort != null) {
            port = restartPort;
            Instance.configure(CHANNEL, true);
        }

        pairToken = newToken();
        System.out.println("Lark Mobile " + Settings.VERSION + " starting...");
        System.out.flush();
        JdkHealth.verifyOrThrow();

        if (!Instance.acquireOrFocus(browser)) {
            return;
        }

        Settings settings = Settings.load();
        try {
            Updates.refreshLaunchers(Updates.installDir());
            Updates.refreshMobileLaunchers(Updates.installDir());
        } catch (Throwable t) {
            System.out.println("Note: could not refresh launchers (" + t.getMessage() + ")");
        }

        Projects projects = new Projects(settings);
        projects.ensureSample();
        Server server = Server.start(port, projects, new Runner(), new GitHub(settings), settings, lanEnabled);
        Runtime.getRuntime().addShutdownHook(new Thread(server::stop));
        String local = "http://127.0.0.1:" + server.port() + "/?pair=" + pairToken;
        System.out.println();
        System.out.println("====================================");
        System.out.println("  Lark Mobile is running");
        System.out.println("  This device:  " + local);
        if (lanEnabled) {
            for (String ip : lanAddresses()) {
                System.out.println("  Phone (Wi‑Fi): http://" + ip + ":" + server.port() + "/?pair=" + pairToken);
            }
            System.out.println("  Pair code:    " + pairToken);
            System.out.println("  Same Wi‑Fi only. Keep this window open.");
        } else {
            System.out.println("  LAN pairing off (--local-only).");
        }
        System.out.println("====================================");
        System.out.println("Projects: " + settings.projectsDir());
        System.out.flush();
        if (browser) {
            System.out.println("Opening Mobile UI...");
            System.out.flush();
            AppWindow.openWithRetry(local);
        }
        new CountDownLatch(1).await();
    }

    private static String newToken() {
        // 128-bit pair token (was 48-bit) — harder to guess on a shared LAN.
        byte[] bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        StringBuilder sb = new StringBuilder(32);
        for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }

    static List<String> lanAddresses() {
        List<String> out = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> nets = NetworkInterface.getNetworkInterfaces();
            while (nets != null && nets.hasMoreElements()) {
                NetworkInterface nif = nets.nextElement();
                if (!nif.isUp() || nif.isLoopback() || nif.isVirtual()) continue;
                Enumeration<InetAddress> addrs = nif.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        out.add(addr.getHostAddress());
                    }
                }
            }
        } catch (Exception ignored) {
            // Best-effort.
        }
        return out;
    }

    private static void help() {
        System.out.println("""
                Lark Mobile — touch-first Java IDE (separate download)

                Usage:
                  java -cp lark.jar lark.Mobile [options]

                Options:
                  --port N        Listen port (default 43125)
                  --lan           Allow phones on the same Wi‑Fi (default)
                  --local-only    Bind to this device only
                  --no-browser    Do not open a window
                  --help          Show this help
                """);
    }
}
