package lark;

import java.net.URI;
import java.net.http.*;

public final class ShareRelayRecoveryCheck {
    public static void main(String[] args) throws Exception {
        Settings settings = Settings.load(); settings.shareRelayUrl = args[0];
        Projects projects = new Projects(settings); String id = projects.create("Recovery test", "empty");
        Share host = new Share(projects, settings), guest = new Share(projects, settings);
        try {
            Json.Obj start = host.control(new Json.Obj().put("action", "host").put("project", id).put("name", "Test").put("displayName", "Host"));
            Json.Obj joined = guest.control(new Json.Obj().put("action", "join").put("invitation", start.str("invitation")).put("displayName", "Guest").put("verified", true));
            host.control(new Json.Obj().put("action", "decide").put("device", joined.str("identity")).put("approve", true).put("role", "editor"));
            Json.Arr files = guest.control(new Json.Obj().put("action", "files")).arr("files");
            String path = ((Json.Obj) files.values().get(0)).str("path"), writer = "a".repeat(32);
            Json.Obj opened = guest.control(new Json.Obj().put("action", "open").put("path", path).put("writer", writer));
            Json.Obj op = new Json.Obj().put("seq", 1000).put("actor", opened.str("actor")).put("after", "").put("text", "// once\n").put("remove", new Json.Arr());
            Json.Obj sync = new Json.Obj().put("action", "sync").put("path", path).put("writer", writer).put("operation", op);
            guest.control(sync);
            HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(args[0] + "/test/reset")).GET().build(), HttpResponse.BodyHandlers.discarding());
            long deadline = System.currentTimeMillis() + 35_000; boolean interrupted = false, restored = false; String previous = "";
            while (System.currentTimeMillis() < deadline) {
                String state = host.control(new Json.Obj().put("action", "relay-progress")).str("state");
                if (!state.equals(previous)) { System.out.println("Relay state: " + state); previous = state; }
                if ("RECONNECTING".equals(state)) interrupted = true;
                if (interrupted && "CONNECTED".equals(state)) { restored = true; break; }
                Thread.sleep(100);
            }
            if (!restored) throw new AssertionError("Host did not restore the same room");
            guest.control(sync);
            String text = guest.control(new Json.Obj().put("action", "source").put("path", path)).str("content");
            if (text.indexOf("// once") < 0 || text.indexOf("// once") != text.lastIndexOf("// once")) throw new AssertionError("Retry duplicated or lost an edit");
            System.out.println("Relay restart restored the session and repeated edit remained idempotent.");
        } finally { guest.close(); host.close(); projects.delete(id); }
    }
}
