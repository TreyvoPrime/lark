package lark;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Real local Git repositories exercise setup without accessing a user's account. */
public final class LocalGitLinkCheck {
    private static String git(Path cwd, String... args) throws Exception {
        List<String> command = new ArrayList<>(List.of("git", "-C", cwd.toString()));
        command.addAll(List.of(args));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        if (!process.waitFor(30, TimeUnit.SECONDS) || process.exitValue() != 0) throw new AssertionError(command + ": " + output);
        return output;
    }
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("lark-git-link-");
        try {
            Path seed = Files.createDirectory(root.resolve("seed"));
            Path bare = root.resolve("remote.git");
            git(root, "init", "--bare", bare.toString());
            git(seed, "init", "-b", "main");
            git(seed, "config", "user.name", "Lark Test");
            git(seed, "config", "user.email", "test@example.invalid");
            Files.writeString(seed.resolve("Main.java"), "class Main {}\n");
            git(seed, "add", "Main.java"); git(seed, "commit", "-m", "Initial");
            String sha = git(seed, "rev-parse", "HEAD");
            git(seed, "remote", "add", "origin", bare.toString());
            git(seed, "push", "origin", "main");
            Path target = Files.createDirectory(root.resolve("target"));
            Files.writeString(target.resolve("Main.java"), "class Main {}\n");
            Files.writeString(target.resolve("untracked.txt"), "keep me");
            String note = LocalGitLink.attach(target, bare.toString(), "main", sha, "", false);
            if (!note.isEmpty()) throw new AssertionError(note);
            if (!git(target, "rev-parse", "HEAD").equals(sha)) throw new AssertionError("Wrong local commit");
            if (!git(target, "rev-parse", "--abbrev-ref", "@{upstream}").equals("origin/main")) throw new AssertionError("No upstream");
            if (!Files.readString(target.resolve("untracked.txt")).equals("keep me")) throw new AssertionError("Worktree changed");
            String before = git(target, "remote", "get-url", "origin");
            if (!LocalGitLink.attach(target, root.resolve("other.git").toString(), "main", sha, "").contains("preserved")) throw new AssertionError("Existing origin not preserved");
            if (!git(target, "remote", "get-url", "origin").equals(before)) throw new AssertionError("Origin changed");
            Path nested = Files.createDirectory(target.resolve("nested"));
            if (!LocalGitLink.attach(nested, bare.toString(), "main", sha, "").contains("inside an existing")) throw new AssertionError("Nested repository created");
            if (Files.exists(nested.resolve(".git"))) throw new AssertionError("Nested Git directory exists");
            System.out.println("Local Git remote, upstream, worktree and existing history checks passed.");
        } finally {
            try (var paths = Files.walk(root)) { paths.forEach(path -> path.toFile().setWritable(true)); }
            Projects.deleteTree(root);
        }
    }
}
