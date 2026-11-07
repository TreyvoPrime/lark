package lark;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

/** Local desktop pickers. A cancelled dialog never creates a project. */
public final class NativePicker {
    private NativePicker() {}
    public static synchronized Path choose(boolean folder) throws Exception {
        if (System.getProperty("os.name", "").toLowerCase().contains("win")) {
            String script = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; " +
                "$owner=New-Object System.Windows.Forms.Form; $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.Width=1; $owner.Height=1; $owner.StartPosition='CenterScreen'; " +
                "$owner.Show(); $owner.Activate(); " +
                (folder ? "$dialog=New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description='Choose or create a folder for your Lark project'; $dialog.ShowNewFolderButton=$true; $dialog.SelectedPath=[Environment]::GetFolderPath('MyDocuments'); " :
                "$dialog=New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title='Open a code file in Lark'; $dialog.InitialDirectory=[Environment]::GetFolderPath('MyDocuments'); $dialog.Filter='Code and text files (*.*)|*.*'; $dialog.CheckFileExists=$true; ") +
                "try { if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write(" + (folder ? "$dialog.SelectedPath" : "$dialog.FileName") + ") } } finally { $dialog.Dispose(); $owner.Dispose() }";
            String encoded = Base64.getEncoder().encodeToString(script.getBytes(StandardCharsets.UTF_16LE));
            Process process = new ProcessBuilder("powershell.exe", "-NoProfile", "-STA", "-EncodedCommand", encoded).start();
            if (!process.waitFor(5, TimeUnit.MINUTES)) { process.destroyForcibly(); throw new RequestFail(408, "Folder or file selection timed out. Try again."); }
            String result = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).replace("\uFEFF", "").trim();
            if (process.exitValue() != 0) throw new RequestFail(503, "Windows couldn't open the file picker. Please try again.");
            return result.isEmpty() ? null : Path.of(result);
        }
        if (java.awt.GraphicsEnvironment.isHeadless()) throw new RequestFail(503, "A desktop is required to select files.");
        final Path[] selected = new Path[1];
        javax.swing.SwingUtilities.invokeAndWait(() -> {
            javax.swing.JFileChooser picker = new javax.swing.JFileChooser(Path.of(System.getProperty("user.home"), "Documents").toFile());
            picker.setFileSelectionMode(folder ? javax.swing.JFileChooser.DIRECTORIES_ONLY : javax.swing.JFileChooser.FILES_ONLY);
            if (picker.showOpenDialog(null) == javax.swing.JFileChooser.APPROVE_OPTION) selected[0] = picker.getSelectedFile().toPath();
        });
        return selected[0];
    }
}
