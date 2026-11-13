package lark;

import java.nio.file.Files;
import java.nio.file.Path;

/** Checks Java-to-Rust saves, including replacement, Unicode and large input. */
public final class NativeFileCheck {
    public static void main(String[] args) throws Exception {
        System.setProperty("lark.native.helper", Path.of(args[0]).toAbsolutePath().toString());
        Path root = Files.createTempDirectory("lark-native-save-");
        Path file = root.resolve("nested/Hello 世界.java");
        Path folder = root.resolve("new folder/child");
        if (!NativeTools.mkdir(folder) || !Files.isDirectory(folder)) throw new AssertionError("native folder creation failed");
        String text = "é🌱\n".repeat(40000);
        if (!NativeTools.writeFile(file, "first")) throw new AssertionError("native helper unavailable");
        if (!NativeTools.writeFile(file, text)) throw new AssertionError("native helper unavailable");
        if (!Files.readString(file).equals(text)) throw new AssertionError("save contents differ");
        if (Files.exists(file.resolveSibling(file.getFileName() + ".larktmp"))) throw new AssertionError("temporary file left behind");
        Path renamed = root.resolve("other/renamed.java");
        if (!NativeTools.operation("move", file, renamed) || !Files.readString(renamed).equals(text)) throw new AssertionError("native move failed");
        Files.writeString(file, "do not overwrite");
        try { NativeTools.operation("move", renamed, file); throw new AssertionError("move overwrote an existing file"); }
        catch (java.io.IOException expected) { if (!Files.readString(file).equals("do not overwrite")) throw new AssertionError("destination changed"); }
        if (!NativeTools.operation("delete", root.resolve("other")) || Files.exists(root.resolve("other"))) throw new AssertionError("native delete failed");
        Files.write(root.resolve("binary.dat"), new byte[] {(byte) 0xff});
        Files.write(root.resolve("large.txt"), new byte[20_000_001]);
        Files.createDirectories(root.resolve(".git"));
        Files.writeString(root.resolve(".git/hidden"), "hidden");
        NativeTools.ProjectContents contents = NativeTools.readProject(root);
        if (contents == null) throw new AssertionError("native project read failed");
        String snapshot = contents.files().write();
        if (!snapshot.contains("binary.dat") || !snapshot.contains("\"binary\":true") || !snapshot.contains("large.txt") || !snapshot.contains("\"tooBig\":true") || snapshot.contains("hidden")) throw new AssertionError("incorrect project snapshot: " + snapshot);
        Json.Arr javaFiles = new Json.Arr(), javaDirs = new Json.Arr();
        try (var walk = Files.walk(root)) {
            for (Path path : walk.sorted().toList()) {
                if (path.equals(root)) continue;
                String rel = root.relativize(path).toString().replace('\\', '/');
                if (Projects.skip(rel)) continue;
                if (Files.isDirectory(path)) javaDirs.add(rel);
                else if (Files.isRegularFile(path)) {
                    Json.Obj entry = new Json.Obj().put("path", rel);
                    if (Files.size(path) > 20_000_000) entry.put("tooBig", true);
                    else try { entry.put("content", Files.readString(path)); }
                    catch (java.nio.charset.MalformedInputException e) { entry.put("binary", true); }
                    javaFiles.add(entry);
                }
            }
        }
        if (!javaFiles.write().equals(contents.files().write()) || !javaDirs.write().equals(contents.dirs().write())) throw new AssertionError("native and Java project views differ");
        System.out.println("Rust file save integration passed");
    }
}
