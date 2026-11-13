package lark;

import java.nio.file.Files;
import java.nio.file.Path;

/** Verifies that the native session, not the Java fallback, handles terminal traffic. */
public final class NativeTerminalCheck {
    public static void main(String[] args) throws Exception {
        System.setProperty("lark.native.helper", Path.of(args[0]).toAbsolutePath().toString());
        Terminal.Session session = new Terminal.Session("native", Files.createTempDirectory("lark-native-session-"));
        session.launch();
        try {
            if (!session.nativeSession) throw new AssertionError("Rust session was not started");
            session.write("echo LARK_NATIVE_SESSION_OK", false);
            boolean seen = false;
            for (int i = 0; i < 200; i++) {
                if (session.snapshot().str("output", "").contains("LARK_NATIVE_SESSION_OK")) { seen = true; break; }
                Thread.sleep(25);
            }
            if (!seen) throw new AssertionError("native shell output missing");
            String privateCommand = System.getProperty("os.name", "").toLowerCase().contains("win")
                    ? "set LARK_PRIVATE_INPUT=hidden" : "export LARK_PRIVATE_INPUT=hidden";
            session.write(privateCommand, true);
            session.write("echo LARK_PRIVATE_CHECK_DONE", false);
            for (int i = 0; i < 200 && !session.snapshot().str("output", "").contains("LARK_PRIVATE_CHECK_DONE"); i++) Thread.sleep(25);
            if (session.snapshot().str("output", "").contains(privateCommand)) throw new AssertionError("private input was echoed");
            session.write("exit", false);
            for (int i = 0; i < 200 && session.snapshot().bool("alive"); i++) Thread.sleep(25);
            String last = session.snapshot().str("output", "");
            if (!last.contains("LARK_NATIVE_SESSION_OK")) throw new AssertionError("output disappeared after exit");
            System.out.println("Rust terminal session integration passed");
        } finally { session.kill(); }
    }
}
