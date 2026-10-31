package lark;

import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Base64;

/** Independent Mobile guests exercise the production pinned TLS transport. */
public final class MobileShareCheck {
    static int checks;
    static void check(boolean value, String label) { checks++; if (!value) throw new AssertionError(label); }
    interface Action { void run() throws Exception; }
    static void denied(Action action, int code) throws Exception {
        try { action.run(); throw new AssertionError("Expected denial"); }
        catch (RequestFail e) { check(e.status == code, "Expected " + code + ", got " + e.status); }
    }
    static Json.Obj command(String action) { return new Json.Obj().put("action", action); }
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("mobile-share-check-");
        Files.writeString(root.resolve("Main.java"), "class Main {}\n");
        try (ShareSession host = new ShareSession(root, "Mobile test", "Host");
             ShareTransport transport = new ShareTransport(host, InetAddress.getLoopbackAddress(), 0);
             MobileShare mobile = new MobileShare(null)) {
            String invitation = Base64.getUrlEncoder().withoutPadding().encodeToString(new Json.Obj()
                .put("version", ShareSession.VERSION).put("address", "127.0.0.1").put("port", transport.port())
                .put("fingerprint", transport.fingerprint).put("session", host.id()).put("invitation", host.invitation()).write().getBytes(StandardCharsets.UTF_8));
            String a = "a".repeat(64), b = "b".repeat(64), writer = "c".repeat(32);
            for (String action : new String[]{"host", "invitation", "decide", "end", "security", "review", "acknowledge", "run"})
                denied(() -> mobile.control(a, command(action)), 403);
            denied(() -> mobile.control("bad", command("status")), 400);
            denied(() -> mobile.control(a, command("join").put("invitation", invitation)), 400);
            Json.Obj joined = mobile.control(a, command("join").put("invitation", invitation).put("verified", true).put("displayName", "Phone"));
            String identity = joined.str("identity");
            check(joined.str("connection").equals("Waiting for Approval"), "Approval required");
            check(!mobile.control(b, command("status")).bool("joined"), "Other tab has no authority");
            denied(() -> mobile.control(a, command("files")), 403);
            host.decide(identity, true, "viewer");
            check(mobile.control(a, command("files")).arr("files").size() == 1, "Approved guest sees files");
            Json.Obj opened = mobile.control(a, command("open").put("writer", writer).put("path", "Main.java"));
            check(opened.str("role").equals("viewer"), "Viewer role preserved");
            Json.Obj operation = new Json.Obj().put("actor", opened.str("actor")).put("seq", 1).put("after", "").put("text", "// phone\n").put("remove", new Json.Arr());
            denied(() -> mobile.control(a, command("sync").put("writer", writer).put("path", "Main.java").put("operation", operation)), 403);
            host.decide(identity, true, "editor");
            check(mobile.control(a, command("sync").put("writer", writer).put("path", "Main.java").put("operation", operation)).bool("ok"), "Editor can edit");
            check(host.review().arr("changes").size() == 1, "Host sees mobile edit for review");
            mobile.control(a, command("leave"));
            denied(() -> mobile.control(a, command("files")), 409);
            check(!mobile.control(b, command("status")).bool("joined"), "Leave cannot affect unrelated guest");
            System.out.println("MobileShareCheck: " + checks + " checks passed over real TLS.");
        } finally { Projects.deleteTree(root); }
    }
}
