package lark;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** Compiles and runs JUnit 5 tests via the console-standalone jar. */
public final class Tests {
    private static final String JUNIT_URL =
            "https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/1.10.2/junit-platform-console-standalone-1.10.2.jar";
    private static final String JUNIT_NAME = "junit-platform-console-standalone-1.10.2.jar";
    private static final Pattern TEST_METHOD = Pattern.compile(
            "@Test\\b[\\s\\S]{0,200}?\\b(?:public\\s+|protected\\s+)?void\\s+(\\w+)\\s*\\(",
            Pattern.MULTILINE);

    private final ExecutorService pool = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "lark-test");
        t.setDaemon(true);
        return t;
    });
    private final ConcurrentHashMap<String, Job> jobs = new ConcurrentHashMap<>();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public Json.Obj start(Path project, String className, String methodName) {
        if (project == null || !Files.isDirectory(project)) {
            throw new RequestFail(400, "No project folder.");
        }
        String id = UUID.randomUUID().toString();
        Job job = new Job(id);
        jobs.put(id, job);
        prune();
        pool.submit(() -> {
            try {
                runTests(project, className == null ? "" : className.trim(),
                        methodName == null ? "" : methodName.trim(), job);
            } catch (Exception e) {
                job.append((e.getMessage() == null ? "Tests failed." : e.getMessage()) + "\n");
                job.finish(1);
            }
        });
        return job.snapshot();
    }

    public Json.Obj snapshot(String id) {
        Job job = jobs.get(id);
        if (job == null) throw new RequestFail(404, "That test run is gone.");
        return job.snapshot();
    }

    public Json.Obj discover(Path project) {
        Json.Arr tests = new Json.Arr();
        if (project == null || !Files.isDirectory(project)) {
            return new Json.Obj().put("ok", true).put("tests", tests);
        }
        try (Stream<Path> walk = Files.walk(project)) {
            for (Path file : walk.filter(p -> p.toString().endsWith(".java")).toList()) {
                if (file.toString().contains(".lark-out")) continue;
                String source = Files.readString(file);
                if (!source.contains("@Test")) continue;
                String className = typeName(source, file);
                if (className.isBlank()) continue;
                Matcher m = TEST_METHOD.matcher(source);
                while (m.find()) {
                    tests.add(new Json.Obj()
                            .put("className", className)
                            .put("method", m.group(1))
                            .put("file", project.relativize(file).toString().replace('\\', '/')));
                }
            }
        } catch (IOException e) {
            throw new RequestFail(500, "Couldn't scan for tests.");
        }
        return new Json.Obj().put("ok", true).put("tests", tests);
    }

    private void runTests(Path project, String className, String methodName, Job job) throws Exception {
        Path junit = ensureJunit(job);
        List<Path> sources = javaFiles(project);
        if (sources.isEmpty()) {
            job.append("No .java files.\n");
            job.finish(1);
            return;
        }
        Path out = project.resolve(".lark-out");
        if (Files.exists(out)) Projects.deleteTree(out);
        Files.createDirectories(out);

        List<String> compile = new ArrayList<>();
        compile.add(tool("javac").toString());
        compile.add("--release");
        compile.add("17");
        compile.add("-encoding");
        compile.add("UTF-8");
        compile.add("-cp");
        compile.add(junit.toString());
        compile.add("-d");
        compile.add(".lark-out");
        for (Path source : sources) {
            compile.add(project.relativize(source).toString().replace('\\', '/'));
        }
        job.phase = "compile";
        job.append(String.join(" ", compile) + "\n");
        int compileExit = runProcess(compile, project, job, 60);
        if (compileExit != 0) {
            job.append("\n— compile failed\n");
            job.finish(compileExit);
            return;
        }

        List<String> run = new ArrayList<>();
        run.add(tool("java").toString());
        run.add("-jar");
        run.add(junit.toString());
        run.add("execute");
        run.add("--class-path");
        run.add(".lark-out");
        run.add("--disable-banner");
        run.add("--details=tree");
        if (!className.isBlank() && !methodName.isBlank()) {
            run.add("--select-method");
            run.add(className + "#" + methodName + "()");
        } else if (!className.isBlank()) {
            run.add("--select-class");
            run.add(className);
        } else {
            run.add("--scan-class-path");
        }
        job.phase = "test";
        job.append("\n" + String.join(" ", run) + "\n");
        int exit = runProcess(run, project, job, 180);
        job.append(exit == 0 ? "\n— tests passed\n" : "\n— tests finished with failures\n");
        job.finish(exit);
    }

    private Path ensureJunit(Job job) throws IOException, InterruptedException {
        Path dir = Settings.home().resolve("lib");
        Files.createDirectories(dir);
        Path jar = dir.resolve(JUNIT_NAME);
        if (Files.isRegularFile(jar) && Files.size(jar) > 1_000_000) return jar;
        job.append("Downloading JUnit (one-time)…\n");
        HttpRequest request = HttpRequest.newBuilder(URI.create(JUNIT_URL))
                .timeout(Duration.ofMinutes(2))
                .header("User-Agent", "Lark-IDE/" + Settings.VERSION)
                .GET()
                .build();
        HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("Couldn't download JUnit (" + response.statusCode() + ").");
        }
        Path tmp = jar.resolveSibling(JUNIT_NAME + ".part");
        try (InputStream in = response.body()) {
            Files.copy(in, tmp, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
        Files.move(tmp, jar, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        job.append("JUnit ready.\n");
        return jar;
    }

    private int runProcess(List<String> cmd, Path dir, Job job, int seconds) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(dir.toFile());
        pb.redirectErrorStream(true);
        Process p = pb.start();
        String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        job.append(out);
        if (!p.waitFor(seconds, TimeUnit.SECONDS)) {
            p.destroyForcibly();
            job.append("\nTimed out.\n");
            return 124;
        }
        return p.exitValue();
    }

    private static List<Path> javaFiles(Path project) throws IOException {
        List<Path> out = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(project)) {
            walk.filter(p -> p.toString().endsWith(".java") && !p.toString().contains(".lark-out"))
                    .forEach(out::add);
        }
        return out;
    }

    private static String typeName(String source, Path file) {
        Matcher pkg = Pattern.compile("(?m)^\\s*package\\s+([\\w.]+)\\s*;").matcher(source);
        String p = pkg.find() ? pkg.group(1) : "";
        Matcher type = Pattern.compile("(?m)^\\s*public\\s+(?:final\\s+|abstract\\s+)?class\\s+(\\w+)").matcher(source);
        if (!type.find()) {
            type = Pattern.compile("(?m)^\\s*class\\s+(\\w+)").matcher(source);
            if (!type.find()) {
                String base = file.getFileName().toString();
                if (base.endsWith(".java")) base = base.substring(0, base.length() - 5);
                return p.isBlank() ? base : p + "." + base;
            }
        }
        return p.isBlank() ? type.group(1) : p + "." + type.group(1);
    }

    private static Path tool(String name) {
        String home = System.getProperty("java.home");
        boolean win = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        Path bin = Path.of(home, "bin", name + (win ? ".exe" : ""));
        if (Files.isExecutable(bin)) return bin;
        return Path.of(name);
    }

    private void prune() {
        if (jobs.size() < 30) return;
        long now = System.currentTimeMillis();
        jobs.entrySet().removeIf(e -> e.getValue().done && now - e.getValue().finishedAt > 60_000);
    }

    private static final class Job {
        final String id;
        final StringBuilder output = new StringBuilder();
        volatile String phase = "starting";
        volatile boolean done;
        volatile int exitCode;
        volatile long finishedAt;

        Job(String id) {
            this.id = id;
        }

        synchronized void append(String text) {
            if (output.length() > 200_000) output.delete(0, output.length() - 160_000);
            output.append(text);
        }

        void finish(int code) {
            exitCode = code;
            done = true;
            phase = "done";
            finishedAt = System.currentTimeMillis();
        }

        synchronized Json.Obj snapshot() {
            return new Json.Obj()
                    .put("ok", true)
                    .put("id", id)
                    .put("phase", phase)
                    .put("done", done)
                    .put("exitCode", exitCode)
                    .put("output", output.toString());
        }
    }
}
