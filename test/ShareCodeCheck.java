package lark;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

/** Short LAN codes: generation, normalization, expiry, revoke, rate limits, and a two-process resolve + join. */
public final class ShareCodeCheck {
    static int checks;
    static void check(boolean ok, String msg) { checks++; if (!ok) throw new AssertionError(msg); }
    static void fails(Runnable r, int code, String msg) {
        try { r.run(); check(false, msg + " (no error)"); }
        catch (RequestFail e) { check(e.status == code, msg + ": got " + e.status + " " + e.getMessage()); }
    }

    public static void main(String[] args) throws Exception {
        if (args.length > 1 && args[0].equals("host")) { host(Path.of(args[1])); return; }
        units();
        twoProcess();
        System.out.println("ShareCodeCheck: " + checks + " checks passed (codes, limits, two-process resolve+join, spoofed responders rejected).");
    }

    static void units() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 2000; i++) {
            String c = ShareCode.generate();
            check(c.matches("LARK-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}"), "Bad code " + c);
            seen.add(c);
        }
        check(seen.size() == 2000, "Codes repeat");
        for (String in : List.of("LARK-K7M2Q9X", "lark-k7m2q9x", " K7M2Q9X ", "k7m2-q9x", "LARK K7M2 Q9X", "\u201CLARK\u2013K7M2Q9X\u201D", "lark_k7m2q9x\n", "K7M\u200B2Q9X"))
            check("LARK-K7M2Q9X".equals(ShareCode.normalize(in)), "Normalize failed: " + in);
        for (String in : List.of("", "LARK-K7M2Q9", "LARK-K7M2Q9XX", "LARK-K7M2Q90", "LARK-K7M2QOX", "LARK-K7M2Q1X", "LARK-K7M2QIX", "LARK-K7M2QLX"))
            check(ShareCode.normalize(in) == null, "Accepted bad code: " + in);
        check(Share.looksLikeShortCode("lark-k7m2q90") && !Share.looksLikeShortCode("eyJ2ZXJzaW9uIjoyLCJhZGRyZXNzIjoiMTI3LjAuMC4xIn0"), "Code vs invitation detection");

        String fp = "ab".repeat(32);
        AtomicLong clock = new AtomicLong(1_000_000);
        ShareCode host = new ShareCode(fp, clock::get);
        Json.Obj hello = new Json.Obj().put("action", "code-hello").put("nonce", "cd".repeat(32));
        fails(() -> host.handle(hello, "10.0.0.2", "s", "i"), 404, "No code yet");
        String code = host.create(ShareCode.DEFAULT_TTL);
        check(host.status().str("codeState").equals("active") && host.status().str("code").equals(code), "Active status");
        Json.Obj ok = claim(host, code, fp, "10.0.0.2");
        check(ok.bool("ok") && "i".equals(ok.str("invitation")), "Right code claims");
        fails(() -> claim(host, "LARK-2222222", fp, "10.0.0.3"), 403, "Wrong code rejected");
        clock.addAndGet(ShareCode.DEFAULT_TTL);
        fails(() -> host.handle(hello, "10.0.0.2", "s", "i"), 410, "Expired code");
        check(host.status().str("codeState").equals("expired") && host.status().str("code").isEmpty(), "Expired status hides code");
        String again = host.create(ShareCode.DEFAULT_TTL);
        host.revoke();
        fails(() -> claim(host, again, fp, "10.0.0.2"), 410, "Revoked code");
        check(host.status().str("codeState").equals("revoked"), "Revoked status");

        // Per-IP backoff after 3 wrong claims; the right code from that IP is then also refused for a while.
        String fresh = host.create(ShareCode.DEFAULT_TTL);
        for (int i = 0; i < 3; i++) fails(() -> claim(host, "LARK-2222222", fp, "10.0.0.9"), 403, "Wrong guess " + i);
        fails(() -> claim(host, fresh, fp, "10.0.0.9"), 429, "Per-IP lockout");
        check(claim(host, fresh, fp, "10.0.0.10").bool("ok"), "Other IPs unaffected");
        clock.addAndGet(6_000);
        check(claim(host, fresh, fp, "10.0.0.9").bool("ok"), "Lockout expires");
        // Hello flood per IP.
        for (int i = 0; i < 12; i++) host.handle(hello, "10.0.0.20", "s", "i");
        fails(() -> host.handle(hello, "10.0.0.20", "s", "i"), 429, "Hello rate limit");
        // Global backoff: 20 wrong claims across all IPs since this code was made (3 above + 17 here).
        for (int i = 0; i < 17; i++) { String ip = "10.1.0." + i; fails(() -> claim(host, "LARK-2222222", fp, ip), 403, "Global guess " + ip); }
        fails(() -> claim(host, fresh, fp, "10.2.0.1"), 429, "Global lockout");
    }
    /** Runs the guest side of the protocol directly against a ShareCode. */
    static Json.Obj claim(ShareCode host, String code, String fp, String ip) {
        String gn = ShareSession.token();
        Json.Obj h = host.handle(new Json.Obj().put("action", "code-hello").put("nonce", gn), ip, "s", "i");
        byte[] key = ShareCode.key(code, fp);
        return host.handle(new Json.Obj().put("action", "code-claim").put("nonce", h.str("nonce"))
                .put("proof", ShareCode.mac(key, "guest", fp, gn, h.str("nonce"))), ip, "s", "i");
    }

    static void twoProcess() throws Exception {
        Path root = Files.createTempDirectory("lark-code-test-");
        Files.writeString(root.resolve("Main.java"), "class Main {}\n");
        Process child = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-cp", System.getProperty("java.class.path"), "lark.ShareCodeCheck", "host", root.toString())
                .redirectError(ProcessBuilder.Redirect.INHERIT).start();
        ShareTransport spoofA = null, spoofB = null;
        try {
            String[] line = new BufferedReader(new InputStreamReader(child.getInputStream(), StandardCharsets.UTF_8)).readLine().split(" ");
            String code = line[0], realFp = line[2]; int port = Integer.parseInt(line[1]);
            Json.Obj real = new Json.Obj().put("address", "127.0.0.1").put("port", port);

            // Spoof A: a LAN responder that doesn't know the code. Spoof B: knows the code and replays proofs made for the
            // real host's certificate (as a relay would), but terminates TLS with its own certificate.
            ShareSession fake = new ShareSession(root, "Fake", "Mallory");
            spoofA = new ShareTransport(fake, ShareTransport.lanAddress("127.0.0.1"), 0, 200);
            spoofA.codes = new ShareCode(spoofA.fingerprint, System::currentTimeMillis); spoofA.codes.create(ShareCode.DEFAULT_TTL);
            spoofB = new ShareTransport(fake, ShareTransport.lanAddress("127.0.0.1"), 0, 200);
            spoofB.codes = new ShareCode(realFp, System::currentTimeMillis); spoofB.codes.create(code, ShareCode.DEFAULT_TTL);
            List<Json.Obj> spoofs = List.of(new Json.Obj().put("address", "127.0.0.1").put("port", spoofA.port()),
                    new Json.Obj().put("address", "127.0.0.1").put("port", spoofB.port()));
            fails(() -> Share.resolveCode(code, spoofs), 404, "Only spoofed responders => not found");

            List<Json.Obj> all = new ArrayList<>(spoofs); all.add(real);
            Json.Obj target = Share.resolveCode(ShareCode.normalize(code.toLowerCase().replace("-", " ")), all);
            check(target.str("fingerprint").equals(realFp) && target.longVal("port") == port, "Resolved to the real host: " + target.write());
            fails(() -> Share.resolveCode("LARK-2222222", List.of(real)), 404, "Wrong code => not found");

            Json.Obj join = ShareTransport.exchange("127.0.0.1", port, target.str("fingerprint"), new Json.Obj().put("version", ShareSession.VERSION)
                    .put("session", target.str("session")).put("action", "join").put("invitation", target.str("invitation")).put("name", "Guest"));
            check(join.bool("ok"), "Join with resolved credentials: " + join.write());
            Json.Obj poll = ShareTransport.exchange("127.0.0.1", port, target.str("fingerprint"), new Json.Obj().put("version", ShareSession.VERSION)
                    .put("session", target.str("session")).put("action", "poll").put("device", join.str("device")).put("credential", join.str("credential")));
            check("pending".equals(poll.str("status")), "Still pending host approval: " + poll.write());
            Json.Obj read = ShareTransport.exchange("127.0.0.1", port, target.str("fingerprint"), new Json.Obj().put("version", ShareSession.VERSION)
                    .put("session", target.str("session")).put("action", "read").put("path", "Main.java").put("device", join.str("device")).put("credential", join.str("credential")));
            check(!read.bool("ok"), "Unapproved guest can't read files");
        } finally {
            child.destroy();
            if (spoofA != null) spoofA.close();
            if (spoofB != null) spoofB.close();
            Projects.deleteTree(root);
        }
    }

    static void host(Path root) throws Exception {
        ShareSession session = new ShareSession(root, "Code test", "Host");
        ShareTransport transport = new ShareTransport(session, ShareTransport.lanAddress("127.0.0.1"), 0, 200);
        transport.codes = new ShareCode(transport.fingerprint, System::currentTimeMillis);
        String code = transport.codes.create(ShareCode.DEFAULT_TTL);
        System.out.println(code + " " + transport.port() + " " + transport.fingerprint);
        System.out.flush();
        Thread.sleep(60_000);
        transport.close();
    }
}
