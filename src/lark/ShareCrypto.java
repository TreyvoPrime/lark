package lark;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.*;

/** Per-request ephemeral X25519 and AES-GCM, authenticated by the private invitation. */
final class ShareCrypto {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DEC = Base64.getUrlDecoder();
    private final KeyPair host;
    private final Set<String> seen = new HashSet<>();
    ShareCrypto() throws Exception { host = KeyPairGenerator.getInstance("X25519").generateKeyPair(); }
    String publicKey() { return ENC.encodeToString(host.getPublic().getEncoded()); }
    String fingerprint() throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(host.getPublic().getEncoded())); }
    static final class Client {
        final byte[] key, binding;
        final Json.Obj envelope;
        Client(String room, String hostPublic, Json.Obj request) throws Exception {
            KeyPair ephemeral = KeyPairGenerator.getInstance("X25519").generateKeyPair();
            byte[] pub = ephemeral.getPublic().getEncoded();
            key = derive(ephemeral.getPrivate(), decodePublic(hostPublic), room, pub);
            byte[] nonce = random();
            byte[] encrypted = crypt(Cipher.ENCRYPT_MODE, key, nonce, aad(room, "request", pub), request.write().getBytes(StandardCharsets.UTF_8));
            binding = MessageDigest.getInstance("SHA-256").digest(encrypted);
            envelope = new Json.Obj().put("session", room).put("action", "encrypted").put("key", ENC.encodeToString(pub))
                    .put("nonce", ENC.encodeToString(nonce)).put("data", ENC.encodeToString(encrypted));
        }
        Json.Obj open(String room, Json.Obj response) throws Exception {
            byte[] nonce = decode(response.str("nonce", ""), 12, 12);
            byte[] data = decode(response.str("data", ""), 16, ShareSession.MAX_FRAME + 16);
            return ShareTransport.parse(crypt(Cipher.DECRYPT_MODE, key, nonce, aad(room, "response", binding), data));
        }
    }
    record Incoming(Json.Obj request, byte[] key, byte[] binding) { }
    synchronized Incoming open(String room, Json.Obj envelope) throws Exception {
        if (!"encrypted".equals(envelope.str("action", ""))) throw new GeneralSecurityException("Encrypted request required.");
        String encoded = envelope.str("key", "");
        byte[] pub = decode(encoded, 32, 128);
        if (seen.contains(encoded) || seen.size() >= 100_000) throw new GeneralSecurityException("Repeated or expired encrypted request.");
        byte[] key = derive(host.getPrivate(), decodePublic(encoded), room, pub);
        byte[] nonce = decode(envelope.str("nonce", ""), 12, 12);
        byte[] data = decode(envelope.str("data", ""), 16, 32 * 1024);
        Json.Obj request = ShareTransport.parse(crypt(Cipher.DECRYPT_MODE, key, nonce, aad(room, "request", pub), data));
        if (!room.equals(request.str("session", ""))) throw new GeneralSecurityException("Wrong session.");
        seen.add(encoded);
        return new Incoming(request, key, MessageDigest.getInstance("SHA-256").digest(data));
    }
    static Json.Obj seal(String room, Incoming incoming, Json.Obj response) throws Exception {
        byte[] nonce = random();
        byte[] data = crypt(Cipher.ENCRYPT_MODE, incoming.key(), nonce, aad(room, "response", incoming.binding()), response.write().getBytes(StandardCharsets.UTF_8));
        return new Json.Obj().put("nonce", ENC.encodeToString(nonce)).put("data", ENC.encodeToString(data));
    }
    private static PublicKey decodePublic(String text) throws Exception { return KeyFactory.getInstance("X25519").generatePublic(new X509EncodedKeySpec(decode(text, 32, 128))); }
    private static byte[] decode(String text, int min, int max) throws GeneralSecurityException {
        if (text.length() > (max * 4L / 3 + 8)) throw new GeneralSecurityException("Encrypted message too large.");
        try { byte[] value = DEC.decode(text); if (value.length < min || value.length > max) throw new GeneralSecurityException("Invalid encrypted message."); return value; }
        catch (IllegalArgumentException e) { throw new GeneralSecurityException("Invalid encrypted message.", e); }
    }
    private static byte[] derive(PrivateKey own, PublicKey peer, String room, byte[] pub) throws Exception {
        KeyAgreement agreement = KeyAgreement.getInstance("X25519"); agreement.init(own); agreement.doPhase(peer, true);
        byte[] shared = agreement.generateSecret();
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(new byte[32], "HmacSHA256"));
        byte[] prk = mac.doFinal(shared); Arrays.fill(shared, (byte) 0);
        mac.init(new SecretKeySpec(prk, "HmacSHA256")); mac.update(aad(room, "key", pub)); mac.update((byte) 1);
        byte[] result = mac.doFinal(); Arrays.fill(prk, (byte) 0); return result;
    }
    private static byte[] aad(String room, String label, byte[] binding) {
        byte[] prefix = ("LarkShareRelay-v1|" + room + "|" + label + "|").getBytes(StandardCharsets.UTF_8);
        byte[] out = Arrays.copyOf(prefix, prefix.length + binding.length); System.arraycopy(binding, 0, out, prefix.length, binding.length); return out;
    }
    private static byte[] random() { byte[] n = new byte[12]; RANDOM.nextBytes(n); return n; }
    private static byte[] crypt(int mode, byte[] key, byte[] nonce, byte[] aad, byte[] data) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce)); cipher.updateAAD(aad); return cipher.doFinal(data);
    }
}
