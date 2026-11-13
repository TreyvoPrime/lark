package lark;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.RejectedExecutionException;

/**
 * Interactive shell sessions for the Terminal tab. Commands run on this machine
 * in the open project folder (localhost-only API).
 */
public final class Terminal {
    private static final int OUT_CAP = 400_000;
    private final ExecutorService pool = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "lark-term");
        t.setDaemon(true);
        return t;
    });
    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();

    public Json.Obj start(Path cwd) {
        Path dir = cwd == null ? Path.of("").toAbsolutePath().normalize() : cwd.toAbsolutePath().normalize();
        if (!Files.isDirectory(dir)) {
            throw new RequestFail(400, "That folder does not exist for the terminal.");
        }
        prune();
        if (sessions.size() >= 12) throw new RequestFail(429, "Too many terminal sessions. Close an existing terminal first.");
        String id = UUID.randomUUID().toString();
        Session session = new Session(id, dir);
        sessions.put(id, session);
        try {
            session.launch();
        } catch (IOException e) {
            sessions.remove(id);
            throw new RequestFail(500, e.getMessage() == null ? "Couldn't start a shell." : e.getMessage());
        }
        if (!session.nativeSession) pool.submit(session::pump);
        return snapshot(id);
    }

    public Json.Obj snapshot(String id) {
        Session session = sessions.get(id);
        if (session == null) throw new RequestFail(404, "That terminal session is gone.");
        if (session.beginGitCheck()) pool.submit(session::checkGit);
        return session.snapshot();
    }

    public void write(String id, String text, boolean sensitive) {
        Session session = sessions.get(id);
        if (session == null) throw new RequestFail(404, "That terminal session is gone.");
        if (text == null) text = "";
        if (text.length() > 20_000) throw new RequestFail(400, "That command is too long.");
        session.write(text, sensitive);
    }

    public Json.Obj stop(String id) {
        Session session = sessions.get(id);
        if (session == null) return new Json.Obj().put("ok", true);
        session.kill();
        sessions.remove(id);
        return new Json.Obj().put("ok", true);
    }

    public void shutdown() {
        for (Session session : sessions.values()) session.kill();
        sessions.clear();
        pool.shutdownNow();
    }

    private void prune() {
        if (sessions.size() < 12) return;
        long now = System.currentTimeMillis();
        sessions.entrySet().removeIf(entry -> {
            Session s = entry.getValue();
            if (!s.alive() && now - s.finishedAt > 60_000) {
                s.kill();
                return true;
            }
            return false;
        });
    }

    static final class Session {
        final String id;
        final Path cwd;
        final StringBuilder out = new StringBuilder();
        final Object lock = new Object();
        // A blocked child must not hold an HTTP request thread. Preserve input order
        // and bound queued input so an unresponsive process cannot exhaust memory.
        final ThreadPoolExecutor input = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(32), r -> { Thread t = new Thread(r, "lark-term-input"); t.setDaemon(true); return t; });
        volatile Process process;
        volatile OutputStream stdin;
        volatile boolean done;
        volatile long finishedAt;
        volatile String gitStatus = "";
        private boolean gitChecking;
        private long lastGitCheck;
        final Charset charset;
        final boolean windows;
        volatile boolean nativeSession;
        final Object nativeLock = new Object();
        java.io.DataInputStream nativeIn;
        java.io.DataOutputStream nativeOut;
        volatile boolean nativeAlive = true;
        volatile String nativeText = "";

        Session(String id, Path cwd) {
            this.id = id;
            this.cwd = cwd;
            this.charset = Charset.defaultCharset();
            this.windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        }

        void launch() throws IOException {
            ProcessBuilder pb;
            if (windows) {
                pb = new ProcessBuilder("cmd.exe", "/Q", "/K", "prompt $P$G");
            } else {
                String shell = System.getenv("SHELL");
                if (shell == null || shell.isBlank()) shell = "/bin/bash";
                if (!Files.isExecutable(Path.of(shell))) shell = "/bin/sh";
                // Non-interactive keeps piped stdin quiet (no job-control noise).
                pb = new ProcessBuilder(shell);
            }
            ProcessBuilder fallback = pb;
            Path helper = NativeTools.find();
            if (helper != null) {
                java.util.List<String> command = new java.util.ArrayList<>();
                command.add(helper.toString());
                command.add("terminal-session");
                command.addAll(pb.command());
                pb = new ProcessBuilder(command);
            }
            pb.directory(cwd.toFile());
            if (helper == null) pb.redirectErrorStream(true);
            else pb.redirectError(ProcessBuilder.Redirect.DISCARD);
            Map<String, String> env = pb.environment();
            env.put("TERM", "dumb");
            env.put("LARK_TERMINAL", "1");
            try {
                process = pb.start();
                if (helper != null) {
                    nativeIn = new java.io.DataInputStream(process.getInputStream());
                    nativeOut = new java.io.DataOutputStream(process.getOutputStream());
                    Process starting = process;
                    java.util.concurrent.CompletableFuture<Integer> ready = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                        try { return nativeIn.read(); } catch (IOException e) { return -1; }
                    });
                    try {
                        if (ready.get(10, TimeUnit.SECONDS) != 0) throw new IOException("Native terminal could not start");
                        nativeSession = true;
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        starting.destroyForcibly();
                        throw new IOException("Native terminal interrupted", e);
                    } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException e) {
                        starting.destroyForcibly();
                        throw new IOException("Native terminal could not start", e);
                    }
                }
            } catch (IOException failure) {
                if (helper == null) throw failure;
                if (process != null) process.destroyForcibly();
                nativeSession = false;
                nativeIn = null; nativeOut = null;
                fallback.directory(cwd.toFile()).redirectErrorStream(true);
                fallback.environment().put("TERM", "dumb");
                fallback.environment().put("LARK_TERMINAL", "1");
                process = fallback.start();
            }
            stdin = process.getOutputStream();
            append("— Lark terminal — " + cwd + "\n");
            String searchPath = env.entrySet().stream().filter(e -> e.getKey().equalsIgnoreCase("PATH"))
                    .map(Map.Entry::getValue).findFirst().orElse("");
            append(findGit(searchPath, windows) ? "Git detected on PATH.\n" : "Git was not found on PATH; install Git or update PATH.\n");
            if (windows) append("Type commands below. Example: dir   or   javac -version\n\n");
            else append("Type commands below. Example: ls   or   javac -version\n\n");
        }

        static boolean findGit(String path, boolean windows) {
            if (path == null) return false;
            for (String dir : path.split(java.util.regex.Pattern.quote(java.io.File.pathSeparator))) {
                if (dir.isBlank()) continue;
                try {
                    Path candidate = Path.of(dir, windows ? "git.exe" : "git");
                    if (Files.isRegularFile(candidate) && (windows || Files.isExecutable(candidate))) return true;
                } catch (RuntimeException ignored) { }
            }
            return false;
        }

        synchronized boolean beginGitCheck() {
            if (done || gitChecking || System.currentTimeMillis() - lastGitCheck < 3000) return false;
            gitChecking = true; lastGitCheck = System.currentTimeMillis(); return true;
        }
        void checkGit() {
            Process git = null;
            try {
                Path nativeHelper = NativeTools.find();
                if (nativeHelper != null) {
                    ProcessBuilder nativeBuilder = new ProcessBuilder(nativeHelper.toString(), "git-status");
                    nativeBuilder.directory(cwd.toFile()).redirectErrorStream(true);
                    git = nativeBuilder.start();
                    if (!git.waitFor(2, TimeUnit.SECONDS)) {
                        git.descendants().forEach(ProcessHandle::destroyForcibly);
                        git.destroyForcibly();
                        gitStatus = "Git status unavailable";
                        return;
                    }
                    if (git.exitValue() == 0) {
                        gitStatus = new String(git.getInputStream().readNBytes(65536), StandardCharsets.UTF_8).strip();
                        return;
                    }
                }
                ProcessBuilder builder = new ProcessBuilder("git", "--no-optional-locks", "status", "--porcelain=v1", "--branch");
                builder.directory(cwd.toFile()).redirectErrorStream(true);
                builder.environment().put("GIT_TERMINAL_PROMPT", "0");
                git = builder.start();
                if (!git.waitFor(2, TimeUnit.SECONDS)) { git.destroyForcibly(); gitStatus = "Git status unavailable"; return; }
                if (git.exitValue() != 0) { gitStatus = ""; return; }
                String output = new String(git.getInputStream().readNBytes(65536), charset);
                String[] lines = output.split("\\R");
                String branch = lines.length > 0 && lines[0].startsWith("## ") ? lines[0].substring(3) : "repository";
                int changes = Math.max(0, lines.length - 1);
                gitStatus = branch + (changes == 0 ? " · clean" : " · " + changes + " changed");
            } catch (IOException e) { gitStatus = ""; }
            catch (InterruptedException e) { if (git != null) git.destroyForcibly(); Thread.currentThread().interrupt(); }
            finally { synchronized (this) { gitChecking = false; } }
        }

        void pump() {
            Process proc = process;
            if (proc == null) return;
            try (InputStream in = proc.getInputStream(); Reader reader = new InputStreamReader(in, charset)) {
                char[] buf = new char[4096];
                int n;
                while ((n = reader.read(buf)) >= 0) {
                    if (n == 0) continue;
                    append(new String(buf, 0, n));
                }
            } catch (IOException ignored) {
                // Shell closed.
            } finally {
                try {
                    proc.waitFor(1, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                done = true;
                finishedAt = System.currentTimeMillis();
                input.shutdownNow();
                append("\n— shell exited —\n");
            }
        }

        void write(String text, boolean sensitive) {
            if (done || stdin == null) throw new RequestFail(400, "The shell is not running. Open Terminal again.");
            String line = text.endsWith("\n") ? text : text + "\n";
            if (nativeSession) {
                byte[] bytes = line.getBytes(charset);
                try {
                    synchronized (nativeLock) {
                        nativeOut.writeByte(2); nativeOut.writeBoolean(sensitive); nativeOut.writeInt(bytes.length);
                        nativeOut.write(bytes); nativeOut.flush();
                        int status = nativeIn.readUnsignedByte();
                        if (status == 1) throw new RequestFail(429, "Terminal input is busy. Cancel the running process or try again.");
                        if (status != 0) throw new RequestFail(400, "The shell is not running. Open Terminal again.");
                    }
                } catch (IOException e) { throw new RequestFail(400, "The shell is not running. Open Terminal again."); }
                return;
            }
            try {
                input.execute(() -> {
                    try {
                        OutputStream stream = stdin;
                        if (done || stream == null) return;
                        if (!sensitive) append((windows ? "" : "$ ") + line);
                        stream.write(line.getBytes(charset));
                        stream.flush();
                    } catch (IOException e) {
                        append("\n— Could not send input to the shell. —\n");
                    }
                });
            } catch (RejectedExecutionException e) {
                throw new RequestFail(429, "Terminal input is busy. Cancel the running process or try again.");
            }
        }

        void append(String chunk) {
            if (chunk == null || chunk.isEmpty()) return;
            synchronized (lock) {
                out.append(chunk);
                if (out.length() > OUT_CAP) {
                    out.delete(0, out.length() - OUT_CAP / 2);
                    out.insert(0, "…\n");
                }
            }
        }

        void kill() {
            done = true;
            finishedAt = System.currentTimeMillis();
            input.shutdownNow();
            Process proc = process;
            if (proc != null) {
                // Stop children before closing the pipe: a blocked writer must not
                // prevent cancellation when a child is not reading its input.
                proc.descendants().forEach(child -> { try { child.destroyForcibly(); } catch (RuntimeException ignored) { } });
                proc.destroy();
            }
            try { if (stdin != null) stdin.close(); } catch (IOException ignored) { }
            stdin = null;
            if (proc != null) {
                try { if (!proc.waitFor(800, TimeUnit.MILLISECONDS)) proc.destroyForcibly(); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); proc.destroyForcibly(); }
            }
        }

        boolean alive() {
            Process proc = process;
            return !done && proc != null && proc.isAlive() && (!nativeSession || nativeAlive);
        }

        Json.Obj snapshot() {
            String text;
            synchronized (lock) {
                text = out.toString();
            }
            if (nativeSession && !done) {
                try {
                    synchronized (nativeLock) {
                        nativeOut.writeByte(1); nativeOut.flush();
                        nativeAlive = nativeIn.readUnsignedByte() != 0;
                        int length = nativeIn.readInt();
                        if (length < 0 || length > OUT_CAP + 4) throw new IOException("Invalid terminal output length");
                        byte[] bytes = nativeIn.readNBytes(length);
                        if (bytes.length != length) throw new IOException("Truncated terminal output");
                        nativeText = new String(bytes, charset);
                        if (!nativeAlive) { done = true; finishedAt = System.currentTimeMillis(); }
                    }
                } catch (IOException e) { done = true; nativeAlive = false; finishedAt = System.currentTimeMillis(); }
            }
            if (nativeSession) text += nativeText;
            return new Json.Obj()
                    .put("ok", true)
                    .put("id", id)
                    .put("cwd", cwd.toString())
                    .put("gitStatus", gitStatus)
                    .put("output", text)
                    .put("alive", alive())
                    .put("done", done);
        }
    }
}
