package lark;

import java.nio.file.*;
import java.util.*;

/** Exercises real WatchService events without polling or rescanning project trees. */
public final class ProjectWatchersCheck {
    static Json.Obj await(ProjectWatchers watches, String id, long cursor, String path, String type) throws Exception {
        for (int i = 0; i < 200; i++) {
            Json.Obj response = watches.poll("project", id, cursor);
            Json.Arr changes = response.arr("changes");
            for (Json.Value value : changes.values()) if (value instanceof Json.Obj item && path.equals(item.str("path")) && type.equals(item.str("type"))) return response;
            Thread.sleep(25);
        }
        throw new AssertionError("Missing watcher event " + type + " " + path);
    }
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("lark-watch-check-");
        try (ProjectWatchers watches = new ProjectWatchers()) {
            Json.Obj started = watches.start("project", root);
            String id = started.str("id"); long cursor = started.longVal("cursor");
            Files.createDirectories(root.resolve("nested"));
            Files.writeString(root.resolve("nested/One.java"), "first");
            Json.Obj created = await(watches, id, cursor, "nested/One.java", "file");
            cursor = created.longVal("cursor");
            Files.writeString(root.resolve("nested/One.java"), "external change");
            Json.Obj changed = await(watches, id, cursor, "nested/One.java", "file");
            boolean correct = changed.arr("changes").values().stream().anyMatch(v -> v instanceof Json.Obj e && "nested/One.java".equals(e.str("path")) && "external change".equals(e.str("content")));
            if (!correct) throw new AssertionError("External content missing");
            cursor = changed.longVal("cursor");
            Files.move(root.resolve("nested/One.java"), root.resolve("nested/Two.java"));
            Json.Obj renamed = await(watches, id, cursor, "nested/Two.java", "file");
            await(watches, id, cursor, "nested/One.java", "delete");
            cursor = renamed.longVal("cursor");
            Files.delete(root.resolve("nested/Two.java"));
            await(watches, id, cursor, "nested/Two.java", "delete");
            Json.Obj idle = watches.poll("project", id, Long.MAX_VALUE);
            if (!idle.bool("overflow")) throw new AssertionError("Invalid cursor must force recovery");
            Path selected = root.resolve("Single.java"); Files.writeString(selected, "selected");
            Json.Obj single = watches.start("project", selected); String singleId = single.str("id");
            Files.writeString(root.resolve("Other.java"), "private sibling"); Files.writeString(selected, "changed");
            Json.Obj singleResult = await(watches, singleId, 0, "Single.java", "file");
            for (Json.Value value : singleResult.arr("changes").values()) if (value instanceof Json.Obj item && !"Single.java".equals(item.str("path"))) throw new AssertionError("Single-file watcher exposed sibling");
            try { watches.poll("other", singleId, 0); throw new AssertionError("Wrong project accepted"); } catch (RequestFail expected) {}
            watches.stop("project", id); watches.stop("project", singleId);
            try (ProjectWatchers.Watch journal = new ProjectWatchers.Watch("project", root)) {
                for (int i = 0; i < 90; i++) journal.add("virtual-" + i + ".java");
                Json.Obj batch = journal.poll(0);
                if (batch.arr("changes").size() != 64 || batch.longVal("cursor") != 64) throw new AssertionError("Watcher batches must preserve the cursor");
                Json.Obj rest = journal.poll(batch.longVal("cursor"));
                if (rest.arr("changes").size() != 26 || rest.longVal("cursor") != 90) throw new AssertionError("Watcher dropped batched changes");
                journal.overflow();
                if (!journal.poll(90).bool("overflow")) throw new AssertionError("Lost events must request recovery");
            }
            System.out.println("Project watcher: create, nested directory, change, rename, delete, recovery and single-file isolation passed.");
        }
    }
}
