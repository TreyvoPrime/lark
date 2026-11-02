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
 * Short LAN codes such as LARK-K7M2Q9X. The code is never broadcast. A guest finds Share hosts with
 * the existing mDNS browse, then runs a two-step proof over TLS with each one:
 *   hello: guest nonce -> host nonce + HMAC(K, "host"|fingerprint|nonces)   (guest checks: host knows the code AND owns that certificate)
 *   claim: HMAC(K, "guest"|fingerprint|nonces) -> long invitation credentials (host checks: guest knows the code)
 * K = PBKDF2(code, fingerprint). A spoofed responder can't produce the host MAC for its own certificate. Offline
 * guessing from a captured host MAC costs 31^7 PBKDF2 runs, far beyond the code's lifetime. Online guesses
 * are rate limited per source IP and globally. Host approval is still required after the join.
 */
final class ShareCode {
    static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L
    static final int LENGTH = 7; // 31^7 ≈ 2^34.7
    static final long DEFAULT_TTL = 15 * 60_000L;
    static final int ITERATIONS = 120_000;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final LongSupplier clock;
    private final String fingerprint;
    private String code; private byte[] key; private long expires; private boolean revoked;
    private final Map<String, long[]> challenges = new LinkedHashMap<>(); // hostNonce -> {created}, with guest nonce in names
    private final Map<String, String> challengeGuest = new HashMap<>();
    private final Map<String, long[]> failures = new LinkedHashMap<>(); // ip -> {count, lockedUntil}
    private final Map<String, long[]> hellos = new LinkedHashMap<>();   // ip -> {windowStart, count}
    private long globalFailures, globalLockedUntil;

    ShareCode(String fingerprint, LongSupplier clock) { this.fingerprint = fingerprint.toLowerCase(Locale.ROOT); this.clock = clock; }

    static String generate() {
        StringBuilder b = new StringBuilder("LARK-");
        for (int i = 0; i < LENGTH; i++) b.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        return b.toString();
    }
    /** Accepts "lark-k7m2 q9x", "K7M2Q9X", "LARK K7M2-Q9X", zero-width chars, etc. Returns null if not a code. */
    static String normalize(String raw) {
        if (raw == null || raw.length() > 64) return null;
        String s = raw.replaceAll("[\\u200B-\\u200F\\u2028-\\u202F\\u2060-\\u206F\\uFEFF\\u00AD]", "")
                .replaceAll("[\\s\\-_.\\u2010-\\u2015\"'`\\u2018\\u2019\\u201C\\u201D<>]", "").toUpperCase(Locale.ROOT);
        if (s.startsWith("LARK")) s = s.substring(4);
        if (s.length() != LENGTH) return null;
        for (char c : s.toCharArray()) if (ALPHABET.indexOf(c) < 0) return null;
        return "LARK-" + s;
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
        challenges.clear(); challengeGuest.clear(); globalFailures = 0; globalLockedUntil = 0;
        return code;
    }
    synchronized void revoke() { if (code != null) revoked = true; key = null; challenges.clear(); challengeGuest.clear(); }
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
            challenges.entrySet().removeIf(e -> now - e.getValue()[0] > 30_000);
            while (challenges.size() >= 64) { String first = challenges.keySet().iterator().next(); challenges.remove(first); challengeGuest.remove(first); }
            String hostNonce = ShareSession.token();
            challenges.put(hostNonce, new long[]{now}); challengeGuest.put(hostNonce, guestNonce);
            return ShareSession.ok().put("nonce", hostNonce).put("proof", mac(key, "host", fingerprint, guestNonce, hostNonce));
        }
        if (action.equals("code-claim")) {
            long[] fail = failures.computeIfAbsent(ip, k -> new long[]{0, 0});
            if (failures.size() > 256) failures.remove(failures.keySet().iterator().next());
            if (now < fail[1] || now < globalLockedUntil) throw new RequestFail(429, "Too many wrong Lark codes. Wait a little and try again.");
            requireActive();
            String hostNonce = request.str("nonce", "");
            long[] made = challenges.remove(hostNonce); String guestNonce = challengeGuest.remove(hostNonce);
            boolean good = made != null && now - made[0] <= 30_000
                    && ShareSession.equal(mac(key, "guest", fingerprint, guestNonce, hostNonce), request.str("proof", ""));
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
