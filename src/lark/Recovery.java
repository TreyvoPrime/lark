package lark;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * Crash / abrupt-close recovery for open editor buffers.
 * Snapshots live under {@code ~/.lark/recovery/session.json}.
 */
public final class Recovery {
    private static final long MAX_BYTES = 2_000_000L;
    private final Path file;

    public Recovery() {
        this.file = Settings.home().resolve("recovery").resolve("session.json");
    }

    public Json.Obj snapshot() {
        if (!Files.isRegularFile(file)) {
            return new Json.Obj().put("ok", true).put("present", false);
        }
        try {
            Json.Obj obj = Json.parseObj(Files.readString(file, StandardCharsets.UTF_8));
            return new Json.Obj()
                    .put("ok", true)
                    .put("present", true)
                    .put("projectId", obj.str("projectId", ""))
                    .put("active", obj.str("active", ""))
                    .put("activeB", obj.str("activeB", ""))
                    .put("open", obj.has("open") ? obj.arr("open") : new Json.Arr())
                    .put("files", obj.has("files") ? obj.arr("files") : new Json.Arr())
                    .put("savedAt", obj.longVal("savedAt"));
        } catch (Exception e) {
            return new Json.Obj().put("ok", true).put("present", false);
        }
    }

    public Json.Obj save(Json.Obj body) throws IOException {
        if (body == null) throw new RequestFail(400, "Nothing to save for recovery.");
        String projectId = body.str("projectId", "").trim();
        if (projectId.isBlank()) throw new RequestFail(400, "Recovery needs an open project.");
        Json.Arr files = body.has("files") ? body.arr("files") : new Json.Arr();
        Json.Arr open = body.has("open") ? body.arr("open") : new Json.Arr();
        Json.Arr cleanedFiles = new Json.Arr();
        long total = 0;
        for (int i = 0; i < files.size(); i++) {
            if (!(files.get(i) instanceof Json.Obj file)) continue;
            String path = file.str("path", "").trim();
            String content = file.str("content", "");
            if (path.isBlank()) continue;
            total += content.length();
            if (total > MAX_BYTES) {
                throw new RequestFail(400, "Recovery snapshot is too large. Save your files, then try again.");
            }
            cleanedFiles.add(new Json.Obj().put("path", path).put("content", content));
        }
        Json.Arr cleanedOpen = new Json.Arr();
        for (int i = 0; i < open.size(); i++) {
            if (open.get(i) instanceof Json.Str s && !s.value.isBlank()) cleanedOpen.add(s.value);
        }
        Json.Obj out = new Json.Obj()
                .put("projectId", projectId)
                .put("active", body.str("active", ""))
                .put("activeB", body.str("activeB", ""))
                .put("open", cleanedOpen)
                .put("files", cleanedFiles)
                .put("savedAt", System.currentTimeMillis())
                .put("version", Settings.VERSION);
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling("session.json.tmp");
        Files.writeString(tmp, out.write(), StandardCharsets.UTF_8);
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
        return new Json.Obj().put("ok", true).put("savedAt", out.longVal("savedAt"));
    }

    public Json.Obj clear() throws IOException {
        Files.deleteIfExists(file);
        Files.deleteIfExists(file.resolveSibling("session.json.tmp"));
        return new Json.Obj().put("ok", true).put("cleared", true);
    }

    /** Apply recovered dirty buffers onto the project tree (best-effort). */
    public Json.Obj applyToProject(Projects projects, String projectId) throws IOException {
        Json.Obj snap = snapshot();
        if (!snap.bool("present")) throw new RequestFail(404, "Nothing to recover.");
        String id = snap.str("projectId", "");
        if (!id.equals(projectId)) {
            throw new RequestFail(400, "That recovery belongs to a different project.");
        }
        Json.Arr files = snap.arr("files");
        List<String> restored = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            if (!(files.get(i) instanceof Json.Obj file)) continue;
            String path = file.str("path", "").trim();
            String content = file.str("content", "");
            if (path.isBlank()) continue;
            try {
                projects.writeFile(projectId, path, content);
                restored.add(path);
            } catch (RequestFail ignored) {
                // Skip paths that no longer belong to the project.
            }
        }
        Json.Arr paths = new Json.Arr();
        for (String path : restored) paths.add(path);
        return new Json.Obj()
                .put("ok", true)
                .put("restored", restored.size())
                .put("paths", paths)
                .put("active", snap.str("active", ""))
                .put("activeB", snap.str("activeB", ""))
                .put("open", snap.arr("open"));
    }
}
