package lark;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;

/** Phase-one Share session: an authorized Java-source project. */
final class ShareSession implements AutoCloseable {
    static final int VERSION = 2, MAX_FRAME = 768 * 1024, MAX_FILE = 96 * 1024;
    static final long IDLE_MS = 30 * 60_000L, LIFE_MS = 8 * 60 * 60_000L;
    private final String id = token(), invitation = token();
    private final String name, host;
    private final Map<String, String> files = new TreeMap<>();
    private final Map<String, Device> devices = new LinkedHashMap<>();
    private final java.util.function.LongSupplier clock;
    private final long created;
    private long active;
    private boolean closed, remoteEdits;
    Runnable onClose = () -> {};
    private final Map<String, ShareDocument> documents = new HashMap<>();
    private final Set<String> dirty = new HashSet<>();
    private final ShareStore store;
    private final java.util.concurrent.ScheduledExecutorService persistence;
    private final String hostActor = "host";
    private final Map<String, Set<String>> writers = new HashMap<>();
    private String defaultRole = "editor";
    private long idleMs = IDLE_MS;

    private static final class Device {
        final String id = token(), credential = token(), name;
        final String color;
        String status = "pending", role = "viewer", file = "", anchor = "", head = "", bird = "classic";
        long seen;
        Device(String name, int index) {
            this.name = name;
            String[] colors = {"#b48eff", "#48c9a2", "#e9a34b", "#e97baa", "#61c8de"};
            color = index < colors.length ? colors[index] : String.format("#%06x", java.awt.Color.HSBtoRGB((float)((index * 0.61803398875) % 1), 0.55f, 0.9f) & 0xffffff);
        }
        Json.Obj publicInfo() { return new Json.Obj().put("id", id).put("name", name)
                .put("status", status).put("role", role).put("bird", bird).put("color", color).put("file", file).put("anchor", anchor).put("head", head)
                .put("connected", System.currentTimeMillis() - seen < 15_000); }
    }

    ShareSession(Path project, String name, String host) throws IOException {
        this(project, name, host, System::currentTimeMillis);
    }

    ShareSession(Path project, String name, String host, java.util.function.LongSupplier clock) throws IOException {
        this.clock = clock; this.created = clock.getAsLong(); this.active = created;
        this.name = label(name); this.host = label(host);
        Path root = project.toRealPath();
        if (!Files.isDirectory(root) || Files.isSymbolicLink(project)) throw new IOException("Choose a real project directory.");
        long total = 0;
        // No FOLLOW_LINKS: hidden/build directories and links are never offered.
        try (var paths = Files.walk(root, 20)) {
            for (Iterator<Path> iterator = paths.iterator(); iterator.hasNext();) {
                Path p = iterator.next();
                if (!p.toString().endsWith(".java")) continue;
                Path relative = root.relativize(p);
                String key = relative.toString().replace('\\', '/');
                // Bound the escaped catalog as well as individual file content.
                if (key.getBytes(StandardCharsets.UTF_8).length > 240 || key.chars().anyMatch(Character::isISOControl)) continue;
                boolean allowed = true;
                for (Path part : relative) {
                    String s = part.toString();
                    if (s.startsWith(".") || s.contains("\\") || s.contains(":") || Set.of("build", "dist", "target", "node_modules").contains(s)) allowed = false;
                }
                if (!allowed || !Files.isRegularFile(p, LinkOption.NOFOLLOW_LINKS)) continue;
                if (files.size() >= 1000) throw new IOException("Share supports up to 1000 Java files.");
                byte[] bytes = readSource(root, relative);
                total += bytes.length;
                if (total > 16 * 1024 * 1024) throw new IOException("Shared source exceeds 16 MiB.");
                String text;
                try { text = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString(); }
                catch (Exception e) { throw new IOException("Share requires UTF-8 Java source."); }
                files.put(key, text);
            }
        }
        if (files.isEmpty()) throw new IOException("This project has no shareable Java source files.");
        store = new ShareStore(root, id, files);
        persistence = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(ShareTransport.daemon("lark-share-save"));
        persistence.scheduleWithFixedDelay(this::persist, 750, 750, java.util.concurrent.TimeUnit.MILLISECONDS);
    }

    private static byte[] readSource(Path root, Path relative) throws IOException {
        // SecureDirectoryStream prevents ancestor replacement while taking a snapshot where supported.
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(root)) {
            if (stream instanceof SecureDirectoryStream<Path> secure) return readSecure(secure, relative, 0);
        }
        // Windows: refuse links at each component, open the leaf without following links,
        // and check the canonical parent again. No remote path can select this input.
        Path p = root;
        for (Path part : relative) {
            p = p.resolve(part);
            if (Files.isSymbolicLink(p)) throw new IOException("Linked source is not shareable.");
        }
        if (!p.toRealPath().startsWith(root)) throw new IOException("Source escapes the project.");
        try (SeekableByteChannel ch = Files.newByteChannel(p, Set.of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS))) {
            byte[] data = readBounded(ch);
            if (!p.toRealPath().startsWith(root)) throw new IOException("Source changed during sharing.");
            return data;
        }
    }

    private static byte[] readSecure(SecureDirectoryStream<Path> dir, Path path, int index) throws IOException {
        if (index == path.getNameCount() - 1) {
            try (var ch = dir.newByteChannel(path.getName(index), Set.of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS))) {
                return readBounded(ch);
            }
        }
        try (var child = dir.newDirectoryStream(path.getName(index), LinkOption.NOFOLLOW_LINKS)) {
            return readSecure(child, path, index + 1);
        }
    }

    private static byte[] readBounded(SeekableByteChannel ch) throws IOException {
        if (ch.size() > MAX_FILE) throw new IOException("A shared Java file exceeds 96 KiB.");
        ByteBuffer b = ByteBuffer.allocate(MAX_FILE + 1);
        while (b.hasRemaining() && ch.read(b) != -1) { }
        if (b.position() > MAX_FILE) throw new IOException("A shared Java file exceeds 96 KiB.");
        return Arrays.copyOf(b.array(), b.position());
    }

    synchronized Json.Obj command(Json.Obj request) {
        requireLive();
        if (request.longVal("version") != VERSION) throw new RequestFail(409, "Incompatible Lark Share protocol.");
        if (!equal(id, request.str("session"))) throw new RequestFail(403, "Unknown Share session.");
        String action = request.str("action", "");
        if (action.equals("join")) {
            if (!equal(invitation, request.str("invitation"))) throw new RequestFail(403, "Invalid invitation.");
            if (devices.size() >= 32) throw new RequestFail(429, "Session device limit reached. End the session to clear requests.");
            Device device = new Device(label(request.str("name", "")), devices.size()); device.seen = clock.getAsLong();
            device.bird = bird(request.str("bird", "classic"));
            devices.put(device.id, device);
            return ok().put("device", device.id).put("credential", device.credential).put("status", device.status);
        }
        Device device = devices.get(request.str("device", ""));
        if (device == null || !equal(device.credential, request.str("credential")) || device.status.equals("revoked"))
            throw new RequestFail(403, "Access revoked or unknown device.");
        device.seen = clock.getAsLong();
        if (action.equals("avatar")) { device.bird = bird(request.str("bird", "classic")); return ok(); }
        if (action.equals("leave")) { device.status = "revoked"; return ok(); }
        if (action.equals("poll")) {
            if (device.status.equals("approved")) active = clock.getAsLong();
            return ok().put("status", device.status).put("name", name).put("host", host).put("role", device.role)
                    .put("participants", device.status.equals("approved") ? participants(false) : new Json.Arr());
        }
        if (!device.status.equals("approved")) throw new RequestFail(403, "Host approval required.");
        active = clock.getAsLong();
        return switch (action) {
            case "files" -> {
                Json.Arr list = new Json.Arr();
                files.keySet().forEach(p -> list.add(new Json.Obj().put("path", p)));
                yield ok().put("files", list);
            }
            case "read" -> {
                String path = request.str("path", "");
                if (!files.containsKey(path)) throw new RequestFail(403, "This source file is not shared.");
                yield ok().put("path", path).put("content", documents.containsKey(path) ? documents.get(path).text() : files.get(path));
            }
            case "open", "sync", "presence" -> documentCommand(request, device.id, device.role, device);
            default -> throw new RequestFail(403, "Share does not allow that operation.");
        };
    }

    synchronized Json.Obj localStatus() {
        requireLive();
        return ok().put("session", id).put("name", name).put("host", host).put("participants", participants(true))
                .put("files", files.size()).put("mode", "collaborative").put("actor", hostActor).put("defaultRole", defaultRole).put("approvalRequired", true)
                .put("encrypted", true).put("conflicts", store.conflicts()).put("remoteEdits", remoteEdits).put("idleMinutes", idleMs / 60_000).put("expiresAt", Math.min(created + LIFE_MS, active + idleMs));
    }
    synchronized void decide(String deviceId, boolean approve) {
        requireLive();
        Device device = devices.get(deviceId);
        if (device == null || device.status.equals("revoked")) throw new RequestFail(404, "Device is no longer available.");
        device.status = approve ? "approved" : "revoked";
        active = clock.getAsLong();
    }
    synchronized void decide(String deviceId, boolean approve, String role) {
        if (!Set.of("editor", "viewer").contains(role)) throw new RequestFail(400, "Choose Editor or Viewer.");
        decide(deviceId, approve);
        if (approve) devices.get(deviceId).role = role;
    }
    synchronized Json.Obj hostCommand(Json.Obj request) {
        requireLive(); active = clock.getAsLong();
        String action = request.str("action", "");
        if (action.equals("files")) { Json.Arr list = new Json.Arr(); files.keySet().forEach(p -> list.add(new Json.Obj().put("path", p))); return ok().put("files", list); }
        return documentCommand(request, hostActor, "host", null);
    }
    private Json.Obj documentCommand(Json.Obj request, String identity, String role, Device device) {
        String path = request.str("path", "");
        if (!files.containsKey(path)) throw new RequestFail(403, "This source file is not shared.");
        String writer = request.str("writer", "");
        if (!writer.matches("[a-f0-9]{32}")) throw new RequestFail(400, "Invalid writer identity.");
        Set<String> sites = writers.computeIfAbsent(identity, k -> new HashSet<>());
        if (!sites.contains(writer) && sites.size() >= 16) throw new RequestFail(429, "Too many editor windows for this device.");
        sites.add(writer);
        ShareDocument document = documents.get(path);
        if (document == null) {
            if (documents.size() >= 32 || documents.values().stream().mapToInt(ShareDocument::nodeCount).sum() + files.get(path).length() > 500_000) throw new RequestFail(429, "Up to 32 shared documents may be opened per session.");
            document = new ShareDocument(files.get(path)); documents.put(path, document);
        }
        if (request.str("action", "").equals("presence")) {
            if (device != null) {
                String anchor = request.str("anchor", ""), head = request.str("head", "");
                if (anchor.length() > 120 || head.length() > 120) throw new RequestFail(400, "Invalid cursor identity.");
                device.file = path; device.anchor = anchor; device.head = head;
            } else { hostFile = path; hostAnchor = request.str("anchor", ""); hostHead = request.str("head", ""); }
        }
        Json.Obj op = request.obj("operation");
        if (op != null) {
            if (role.equals("viewer")) throw new RequestFail(403, "Viewers cannot change source.");
            if (documents.values().stream().mapToInt(ShareDocument::nodeCount).sum() + op.str("text", "").length() > 500_000)
                throw new RequestFail(429, "Session document capacity reached; save, end and rehost.");
            if (document.apply(op, identity + "." + writer)) { dirty.add(path); if (device != null) remoteEdits = true; }
        }
        return document.page(request.longVal("since"), request.str("action", "").equals("open"))
                .put("actor", identity + "." + writer).put("role", role).put("participants", participants(false));
    }
    private String hostFile = "", hostAnchor = "", hostHead = "", hostBird = "classic";
    synchronized void avatar(String value) { requireLive(); hostBird = bird(value); }
    static String bird(String value) {
        return Set.of("classic", "blue-jay", "cardinal", "goldfinch", "robin", "snow-owl", "hummingbird", "raven", "eagle", "falcon").contains(value) ? value : "classic";
    }
    synchronized Json.Obj discoveryInfo() { requireLive(); return new Json.Obj().put("name", name).put("host", host).put("status", devices.size() < 32 ? "available" : "full").put("count", 1 + devices.values().stream().filter(d -> d.status.equals("approved")).count()); }
    synchronized void settings(String role, long minutes) {
        requireLive(); if (!Set.of("editor", "viewer").contains(role) || minutes < 5 || minutes > 120) throw new RequestFail(400, "Choose a role and 5–120 minute inactivity limit.");
        defaultRole = role; idleMs = minutes * 60_000;
    }
    synchronized boolean shares(String path) { return !closed && files.containsKey(path); }
    synchronized Json.Obj review() {
        requireLive(); Json.Arr changes = new Json.Arr();
        documents.forEach((path, doc) -> { if (!files.get(path).equals(doc.text())) changes.add(new Json.Obj().put("path", path).put("before", files.get(path)).put("after", doc.text())); });
        return ok().put("changes", changes).put("conflicts", store.conflicts());
    }
    synchronized void acknowledgeRun() { requireLive(); persist(); if (store.conflicts().size() > 0) throw new RequestFail(409, "Resolve external save conflicts before execution."); remoteEdits = false; }
    synchronized void saveForRun() {
        requireLive(); persist();
        if (store.conflicts().size() > 0) throw new RequestFail(409, "Resolve Share save conflicts before execution.");
    }
    synchronized boolean needsReview() { return remoteEdits; }
    private synchronized void persist() {
        if (closed) return;
        for (String path : dirty) store.save(path, documents.get(path).text());
        dirty.clear();
        documents.forEach((path, doc) -> store.checkExternal(path, doc.text()));
    }
    private Json.Arr participants(boolean includePending) {
        Json.Arr out = new Json.Arr();
        out.add(new Json.Obj().put("id", "host").put("color", "#6495ed").put("name", host).put("status", "approved").put("role", "host").put("connected", true)
                .put("bird", hostBird).put("file", hostFile).put("anchor", hostAnchor).put("head", hostHead));
        devices.values().stream().filter(d -> includePending || d.status.equals("approved")).forEach(d -> out.add(d.publicInfo()));
        return out;
    }
    synchronized boolean expired() { return closed || clock.getAsLong() - created >= LIFE_MS || clock.getAsLong() - active >= idleMs; }
    private void requireLive() { if (expired()) { close(); throw new RequestFail(410, "Share session ended or expired."); } }
    String id() { return id; }
    String invitation() { return invitation; }
    @Override public synchronized void close() { if (closed) return; persist(); closed = true; persistence.shutdownNow(); onClose.run(); files.clear(); devices.clear(); documents.clear(); writers.clear(); }
    static Json.Obj ok() { return new Json.Obj().put("ok", true).put("version", VERSION); }
    static String label(String value) {
        if (value == null || value.isBlank() || value.length() > 80 || value.chars().anyMatch(Character::isISOControl))
            throw new RequestFail(400, "Use a display name of 1–80 characters without control characters.");
        return value.trim();
    }
    static String token() { byte[] b = new byte[32]; new SecureRandom().nextBytes(b); return HexFormat.of().formatHex(b); }
    static boolean equal(String a, String b) { return b != null && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8)); }
}
