package lark;

import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import java.util.function.LongSupplier;

/**
 * Short LAN codes such as 7K9M2P. The code is never broadcast. A guest finds Share hosts with
 * the existing mDNS browse, then runs a two-step proof over TLS with each one:
 *   hello: guest nonce -> host nonce + HMAC(K, "host"|fingerprint|nonces)   (guest checks: host knows the code AND owns that certificate)
 *   claim: HMAC(K, "guest"|fingerprint|nonces) -> long invitation credentials (host checks: guest knows the code)
 * K = PBKDF2(code, fingerprint). A spoofed responder can't produce the host MAC for its own certificate.
 * The host proof is an offline password verifier: anyone who obtains one can test guesses without the online
 * limiter. A code's expiry does not protect a captured transcript. The six-character code is weaker than the old
 * code; it must not be relied on as the only authentication. Host approval is still required after join.
 */
final class ShareCode {
    static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L
    static final int LENGTH = 6; // 31^6 ≈ 2^29.7
    static final long DEFAULT_TTL = 15 * 60_000L;
    static final int ITERATIONS = 120_000;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final LongSupplier clock;
    private final String fingerprint;
    private String code; private byte[] key; private long expires; private boolean revoked;
    private record Challenge(long created, String guestNonce) { }
    private final Map<String, Challenge> challenges = new LinkedHashMap<>();
    private final Map<String, long[]> failures = new LinkedHashMap<>(); // ip -> {count, lockedUntil}
    private final Map<String, long[]> hellos = new LinkedHashMap<>();   // ip -> {windowStart, count}
    private long globalFailures, globalLockedUntil;

    ShareCode(String fingerprint, LongSupplier clock) { this.fingerprint = fingerprint.toLowerCase(Locale.ROOT); this.clock = clock; }

    static String generate() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < LENGTH; i++) b.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        return b.toString();
    }
    /** Accept a six-character code case-insensitively, allowing whitespace around it. */
    static String normalize(String raw) {
        if (raw == null || raw.length() > 64) return null;
        String s = raw.strip().toUpperCase(Locale.ROOT);
        if (s.length() != LENGTH) return null;
        for (char c : s.toCharArray()) if (ALPHABET.indexOf(c) < 0) return null;
        return s;
    }
    static byte[] key(String code, String fingerprint) {
        try {
            PBEKeySpec spec = new PBEKeySpec(code.toCharArray(), ("lark-share-code|" + fingerprint.toLowerCase(Locale.ROOT)).getBytes(StandardCharsets.UTF_8), ITERATIONS, 256);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    static String mac(byte[] key, String role, String fingerprint, String guestNonce, String hostNonce) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((role + "|" + fingerprint.toLowerCase(Locale.ROOT) + "|" + guestNonce + "|" + hostNonce).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    synchronized String create(long ttl) { return create(generate(), ttl); }
    synchronized String create(String fixed, long ttl) {
        code = fixed; key = key(code, fingerprint); expires = clock.getAsLong() + ttl; revoked = false;
        challenges.clear(); globalFailures = 0; globalLockedUntil = 0;
        return code;
    }
    synchronized void revoke() { if (code != null) revoked = true; key = null; challenges.clear(); }
    synchronized Json.Obj status() {
        Json.Obj o = new Json.Obj();
        if (code == null) return o.put("code", "").put("codeState", "none");
        String state = revoked ? "revoked" : clock.getAsLong() >= expires ? "expired" : "active";
        o.put("code", state.equals("active") ? code : "").put("codeState", state);
        if (state.equals("active")) o.put("codeExpiresIn", Math.max(0, (expires - clock.getAsLong()) / 1000));
        return o;
    }
    private void requireActive() {
        if (code == null) throw new RequestFail(404, "No active Lark code on this host.");
        if (revoked || key == null) throw new RequestFail(410, "This Lark code was revoked by the host.");
        if (clock.getAsLong() >= expires) throw new RequestFail(410, "This Lark code has expired. Ask the host for a new one.");
    }

    /** Host side of both steps. {@code ip} is the TLS peer address. */
    synchronized Json.Obj handle(Json.Obj request, String ip, String sessionId, String invitation) {
        long now = clock.getAsLong();
        String action = request.str("action", "");
        if (action.equals("code-hello")) {
            long[] slot = hellos.computeIfAbsent(ip, k -> new long[]{now, 0});
            if (hellos.size() > 256) hellos.remove(hellos.keySet().iterator().next());
            if (now - slot[0] >= 60_000) { slot[0] = now; slot[1] = 0; }
            if (++slot[1] > 12) throw new RequestFail(429, "Too many Lark code attempts. Wait a minute and try again.");
            requireActive();
            String guestNonce = request.str("nonce", "");
            if (!guestNonce.matches("[a-f0-9]{64}")) throw new RequestFail(400, "Invalid Lark code request.");
            challenges.entrySet().removeIf(e -> now - e.getValue().created() > 30_000);
            while (challenges.size() >= 64) challenges.remove(challenges.keySet().iterator().next());
            String hostNonce = ShareSession.token();
            challenges.put(hostNonce, new Challenge(now, guestNonce));
            return ShareSession.ok().put("nonce", hostNonce).put("proof", mac(key, "host", fingerprint, guestNonce, hostNonce));
        }
        if (action.equals("code-claim")) {
            long[] fail = failures.computeIfAbsent(ip, k -> new long[]{0, 0});
            if (failures.size() > 256) failures.remove(failures.keySet().iterator().next());
            if (now < fail[1] || now < globalLockedUntil) throw new RequestFail(429, "Too many wrong Lark codes. Wait a little and try again.");
            requireActive();
            String hostNonce = request.str("nonce", "");
            Challenge made = challenges.remove(hostNonce);
            boolean good = made != null && now - made.created() <= 30_000
                    && ShareSession.equal(mac(key, "guest", fingerprint, made.guestNonce(), hostNonce), request.str("proof", ""));
            if (!good) {
                fail[0]++; if (fail[0] >= 3) fail[1] = now + Math.min(10 * 60_000L, 5_000L << Math.min(fail[0] - 3, 7));
                globalFailures++; if (globalFailures >= 20) globalLockedUntil = now + Math.min(10 * 60_000L, 10_000L << Math.min(globalFailures - 20, 6));
                throw new RequestFail(403, "That Lark code doesn't match this host.");
            }
            fail[0] = 0;
            return ShareSession.ok().put("session", sessionId).put("invitation", invitation);
        }
        throw new RequestFail(400, "Unknown Lark code request.");
    }
}
