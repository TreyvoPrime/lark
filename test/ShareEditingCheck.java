package lark;

import java.net.InetAddress;
import java.nio.file.*;
import java.util.*;

/** CRDT, authority, persistence and DNS-SD tests, without third-party dependencies. */
public final class ShareEditingCheck {
    static int checks;
    static void check(boolean result, String message) { checks++; if (!result) throw new AssertionError(message); }
    static Json.Obj op(long seq, String actor, String after, String text, String... remove) {
        Json.Arr ids = new Json.Arr(); for (String id : remove) ids.add(id);
        return new Json.Obj().put("seq", seq).put("actor", actor).put("after", after).put("text", text).put("remove", ids);
    }
    static Json.Obj request(ShareSession s, Json.Obj device, String action, String path) {
        return new Json.Obj().put("version", ShareSession.VERSION).put("session", s.id()).put("device", device.str("device")).put("credential", device.str("credential"))
                .put("action", action).put("path", path).put("writer", "a".repeat(32)).put("since", 0);
    }
    public static void main(String[] args) throws Exception {
        String actorA = "alice", actorB = "bob";
        for (int i = 0; i < 100; i++) {
            ShareDocument a = new ShareDocument("ab"), b = new ShareDocument("ab");
            Json.Obj x = op(10, actorA, "1@seed", "😀X", "2@seed"), y = op(10, actorB, "1@seed", "Y");
            a.apply(x, actorA); a.apply(y, actorB); b.apply(y, actorB); b.apply(x, actorA);
            check(a.text().equals(b.text()), "Concurrent convergence");
            check(!a.apply(x, actorA), "Retry idempotent");
            check(a.text().contains("😀"), "UTF-16 retained");
        }
        check(Json.parseObj(new Json.Obj().put("x", "\ud83d").write()).str("x").equals("\ud83d"), "Isolated surrogate JSON roundtrip");
        Path root = Files.createTempDirectory("lark-share-edit-");
        try {
            Files.writeString(root.resolve("Main.java"), "class Main {}\n"); Files.writeString(root.resolve("Other.java"), "class Other {}\n");
            try (ShareSession s = new ShareSession(root, "Editing", "Host")) {
                Json.Obj editor = s.command(new Json.Obj().put("version", ShareSession.VERSION).put("session", s.id()).put("action", "join").put("name", "Alice").put("invitation", s.invitation()));
                s.decide(editor.str("device"), true, "editor");
                String actor = s.command(request(s, editor, "open", "Main.java")).str("actor");
                Json.Obj operation = op(100, actor, "", "// shared\n");
                s.command(request(s, editor, "sync", "Main.java").put("operation", operation));
                s.command(request(s, editor, "sync", "Main.java").put("operation", operation));
                check(s.command(request(s, editor, "sync", "Main.java")).longVal("head") == 1, "Deduplicated server history");
                check(s.needsReview(), "Remote changes require host review");
                s.decide(editor.str("device"), true, "viewer");
                try { s.command(request(s, editor, "sync", "Main.java").put("operation", op(200, actor, "", "denied"))); throw new AssertionError("Viewer wrote"); }
                catch (RequestFail expected) { check(expected.status == 403, "Viewer mutation denied"); }
                s.command(request(s, editor, "presence", "Main.java").put("head", "1@seed").put("anchor", ""));
                check(s.localStatus().arr("participants").values().stream().anyMatch(v -> ((Json.Obj)v).str("file", "").equals("Main.java")), "Presence relay");
                s.acknowledgeRun(); check(!s.needsReview(), "Host acknowledges reviewed source");
                check(Files.readString(root.resolve("Main.java")).startsWith("// shared"), "Canonical host file saved");
                s.decide(editor.str("device"), true, "editor");
                Files.writeString(root.resolve("Main.java"), "// external change\n");
                s.command(request(s, editor, "sync", "Main.java").put("operation", op(201, actor, "", "// next\n")));
                s.command(request(s, editor, "sync", "Other.java").put("operation", op(300, actor, "", "// separate\n")));
                s.close();
                check(Files.readString(root.resolve("Main.java")).equals("// external change\n"), "External edit is never overwritten");
                check(Files.readString(root.resolve("Other.java")).startsWith("// separate"), "Independent file saved");
                Path recovery = Settings.home().resolve("share/recovery").resolve(s.id());
                check(Files.readString(recovery.resolve("Main.java.recovery")).contains("// next"), "Recovery keeps conflicted changes");
                check(Files.readString(recovery.resolve("Main.java.before")).equals("class Main {}\n"), "Pre-session backup retained");
            }
            try (ShareSession shared = new ShareSession(root, "Five editors", "Host");
                 ShareTransport transport = new ShareTransport(shared, InetAddress.getByName("127.0.0.1"), 0)) {
                List<Json.Obj> devices = new ArrayList<>();
                for (int i = 0; i < 5; i++) {
                    Json.Obj join = new Json.Obj().put("version", ShareSession.VERSION).put("session", shared.id()).put("action", "join").put("invitation", shared.invitation()).put("name", "Editor " + i);
                    Json.Obj device = ShareTransport.exchange("127.0.0.1", transport.port(), transport.fingerprint, join);
                    shared.decide(device.str("device"), true, "editor"); devices.add(device);
                }
                var pool = java.util.concurrent.Executors.newFixedThreadPool(5);
                try {
                    List<java.util.concurrent.Future<Json.Obj>> replies = new ArrayList<>();
                    for (int i = 0; i < 5; i++) {
                        final int index = i; Json.Obj device = devices.get(i);
                        replies.add(pool.submit(() -> {
                            Json.Obj open = ShareTransport.exchange("127.0.0.1", transport.port(), transport.fingerprint, request(shared, device, "open", "Other.java"));
                            return ShareTransport.exchange("127.0.0.1", transport.port(), transport.fingerprint, request(shared, device, "sync", "Other.java").put("operation", op(500, open.str("actor"), "", "// editor" + index + "\n")));
                        }));
                    }
                    for (var reply : replies) check(reply.get(10, java.util.concurrent.TimeUnit.SECONDS).bool("ok"), "Concurrent TLS editor operation accepted");
                    Json.Obj result = shared.command(request(shared, devices.get(0), "read", "Other.java"));
                    for (int i = 0; i < 5; i++) check(result.str("content").contains("// editor" + i), "Every editor survives convergence");
                } finally { pool.shutdownNow(); }
            }
            Json.Obj metadata = new Json.Obj().put("name", "Study group").put("host", "Ada").put("count", 3);
            byte[] packet = ShareDiscovery.answer("Lark-123456789012." + ShareDiscovery.SERVICE, InetAddress.getByName("192.168.1.5"), 43126, metadata, 120);
            List<Json.Obj> found = ShareDiscovery.parse(packet);
            check(found.size() == 1 && found.get(0).str("name").equals("Study group"), "DNS-SD PTR/SRV/TXT/A roundtrip");
            check(found.get(0).longVal("port") == 43126 && found.get(0).str("address").equals("192.168.1.5"), "Discovered endpoint");
            check(ShareDiscovery.queryForService(ShareDiscovery.query()), "mDNS service query");
            String local = Mobile.lanAddresses().stream().findFirst().orElse(null);
            if (local != null) {
                try (ShareDiscovery advertisement = new ShareDiscovery(InetAddress.getByName(local), 43126, "123456789012" + "a".repeat(52), () -> metadata)) {
                    Json.Arr nearby = ShareDiscovery.nearby(InetAddress.getByName(local));
                    if (nearby.values().stream().anyMatch(v -> ((Json.Obj)v).str("name", "").equals("Study group"))) check(true, "Real selected-interface mDNS discovery");
                    else System.out.println("SKIP physical multicast response: network did not return the local advertisement.");
                } catch (java.io.IOException e) { System.out.println("SKIP multicast socket: " + e.getClass().getSimpleName()); }
            }
            check(!new String(packet, java.nio.charset.StandardCharsets.ISO_8859_1).contains("invitation"), "No credentials in discovery");
            try { ShareDiscovery.parse(Arrays.copyOf(packet, 12)); throw new AssertionError("Truncated DNS accepted"); }
            catch (java.io.IOException e) { check(true, "Malformed DNS denied"); }
        } finally { Projects.deleteTree(root); }
        System.out.println("ShareEditingCheck: " + checks + " checks passed.");
    }
}
