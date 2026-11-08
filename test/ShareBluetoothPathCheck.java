package lark;

import java.nio.file.*;

public final class ShareBluetoothPathCheck {
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("lark-bluetooth-path-");
        try {
            Path install = Files.createDirectory(root.resolve("install"));
            Path app = Files.createDirectory(install.resolve("app"));
            Path run = Files.createDirectory(root.resolve("run"));
            Path runJar = Files.createFile(run.resolve("run-copy.jar"));
            if (ShareBluetooth.findHelper(install, runJar) != null) throw new AssertionError("missing helper accepted");
            Path helper = Files.createFile(app.resolve("lark-bluetooth.exe"));
            if (!helper.equals(ShareBluetooth.findHelper(install, runJar))) throw new AssertionError("installed helper not found from run copy");
            Files.delete(helper);
            helper = Files.createFile(install.resolve("lark-bluetooth.exe"));
            if (!helper.equals(ShareBluetooth.findHelper(install, runJar))) throw new AssertionError("portable helper not found");
            Files.delete(helper);
            helper = Files.createFile(run.resolve("lark-bluetooth.exe"));
            if (!helper.equals(ShareBluetooth.findHelper(null, runJar))) throw new AssertionError("adjacent helper not found");
        } finally { Projects.deleteTree(root); }
    }
}
