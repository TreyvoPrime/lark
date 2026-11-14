package lark;

import java.io.IOException;
import java.nio.charset.MalformedInputException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/** Per-client recursive filesystem watches. Polling reads a bounded event journal, not the tree. */
final class ProjectWatchers implements AutoCloseable {
    private final Map<String, Watch> watches = new ConcurrentHashMap<>();
    private static final long IDLE_MS = 120_000;
    private final java.util.concurrent.ScheduledExecutorService reaper = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "lark-watch-reaper"); thread.setDaemon(true); return thread;
    });
    ProjectWatchers() { reaper.scheduleWithFixedDelay(this::prune, 30, 30, TimeUnit.SECONDS); }

    Json.Obj start(String project, Path target) throws IOException {
        prune();
        if (watches.size() >= 24) throw new RequestFail(429, "Too many project watchers.");
        Watch watch = new Watch(project, target);
        watches.put(watch.id, watch);
        watch.start();
        return new Json.Obj().put("ok", true).put("id", watch.id).put("cursor", 0L);
    }
    Json.Obj poll(String project, String id, long cursor) {
        Watch watch = watches.get(id);
        if (watch == null || !watch.project.equals(project)) throw new RequestFail(404, "Project watcher expired.");
        return watch.poll(cursor);
    }
    void stop(String project, String id) {
        Watch watch = watches.get(id);
        if (watch != null && watch.project.equals(project) && watches.remove(id, watch)) watch.close();
    }
    private void prune() {
        long now = System.currentTimeMillis();
        watches.forEach((id, watch) -> { if (now - watch.lastPoll > IDLE_MS && watches.remove(id, watch)) watch.close(); });
    }
    public void close() { reaper.shutdownNow(); watches.values().forEach(Watch::close); watches.clear(); }

    static final class Watch implements AutoCloseable {
        record Event(long seq, String path) {}
        final String id = UUID.randomUUID().toString(), project;
        final Path root, single;
        final WatchService service;
        final Map<WatchKey, Path> directories = new ConcurrentHashMap<>();
        final Deque<Event> events = new ArrayDeque<>();
        long sequence, droppedThrough;
        volatile long lastPoll = System.currentTimeMillis();
        volatile boolean closed;
        Watch(String project, Path target) throws IOException {
            this.project = project;
            Path absolute = target.toAbsolutePath().normalize();
            single = Files.isDirectory(absolute) ? null : absolute;
            root = single == null ? absolute : absolute.getParent();
            if (root == null || !Files.isDirectory(root)) throw new IOException("Project directory is unavailable");
            service = FileSystems.getDefault().newWatchService();
            try { if (single == null) registerTree(root, false); else register(root); }
            catch (IOException | RuntimeException e) { service.close(); throw e; }
        }
        void start() { Thread t = new Thread(this::run, "lark-project-watch"); t.setDaemon(true); t.start(); }
        void register(Path dir) throws IOException {
            WatchKey key = dir.register(service, StandardWatchEventKinds.ENTRY_CREATE, StandardWatchEventKinds.ENTRY_DELETE, StandardWatchEventKinds.ENTRY_MODIFY);
            directories.put(key, dir);
        }
        void registerTree(Path start, boolean announce) throws IOException {
            Files.walkFileTree(start, EnumSet.noneOf(FileVisitOption.class), Integer.MAX_VALUE, new SimpleFileVisitor<>() {
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                    if (!dir.equals(root) && ignored(relative(dir))) return FileVisitResult.SKIP_SUBTREE;
                    register(dir);
                    if (announce && !dir.equals(start)) add(relative(dir));
                    return FileVisitResult.CONTINUE;
                }
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    String rel = relative(file);
                    if (announce && !ignored(rel)) add(rel);
                    return FileVisitResult.CONTINUE;
                }
            });
        }
        String relative(Path path) { return root.relativize(path).toString().replace('\\', '/'); }
        boolean ignored(String rel) { return rel.isEmpty() || rel.endsWith(".larktmp") || Projects.skip(rel); }
        synchronized void add(String rel) {
            if (ignored(rel)) return;
            events.addLast(new Event(++sequence, rel));
            if (events.size() > 4096) droppedThrough = events.removeFirst().seq();
        }
        synchronized void overflow() { droppedThrough = ++sequence; events.clear(); }
        void run() {
            while (!closed) {
                try {
                    WatchKey key = service.poll(30, TimeUnit.SECONDS);
                    if (key == null) continue;
                    Path dir = directories.get(key);
                    if (dir != null) for (WatchEvent<?> event : key.pollEvents()) {
                        if (event.kind() == StandardWatchEventKinds.OVERFLOW) { overflow(); continue; }
                        Path path = dir.resolve((Path) event.context()).normalize();
                        if (!path.startsWith(root) || (single != null && !path.equals(single))) continue;
                        String rel = relative(path);
                        if (ignored(rel)) continue;
                        add(rel);
                        if (single == null && event.kind() == StandardWatchEventKinds.ENTRY_CREATE && Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)) {
                            try { registerTree(path, true); } catch (IOException e) { overflow(); }
                        }
                    }
                    if (!key.reset()) { directories.remove(key); if (dir != null && dir.equals(root)) overflow(); }
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
                catch (ClosedWatchServiceException e) { break; }
                catch (RuntimeException e) { overflow(); }
            }
        }
        Json.Obj poll(long cursor) {
            lastPoll = System.currentTimeMillis();
            LinkedHashMap<String, Long> changed = new LinkedHashMap<>();
            long current; boolean lost;
            synchronized (this) {
                current = sequence; lost = cursor < droppedThrough || cursor > current;
                if (!lost) for (Event event : events) if (event.seq() > cursor) {
                    changed.remove(event.path()); changed.put(event.path(), event.seq());
                    if (changed.size() >= 64) break;
                }
            }
            Json.Arr result = new Json.Arr();
            long next = changed.isEmpty() || lost ? current : cursor;
            long bytes = 0;
            if (!lost) for (Map.Entry<String, Long> change : changed.entrySet()) {
                String rel = change.getKey();
                Path path = root.resolve(rel).normalize();
                Json.Obj entry = new Json.Obj().put("path", rel);
                try {
                    if (Files.isDirectory(path)) entry.put("type", "directory");
                    else if (Files.isRegularFile(path) && Files.size(path) <= Projects.MAX_TEXT_FILE_BYTES) {
                        long size = Files.size(path);
                        if (result.size() > 0 && bytes + size > 25_000_000) break;
                        bytes += size;
                        try { entry.put("type", "file").put("content", Files.readString(path)); }
                        catch (MalformedInputException e) { entry.put("type", "unavailable"); }
                    } else if (Files.exists(path)) entry.put("type", "unavailable");
                    else entry.put("type", "delete");
                } catch (IOException e) { entry.put("type", "unavailable"); }
                result.add(entry);
                next = change.getValue();
            }
            return new Json.Obj().put("ok", true).put("cursor", next).put("overflow", lost).put("changes", result);
        }
        public void close() { closed = true; try { service.close(); } catch (IOException ignored) {} }
    }
}
