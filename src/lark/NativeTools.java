package lark;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** Optional platform helper; old and portable installations retain their Java implementation. */
final class NativeTools {
    private NativeTools() {}

    static Path find() {
        String override = System.getProperty("lark.native.helper", "");
        if (!override.isBlank()) {
            Path candidate = Path.of(override).toAbsolutePath().normalize();
            return Files.isRegularFile(candidate) ? candidate : null;
        }
        Path install = Updates.installDir();
        if (install == null) return null;
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        Path candidate = install.resolve("app").resolve(windows ? "lark-native.exe" : "lark-native");
        return Files.isRegularFile(candidate) ? candidate : null;
    }

    static boolean writeFile(Path path, String content) throws IOException {
        Path helper = find();
        if (helper == null) return false;
        Process process;
        try {
            process = new ProcessBuilder(helper.toString(), "write-file", path.toString())
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .redirectError(ProcessBuilder.Redirect.DISCARD).start();
        } catch (IOException cannotStart) {
            return false;
        }
        CompletableFuture<Void> writer = CompletableFuture.runAsync(() -> {
            try (var out = process.getOutputStream()) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                throw new java.util.concurrent.CompletionException(e);
            }
        });
        try {
            if (!process.waitFor(10, TimeUnit.SECONDS)) throw new IOException("Native file save timed out");
            writer.get(1, TimeUnit.SECONDS);
            if (process.exitValue() != 0) throw new IOException("Native file save failed");
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Native file save interrupted", e);
        } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException e) {
            throw new IOException("Native file save failed", e);
        } finally {
            if (process.isAlive()) process.destroyForcibly();
        }
    }

    static boolean mkdir(Path path) throws IOException {
        return operation("mkdir", path);
    }

    record ProjectContents(Json.Arr dirs, Json.Arr files) {}

    static ProjectContents readProject(Path root) {
        Path helper = find();
        if (helper == null) return null;
        Process process;
        try {
            process = new ProcessBuilder(helper.toString(), "project-read", root.toString())
                    .redirectError(ProcessBuilder.Redirect.DISCARD).start();
        } catch (IOException cannotStart) { return null; }
        CompletableFuture<ProjectContents> reader = CompletableFuture.supplyAsync(() -> {
            Json.Arr dirs = new Json.Arr();
            Json.Arr files = new Json.Arr();
            try (var in = new java.io.DataInputStream(process.getInputStream())) {
                while (true) {
                    int kind = in.readUnsignedByte();
                    if (kind == 0) return new ProjectContents(dirs, files);
                    if (kind < 1 || kind > 4) throw new IOException("Invalid native project entry");
                    int length = in.readInt();
                    if (length < 0 || length > 1_000_000) throw new IOException("Invalid project path length");
                    byte[] name = in.readNBytes(length);
                    if (name.length != length) throw new IOException("Truncated project path");
                    String rel = new String(name, StandardCharsets.UTF_8);
                    if (kind == 1) { dirs.add(rel); continue; }
                    Json.Obj file = new Json.Obj().put("path", rel);
                    if (kind == 2) {
                        int size = in.readInt();
                        if (size < 0 || size > 20_000_000) throw new IOException("Invalid project file length");
                        byte[] content = in.readNBytes(size);
                        if (content.length != size) throw new IOException("Truncated project file");
                        file.put("content", new String(content, StandardCharsets.UTF_8));
                    } else if (kind == 3) file.put("tooBig", true);
                    else file.put("binary", true);
                    files.add(file);
                }
            } catch (IOException e) { throw new java.util.concurrent.CompletionException(e); }
        });
        try {
            ProjectContents result = reader.get(30, TimeUnit.SECONDS);
            if (!process.waitFor(1, TimeUnit.SECONDS) || process.exitValue() != 0) return null;
            return result;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException e) {
            return null;
        } finally { if (process.isAlive()) process.destroyForcibly(); }
    }

    static boolean operation(String command, Path... paths) throws IOException {
        Path helper = find();
        if (helper == null) return false;
        Process process;
        try {
            java.util.List<String> args = new java.util.ArrayList<>();
            args.add(helper.toString());
            args.add(command);
            for (Path path : paths) args.add(path.toString());
            process = new ProcessBuilder(args)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .redirectError(ProcessBuilder.Redirect.DISCARD).start();
        } catch (IOException cannotStart) {
            return false;
        }
        try {
            // In particular, never terminate a recursive delete partway through
            // solely because a large project took longer than a fixed timeout.
            process.waitFor();
            if (process.exitValue() != 0) throw new IOException("Native file operation failed");
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Native file operation interrupted", e);
        } finally {
            if (process.isAlive()) process.destroyForcibly();
        }
    }
}
