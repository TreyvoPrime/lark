package lark;
import java.nio.file.*;
/** Pinned TLS and avatar synchronization through a real local network interface. */
public final class ShareLanBirdCheck {
  static Json.Obj request(ShareSession s, String action) { return new Json.Obj().put("version", ShareSession.VERSION).put("session", s.id()).put("action", action); }
  static Json.Obj authenticated(ShareSession s, Json.Obj device, String action) { return request(s, action).put("device", device.str("device")).put("credential", device.str("credential")); }
  public static void main(String[] args) throws Exception {
    String address = Mobile.lanAddresses().stream().findFirst().orElse(null);
    if (address == null) { System.out.println("SKIP LAN check: no local interface"); return; }
    Path root = Files.createTempDirectory("lark-lan-bird-"); Files.writeString(root.resolve("Main.java"), "class Main {}\n");
    try (ShareSession session = new ShareSession(root, "LAN test", "Host"); ShareTransport server = new ShareTransport(session, ShareTransport.lanAddress(address), 0)) {
      Json.Obj first = ShareTransport.exchange(address, server.port(), server.fingerprint, request(session, "join").put("invitation", session.invitation()).put("name", "Alice").put("bird", "robin"));
      Json.Obj second = ShareTransport.exchange(address, server.port(), server.fingerprint, request(session, "join").put("invitation", session.invitation()).put("name", "Bob").put("bird", "robin"));
      session.decide(first.str("device"), true, "editor"); session.decide(second.str("device"), true, "viewer");
      if (!ShareTransport.exchange(address, server.port(), server.fingerprint, authenticated(session, first, "avatar").put("bird", "falcon")).bool("ok")) throw new AssertionError("update failed");
      Json.Obj poll = ShareTransport.exchange(address, server.port(), server.fingerprint, authenticated(session, second, "poll"));
      boolean seen = poll.arr("participants").values().stream().anyMatch(v -> { Json.Obj p = (Json.Obj)v; return p.str("id", "").equals(first.str("device")) && p.str("name", "").equals("Alice") && p.str("bird", "").equals("falcon"); });
      if (!seen || !poll.str("role").equals("viewer")) throw new AssertionError("avatar, identity or permission mismatch");
      System.out.println("LAN-interface encrypted bird synchronization passed");
    }
  }
}
