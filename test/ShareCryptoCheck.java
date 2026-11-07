package lark;

public final class ShareCryptoCheck {
    public static void main(String[] args) throws Exception {
        String room = ShareSession.token();
        ShareCrypto host = new ShareCrypto();
        Json.Obj request = new Json.Obj().put("session", room).put("action", "join").put("secret", "private source");
        ShareCrypto.Client guest = new ShareCrypto.Client(room, host.publicKey(), request);
        if (guest.envelope.write().contains("private source")) throw new AssertionError("Plaintext exposed");
        ShareCrypto.Incoming opened = host.open(room, guest.envelope);
        if (!opened.request().str("secret").equals("private source")) throw new AssertionError("Request mismatch");
        Json.Obj encrypted = ShareCrypto.seal(room, opened, new Json.Obj().put("ok", true).put("source", "secret code"));
        if (encrypted.write().contains("secret code") || !guest.open(room, encrypted).str("source").equals("secret code")) throw new AssertionError("Response mismatch");
        try { host.open(room, guest.envelope); throw new AssertionError("Replay accepted"); } catch (java.security.GeneralSecurityException expected) { }
        ShareCrypto.Client other = new ShareCrypto.Client(room, host.publicKey(), request);
        try { other.open(room, encrypted); throw new AssertionError("Response substitution accepted"); } catch (java.security.GeneralSecurityException expected) { }
        System.out.println("Encrypted relay request, response, replay and substitution checks passed.");
    }
}
