package lark;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Windows taskbar identity for Lark Desktop / Executable.
 * Chromium {@code --app} windows invent their own AppUserModelID, so the pinned
 * {@code Lark Desktop.exe} and the running editor show as two icons. We stamp a
 * shared AUMID on shortcuts and re-apply it to the editor window after launch.
 */
public final class WinTaskbar {
    /** Company.Product — must match Go launchers and installer shortcuts. */
    public static final String DESKTOP_AUMID = "TreyvoPrime.Lark.Desktop";
    public static final String EXECUTABLE_AUMID = "TreyvoPrime.Lark.Executable";

    private static final AtomicBoolean reclaimStarted = new AtomicBoolean(false);

    private WinTaskbar() {}

    public static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    public static String appUserModelId() {
        String channel = Instance.channel();
        if (channel == null) channel = "";
        channel = channel.toLowerCase(Locale.ROOT);
        if ("executable".equals(channel)) return EXECUTABLE_AUMID;
        return DESKTOP_AUMID;
    }

    public static String displayName() {
        String channel = Instance.channel();
        if (channel != null && "executable".equalsIgnoreCase(channel.trim())) return "Lark";
        return "Lark Desktop";
    }

    /** Path to the Windows launcher exe, or null when unknown. */
    public static Path launcherExe() {
        Path install = Updates.installDir();
        if (install == null) return null;
        String channel = Instance.channel();
        if (channel != null && "executable".equalsIgnoreCase(channel.trim())) {
            Path exe = install.resolve("Lark.exe");
            if (Files.isRegularFile(exe)) return exe;
        }
        Path desktop = install.resolve("Lark Desktop.exe");
        if (Files.isRegularFile(desktop)) return desktop;
        Path legacy = install.resolve("Lark Enterprise.exe");
        if (Files.isRegularFile(legacy)) return legacy;
        Path plain = install.resolve("Lark.exe");
        if (Files.isRegularFile(plain)) return plain;
        return null;
    }

    public static Path iconResource() {
        Path install = Updates.installDir();
        if (install != null) {
            Path ico = install.resolve("app").resolve("lark-icon.ico");
            if (Files.isRegularFile(ico)) return ico;
            Path png = install.resolve("app").resolve("lark-icon.png");
            if (Files.isRegularFile(png)) return png;
        }
        Path exe = launcherExe();
        return exe;
    }

    /**
     * After opening (or focusing) the Chromium --app window, force its AUMID
     * and relaunch properties so it groups with the pinned Lark launcher.
     */
    public static void claimEditorWindow() {
        if (!isWindows()) return;
        try {
            runClaimScript(true);
        } catch (Exception ignored) {
            // Best-effort — taskbar may stay split until next focus.
        }
    }

    /** Background retries while Edge/Chrome creates the --app window. */
    public static void reclaimAfterLaunch() {
        if (!isWindows()) return;
        if (!reclaimStarted.compareAndSet(false, true)) {
            // Already looping — kick one more immediate claim.
            Thread t = new Thread(WinTaskbar::claimEditorWindow, "lark-taskbar-claim");
            t.setDaemon(true);
            t.start();
            return;
        }
        Thread t = new Thread(() -> {
            try {
                int[] delays = { 400, 900, 1600, 2800, 4500, 8000 };
                for (int ms : delays) {
                    Thread.sleep(ms);
                    claimEditorWindow();
                    stampKnownShortcuts();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                reclaimStarted.set(false);
            }
        }, "lark-taskbar-reclaim");
        t.setDaemon(true);
        t.start();
    }

    /**
     * Raise the Lark editor window and re-apply AUMID. Returns true when a
     * window was found and focused.
     */
    public static boolean focusAndClaim() {
        if (!isWindows()) return false;
        try {
            return runClaimScript(false);
        } catch (Exception e) {
            return false;
        }
    }

    /** Stamp Start Menu / Desktop / pinned-taskbar .lnk files with our AUMID. */
    public static void stampKnownShortcuts() {
        if (!isWindows()) return;
        Path exe = launcherExe();
        if (exe == null) return;
        String aumid = appUserModelId();
        String name = displayName();
        List<String> paths = new ArrayList<>();
        String appData = System.getenv("APPDATA");
        String userProfile = System.getenv("USERPROFILE");
        if (appData != null && !appData.isBlank()) {
            paths.add(Path.of(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Lark Desktop.lnk").toString());
            paths.add(Path.of(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Lark", "Lark Desktop.lnk").toString());
            paths.add(Path.of(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Lark.lnk").toString());
            paths.add(Path.of(appData, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar", "Lark Desktop.lnk").toString());
            paths.add(Path.of(appData, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar", "Lark.lnk").toString());
        }
        if (userProfile != null && !userProfile.isBlank()) {
            paths.add(Path.of(userProfile, "Desktop", "Lark Desktop.lnk").toString());
            paths.add(Path.of(userProfile, "Desktop", "Lark.lnk").toString());
        }
        String publicDesktop = System.getenv("PUBLIC");
        if (publicDesktop != null && !publicDesktop.isBlank()) {
            paths.add(Path.of(publicDesktop, "Desktop", "Lark Desktop.lnk").toString());
        }
        try {
            runStampScript(paths, aumid, exe.toAbsolutePath().toString(), name);
        } catch (Exception ignored) {
            // Best-effort.
        }
    }

    private static boolean runClaimScript(boolean claimOnly) throws Exception {
        Path exe = launcherExe();
        Path icon = iconResource();
        String aumid = appUserModelId();
        String name = displayName();
        String relaunch = exe != null ? exe.toAbsolutePath().toString() : "";
        String iconRes = icon != null ? icon.toAbsolutePath().toString() : relaunch;
        if (!iconRes.isEmpty() && iconRes.toLowerCase(Locale.ROOT).endsWith(".exe")) {
            iconRes = iconRes + ",0";
        } else if (!iconRes.isEmpty() && !iconRes.contains(",")) {
            // .ico path is valid as RelaunchIconResource
        }

        String profileNeedle = profileNeedle();
        // PowerShell: find Chromium --app windows for our profile (or title Lark),
        // set AUMID + relaunch props, optionally SetForegroundWindow.
        StringBuilder sb = new StringBuilder();
        sb.append("$ErrorActionPreference='Stop';");
        sb.append("Add-Type -TypeDefinition @'\n");
        sb.append("using System;\n");
        sb.append("using System.Runtime.InteropServices;\n");
        sb.append("public class LarkTb {\n");
        sb.append("  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);\n");
        sb.append("  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);\n");
        sb.append("  [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr hWnd);\n");
        sb.append("  [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);\n");
        sb.append("  [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr hWnd);\n");
        sb.append("  [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);\n");
        sb.append("  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);\n");
        sb.append("  [DllImport(\"shell32.dll\")] public static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, out IPropertyStore pps);\n");
        sb.append("  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);\n");
        sb.append("  [ComImport, Guid(\"886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]\n");
        sb.append("  public interface IPropertyStore {\n");
        sb.append("    void GetCount(out uint cProps);\n");
        sb.append("    void GetAt(uint iProp, out PropertyKey pkey);\n");
        sb.append("    void GetValue(ref PropertyKey key, out PropVariant pv);\n");
        sb.append("    void SetValue(ref PropertyKey key, ref PropVariant pv);\n");
        sb.append("    void Commit();\n");
        sb.append("  }\n");
        sb.append("  [StructLayout(LayoutKind.Sequential, Pack=4)] public struct PropertyKey { public Guid fmtid; public uint pid; }\n");
        sb.append("  [StructLayout(LayoutKind.Sequential)] public struct PropVariant {\n");
        sb.append("    public ushort vt; public ushort w1; public ushort w2; public ushort w3;\n");
        sb.append("    public IntPtr pointerValue; public int i1; public int i2;\n");
        sb.append("  }\n");
        sb.append("  [DllImport(\"ole32.dll\")] public static extern int PropVariantClear(ref PropVariant pvar);\n");
        sb.append("  static readonly Guid FMTID = new Guid(\"9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3\");\n");
        sb.append("  static PropVariant Str(string s) {\n");
        sb.append("    var pv = new PropVariant(); pv.vt = 31; pv.pointerValue = Marshal.StringToCoTaskMemUni(s); return pv;\n");
        sb.append("  }\n");
        sb.append("  static void SetProp(IPropertyStore store, uint pid, string val) {\n");
        sb.append("    if (string.IsNullOrEmpty(val)) return;\n");
        sb.append("    var key = new PropertyKey { fmtid = FMTID, pid = pid };\n");
        sb.append("    var pv = Str(val);\n");
        sb.append("    try { store.SetValue(ref key, ref pv); } finally { PropVariantClear(ref pv); }\n");
        sb.append("  }\n");
        sb.append("  public static void Claim(IntPtr hwnd, string aumid, string relaunch, string icon, string display) {\n");
        sb.append("    Guid iid = new Guid(\"886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99\");\n");
        sb.append("    IPropertyStore store;\n");
        sb.append("    if (SHGetPropertyStoreForWindow(hwnd, ref iid, out store) != 0 || store == null) return;\n");
        sb.append("    SetProp(store, 2, relaunch); SetProp(store, 3, icon); SetProp(store, 4, display); SetProp(store, 5, aumid);\n");
        sb.append("    store.Commit();\n");
        sb.append("  }\n");
        sb.append("}\n");
        sb.append("'@;\n");

        sb.append("$aumid = ").append(psQuote(aumid)).append(";\n");
        sb.append("$relaunch = ").append(psQuote(relaunch.isEmpty() ? "" : "\"" + relaunch + "\"")).append(";\n");
        sb.append("$icon = ").append(psQuote(iconRes)).append(";\n");
        sb.append("$display = ").append(psQuote(name)).append(";\n");
        sb.append("$needle = ").append(psQuote(profileNeedle)).append(";\n");
        sb.append("$focus = ").append(claimOnly ? "$false" : "$true").append(";\n");
        sb.append("$pids = @{};\n");
        sb.append("try {\n");
        sb.append("  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {\n");
        sb.append("    $_.Name -match '^(msedge|chrome|chromium)\\.exe$' -and $_.CommandLine -and (\n");
        sb.append("      ($needle -and $_.CommandLine.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) -or\n");
        sb.append("      ($_.CommandLine -match '--app=http://127\\.0\\.0\\.1')\n");
        sb.append("    )\n");
        sb.append("  } | ForEach-Object { $pids[[int]$_.ProcessId] = $true }\n");
        sb.append("} catch {}\n");
        sb.append("$script:hits = New-Object System.Collections.ArrayList;\n");
        sb.append("$callback = [LarkTb+EnumProc]{\n");
        sb.append("  param([IntPtr]$hwnd, [IntPtr]$lp)\n");
        sb.append("  if (-not [LarkTb]::IsWindowVisible($hwnd)) { return $true }\n");
        sb.append("  $wpid = [uint32]0; [void][LarkTb]::GetWindowThreadProcessId($hwnd, [ref]$wpid)\n");
        sb.append("  $titleBuf = New-Object System.Text.StringBuilder 512\n");
        sb.append("  [void][LarkTb]::GetWindowText($hwnd, $titleBuf, $titleBuf.Capacity)\n");
        sb.append("  $title = $titleBuf.ToString()\n");
        sb.append("  $byPid = $pids.ContainsKey([int]$wpid)\n");
        sb.append("  $byTitle = ($title -match '(?i)\\bLark\\b')\n");
        sb.append("  if (-not ($byPid -or $byTitle)) { return $true }\n");
        sb.append("  if (-not $byPid) {\n");
        sb.append("    try {\n");
        sb.append("      $proc = Get-Process -Id $wpid -ErrorAction SilentlyContinue\n");
        sb.append("      if ($null -eq $proc) { return $true }\n");
        sb.append("      $n = $proc.ProcessName\n");
        sb.append("      if ($n -notmatch '(?i)^(msedge|chrome|chromium)$') { return $true }\n");
        sb.append("    } catch { return $true }\n");
        sb.append("  }\n");
        sb.append("  [LarkTb]::Claim($hwnd, $aumid, $relaunch, $icon, $display)\n");
        sb.append("  if ($focus) {\n");
        sb.append("    if ([LarkTb]::IsIconic($hwnd)) { [void][LarkTb]::ShowWindowAsync($hwnd, 9) }\n");
        sb.append("    [void][LarkTb]::SetForegroundWindow($hwnd)\n");
        sb.append("  }\n");
        sb.append("  [void]$script:hits.Add(1)\n");
        sb.append("  return $true\n");
        sb.append("};\n");
        sb.append("[void][LarkTb]::EnumWindows($callback, [IntPtr]::Zero);\n");
        sb.append("if ($script:hits.Count -lt 1) { exit 2 } else { exit 0 }\n");

        return runPowerShell(sb.toString(), 6) == 0;
    }

    private static void runStampScript(List<String> paths, String aumid, String exePath, String display)
            throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append("$ErrorActionPreference='SilentlyContinue';");
        sb.append("Add-Type -TypeDefinition @'\n");
        sb.append("using System;\n");
        sb.append("using System.Runtime.InteropServices;\n");
        sb.append("public class LarkLnk {\n");
        sb.append("  [DllImport(\"shell32.dll\", CharSet=CharSet.Unicode, PreserveSig=false)]\n");
        sb.append("  static extern void SHGetPropertyStoreFromParsingName(string pszPath, IntPtr pbc, uint flags, ref Guid riid, out IPropertyStore ppv);\n");
        sb.append("  [ComImport, Guid(\"886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]\n");
        sb.append("  interface IPropertyStore {\n");
        sb.append("    void GetCount(out uint cProps);\n");
        sb.append("    void GetAt(uint iProp, out PropertyKey pkey);\n");
        sb.append("    void GetValue(ref PropertyKey key, out PropVariant pv);\n");
        sb.append("    void SetValue(ref PropertyKey key, ref PropVariant pv);\n");
        sb.append("    void Commit();\n");
        sb.append("  }\n");
        sb.append("  [StructLayout(LayoutKind.Sequential, Pack=4)] struct PropertyKey { public Guid fmtid; public uint pid; }\n");
        sb.append("  [StructLayout(LayoutKind.Sequential)] struct PropVariant {\n");
        sb.append("    public ushort vt; public ushort w1; public ushort w2; public ushort w3;\n");
        sb.append("    public IntPtr pointerValue; public int i1; public int i2;\n");
        sb.append("  }\n");
        sb.append("  [DllImport(\"ole32.dll\")] static extern int PropVariantClear(ref PropVariant pvar);\n");
        sb.append("  public static void SetAppId(string path, string appId) {\n");
        sb.append("    Guid iid = new Guid(\"886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99\");\n");
        sb.append("    IPropertyStore store;\n");
        sb.append("    SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 2, ref iid, out store);\n");
        sb.append("    var key = new PropertyKey { fmtid = new Guid(\"9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3\"), pid = 5 };\n");
        sb.append("    var pv = new PropVariant(); pv.vt = 31; pv.pointerValue = Marshal.StringToCoTaskMemUni(appId);\n");
        sb.append("    try { store.SetValue(ref key, ref pv); store.Commit(); } finally { PropVariantClear(ref pv); }\n");
        sb.append("  }\n");
        sb.append("}\n");
        sb.append("'@;\n");
        sb.append("$aumid = ").append(psQuote(aumid)).append(";\n");
        sb.append("$paths = @(\n");
        for (int i = 0; i < paths.size(); i++) {
            if (i > 0) sb.append(",\n");
            sb.append("  ").append(psQuote(paths.get(i)));
        }
        sb.append("\n);\n");
        sb.append("foreach ($p in $paths) {\n");
        sb.append("  if (Test-Path -LiteralPath $p) {\n");
        sb.append("    try { [LarkLnk]::SetAppId($p, $aumid) } catch {}\n");
        sb.append("  }\n");
        sb.append("}\n");
        // Also rewrite WScript shortcuts that still point at .vbs/.bat to the exe when present.
        if (exePath != null && !exePath.isBlank()) {
            sb.append("$exe = ").append(psQuote(exePath)).append(";\n");
            sb.append("$name = ").append(psQuote(display)).append(";\n");
            sb.append("if (Test-Path -LiteralPath $exe) {\n");
            sb.append("  $w = New-Object -ComObject WScript.Shell\n");
            sb.append("  foreach ($p in $paths) {\n");
            sb.append("    if (-not (Test-Path -LiteralPath $p)) { continue }\n");
            sb.append("    try {\n");
            sb.append("      $sc = $w.CreateShortcut($p)\n");
            sb.append("      $sc.TargetPath = $exe\n");
            sb.append("      $sc.WorkingDirectory = [IO.Path]::GetDirectoryName($exe)\n");
            sb.append("      $sc.Description = $name\n");
            sb.append("      $sc.Save()\n");
            sb.append("      [LarkLnk]::SetAppId($p, $aumid)\n");
            sb.append("    } catch {}\n");
            sb.append("  }\n");
            sb.append("}\n");
        }
        runPowerShell(sb.toString(), 8);
    }

    private static String profileNeedle() {
        try {
            String channel = Instance.channel();
            if (channel == null || channel.isBlank()) channel = "portable";
            // Match both slash styles in Chrome's --user-data-dir=
            return "Lark" + java.io.File.separator + "browser" + java.io.File.separator + channel;
        } catch (Exception e) {
            return "Lark\\browser\\";
        }
    }

    private static String psQuote(String s) {
        if (s == null) s = "";
        return "'" + s.replace("'", "''") + "'";
    }

    private static int runPowerShell(String script, int timeoutSec) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle", "Hidden",
                "-Command", script
        );
        pb.redirectErrorStream(true);
        Process p = pb.start();
        boolean finished = p.waitFor(timeoutSec, TimeUnit.SECONDS);
        if (!finished) {
            p.destroyForcibly();
            return -1;
        }
        return p.exitValue();
    }
}
