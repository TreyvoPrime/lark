package lark;

import java.awt.Desktop;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * Opens Lark in a dedicated browser app window (Chrome/Edge --app) when possible,
 * and can raise an already-open Lark window without spawning another taskbar entry.
 */
public final class AppWindow {
    private AppWindow() {}

    public static void open(String url) {
        clearStaleProfileLocks();
        openRaw(url);
    }

    /**
     * Open the Lark window, then retry once if no editor tab checks in.
     * Covers the post-update case where Chromium still holds the profile lock and
     * the first {@code --app} launch hands off to a dying window (or nothing).
     */
    public static void openWithRetry(String url) {
        open(url);
        Thread retry = new Thread(() -> {
            try {
                Thread.sleep(2200);
                if (Server.uiFresh()) return;
                System.out.println("Lark window didn't check in — opening again…");
                System.out.flush();
                clearStaleProfileLocks();
                openRaw(url);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "lark-window-retry");
        retry.setDaemon(true);
        retry.start();
    }

    private static void openRaw(String url) {
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
            // Use -a (not -n) so Chrome/Edge reuse the existing process instead of spawning
            // another app instance that shows up as a second taskbar/Dock entry.
            if (macApp("Google Chrome", url)) return;
            if (macApp("Microsoft Edge", url)) return;
            if (macApp("Chromium", url)) return;
        } else {
            String[] browsers = {
                    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
                    "microsoft-edge", "microsoft-edge-stable"
            };
            for (String bin : browsers) {
                if (onPath(bin) && start(bin, chromeArgs(url, true))) return;
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

    /**
     * Raise an already-open Lark Chromium/Edge --app window. Never opens a new window.
     * Title match is hardcoded to {@code Lark} — no user/URL input is passed to the shell.
     */
    public static boolean focusExisting() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        try {
            if (os.contains("win")) return focusWindows();
            if (os.contains("mac")) return focusMac();
            return focusLinux();
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean focusWindows() throws Exception {
        // Hardcoded script only — no string interpolation of URLs or user data.
        String script = String.join(";",
                "Add-Type -TypeDefinition @'",
                "using System;",
                "using System.Runtime.InteropServices;",
                "public class LarkFocus {",
                "  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
                "  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);",
                "  [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr hWnd);",
                "}",
                "'@",
                "$hit = $false",
                "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'Lark' } | ForEach-Object {",
                "  $h = $_.MainWindowHandle",
                "  if ([LarkFocus]::IsIconic($h)) { [void][LarkFocus]::ShowWindowAsync($h, 9) }",
                "  [void][LarkFocus]::SetForegroundWindow($h)",
                "  $hit = $true",
                "}",
                "if (-not $hit) { exit 2 } else { exit 0 }"
        );
        ProcessBuilder pb = new ProcessBuilder(
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle", "Hidden",
                "-Command", script
        );
        pb.redirectErrorStream(true);
        Process p = pb.start();
        boolean finished = p.waitFor(4, TimeUnit.SECONDS);
        if (!finished) {
            p.destroyForcibly();
            return false;
        }
        return p.exitValue() == 0;
    }

    private static boolean focusMac() throws Exception {
        String[] apps = { "Google Chrome", "Microsoft Edge", "Chromium" };
        for (String app : apps) {
            // Activate the browser; then try to raise a window whose name contains Lark.
            String script = "tell application \"" + app + "\" to activate\n"
                    + "tell application \"System Events\"\n"
                    + "  if exists process \"" + app + "\" then\n"
                    + "    tell process \"" + app + "\"\n"
                    + "      set frontmost to true\n"
                    + "      repeat with w in windows\n"
                    + "        try\n"
                    + "          if name of w contains \"Lark\" then\n"
                    + "            perform action \"AXRaise\" of w\n"
                    + "            set index of w to 1\n"
                    + "            return\n"
                    + "          end if\n"
                    + "        end try\n"
                    + "      end repeat\n"
                    + "    end tell\n"
                    + "  end if\n"
                    + "end tell";
            Process p = new ProcessBuilder("osascript", "-e", script).start();
            if (p.waitFor(3, TimeUnit.SECONDS) && p.exitValue() == 0) return true;
        }
        return false;
    }

    private static boolean focusLinux() throws Exception {
        // Prefer our --class=Lark app window over a normal browser tab whose title
        // happens to mention Lark.
        if (onPath("xdotool") && activateXdotool("search", "--class", "Lark")) return true;
        if (onPath("wmctrl")) {
            Process p = new ProcessBuilder("wmctrl", "-a", "Lark").start();
            if (p.waitFor(2, TimeUnit.SECONDS) && p.exitValue() == 0) return true;
        }
        if (onPath("xdotool") && activateXdotool("search", "--name", "Lark")) return true;
        return false;
    }

    private static boolean activateXdotool(String... searchArgs) throws Exception {
        List<String> cmd = new ArrayList<>();
        cmd.add("xdotool");
        for (String a : searchArgs) cmd.add(a);
        Process search = new ProcessBuilder(cmd).start();
        if (!search.waitFor(2, TimeUnit.SECONDS) || search.exitValue() != 0) return false;
        String ids = new String(search.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        if (ids.isBlank()) return false;
        String id = ids.split("\\s+")[0];
        if (!id.matches("\\d+")) return false;
        Process act = new ProcessBuilder("xdotool", "windowactivate", "--sync", id).start();
        return act.waitFor(2, TimeUnit.SECONDS) && act.exitValue() == 0;
    }

    /** Stable Chromium profile so --app windows group as one Lark app. */
    private static Path profileDir() {
        String channel = Instance.channel();
        if (channel == null || channel.isBlank()) channel = "portable";
        return Settings.home().resolve("browser").resolve(channel);
    }

    /**
     * Drop Chromium Singleton* files left by a dead browser process so the next
     * {@code --app} launch is not swallowed by a profile lock with no window.
     */
    public static void clearStaleProfileLocks() {
        Path profile = profileDir();
        Path lock = profile.resolve("SingletonLock");
        try {
            if (!Files.exists(lock)) return;
            Long pid = singletonOwnerPid(lock);
            // Only clear when we know the owning PID and it is gone. Unknown lock
            // formats (common on Windows) stay put — Chrome owns that file while live.
            if (pid == null || processAlive(pid)) return;
            Files.deleteIfExists(lock);
            Files.deleteIfExists(profile.resolve("SingletonCookie"));
            Files.deleteIfExists(profile.resolve("SingletonSocket"));
        } catch (Exception ignored) {
            // Best-effort — Chrome may still recover on its own.
        }
    }

    private static Long singletonOwnerPid(Path lock) {
        try {
            if (Files.isSymbolicLink(lock)) {
                Path target = Files.readSymbolicLink(lock);
                String name = target.getFileName().toString();
                int dash = name.lastIndexOf('-');
                if (dash >= 0 && dash + 1 < name.length()) {
                    return Long.parseLong(name.substring(dash + 1));
                }
            }
        } catch (Exception ignored) {
            // Not a hostname-pid symlink (Windows uses a regular lock file).
        }
        return null;
    }

    private static boolean processAlive(long pid) {
        try {
            return ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false);
        } catch (Exception e) {
            return false;
        }
    }

    private static String[] chromeArgs(String url, boolean linuxClass) {
        Path profile = profileDir();
        try {
            Files.createDirectories(profile);
        } catch (IOException ignored) {
            // Best-effort; Chrome may still create it.
        }
        List<String> args = new ArrayList<>();
        args.add("--user-data-dir=" + profile.toAbsolutePath());
        args.add("--no-first-run");
        args.add("--no-default-browser-check");
        if (linuxClass) args.add("--class=Lark");
        args.add("--app=" + url);
        return args.toArray(new String[0]);
    }

    private static boolean macApp(String name, String url) {
        try {
            List<String> cmd = new ArrayList<>();
            cmd.add("open");
            cmd.add("-a");
            cmd.add(name);
            cmd.add("--args");
            for (String arg : chromeArgs(url, false)) cmd.add(arg);
            Process process = new ProcessBuilder(cmd).start();
            return process.waitFor() == 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean launchApp(String url, String root, String... rest) {
        if (root == null || root.isBlank()) return false;
        Path path = Path.of(root, rest);
        if (!Files.isRegularFile(path)) return false;
        return start(path.toString(), chromeArgs(url, false));
    }

    private static boolean start(String bin, String[] args) {
        try {
            List<String> cmd = new ArrayList<>();
            cmd.add(bin);
            for (String arg : args) cmd.add(arg);
            new ProcessBuilder(cmd).start();
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
