package lark;

import java.nio.file.Files;
import java.nio.file.Path;

/** Exercises the Java-to-Rust integration with a disposable local repository. */
public final class NativeGitCheck {
    public static void main(String[] args) throws Exception {
        Path helper = Path.of(args[0]).toAbsolutePath();
        System.setProperty("lark.native.helper", helper.toString());
        Path dir = Files.createTempDirectory("lark-native-git-");
        Process init = new ProcessBuilder("git", "init", "-q", dir.toString()).redirectErrorStream(true).start();
        if (init.waitFor() != 0) throw new AssertionError("git init failed");
        Terminal.Session session = new Terminal.Session("native-check", dir);
        session.checkGit();
        if (!session.gitStatus.endsWith(" · clean")) throw new AssertionError("clean status: " + session.gitStatus);
        Files.writeString(dir.resolve("space in file.java"), "class Example {}\n");
        session.checkGit();
        if (!session.gitStatus.endsWith(" · 1 changed")) throw new AssertionError("dirty status: " + session.gitStatus);
        System.out.println("Rust Git status integration passed");
    }
}
