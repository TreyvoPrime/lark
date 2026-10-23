package lark;

import java.io.IOException;
import java.io.InputStream;
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
        String id = UUID.randomUUID().toString();
        Session session = new Session(id, dir);
        sessions.put(id, session);
        try {
            session.launch();
        } catch (IOException e) {
            sessions.remove(id);
            throw new RequestFail(500, e.getMessage() == null ? "Couldn't start a shell." : e.getMessage());
        }
        pool.submit(session::pump);
        return snapshot(id);
    }

    public Json.Obj snapshot(String id) {
        Session session = sessions.get(id);
        if (session == null) throw new RequestFail(404, "That terminal session is gone.");
        return session.snapshot();
    }

    public void write(String id, String text) {
        Session session = sessions.get(id);
        if (session == null) throw new RequestFail(404, "That terminal session is gone.");
        if (text == null) text = "";
        if (text.length() > 20_000) throw new RequestFail(400, "That command is too long.");
        session.write(text);
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
        volatile Process process;
        volatile OutputStream stdin;
        volatile boolean done;
        volatile long finishedAt;
        final Charset charset;
        final boolean windows;

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
            pb.directory(cwd.toFile());
            pb.redirectErrorStream(true);
            Map<String, String> env = pb.environment();
            env.put("TERM", "dumb");
            env.put("LARK_TERMINAL", "1");
            process = pb.start();
            stdin = process.getOutputStream();
            append("— Lark terminal — " + cwd + "\n");
            if (windows) append("Type commands below. Example: dir   or   javac -version\n\n");
            else append("Type commands below. Example: ls   or   javac -version\n\n");
        }

        void pump() {
            Process proc = process;
            if (proc == null) return;
            try (InputStream in = proc.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) >= 0) {
                    if (n == 0) continue;
                    append(new String(buf, 0, n, charset));
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
                append("\n— shell exited —\n");
            }
        }

        void write(String text) {
            if (done || stdin == null) throw new RequestFail(400, "The shell is not running. Open Terminal again.");
            try {
                String line = text.endsWith("\n") ? text : text + "\n";
                // cmd.exe /Q does not echo; show the typed line. Unix shells usually do not either when piped.
                append((windows ? "" : "$ ") + (text.endsWith("\n") ? text : text + "\n"));
                stdin.write(line.getBytes(charset));
                stdin.flush();
            } catch (IOException e) {
                kill();
                throw new RequestFail(500, "Couldn't send that to the shell.");
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
            try {
                if (stdin != null) stdin.close();
            } catch (IOException ignored) {
                // Best-effort.
            }
            stdin = null;
            Process proc = process;
            if (proc != null) {
                proc.destroy();
                try {
                    if (!proc.waitFor(800, TimeUnit.MILLISECONDS)) proc.destroyForcibly();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    proc.destroyForcibly();
                }
            }
        }

        boolean alive() {
            Process proc = process;
            return !done && proc != null && proc.isAlive();
        }

        Json.Obj snapshot() {
            String text;
            synchronized (lock) {
                text = out.toString();
            }
            return new Json.Obj()
                    .put("ok", true)
                    .put("id", id)
                    .put("cwd", cwd.toString())
                    .put("output", text)
                    .put("alive", alive())
                    .put("done", done);
        }
    }
}
