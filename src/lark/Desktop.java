package lark;

import java.awt.AWTException;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.RenderingHints;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;

/**
 * Lark Desktop — enterprise install that opens in its own app window
 * (Chrome/Edge --app mode), keeps a system tray exit control, and uses
 * the desktop update channel.
 */
public final class Desktop {
    static final String CHANNEL = "desktop";

    private Desktop() {}

    public static void main(String[] args) {
        System.setProperty("lark.desktop", "true");
        System.setProperty("lark.channel", CHANNEL);
        if (System.getProperty("lark.ui") == null || System.getProperty("lark.ui").isBlank()) {
            System.setProperty("lark.ui", "jar");
        }
        try {
            boot(args);
        } catch (Throwable t) {
            System.err.println();
            System.err.println("========== Lark Desktop failed to start ==========");
            if (JdkHealth.looksLikeCorruptJdk(t)) {
                System.err.println(JdkHealth.message(t));
            } else {
                t.printStackTrace(System.err);
            }
            System.err.println("==================================================");
            System.err.flush();
            try {
                System.in.read();
            } catch (IOException ignored) {
                // Ignore.
            }
            System.exit(1);
        }
    }

    /** True when this JVM is the desktop edition. */
    public static boolean isDesktop() {
        if (Boolean.parseBoolean(System.getProperty("lark.desktop", "false"))) return true;
        String channel = System.getProperty("lark.channel", "");
        if (CHANNEL.equalsIgnoreCase(channel)) return true;
        String env = System.getenv("LARK_CHANNEL");
        if (env != null && CHANNEL.equalsIgnoreCase(env.trim())) return true;
        try {
            java.nio.file.Path dir = Updates.installDir();
            if (dir != null) {
                if (java.nio.file.Files.isRegularFile(dir.resolve("desktop.marker"))) return true;
                if (java.nio.file.Files.isRegularFile(dir.resolve("app").resolve("desktop.marker"))) return true;
            }
        } catch (Throwable ignored) {
            // Install dir may not be ready yet.
        }
        return false;
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
                case "--desktop" -> {
                    // Already in desktop mode.
                }
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

        System.out.println("Lark Desktop " + Settings.VERSION + " starting...");
        System.out.flush();
        JdkHealth.verifyOrThrow();

        Settings settings = Settings.load();
        try {
            Updates.refreshLaunchers(Updates.installDir());
            Updates.refreshDesktopLaunchers(Updates.installDir());
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
        System.out.println("  Lark Desktop is running");
        System.out.println("  " + url);
        System.out.println("  Close from the tray icon to quit.");
        System.out.println("====================================");
        System.out.flush();

        installTray(url);
        if (browser) {
            System.out.println("Opening Lark Desktop window...");
            System.out.flush();
            AppWindow.open(url);
        }
        new CountDownLatch(1).await();
    }

    private static void help() {
        System.out.println("""
                Lark Desktop — enterprise Java IDE

                Usage:
                  java -cp lark.jar lark.Desktop [--port 43123] [--no-browser]

                Installs live under %LOCALAPPDATA%\\Programs\\Lark (Windows)
                or ~/Applications/Lark Desktop (Mac/Linux). Updates prompt in-app.
                """);
    }

    private static void installTray(String url) {
        if (!SystemTray.isSupported()) return;
        try {
            SystemTray tray = SystemTray.getSystemTray();
            PopupMenu menu = new PopupMenu();
            MenuItem open = new MenuItem("Open Lark");
            open.addActionListener(e -> AppWindow.open(url));
            MenuItem quit = new MenuItem("Quit Lark Desktop");
            quit.addActionListener(e -> System.exit(0));
            menu.add(open);
            menu.addSeparator();
            menu.add(quit);
            TrayIcon icon = new TrayIcon(trayImage(), "Lark Desktop " + Settings.VERSION, menu);
            icon.setImageAutoSize(true);
            icon.addActionListener(e -> AppWindow.open(url));
            tray.add(icon);
        } catch (AWTException | IllegalArgumentException e) {
            System.out.println("Note: system tray unavailable (" + e.getMessage() + ")");
        }
    }

    private static Image trayImage() {
        int size = 64;
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0x1b1916));
        g.fillRoundRect(2, 2, size - 4, size - 4, 16, 16);
        g.setColor(new Color(0xe3a45a));
        g.setStroke(new BasicStroke(3.2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        Path2D wing = new Path2D.Float();
        wing.moveTo(14, 42);
        wing.curveTo(24, 36, 30, 22, 32, 14);
        wing.curveTo(34, 22, 40, 36, 50, 42);
        g.draw(wing);
        g.drawLine(22, 44, 42, 44);
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 10));
        g.dispose();
        return img;
    }
}
