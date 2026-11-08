package lark;

public final class ShareRelayWorkflowCheck {
    public static void main(String[] args) throws Exception {
        Settings settings = Settings.load(); settings.shareRelayUrl = args[0];
        Projects projects = new Projects(settings); String id = projects.create("Relay workflow test", "empty");
        Share host = new Share(projects, settings), guest = new Share(projects, settings);
        try {
            Json.Obj started = host.control(new Json.Obj().put("action", "host").put("project", id).put("name", "Test").put("displayName", "Host"));
            if (!started.bool("hosting") || !started.bool("relay")) throw new AssertionError("Relay host not ready");
            Json.Obj joined = guest.control(new Json.Obj().put("action", "join").put("invitation", started.str("invitation")).put("displayName", "Guest").put("verified", true));
            String device = joined.str("identity");
            if (!"pending".equals(joined.obj("session").str("status"))) throw new AssertionError("Guest approval bypassed");
            host.control(new Json.Obj().put("action", "decide").put("device", device).put("approve", true).put("role", "editor"));
            Json.Obj files = guest.control(new Json.Obj().put("action", "files"));
            if (files.arr("files").values().isEmpty()) throw new AssertionError("Guest could not list source");
            guest.control(new Json.Obj().put("action", "leave"));
            host.control(new Json.Obj().put("action", "end"));
            System.out.println("Live Share control flow: host, invitation, approval, files, leave and cleanup passed.");
        } finally { guest.close(); host.close(); projects.delete(id); }
    }
}
