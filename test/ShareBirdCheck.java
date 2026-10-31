package lark;
import java.nio.file.*;
/** Exercises the authenticated avatar path without opening a network listener. */
public final class ShareBirdCheck {
  public static void main(String[] args) throws Exception {
    Path root = Files.createTempDirectory("lark-bird-");
    Files.writeString(root.resolve("Main.java"), "class Main {}\n");
    try (ShareSession s = new ShareSession(root, "Session", "Host")) {
      Json.Obj base = new Json.Obj().put("version", ShareSession.VERSION).put("session", s.id());
      Json.Obj join = s.command(new Json.Obj().put("version", ShareSession.VERSION).put("session", s.id()).put("action", "join").put("invitation", s.invitation()).put("name", "Guest").put("bird", "cardinal"));
      Json.Obj avatar = new Json.Obj().put("version", ShareSession.VERSION).put("session", s.id()).put("action", "avatar").put("device", join.str("device")).put("credential", join.str("credential")).put("bird", "raven");
      s.command(avatar);
      if (!s.localStatus().write().contains("\"bird\":\"raven\"")) throw new AssertionError("avatar update");
      s.avatar("eagle");
      if (!s.localStatus().write().contains("\"bird\":\"eagle\"")) throw new AssertionError("host avatar");
      avatar.put("credential", "invalid");
      try { s.command(avatar); throw new AssertionError("unauthenticated update"); } catch (RequestFail expected) { if (expected.status != 403) throw expected; }
      if (!ShareSession.bird("invalid").equals("classic")) throw new AssertionError("invalid fallback");
    }
    System.out.println("Share bird authentication checks passed");
  }
}
