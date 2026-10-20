package lark;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * Lightweight compile-only check for live Problems feedback.
 * Writes into a separate .lark-check folder so it never fights a Run.
 */
public final class Checker {
    public Checker() {}

    public Json.Obj check(Path project) {
        if (project == null || !Files.isDirectory(project)) {
            throw new RequestFail(400, "No project folder.");
        }
        try {
            return compile(project);
        } catch (IOException e) {
            throw new RequestFail(500, e.getMessage() == null ? "Check failed." : e.getMessage());
        }
    }

    private Json.Obj compile(Path project) throws IOException {
        List<Path> sources = javaFiles(project);
        Json.Arr problems = new Json.Arr();
        if (sources.isEmpty()) {
            return new Json.Obj().put("ok", true).put("problems", problems).put("clean", true);
        }

        Path junit = Settings.home().resolve("lib").resolve("junit-platform-console-standalone-1.10.2.jar");
        boolean haveJunit = Files.isRegularFile(junit);
        try {
            haveJunit = haveJunit && Files.size(junit) > 1_000_000;
        } catch (IOException ignored) {
            haveJunit = false;
        }
        if (!haveJunit) {
            sources = new ArrayList<>(sources);
            sources.removeIf(p -> {
                String name = p.getFileName().toString();
                if (name.endsWith("Test.java") || name.endsWith("Tests.java")) return true;
                try {
                    return Files.readString(p).contains("org.junit");
                } catch (IOException e) {
                    return false;
                }
            });
        }
        if (sources.isEmpty()) {
            return new Json.Obj().put("ok", true).put("problems", problems).put("clean", true);
        }

        Path out = project.resolve(".lark-check");
        if (Files.exists(out)) Projects.deleteTree(out);
        Files.createDirectories(out);

        List<String> cmd = new ArrayList<>();
        cmd.add(tool("javac").toString());
        cmd.add("--release");
        cmd.add("17");
        cmd.add("-encoding");
        cmd.add("UTF-8");
        cmd.add("-Xlint:unchecked");
        cmd.add("-Xlint:deprecation");
        cmd.add("-Xmaxerrs");
        cmd.add("40");
        if (haveJunit) {
            cmd.add("-cp");
            cmd.add(junit.toString());
        }
        cmd.add("-d");
        cmd.add(".lark-check");
        for (Path source : sources) {
            cmd.add(project.relativize(source).toString().replace('\\', '/'));
        }

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(project.toFile());
        pb.redirectErrorStream(true);
        Process p = pb.start();
        String log = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        try {
            if (!p.waitFor(45, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                return new Json.Obj().put("ok", true).put("problems", problems)
                        .put("clean", false).put("message", "Compile check timed out.");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Compile check interrupted.");
        }

        for (Runner.Problem problem : Runner.parseDiagnostics(project, log)) {
            problems.add(new Json.Obj()
                    .put("file", problem.file())
                    .put("line", problem.line())
                    .put("column", problem.column())
                    .put("severity", problem.severity())
                    .put("message", problem.message())
                    .put("plain", problem.plain())
                    .put("hint", problem.hint())
                    .put("source", "compile"));
        }
        boolean clean = p.exitValue() == 0 && problems.size() == 0;
        return new Json.Obj()
                .put("ok", true)
                .put("problems", problems)
                .put("clean", clean)
                .put("exitCode", p.exitValue());
    }

    private static List<Path> javaFiles(Path project) throws IOException {
        try (Stream<Path> walk = Files.walk(project)) {
            return walk.filter(path -> Files.isRegularFile(path) && path.getFileName().toString().endsWith(".java"))
                    .filter(path -> !Projects.skip(project.relativize(path).toString().replace('\\', '/')))
                    .sorted()
                    .toList();
        }
    }

    private static Path tool(String name) {
        String home = System.getProperty("java.home");
        boolean win = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        Path bin = Path.of(home, "bin", name + (win ? ".exe" : ""));
        if (Files.isExecutable(bin)) return bin;
        return Path.of(name);
    }
}
