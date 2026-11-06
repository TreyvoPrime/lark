package lark;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Connects a published project without changing an existing Git history or worktree. */
final class LocalGitLink {
    private LocalGitLink() {}

    static String attach(Path project, String remote, String branch, String sha, String token) {
        return attach(project, remote, branch, sha, token, true);
    }

    static String attach(Path project, String remote, String branch, String sha, String token, boolean detectAncestor) {
        Path dotGit = project.resolve(".git");
        boolean existing = Files.exists(dotGit);
        try {
            // A project inside an existing repository must never become a nested repository.
            if (detectAncestor && !existing) {
                for (Path parent = project.toAbsolutePath().normalize().getParent(); parent != null; parent = parent.getParent()) {
                    if (Files.exists(parent.resolve(".git"), java.nio.file.LinkOption.NOFOLLOW_LINKS))
                        return "The project is inside an existing Git repository; its remote was not changed.";
                }
            }
            if (!existing && run(project, null, "init", "--quiet") != 0)
                return "The project was published, but its local Git repository could not be initialized.";
            if (existing) {
                // Preserve any existing origin, even if it names the same server differently.
                if (run(project, null, "remote", "get-url", "origin") == 0)
                    return "The existing Git remote and history were preserved.";
            }
            if (run(project, null, "remote", "add", "origin", remote) != 0)
                return "The project was published, but its local Git remote could not be configured.";
            if (existing) return "The GitHub remote was added; existing local history was preserved.";
            if (run(project, token, "fetch", "--quiet", "origin", "refs/heads/" + branch + ":refs/remotes/origin/" + branch) != 0)
                return "The GitHub remote was added, but the published branch could not be fetched.";
            if (!sha.matches("[0-9a-fA-F]{40,64}")) return "The GitHub remote was added, but its branch identity was invalid.";
            if (run(project, null, "merge-base", "--is-ancestor", sha, "refs/remotes/origin/" + branch) != 0)
                return "The GitHub remote was added, but the published commit could not be verified.";
            if (run(project, null, "update-ref", "refs/heads/" + branch, sha) != 0
                    || run(project, null, "symbolic-ref", "HEAD", "refs/heads/" + branch) != 0
                    || run(project, null, "reset", "--mixed", "--quiet", sha) != 0
                    || run(project, null, "branch", "--set-upstream-to=origin/" + branch, branch) != 0)
                return "The GitHub remote was added, but local branch setup was incomplete.";
            return "";
        } catch (Exception e) {
            return "The project was published, but Git is unavailable or local setup timed out.";
        }
    }

    private static int run(Path project, String token, String... args) throws Exception {
        List<String> cmd = new ArrayList<>(List.of("git", "--no-optional-locks", "-C", project.toString()));
        cmd.addAll(List.of(args));
        ProcessBuilder builder = new ProcessBuilder(cmd).redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD);
        builder.environment().keySet().removeIf(key -> key.toUpperCase(java.util.Locale.ROOT).startsWith("GIT_"));
        builder.environment().put("GIT_TERMINAL_PROMPT", "0");
        builder.environment().put("GCM_INTERACTIVE", "Never");
        if (token != null && !token.isBlank()) {
            String basic = Base64.getEncoder().encodeToString(("x-access-token:" + token).getBytes(StandardCharsets.UTF_8));
            builder.environment().put("GIT_CONFIG_COUNT", "1");
            builder.environment().put("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader");
            builder.environment().put("GIT_CONFIG_VALUE_0", "Authorization: Basic " + basic);
        }
        Process process = builder.start();
        if (!process.waitFor(45, TimeUnit.SECONDS)) { process.destroyForcibly(); process.waitFor(); throw new java.io.IOException("Git timed out"); }
        return process.exitValue();
    }
}
