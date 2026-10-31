package lark;

import java.nio.file.*;
import java.util.List;

/** Validate isolation configuration without claiming this kernel supports namespaces. */
public final class MobileSandboxCheck {
    public static void main(String[] args) throws Exception {
        Path project = Files.createTempDirectory("lark-sandbox-check-");
        try {
            System.setProperty("lark.mobile", "true");
            System.setProperty("lark.mobile.isolate", "true");
            ProcessBuilder process = new ProcessBuilder(List.of(Path.of(System.getProperty("java.home"), "bin", "javac").toString(), "-version"));
            process.directory(project.toFile()); process.environment().put("LARK_TEST_SECRET", "must-not-leak");
            if (!Files.isExecutable(Path.of("/usr/bin/bwrap"))) {
                try { MobileSandbox.configure(process); throw new AssertionError("Missing sandbox accepted"); }
                catch (java.io.IOException expected) { System.out.println("MobileSandboxCheck: missing sandbox fails closed."); return; }
            }
            MobileSandbox.configure(process);
            var command = process.command();
            for (String flag : List.of("--unshare-all", "--clearenv", "--die-with-parent", "--new-session", "--cpu=60", "--as=4294967296", "-J-Xmx256m"))
                if (!command.contains(flag)) throw new AssertionError("Missing " + flag);
            if (process.environment().containsKey("LARK_TEST_SECRET")) throw new AssertionError("Inherited credential");
            String hostHome = System.getProperty("user.home");
            if (command.contains(hostHome)) throw new AssertionError("Host home exposed");
            System.out.println("MobileSandboxCheck: namespace, environment, mount and resource configuration passed; runtime namespace support is a separate integration requirement.");
        } finally { System.clearProperty("lark.mobile.isolate"); System.clearProperty("lark.mobile"); Projects.deleteTree(project); }
    }
}
