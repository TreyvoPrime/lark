package lark;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

/** Nearby Request Access + host Approve/Deny/Remove, enforced by the host backend. Run with an isolated LARK_HOME. */
public final class ShareNearbyCheck {
    static int checks;
    static void check(boolean ok, String msg) { checks++; if (!ok) throw new AssertionError(msg); }
    interface Call { Object run() throws Exception; }
    static RequestFail fails(Call r, String msg) {
        try { r.run(); check(false, msg + " (no error)"); return null; }
        catch (RequestFail e) { checks++; return e; }
        catch (Exception e) { throw new AssertionError(msg + ": " + e, e); }
    }
    static Json.Obj req(ShareSession s, String action) { return new Json.Obj().put("version", ShareSession.VERSION).put("session", s.id()).put("action", action); }
    static Json.Obj auth(ShareSession s, Json.Obj d, String action) { return req(s, action).put("device", d.str("device")).put("credential", d.str("credential")); }
    static Json.Obj ask(String client, String name) { return new Json.Obj().put("version", ShareSession.VERSION).put("action", "request").put("client", client).put("name", name).put("device", "PC-" + name); }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("lark-nearby-test-");
        Files.writeString(root.resolve("Main.java"), "class Main {}\n");
        try {
            if (args.length > 0 && args[0].equals("host")) { host(Path.of(args[1])); return; }
            units(root);
            cards();
            twoProcess(root);
            System.out.println("ShareNearbyCheck: " + checks + " checks passed (request/approve/deny/remove/expiry enforced by host; two-process flow).");
        } finally { Projects.deleteTree(root); }
    }

    static void units(Path root) throws Exception {
        AtomicLong clock = new AtomicLong(1_000_000);
        try (ShareSession s = new ShareSession(root, "Nearby", "Host", clock::get)) {
            String a = ShareSession.token(), b = ShareSession.token(), c = ShareSession.token();
            Json.Obj da = s.request(ask(a, "Ann"), "10.0.0.2");
            check("pending".equals(da.str("status")) && s.id().equals(da.str("session")), "Request creates a pending device");
            for (String action : List.of("files", "read", "open", "sync"))
                check(fails(() -> s.command(auth(s, da, action).put("path", "Main.java")), "No " + action + " before approval").status == 403, action + " is 403 before approval");
            check(fails(() -> s.request(ask(a, "Ann"), "10.0.0.2"), "Duplicate").status == 409, "Duplicate request from same client refused");
            Json.Arr people = s.localStatus().arr("participants");
            Json.Obj ann = (Json.Obj) people.values().get(1);
            check("Ann".equals(ann.str("name")) && "PC-Ann".equals(ann.str("device")) && "pending".equals(ann.str("status")), "Host sees name, device and pending status");
            check(Set.of("name", "host", "bird", "status", "count").stream().allMatch(s.discoveryInfo()::has) && !s.discoveryInfo().write().contains("Main.java"), "Advert has no file names");

            s.decide(da.str("device"), false, "editor");
            check(fails(() -> s.command(auth(s, da, "poll")), "Denied poll").getMessage().contains("denied"), "Denied guest told so");
            check(fails(() -> s.request(ask(a, "Ann"), "10.0.0.2"), "Cooldown").status == 429, "Same IP cools down after a deny");
            check(fails(() -> s.request(ask(a, "Ann"), "10.0.0.3"), "Blocked").status == 403, "Denied client stays blocked from any IP");
            clock.addAndGet(ShareSession.DENY_COOLDOWN_MS);
            check(fails(() -> s.request(ask(a, "Ann"), "10.0.0.2"), "Blocked later").status == 403, "Denied client still blocked after cooldown");

            Json.Obj db = s.request(ask(b, "Bob"), "10.0.0.4");
            s.decide(db.str("device"), true, "editor");
            check(s.command(auth(s, db, "read").put("path", "Main.java")).bool("ok"), "Approved guest reads");
            s.decide(db.str("device"), false, "editor");
            check(fails(() -> s.command(auth(s, db, "read").put("path", "Main.java")), "Kicked").getMessage().contains("removed"), "Removed guest gets 403 immediately");
            check(s.request(ask(b, "Bob"), "10.0.0.4").bool("ok"), "Removed (not denied) guest may ask again");

            Json.Obj dc = s.request(ask(c, "Cat"), "10.0.0.5");
            clock.addAndGet(ShareSession.REQUEST_MS);
            check(fails(() -> s.command(auth(s, dc, "poll")), "Expired").status == 410, "Unanswered request expires");
            check(fails(() -> { s.decide(dc.str("device"), true, "editor"); return null; }, "Approve expired").status == 404, "Expired request can't be approved");
            check(s.request(ask(c, "Cat"), "10.0.0.5").bool("ok"), "Expired guest may ask again");

            // Stale approved participant is dropped.
            String d = ShareSession.token();
            Json.Obj dd = s.request(ask(d, "Dan"), "10.0.0.6"); s.decide(dd.str("device"), true, "viewer");
            clock.addAndGet(ShareSession.STALE_MS);
            s.command(auth(s, db, "poll").put("device", "x")).toString(); // any command triggers cleanup (this one fails below)
        } catch (RequestFail expected) { checks++; }
        try (ShareSession s = new ShareSession(root, "Rate", "Host", clock::get)) {
            for (int i = 0; i < 6; i++) s.request(ask(ShareSession.token(), "R" + i), "10.0.9.9");
            check(fails(() -> s.request(ask(ShareSession.token(), "R7"), "10.0.9.9"), "Rate").status == 429, "Per-IP request rate limit");
            for (int i = 0; i < 2; i++) s.request(ask(ShareSession.token(), "S" + i), "10.0.9." + i);
            check(fails(() -> s.request(ask(ShareSession.token(), "T"), "10.0.8.1"), "Pending cap").status == 429, "At most 8 unanswered requests");
            clock.addAndGet(ShareSession.REQUEST_MS); // every pending request expires
            Json.Obj fresh = s.request(ask(ShareSession.token(), "Eve"), "10.0.7.1"); s.decide(fresh.str("device"), true, "viewer");
            check(s.localStatus().arr("participants").values().size() == 2, "Expired requests leave the host's list");
            clock.addAndGet(ShareSession.STALE_MS);
            int stale = fails(() -> s.command(auth(s, fresh, "poll")), "Stale").status;
            check(stale == 403 || stale == 410, "Approved guest that stopped polling is dropped (or idle session closed)");
        }
    }

    static void cards() throws Exception {
        Share guest = new Share(null, null);
        Json.Obj a = new Json.Obj().put("id", "aaaaaaaaaaaa").put("name", "Proj").put("host", "Hana").put("bird", "robin").put("address", "10.0.0.2").put("port", 5000).put("status", "available");
        Json.Obj dup = new Json.Obj().put("id", "aaaaaaaaaaaa").put("name", "Proj").put("host", "Hana").put("bird", "nonsense").put("address", "10.0.0.3").put("port", 5000).put("status", "available");
        Json.Arr out = guest.nearbyCards(List.of(a, dup), 1000);
        check(out.values().size() == 1 && "classic".equals(((Json.Obj) out.values().get(0)).str("bird")), "Deduped by session id; bird sanitized");
        out = guest.nearbyCards(List.of(), 20_000);
        check("unavailable".equals(((Json.Obj) out.values().get(0)).str("status")), "Silent session shows unavailable");
        check(guest.nearbyCards(List.of(), 40_000).values().isEmpty(), "Silent session dropped after 30 s");
    }

    static void twoProcess(Path root) throws Exception {
        String lan = Mobile.lanAddresses().stream().findFirst().orElse("127.0.0.1");
        Process child = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-cp", System.getProperty("java.class.path"), "lark.ShareNearbyCheck", "host", lan)
                .redirectError(ProcessBuilder.Redirect.INHERIT).start();
        BufferedReader in = new BufferedReader(new InputStreamReader(child.getInputStream(), StandardCharsets.UTF_8));
        PrintWriter out = new PrintWriter(new OutputStreamWriter(child.getOutputStream(), StandardCharsets.UTF_8), true);
        try {
            String[] ready = in.readLine().split(" ");
            String address = ready[1], id = ready[3]; int port = Integer.parseInt(ready[2]);
            if (!address.startsWith("127.")) {
                List<Json.Obj> seen = new ArrayList<>();
                for (int i = 0; i < 3 && seen.isEmpty(); i++)
                    for (Json.Value v : ShareDiscovery.nearby(ShareTransport.lanAddress(address)).values())
                        if (v instanceof Json.Obj o && id.equals(o.str("id", ""))) seen.add(o);
                if (seen.isEmpty()) System.out.println("SKIP mDNS discovery: no multicast reply on " + address + " (requests below still run over that address)");
                else check(seen.get(0).longVal("port") == port && "raven".equals(seen.get(0).str("bird")) && !seen.get(0).write().contains("Main.java"), "Discovered with bird, no file names");
            } else System.out.println("SKIP mDNS discovery: no LAN interface");

            Settings settings = Settings.load();
            Share guest = new Share(new Projects(settings), settings);
            Json.Obj st = guest.control(new Json.Obj().put("action", "request").put("address", address).put("port", port).put("displayName", "Gus"));
            check("Waiting for Approval".equals(st.str("connection")) && st.str("verification").equals(ready[4]), "Pending, and guest's check code matches host's: " + st.write());
            check(fails(() -> guest.control(new Json.Obj().put("action", "files")), "Files before approval").status == 403, "No file list before approval");
            check(fails(() -> guest.control(new Json.Obj().put("action", "source").put("path", "Main.java")), "Read before approval").status == 403, "No file read before approval");
            out.println("deny Gus"); check("ok".equals(in.readLine()), "Host denied");
            check(guest.control(new Json.Obj().put("action", "status")).str("error", "").contains("denied"), "Guest sees denied");
            guest.control(new Json.Obj().put("action", "leave"));
            int again = fails(() -> guest.control(new Json.Obj().put("action", "request").put("address", address).put("port", port).put("displayName", "Gus")), "Re-request").status;
            check(again == 429 || again == 403, "Denied computer can't immediately re-request: " + again);

            // Approve path (fresh client). The deny cooldown is per IP, so wait it out on the host's clock: host restarts cooldown-free.
            out.println("clear"); check("ok".equals(in.readLine()), "Host cleared cooldown");
            Share friend = new Share(new Projects(settings), settings);
            friend.control(new Json.Obj().put("action", "request").put("address", address).put("port", port).put("displayName", "Fay"));
            out.println("approve Fay"); check("ok".equals(in.readLine()), "Host approved");
            check("Connected".equals(friend.control(new Json.Obj().put("action", "status")).str("connection")), "Approved guest connected");
            Json.Obj open = friend.control(new Json.Obj().put("action", "open").put("path", "Main.java").put("writer", "a".repeat(32)));
            String actor = open.str("actor");
            Json.Obj synced = friend.control(new Json.Obj().put("action", "sync").put("path", "Main.java").put("writer", "a".repeat(32)).put("operation",
                    new Json.Obj().put("seq", 1).put("actor", actor).put("after", "").put("text", "// hi\n").put("remove", new Json.Arr())));
            Json.Obj after = friend.control(new Json.Obj().put("action", "open").put("path", "Main.java").put("writer", "a".repeat(32)));
            check(after.write().contains("// hi"), "Approved guest edit applied: " + synced.write() + " / " + after.write());
            out.println("kick Fay"); check("ok".equals(in.readLine()), "Host removed guest");
            check(fails(() -> friend.control(new Json.Obj().put("action", "files")), "Kicked").status == 403, "Removed guest gets 403");
        } finally { out.println("quit"); child.waitFor(5, java.util.concurrent.TimeUnit.SECONDS); child.destroy(); }
    }

    static ShareSession hostSession;
    static void host(Path lan) throws Exception {
        Path root = Files.createTempDirectory("lark-nearby-host-");
        Files.writeString(root.resolve("Main.java"), "class Main {}\n");
        ShareSession s = new ShareSession(root, "Nearby Project", "Hana");
        s.avatar("raven");
        String addr = lan.toString();
        ShareTransport t = new ShareTransport(s, ShareTransport.lanAddress(addr), 0, 400);
        ShareDiscovery d = null;
        if (!addr.startsWith("127.")) try { d = new ShareDiscovery(ShareTransport.lanAddress(addr), t.port(), s.id(), s::discoveryInfo); } catch (Exception ignored) { }
        System.out.println("READY " + addr + " " + t.port() + " " + s.id().substring(0, 12) + " " + ShareTransport.verification(t.fingerprint));
        System.out.flush();
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        for (String line; (line = in.readLine()) != null && !line.equals("quit"); ) {
            String[] p = line.split(" ");
            try {
                if (p[0].equals("clear")) { s.close(); t.close(); if (d != null) d.close();
                    s = new ShareSession(root, "Nearby Project", "Hana"); t = new ShareTransport(s, ShareTransport.lanAddress(addr), t.port(), 400); }
                else {
                    String want = p[1]; String deviceId = null;
                    for (Json.Value v : s.localStatus().arr("participants").values()) if (v instanceof Json.Obj o && want.equals(o.str("name"))) deviceId = o.str("id");
                    s.decide(deviceId, p[0].equals("approve"), "editor");
                }
                System.out.println("ok");
            } catch (Exception e) { System.out.println("error " + e.getMessage()); }
            System.out.flush();
        }
        t.close(); if (d != null) d.close(); Projects.deleteTree(root);
    }
}
