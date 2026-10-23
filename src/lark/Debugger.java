package lark;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
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

/**
 * Lightweight debugger driven by the JDK {@code jdb} tool.
 * Supports breakpoints, step / next / continue, and locals.
 */
public final class Debugger {
    private static final Pattern STOPPED = Pattern.compile(
            "(?:Breakpoint hit|Step completed|Breakpoint hit:).*?(?:line[= ]|:\\s*)(\\d+)",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern CURRENT = Pattern.compile(
            ",\\s*(\\w+(?:\\.\\w+)*)\\.(\\w+)\\(\\),\\s*line=(\\d+)",
            Pattern.CASE_INSENSITIVE);

    private final ExecutorService pool = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "lark-debug");
        t.setDaemon(true);
        return t;
    });
    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();

    public Debugger() {}

    public Json.Obj start(Path project, String mainClass, String args, List<String> breakpoints) {
        if (project == null || !Files.isDirectory(project)) {
            throw new RequestFail(400, "No project folder.");
        }
        if (mainClass == null || mainClass.isBlank()) {
            throw new RequestFail(400, "Pick a main class to debug.");
        }
        try {
            compileProject(project);
        } catch (IOException e) {
            throw new RequestFail(500, e.getMessage() == null ? "Compile failed." : e.getMessage());
        }

        String id = UUID.randomUUID().toString();
        Session session = new Session(id, project, mainClass);
        sessions.put(id, session);
        prune();

        List<String> cmd = new ArrayList<>();
        cmd.add(tool("jdb").toString());
        cmd.add("-classpath");
        cmd.add(".lark-out");
        cmd.add("-sourcepath");
        cmd.add(sourcePath(project));
        cmd.add(mainClass);
        if (args != null && !args.isBlank()) {
            for (String a : splitArgs(args)) cmd.add(a);
        }

        pool.submit(() -> runSession(session, cmd, breakpoints == null ? List.of() : breakpoints));
        return session.snapshot();
    }

    public Json.Obj snapshot(String id) {
        Session session = sessions.get(id);
        if (session == null) throw new RequestFail(404, "That debug session is gone.");
        return session.snapshot();
    }

    public Json.Obj command(String id, String command) {
        Session session = sessions.get(id);
        if (session == null) throw new RequestFail(404, "That debug session is gone.");
        if (command == null || command.isBlank()) throw new RequestFail(400, "Missing debug command.");
        String cmd = command.trim();
        session.send(cmd);
        // Give jdb a moment to respond for sync-ish UX.
        try {
            Thread.sleep(120);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if ("locals".equals(cmd) || cmd.startsWith("print ") || cmd.startsWith("dump ")) {
            session.captureLocals = true;
        }
        return session.snapshot();
    }

    public void stop(String id) {
        Session session = sessions.get(id);
        if (session == null) throw new RequestFail(404, "That debug session is gone.");
        session.shutdown();
    }

    private void runSession(Session session, List<String> cmd, List<String> breakpoints) {
        ProcessBuilder builder = new ProcessBuilder(cmd);
        builder.directory(session.project.toFile());
        builder.redirectErrorStream(true);
        try {
            Process process = builder.start();
            session.process = process;
            session.writer = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
            pool.submit(() -> readLoop(session, reader));

            // Wait for jdb prompt then set breakpoints and run.
            awaitReady(session, 4000);
            for (String bp : breakpoints) {
                if (bp == null || bp.isBlank()) continue;
                // "File.java:12" or "pkg.Class:12"
                String stop = toStopAt(bp);
                if (stop != null) session.send("stop at " + stop);
            }
            session.send("run");
            process.waitFor(30, TimeUnit.MINUTES);
        } catch (Exception e) {
            session.append("Debugger error: " + (e.getMessage() == null ? "failed" : e.getMessage()) + "\n");
        } finally {
            session.done = true;
            session.phase = "done";
            session.finishedAt = System.currentTimeMillis();
            session.shutdown();
        }
    }

    private void readLoop(Session session, BufferedReader reader) {
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                session.append(line + "\n");
                parseStatus(session, line);
                if (session.captureLocals && (line.contains("=") || line.trim().startsWith("Local variables:"))) {
                    session.noteLocal(line.trim());
                }
                if (line.contains("The application exited") || line.contains("VM exited")) {
                    session.done = true;
                    session.phase = "done";
                }
            }
        } catch (IOException ignored) {
            // process ended
        }
    }

    private void parseStatus(Session session, String line) {
        Matcher m = CURRENT.matcher(line);
        if (m.find()) {
            session.currentClass = m.group(1) + "." + m.group(2);
            try {
                session.currentLine = Integer.parseInt(m.group(3));
            } catch (NumberFormatException ignored) {
                // keep previous
            }
            session.phase = "paused";
            session.captureLocals = false;
            session.locals.clear();
            return;
        }
        Matcher s = STOPPED.matcher(line);
        if (s.find()) {
            try {
                session.currentLine = Integer.parseInt(s.group(1));
            } catch (NumberFormatException ignored) {
                // ignore
            }
            session.phase = "paused";
            session.captureLocals = false;
            session.locals.clear();
        }
        if (line.toLowerCase(Locale.ROOT).contains("running ...")) {
            session.phase = "running";
        }
    }

    private static void awaitReady(Session session, long ms) throws InterruptedException {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            if (session.output.toString().contains("Initializing jdb")
                    || session.output.toString().contains(">")) {
                Thread.sleep(150);
                return;
            }
            Thread.sleep(50);
        }
    }

    private static String toStopAt(String bp) {
        String value = bp.trim().replace('\\', '/');
        int colon = value.lastIndexOf(':');
        if (colon < 1) return null;
        String left = value.substring(0, colon).trim();
        String line = value.substring(colon + 1).trim();
        if (!line.matches("\\d+")) return null;
        if (left.endsWith(".java")) {
            String base = left.substring(left.lastIndexOf('/') + 1);
            base = base.substring(0, base.length() - 5);
            return base + ":" + line;
        }
        return left + ":" + line;
    }

    private void compileProject(Path project) throws IOException {
        Path junit = Settings.home().resolve("lib").resolve("junit-platform-console-standalone-1.10.2.jar");
        boolean haveJunit = Files.isRegularFile(junit) && Files.size(junit) > 1_000_000;
        List<Path> sources = new ArrayList<>();
        try (var walk = Files.walk(project)) {
            walk.filter(p -> p.toString().endsWith(".java") && !p.toString().contains(".lark-out"))
                    .forEach(sources::add);
        }
        if (!haveJunit) {
            sources.removeIf(p -> {
                String name = p.getFileName().toString();
                if (name.endsWith("Test.java") || name.endsWith("Tests.java")) return true;
                try {
                    String text = Files.readString(p);
                    return text.contains("org.junit");
                } catch (IOException e) {
                    return false;
                }
            });
        }
        if (sources.isEmpty()) throw new IOException("No .java files to compile.");
        Path out = project.resolve(".lark-out");
        if (Files.exists(out)) Projects.deleteTree(out);
        Files.createDirectories(out);
        List<String> cmd = new ArrayList<>();
        cmd.add(tool("javac").toString());
        cmd.add("--release");
        cmd.add("17");
        cmd.add("-encoding");
        cmd.add("UTF-8");
        cmd.add("-g");
        if (haveJunit) {
            cmd.add("-cp");
            cmd.add(junit.toString());
        }
        cmd.add("-d");
        cmd.add(".lark-out");
        for (Path source : sources) {
            cmd.add(project.relativize(source).toString().replace('\\', '/'));
        }
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(project.toFile());
        pb.redirectErrorStream(true);
        Process p = pb.start();
        String log = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        try {
            if (!p.waitFor(60, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new IOException("Compile timed out.");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Compile interrupted.");
        }
        if (p.exitValue() != 0) throw new IOException(log.isBlank() ? "Compile failed." : log);
    }

    private static String sourcePath(Path project) {
        Path src = project.resolve("src");
        if (Files.isDirectory(src)) return "src";
        return ".";
    }

    private static Path tool(String name) {
        String home = System.getProperty("java.home");
        Path bin = Path.of(home, "bin", name + (isWindows() ? ".exe" : ""));
        if (Files.isExecutable(bin)) return bin;
        Path sibling = Path.of(home).getParent();
        if (sibling != null) {
            Path alt = sibling.resolve("bin").resolve(name + (isWindows() ? ".exe" : ""));
            if (Files.isExecutable(alt)) return alt;
        }
        return Path.of(name);
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    private static List<String> splitArgs(String raw) {
        List<String> out = new ArrayList<>();
        if (raw == null || raw.isBlank()) return out;
        Matcher m = Pattern.compile("\"([^\"]*)\"|'([^']*)'|(\\S+)").matcher(raw.trim());
        while (m.find()) {
            if (m.group(1) != null) out.add(m.group(1));
            else if (m.group(2) != null) out.add(m.group(2));
            else out.add(m.group(3));
        }
        return out;
    }

    private void prune() {
        if (sessions.size() < 20) return;
        long now = System.currentTimeMillis();
        sessions.entrySet().removeIf(e -> e.getValue().done && now - e.getValue().finishedAt > 60_000);
    }

    private static final class Session {
        final String id;
        final Path project;
        final String mainClass;
        final StringBuilder output = new StringBuilder();
        final List<String> locals = new ArrayList<>();
        volatile String phase = "starting";
        volatile boolean done;
        volatile boolean captureLocals;
        volatile int currentLine;
        volatile String currentClass = "";
        volatile long finishedAt;
        Process process;
        BufferedWriter writer;

        Session(String id, Path project, String mainClass) {
            this.id = id;
            this.project = project;
            this.mainClass = mainClass;
        }

        synchronized void append(String text) {
            if (output.length() > 200_000) output.delete(0, output.length() - 160_000);
            output.append(text);
        }

        synchronized void noteLocal(String line) {
            if (line == null || line.isBlank()) return;
            if (line.startsWith("Local variables:")) return;
            if (locals.size() > 80) return;
            locals.add(line);
        }

        synchronized void send(String cmd) {
            if (writer == null || done) return;
            try {
                writer.write(cmd);
                writer.newLine();
                writer.flush();
                append("> " + cmd + "\n");
                if ("locals".equals(cmd)) {
                    locals.clear();
                    captureLocals = true;
                }
            } catch (IOException e) {
                append("(couldn't send " + cmd + ")\n");
            }
        }

        void shutdown() {
            try {
                if (writer != null) {
                    writer.write("quit");
                    writer.newLine();
                    writer.flush();
                }
            } catch (IOException ignored) {
                // ignore
            }
            if (process != null) process.destroyForcibly();
            done = true;
            phase = "done";
            finishedAt = System.currentTimeMillis();
        }

        synchronized Json.Obj snapshot() {
            Json.Arr loc = new Json.Arr();
            for (String line : locals) loc.add(line);
            return new Json.Obj()
                    .put("ok", true)
                    .put("id", id)
                    .put("phase", phase)
                    .put("done", done)
                    .put("mainClass", mainClass)
                    .put("currentClass", currentClass == null ? "" : currentClass)
                    .put("currentLine", currentLine)
                    .put("output", output.toString())
                    .put("locals", loc);
        }
    }
}
