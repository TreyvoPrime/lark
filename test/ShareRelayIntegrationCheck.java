package lark;

import java.nio.file.*;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ShareRelayIntegrationCheck {
    public static void main(String[] args) throws Exception {
        Path dir = Files.createTempDirectory("lark-relay-integration-");
        Files.writeString(dir.resolve("Main.java"), "class Main {}\n");
        ShareSession session = new ShareSession(dir, "Test", "Host");
        ShareCrypto crypto = new ShareCrypto();
        ShareRelay relay = new ShareRelay(args[0], session.id(), ShareSession.token(), session.invitation());
        AtomicBoolean running = new AtomicBoolean(true);
        Thread host = new Thread(() -> {
            while (running.get()) try {
                Json.Obj item = relay.poll().obj("item"); if (item == null) continue;
                ShareCrypto.Incoming incoming = crypto.open(session.id(), item.obj("request"));
                Json.Obj result;
                try { result = session.command(incoming.request()); }
                catch (RequestFail e) { result = ShareTransport.error(e.status, e.getMessage()); }
                relay.reply(item.str("id"), ShareCrypto.seal(session.id(), incoming, result));
            } catch (InterruptedException e) { break; }
              catch (Exception e) { if (running.get()) throw new RuntimeException(e); }
        });
        host.setDaemon(true); host.start();
        try {
            Json.Obj join = new Json.Obj().put("version", ShareSession.VERSION).put("session", session.id()).put("action", "join")
                    .put("invitation", session.invitation()).put("client", ShareSession.token()).put("name", "Guest");
            Json.Obj guest = ShareRelay.send(args[0], session.id(), session.invitation(), crypto.publicKey(), crypto.fingerprint(), join);
            String device = guest.str("device"), credential = guest.str("credential");
            session.decide(device, true, "editor");
            Json.Obj read = new Json.Obj().put("version", ShareSession.VERSION).put("session", session.id()).put("action", "read")
                    .put("device", device).put("credential", credential).put("path", "Main.java");
            Json.Obj result = ShareRelay.send(args[0], session.id(), session.invitation(), crypto.publicKey(), crypto.fingerprint(), read);
            if (!result.str("content").contains("class Main")) throw new AssertionError("Encrypted relay source mismatch");
            session.decide(device, false, "editor");
            try { ShareRelay.send(args[0], session.id(), session.invitation(), crypto.publicKey(), crypto.fingerprint(), read); throw new AssertionError("Revoked guest retained access"); }
            catch (RequestFail expected) { }
            System.out.println("HTTPS relay encrypted join, approval, source and revocation passed.");
        } finally { running.set(false); host.interrupt(); relay.close(); session.close(); Projects.deleteTree(dir); }
    }
}
