package lark;

import javax.net.ssl.SSLException;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.jar.JarFile;

/** Runs real pinned TLS peers, without a browser, cloud service, or external dependency. */
public final class ShareCheck {
    static int checks;
    static void check(boolean condition, String message) { checks++; if (!condition) throw new AssertionError(message); }
    static Json.Obj request(ShareSession session, String action) {
        return new Json.Obj().put("version", ShareSession.VERSION).put("session", session.id()).put("action", action);
    }
    static Json.Obj authenticated(ShareSession session, Json.Obj device, String action) {
        return request(session, action).put("device", device.str("device")).put("credential", device.str("credential"));
    }
    static void denied(Runnable run, int code) {
        try { run.run(); throw new AssertionError("Expected denial " + code); }
        catch (RequestFail e) { check(e.status == code, "Expected " + code + ", got " + e.status); }
    }
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("lark-share-test-");
        try {
            Files.writeString(root.resolve("Main.java"), "class Main { public static void main(String[] a) { System.out.println(42); } }\n");
            Files.createDirectories(root.resolve("app")); Files.writeString(root.resolve("app/Other.java"), "package app; class Other {}\n");
            Files.writeString(root.resolve("secret.txt"), "not shared");
            Files.createDirectories(root.resolve("long"));
            Files.writeString(root.resolve("long/" + "x".repeat(235) + ".java"), "class LongPath {}\n");
            Files.createDirectories(root.resolve(".git")); Files.writeString(root.resolve(".git/Private.java"), "not shared");
            try { Files.createSymbolicLink(root.resolve("Linked.java"), root.resolve("secret.txt")); }
            catch (UnsupportedOperationException | IOException e) { System.out.println("SKIP symlink creation: " + e.getClass().getSimpleName()); }
            sessionContracts(root);
            transportContracts(root);
            packagedAssets();
            System.out.println("ShareCheck: " + checks + " checks passed (real TLS, five concurrent viewers; read-only milestone).");
        } finally { Projects.deleteTree(root); }
    }
    static void sessionContracts(Path root) throws Exception {
        AtomicLong clock = new AtomicLong(1000);
        try (ShareSession session = new ShareSession(root, "Review", "Host", clock::get)) {
            check(session.localStatus().longVal("files") == 2, "Only non-hidden unlinked Java files included");
            denied(() -> session.command(request(session, "join").put("invitation", "bad").put("name", "A")), 403);
            denied(() -> session.command(request(session, "join").put("version", 999)), 409);
            Json.Obj device = session.command(request(session, "join").put("invitation", session.invitation()).put("name", "Alice"));
            check(device.str("credential").length() == 64, "Strong device credential");
            check(session.command(authenticated(session, device, "poll")).arr("participants").size() == 0, "Pending device has no participant data");
            denied(() -> session.command(authenticated(session, device, "files")), 403);
            denied(() -> session.command(authenticated(session, device, "read").put("path", "Main.java")), 403);
            session.decide(device.str("device"), true);
            check(session.command(authenticated(session, device, "files")).arr("files").size() == 2, "Approved file list");
            String source = session.command(authenticated(session, device, "read").put("path", "Main.java")).str("content");
            Files.writeString(root.resolve("Main.java"), "class Main { int changed; }\n");
            check(source.equals(session.command(authenticated(session, device, "read").put("path", "Main.java")).str("content")), "Snapshot does not pretend to be live");
            for (String path : List.of("../secret.txt", "/etc/passwd", "app/../../secret.txt", "Linked.java", ".git/Private.java", "secret.txt", "other/Main.java"))
                denied(() -> session.command(authenticated(session, device, "read").put("path", path)), 403);
            for (String action : List.of("edit", "write", "run", "debug", "terminal", "settings", "approve", "delete", "rename", "/api/run"))
                denied(() -> session.command(authenticated(session, device, action)), 403);
            denied(() -> session.command(authenticated(session, device, "files").put("credential", "wrong")), 403);
            denied(() -> session.command(authenticated(session, device, "files").put("session", "wrong")), 403);
            session.decide(device.str("device"), false);
            denied(() -> session.command(authenticated(session, device, "read").put("path", "Main.java")), 403);
            denied(() -> session.decide(device.str("device"), true), 404);
            Json.Obj rejected = session.command(request(session, "join").put("invitation", session.invitation()).put("name", "Rejected"));
            session.decide(rejected.str("device"), false);
            denied(() -> session.command(authenticated(session, rejected, "poll")), 403);
            clock.addAndGet(ShareSession.IDLE_MS);
            denied(session::localStatus, 410);
        }
        try (ShareSession session = new ShareSession(root, "Limit", "Host")) {
            for (int i = 0; i < 32; i++) session.command(request(session, "join").put("invitation", session.invitation()).put("name", "Viewer " + i));
            denied(() -> session.command(request(session, "join").put("invitation", session.invitation()).put("name", "Overflow")), 429);
        }
        try (ShareSession session = new ShareSession(root, "Expiry", "Host", clock::get)) {
            Json.Obj device = session.command(request(session, "join").put("invitation", session.invitation()).put("name", "Active"));
            session.decide(device.str("device"), true);
            for (int i = 0; i < 16; i++) { clock.addAndGet(ShareSession.IDLE_MS - 1); session.command(authenticated(session, device, "poll")); }
            clock.addAndGet(ShareSession.IDLE_MS);
            denied(session::localStatus, 410);
        }
        Path big = root.resolve("TooBig.java");
        Files.write(big, new byte[ShareSession.MAX_FILE + 1]);
        try { new ShareSession(root, "Big", "Host"); throw new AssertionError("Oversized file accepted"); }
        catch (IOException expected) { check(true, "Source limit"); } finally { Files.delete(big); }
        if (Files.exists(root.resolve("Linked.java"))) {
            Path directoryLink = root.resolveSibling(root.getFileName() + "-link");
            Files.createSymbolicLink(directoryLink, root);
            try { new ShareSession(directoryLink, "Link", "Host"); throw new AssertionError("Linked project accepted"); }
            catch (IOException expected) { check(true, "Linked project denied"); } finally { Files.delete(directoryLink); }
        }
    }
    static void transportContracts(Path root) throws Exception {
        try (ShareSession session = new ShareSession(root, "TLS test", "Host");
             ShareTransport server = new ShareTransport(session, ShareTransport.lanAddress("127.0.0.1"), 0)) {
            String host = "127.0.0.1"; int port = server.port();
            Json.Obj join = request(session, "join").put("invitation", session.invitation()).put("name", "TLS Viewer");
            String wrongPin = (server.fingerprint.startsWith("0") ? "1" : "0") + server.fingerprint.substring(1);
            try { ShareTransport.exchange(host, port, wrongPin, join); throw new AssertionError("Wrong certificate accepted"); }
            catch (SSLException expected) { check(true, "Certificate pin mismatch rejected"); }
            Json.Obj bad = ShareTransport.exchange(host, port, server.fingerprint, request(session, "join").put("invitation", "bad").put("name", "Bad"));
            check(!bad.bool("ok") && bad.longVal("code") == 403, "TLS authentication failure");
            check(ShareTransport.exchange(host, port, server.fingerprint, join.put("version", 2)).longVal("code") == 409, "Wire version mismatch");
            List<Json.Obj> devices = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                Json.Obj device = ShareTransport.exchange(host, port, server.fingerprint, request(session, "join").put("invitation", session.invitation()).put("name", "Viewer " + i));
                devices.add(device); session.decide(device.str("device"), true);
            }
            ExecutorService pool = Executors.newFixedThreadPool(5);
            try {
                List<Future<Json.Obj>> replies = new ArrayList<>();
                for (int i = 0; i < 5; i++) {
                    Json.Obj device = devices.get(i); String path = i % 2 == 0 ? "Main.java" : "app/Other.java";
                    replies.add(pool.submit(() -> ShareTransport.exchange(host, port, server.fingerprint, authenticated(session, device, "read").put("path", path))));
                }
                for (Future<Json.Obj> reply : replies) check(reply.get(10, TimeUnit.SECONDS).bool("ok"), "Five concurrent pinned readers");
            } finally { pool.shutdownNow(); }
            Json.Obj first = devices.get(0);
            // A new TLS connection resumes the same authorized device without another approval.
            check(ShareTransport.exchange(host, port, server.fingerprint, authenticated(session, first, "poll")).str("status").equals("approved"), "Reconnect credential works");
            session.decide(first.str("device"), false);
            check(ShareTransport.exchange(host, port, server.fingerprint, authenticated(session, first, "files")).longVal("code") == 403, "Revocation enforced on wire");
            check(ShareTransport.exchange(host, port, server.fingerprint, authenticated(session, devices.get(1), "terminal")).longVal("code") == 403, "Remote execution unavailable");
            for (int i = 0; i < 121; i++) {
                try (java.net.Socket socket = new java.net.Socket(host, port)) { socket.setSoTimeout(100); }
            }
            try { ShareTransport.exchange(host, port, server.fingerprint, authenticated(session, devices.get(1), "files")); throw new AssertionError("Flood not limited"); }
            catch (IOException expected) { check(true, "Connection flooding limited"); }
            server.close();
            try { ShareTransport.exchange(host, port, server.fingerprint, authenticated(session, devices.get(1), "poll")); throw new AssertionError("Ended host accessible"); }
            catch (IOException expected) { check(true, "Host shutdown closes listener"); }
        }
        framing();
        for (String address : List.of("8.8.8.8", "example.com", "224.0.0.251", "0.0.0.0")) {
            try { ShareTransport.lanAddress(address); throw new AssertionError("Non-LAN target accepted"); }
            catch (RequestFail expected) { check(true, "LAN target boundary"); }
        }
    }
    static void framing() throws Exception {
        for (int size : new int[]{-1, 0, 16 * 1024 + 1, Integer.MAX_VALUE}) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); new DataOutputStream(bytes).writeInt(size);
            try { ShareTransport.read(new ByteArrayInputStream(bytes.toByteArray()), 16 * 1024); throw new AssertionError("Bad length accepted"); }
            catch (IOException expected) { check(true, "Bounded framing"); }
        }
        for (String text : List.of("{", "[]", "{\"x\":" + "[".repeat(100) + "0" + "]".repeat(100) + "}", "{\"x\":true} trailing")) {
            byte[] bytes = text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            ByteArrayOutputStream framed = new ByteArrayOutputStream(); DataOutputStream out = new DataOutputStream(framed); out.writeInt(bytes.length); out.write(bytes);
            try { ShareTransport.read(new ByteArrayInputStream(framed.toByteArray()), 16 * 1024); throw new AssertionError("Bad JSON accepted"); }
            catch (IOException expected) { check(true, "Invalid/deep JSON rejected"); }
        }
    }
    static void packagedAssets() throws Exception {
        check(Files.readString(Path.of("packaging/fetch-portable-jdk.sh")).contains("jdk/bin/keytool"), "Portable JDK validates keytool dependency");
        try (JarFile jar = new JarFile("dist/lark.jar")) {
            for (String name : List.of("lark/Share.class", "lark/ShareSession.class", "lark/ShareTransport.class", "web/js/share.js", "web/css/share.css"))
                check(jar.getEntry(name) != null, "Packaged " + name);
        }
    }
}
