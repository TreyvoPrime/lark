package lark;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
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

/** Compiles a project with javac and runs the chosen main class. */
public final class Runner {
    private static final int OUT_CAP = 200_000;
    private static final Pattern DIAG = Pattern.compile(
            "^(.*\\.java):(\\d+):(?:(\\d+):)?\\s*(error|warning):\\s*(.+)$");
    private static final Pattern PKG = Pattern.compile("(?m)^\\s*package\\s+([\\w.]+)\\s*;");
    private static final Pattern PUBLIC_TYPE = Pattern.compile(
            "(?m)^\\s*public\\s+(?:final\\s+|abstract\\s+)?(?:class|interface|enum|record)\\s+(\\w+)");
    private static final Pattern ANY_TYPE = Pattern.compile(
            "(?m)^\\s*(?:public\\s+)?(?:final\\s+|abstract\\s+)?(?:class|interface|enum|record)\\s+(\\w+)");
    private static final Pattern MAIN = Pattern.compile(
            "static\\s+void\\s+main\\s*\\(\\s*String\\s*(?:\\[\\s*\\]|\\.\\.\\.)\\s+\\w+\\s*\\)");

    private final ExecutorService pool = Executors.newCachedThreadPool(r -> {
        Thread thread = new Thread(r, "lark-run");
        thread.setDaemon(true);
        return thread;
    });
    private final ConcurrentHashMap<String, Job> jobs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Object> locks = new ConcurrentHashMap<>();

    public String start(Path project, String mainClass, String args, String stdin) {
        String id = UUID.randomUUID().toString();
        Job job = new Job(id);
        jobs.put(id, job);
        prune();
        String key = project.toAbsolutePath().toString();
        // Stop an older run for this project so a stuck Scanner prompt cannot block the next Run.
        for (Job existing : jobs.values()) {
            if (existing != job && key.equals(existing.projectKey) && !existing.done) {
                existing.cancel();
            }
        }
        job.projectKey = key;
        pool.submit(() -> {
            try {
                synchronized (locks.computeIfAbsent(key, k -> new Object())) {
                    if (job.cancelled) {
                        job.append("Stopped.\n");
                        job.finish(-1);
                        return;
                    }
                    execute(project, mainClass == null ? "" : mainClass, args == null ? "" : args,
                            stdin == null ? "" : stdin, job);
                }
            } catch (Exception e) {
                job.append((e.getMessage() == null ? "The run failed." : e.getMessage()) + "\n");
                job.finish(1);
            }
        });
        return id;
    }

    /**
     * Compiles and runs a single throwaway Java source (Scratch pad).
     * Source must already be a complete compilation unit with a main method.
     */
    public String startScratch(String source, String mainClass, String args, String stdin) {
        if (source == null || source.isBlank()) {
            throw new RequestFail(400, "Scratch pad is empty.");
        }
        if (source.length() > 200_000) {
            throw new RequestFail(400, "That scratch program is too long.");
        }
        String main = mainClass == null || mainClass.isBlank() ? "ScratchPad" : mainClass.trim();
        if (!main.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            throw new RequestFail(400, "Invalid scratch main class.");
        }
        Path dir = Settings.home().resolve("scratch-run");
        try {
            if (Files.isDirectory(dir)) Projects.deleteTree(dir);
            Files.createDirectories(dir);
            Files.writeString(dir.resolve(main + ".java"), source);
        } catch (IOException e) {
            throw new RequestFail(500, "Couldn't prepare the scratch pad run.");
        }
        return start(dir, main, args == null ? "" : args, stdin == null ? "" : stdin);
    }

    public Json.Obj snapshot(String id) {
        Job job = jobs.get(id);
        if (job == null) throw new RequestFail(404, "That run is gone.");
        return job.snapshot();
    }

    public void stop(String id) {
        Job job = jobs.get(id);
        if (job == null) throw new RequestFail(404, "That run is gone.");
        job.cancel();
    }

    /** Sends a line to a running program's standard input. */
    public void writeInput(String id, String text) {
        Job job = jobs.get(id);
        if (job == null) throw new RequestFail(404, "That run is gone.");
        if (text == null) text = "";
        if (text.length() > 20_000) throw new RequestFail(400, "That input is too long.");
        job.writeInput(text);
    }

    private void prune() {
        if (jobs.size() < 40) return;
        long now = System.currentTimeMillis();
        jobs.entrySet().removeIf(entry -> entry.getValue().done && now - entry.getValue().finishedAt > 60_000);
    }

    private void execute(Path project, String mainClass, String args, String stdin, Job job) throws IOException, InterruptedException {
        List<Path> sources = javaFiles(project);
        if (sources.isEmpty()) {
            job.append("This project has no .java files yet.\n");
            job.finish(1);
            return;
        }
        if (mainClass.isBlank()) mainClass = detectMain(sources);
        if (mainClass == null || mainClass.isBlank()) {
            job.append("No main method found. Add public static void main, or pick a class in the Run menu.\n");
            job.finish(1);
            return;
        }

        Path outDir = project.resolve(".lark-out");
        if (Files.exists(outDir)) Projects.deleteTree(outDir);
        Files.createDirectories(outDir);

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

        List<String> compile = new ArrayList<>();
        compile.add(tool("javac").toString());
        compile.add("--release");
        compile.add("17");
        compile.add("-encoding");
        compile.add("UTF-8");
        if (haveJunit) {
            compile.add("-cp");
            compile.add(junit.toString());
        }
        compile.add("-d");
        compile.add(".lark-out");
        compile.add("-Xmaxerrs");
        compile.add("40");
        for (Path source : sources) {
            compile.add(project.relativize(source).toString().replace('\\', '/'));
        }

        job.phase = "compile";
        job.append(format(compile) + "\n");
        StringBuilder compileErr = new StringBuilder();
        int compileExit = executeProcess(compile, project, "", 30, job, null, compileErr, true);
        job.setProblems(parseDiagnostics(project, compileErr.toString()));
        long errors = job.problems.stream().filter(problem -> "error".equals(problem.severity)).count();
        if (job.cancelled) {
            job.finish(-1);
            return;
        }
        if (compileExit != 0 || errors > 0) {
            job.append("\n— compile failed\n");
            job.finish(compileExit == 0 ? 1 : compileExit);
            return;
        }

        List<String> run = new ArrayList<>();
        run.add(tool("java").toString());
        // Keep emoji and other Unicode readable on Windows and Linux.
        if (Mobile.isMobile()) { run.add("-Xmx256m"); run.add("-XX:ActiveProcessorCount=2"); }
        run.add("-Dfile.encoding=UTF-8");
        run.add("-Dstdout.encoding=UTF-8");
        run.add("-Dstderr.encoding=UTF-8");
        run.add("-Dstdin.encoding=UTF-8");
        run.add("-Dsun.stdout.encoding=UTF-8");
        run.add("-Dsun.stderr.encoding=UTF-8");
        run.add("-cp");
        run.add(".lark-out");
        run.add(mainClass);
        run.addAll(splitArgs(args));
        job.phase = "run";
        job.append("\n" + format(run) + "\n");
        if (stdin == null || stdin.isBlank()) {
            job.append("(Type under Output if the program asks a question.)\n");
        }
        int exit = executeProcess(run, project, stdin, Mobile.isMobile() ? 60 : 300, job, null, null, true);
        if (!job.cancelled) job.append("\n— exited " + exit + "\n");
        job.finish(exit);
    }

    private int executeProcess(List<String> cmd, Path dir, String stdin, int seconds, Job job,
                               StringBuilder stdout, StringBuilder stderr, boolean echo) throws InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(cmd);
        builder.directory(dir.toFile());
        builder.redirectInput(ProcessBuilder.Redirect.PIPE);
        builder.redirectOutput(ProcessBuilder.Redirect.PIPE);
        builder.redirectError(ProcessBuilder.Redirect.PIPE);
        builder.environment().put("LANG", "C.UTF-8");
        builder.environment().put("LC_ALL", "C.UTF-8");
        builder.environment().put("PYTHONIOENCODING", "utf-8");
        Process process;
        try {
            MobileSandbox.configure(builder);
            process = builder.start();
        } catch (IOException e) {
            job.append((MobileSandbox.required() ? "Isolated Java execution could not start: " + e.getMessage() : "Lark cannot start the Java tools. Check the JDK installation.") + "\n");
            return 127;
        }
        job.process = process;
        Thread outThread = gobble(process.getInputStream(), echo ? job : null, stdout);
        Thread errThread = gobble(process.getErrorStream(), echo ? job : null, stderr);
        OutputStream os = process.getOutputStream();
        // Keep stdin open for the whole run so Scanner.nextLine() waits for the reply box.
        // Closing it early is what causes "NoSuchElementException: No line found".
        boolean keepOpen = "run".equals(job.phase);
        if (keepOpen) job.attachStdin(os);
        try {
            if (stdin != null && !stdin.isEmpty()) {
                os.write(stdin.getBytes(StandardCharsets.UTF_8));
                if (!stdin.endsWith("\n")) os.write('\n');
                os.flush();
            }
            if (!keepOpen) {
                try {
                    os.close();
                } catch (IOException ignored) {
                    // Compile tools don't read stdin.
                }
            }
        } catch (IOException ignored) {
            // The program may have closed stdin already.
        }
        boolean finished = process.waitFor(seconds, TimeUnit.SECONDS);
        if (keepOpen) job.closeStdin();
        if (!finished) {
            process.destroyForcibly();
            if (job.cancelled) job.append("\nStopped.\n");
            else job.append("\nStopped after " + seconds + " seconds.\n");
        } else if (job.cancelled) {
            job.append("\nStopped.\n");
        }
        outThread.join(2000);
        errThread.join(2000);
        try {
            return process.exitValue();
        } catch (IllegalThreadStateException e) {
            return job.cancelled ? -1 : 124;
        }
    }

    private Thread gobble(InputStream in, Job job, StringBuilder capture) {
        Thread thread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                char[] buf = new char[1024];
                int n;
                while ((n = reader.read(buf)) >= 0) {
                    String chunk = new String(buf, 0, n);
                    if (capture != null) capture.append(chunk);
                    if (job != null) job.append(chunk);
                }
            } catch (IOException ignored) {
                // The process was stopped.
            }
        }, "lark-io");
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    private static List<Path> javaFiles(Path project) throws IOException {
        try (Stream<Path> walk = Files.walk(project)) {
            return walk.filter(path -> Files.isRegularFile(path) && path.getFileName().toString().endsWith(".java"))
                    .filter(path -> !Projects.skip(project.relativize(path).toString().replace('\\', '/')))
                    .sorted()
                    .toList();
        }
    }

    static String detectMain(List<Path> sources) throws IOException {
        String first = null;
        String namedMain = null;
        for (Path source : sources) {
            String text = Files.readString(source);
            if (!MAIN.matcher(text).find()) continue;
            String pkg = "";
            Matcher packageMatcher = PKG.matcher(text);
            if (packageMatcher.find()) pkg = packageMatcher.group(1);
            String type = null;
            Matcher pub = PUBLIC_TYPE.matcher(text);
            if (pub.find()) type = pub.group(1);
            else {
                Matcher any = ANY_TYPE.matcher(text);
                if (any.find()) type = any.group(1);
            }
            if (type == null) continue;
            String qualified = pkg.isBlank() ? type : pkg + "." + type;
            if (first == null) first = qualified;
            if ("Main".equals(type)) namedMain = qualified;
        }
        return namedMain != null ? namedMain : first;
    }

    public static List<Problem> parseDiagnostics(Path project, String stderr) {
        List<Problem> list = new ArrayList<>();
        if (stderr == null || stderr.isBlank()) return list;
        String prefix = project.toAbsolutePath().toString().replace('\\', '/');
        String[] lines = stderr.split("\\R");
        for (int i = 0; i < lines.length; i++) {
            Matcher matcher = DIAG.matcher(lines[i].trim());
            if (!matcher.matches()) continue;
            String file = matcher.group(1).replace('\\', '/');
            if (file.startsWith(prefix + "/")) file = file.substring(prefix.length() + 1);
            int lineNo = Integer.parseInt(matcher.group(2));
            int column = matcher.group(3) == null ? 0 : Integer.parseInt(matcher.group(3));
            String severity = matcher.group(4);
            StringBuilder message = new StringBuilder(matcher.group(5));
            // Pull in javac follow-up lines (symbol: / location:) so explanations can name what was missing.
            for (int j = i + 1; j < lines.length && j <= i + 4; j++) {
                String extra = lines[j].trim();
                if (extra.isEmpty()) continue;
                if (DIAG.matcher(extra).matches()) break;
                if (extra.startsWith("^")) continue;
                if (extra.startsWith("symbol:") || extra.startsWith("location:")
                        || extra.startsWith("required:") || extra.startsWith("found:")
                        || extra.startsWith("reason:")) {
                    message.append(' ').append(extra);
                    i = j;
                } else {
                    break;
                }
            }
            String full = message.toString();
            Errors.Explained explained = Errors.explainCompile(full);
            list.add(new Problem(file, lineNo, column, severity, full, explained.plain(), explained.hint()));
        }
        return list;
    }

    public static List<String> splitArgs(String raw) {
        List<String> args = new ArrayList<>();
        if (raw == null || raw.isBlank()) return args;
        StringBuilder current = new StringBuilder();
        boolean quote = false;
        char which = 0;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (quote) {
                if (c == which) quote = false;
                else current.append(c);
            } else if (c == '"' || c == '\'') {
                quote = true;
                which = c;
            } else if (Character.isWhitespace(c)) {
                if (!current.isEmpty()) {
                    args.add(current.toString());
                    current.setLength(0);
                }
            } else {
                current.append(c);
            }
        }
        if (!current.isEmpty()) args.add(current.toString());
        return args;
    }

    static Path tool(String name) {
        String exe = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win") ? name + ".exe" : name;
        Path home = Path.of(System.getProperty("java.home"));
        Path bin = home.resolve("bin").resolve(exe);
        if (Files.isExecutable(bin)) return bin;
        if (home.getParent() != null) {
            Path alt = home.getParent().resolve("bin").resolve(exe);
            if (Files.isExecutable(alt)) return alt;
        }
        return Path.of(name);
    }

    static String format(List<String> cmd) {
        StringBuilder out = new StringBuilder("> ");
        for (int i = 0; i < cmd.size(); i++) {
            if (i > 0) out.append(' ');
            String part = cmd.get(i);
            if (i == 0) part = Path.of(part).getFileName().toString();
            if (part.indexOf(' ') >= 0) out.append('"').append(part).append('"');
            else out.append(part);
        }
        return out.toString();
    }

    public record Problem(
            String file,
            int line,
            int column,
            String severity,
            String message,
            String plain,
            String hint
    ) {
        Json.Obj toJson() {
            return new Json.Obj()
                    .put("file", file)
                    .put("line", line)
                    .put("column", column)
                    .put("severity", severity)
                    .put("message", message)
                    .put("plain", plain == null ? "" : plain)
                    .put("hint", hint == null ? "" : hint);
        }
    }

    static final class Job {
        final String id;
        final StringBuilder out = new StringBuilder();
        volatile String phase = "start";
        volatile boolean done;
        volatile boolean cancelled;
        volatile int exitCode;
        volatile long finishedAt;
        volatile Process process;
        volatile String projectKey = "";
        private OutputStream stdin;
        List<Problem> problems = List.of();

        Job(String id) {
            this.id = id;
        }

        synchronized void attachStdin(OutputStream stream) {
            stdin = stream;
        }

        synchronized void closeStdin() {
            OutputStream stream = stdin;
            stdin = null;
            if (stream == null) return;
            try {
                stream.close();
            } catch (IOException ignored) {
                // Already closed by the program.
            }
        }

        synchronized void writeInput(String text) {
            if (done || cancelled) {
                throw new RequestFail(400, "That program already finished.");
            }
            OutputStream stream = stdin;
            if (stream == null) {
                throw new RequestFail(400, "That program isn't accepting input right now.");
            }
            if (!text.endsWith("\n")) text = text + "\n";
            try {
                stream.write(text.getBytes(StandardCharsets.UTF_8));
                stream.flush();
                append(text);
            } catch (IOException e) {
                throw new RequestFail(400, "Couldn't send that input. The program may have closed it.");
            }
        }

        synchronized void append(String text) {
            if (text == null || out.length() >= OUT_CAP) return;
            int room = OUT_CAP - out.length();
            if (text.length() > room) {
                out.append(text, 0, room).append("\n… output truncated\n");
            } else {
                out.append(text);
            }
        }

        synchronized void setProblems(List<Problem> list) {
            problems = list;
        }

        synchronized void finish(int code) {
            if (done) return;
            exitCode = code;
            done = true;
            finishedAt = System.currentTimeMillis();
            phase = "done";
        }

        void cancel() {
            cancelled = true;
            Process current = process;
            if (current != null) current.destroyForcibly();
        }

        synchronized Json.Obj snapshot() {
            Json.Arr problemsJson = new Json.Arr();
            for (Problem problem : problems) problemsJson.add(problem.toJson());
            boolean acceptsInput = !done && !cancelled && stdin != null && "run".equals(phase);
            Json.Obj obj = new Json.Obj()
                    .put("ok", true)
                    .put("id", id)
                    .put("phase", phase)
                    .put("output", out.toString())
                    .put("done", done)
                    .put("acceptsInput", acceptsInput)
                    .put("problems", problemsJson);
            if (done) obj.put("exit", exitCode);
            return obj;
        }
    }
}
