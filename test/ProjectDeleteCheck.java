package lark;

import java.nio.file.*;

public final class ProjectDeleteCheck {
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("lark-delete-check-");
        try {
            Path selected = root.resolve("Main.java"), sibling = root.resolve("keep.txt");
            Files.writeString(selected, "class Main {}\n"); Files.writeString(sibling, "keep");
            Projects projects = new Projects(Settings.load());
            String id = projects.openSingleFile(selected);
            projects.delete(id);
            if (Files.exists(selected) || !Files.exists(sibling) || !Files.isDirectory(root)) throw new AssertionError("Single-file deletion removed the wrong files");
            System.out.println("Single-file deletion preserves the parent and sibling files.");
        } finally { Projects.deleteTree(root); }
    }
}
