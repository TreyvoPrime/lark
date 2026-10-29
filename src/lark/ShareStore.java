package lark;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Host-only persistence. Recovery is retained even when an external edit blocks saving. */
final class ShareStore {
    final Path root, recovery;
    private final Map<String, String> written = new HashMap<>();
    private final Map<String, String> conflicts = new TreeMap<>();
    private final Set<String> backedUp = new HashSet<>();
    private final Map<String, String> stamps = new HashMap<>();
    ShareStore(Path root, String session, Map<String, String> initial) throws IOException {
        this.root = root.toRealPath(); this.recovery = Settings.home().resolve("share/recovery").resolve(session);
        written.putAll(initial);
        for (String path : initial.keySet()) stamps.put(path, stamp(path));
    }
    synchronized void save(String path, String text) {
        if (text.equals(written.get(path))) return;
        try {
            retain(path, text);
            if (conflicts.containsKey(path)) return;
            Path relative = Path.of(path);
            try (DirectoryStream<Path> dir = Files.newDirectoryStream(root)) {
                if (dir instanceof SecureDirectoryStream<Path> secure) replaceSecure(secure, relative, 0, written.get(path), text);
                else {
                    Path destination = root.resolve(relative);
                    Path p = root;
                    for (Path part : relative) { p = p.resolve(part); if (Files.isSymbolicLink(p)) throw new IOException("Source became a link."); }
                    if (!destination.toRealPath().startsWith(root) || !Files.readString(destination).equals(written.get(path))) throw new IOException("Source changed outside Share.");
                    atomicLocal(destination, text);
                }
            }
            written.put(path, text); stamps.put(path, stamp(path));
        } catch (Exception e) { conflicts.put(path, "External change or save failure. Recovery retained; end Share and review both versions before restoring."); }
    }
    private String stamp(String path) throws IOException {
        Path file = root.resolve(path);
        if (!file.toRealPath().startsWith(root)) throw new IOException("Source escaped its project.");
        var attrs = Files.readAttributes(file, java.nio.file.attribute.BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!attrs.isRegularFile()) throw new IOException("Source is not a regular file.");
        return attrs.lastModifiedTime() + ":" + attrs.size() + ":" + attrs.fileKey();
    }
    private void retain(String path, String text) throws IOException {
        Path backup = recovery.resolve(path + ".before"), pending = recovery.resolve(path + ".recovery");
        Files.createDirectories(backup.getParent());
        if (!backedUp.contains(path)) { Files.writeString(backup, written.get(path), StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW); backedUp.add(path); }
        atomicLocal(pending, text);
    }
    synchronized void checkExternal(String path, String canonical) {
        if (conflicts.containsKey(path)) return;
        try {
            String current = stamp(path);
            if (current.equals(stamps.get(path))) return;
            Path file = root.resolve(path);
            if (Files.size(file) > 4L * ShareSession.MAX_FILE || !Files.readString(file).equals(written.get(path))) throw new IOException("Source changed outside Share.");
            stamps.put(path, current);
        } catch (Exception e) {
            conflicts.put(path, "External source changed or disappeared. End Share and reconcile the retained recovery version.");
            try { retain(path, canonical); } catch (IOException ignored) { }
        }
    }
    private static void replaceSecure(SecureDirectoryStream<Path> dir, Path path, int index, String expected, String text) throws IOException {
        Path leaf = path.getName(index);
        if (index < path.getNameCount() - 1) {
            try (var child = dir.newDirectoryStream(leaf, LinkOption.NOFOLLOW_LINKS)) { replaceSecure(child, path, index + 1, expected, text); }
            return;
        }
        try (SeekableByteChannel ch = dir.newByteChannel(leaf, Set.of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS))) {
            if (ch.size() > 4L * ShareSession.MAX_FILE) throw new IOException("External source changed.");
            ByteBuffer data = ByteBuffer.allocate((int) ch.size());
            while (data.hasRemaining() && ch.read(data) != -1) { }
            if (!new String(data.array(), 0, data.position(), StandardCharsets.UTF_8).equals(expected)) throw new IOException("External source changed.");
        }
        Path temporary = Path.of(".lark-share-" + ShareSession.token());
        try {
            try (var ch = dir.newByteChannel(temporary, Set.of(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS))) {
                ByteBuffer data = StandardCharsets.UTF_8.encode(text); while (data.hasRemaining()) ch.write(data);
                if (ch instanceof java.nio.channels.FileChannel file) file.force(true);
            }
            dir.move(temporary, dir, leaf);
        } finally { try { dir.deleteFile(temporary); } catch (NoSuchFileException ignored) { } }
    }
    private static void atomicLocal(Path target, String text) throws IOException {
        Path temp = Files.createTempFile(target.getParent(), ".lark-share-", ".tmp");
        try {
            Files.writeString(temp, text, StandardCharsets.UTF_8);
            try { Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException e) { Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(temp); }
    }
    synchronized Json.Arr conflicts() {
        Json.Arr list = new Json.Arr(); conflicts.forEach((path, error) -> list.add(new Json.Obj().put("path", path).put("error", error))); return list;
    }
}
