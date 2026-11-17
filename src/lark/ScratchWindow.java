package lark;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

/** Native window operations for detached Scratch windows. */
public final class ScratchWindow {
    private ScratchWindow() {}

    public static void setAlwaysOnTop(String id, boolean enabled) {
        if (!WinTaskbar.isWindows()) throw new RequestFail(501, "Always on top is currently supported on Windows only.");
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,80}")) throw new RequestFail(400, "Invalid Scratch window identifier.");
        String script = "Add-Type -TypeDefinition @'\n"
                + "using System; using System.Text; using System.Runtime.InteropServices;\n"
                + "public static class LarkScratchNative {\n"
                + " public delegate bool Callback(IntPtr h, IntPtr p);\n"
                + " [DllImport(\"user32.dll\")] public static extern bool EnumWindows(Callback cb, IntPtr p);\n"
                + " [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int n);\n"
                + " [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr h);\n"
                + " [DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint flags);\n"
                + "}\n'@\n"
                + "$needle = '[Lark Scratch ' + $env:LARK_SCRATCH_ID + ']'; $hits = New-Object 'System.Collections.Generic.List[System.IntPtr]'\n"
                + "$cb = [LarkScratchNative+Callback]{ param($h,$p) $s=New-Object System.Text.StringBuilder 1024; "
                + "if ([LarkScratchNative]::IsWindowVisible($h) -and [LarkScratchNative]::GetWindowText($h,$s,$s.Capacity) -gt 0 -and $s.ToString().Contains($needle)) { $hits.Add($h) }; return $true }\n"
                + "[void][LarkScratchNative]::EnumWindows($cb,[IntPtr]::Zero)\n"
                + "if ($hits.Count -ne 1) { exit 2 }; $after = if ($env:LARK_SCRATCH_TOP -eq '1') { -1 } else { -2 }\n"
                + "if (-not [LarkScratchNative]::SetWindowPos($hits[0],[IntPtr]$after,0,0,0,0,0x13)) { exit 3 }\n";
        String encoded = Base64.getEncoder().encodeToString(script.getBytes(StandardCharsets.UTF_16LE));
        try {
            ProcessBuilder builder = new ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded);
            builder.environment().put("LARK_SCRATCH_ID", id);
            builder.environment().put("LARK_SCRATCH_TOP", enabled ? "1" : "0");
            builder.redirectErrorStream(true);
            Process process = builder.start();
            if (!process.waitFor(10, TimeUnit.SECONDS)) { process.destroyForcibly(); throw new RequestFail(503, "Scratch window control timed out."); }
            if (process.exitValue() != 0) throw new RequestFail(409, "Could not uniquely identify the Scratch window.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RequestFail(503, "Scratch window control was interrupted.");
        } catch (java.io.IOException e) {
            throw new RequestFail(503, "Windows window control is unavailable.");
        }
    }
}
