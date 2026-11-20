package lark;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** HTTPS-only bounded request broker. The remote service is trusted with Share traffic in this prototype. */
final class ShareRelay {
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final String base, room, hostKey, capability;

    ShareRelay(String base, String room, String hostKey, String capability) throws Exception {
        this.base = validate(base); this.room = room; this.hostKey = hostKey; this.capability = capability;
        register(false);
    }
    void restore() throws Exception { register(true); }
    private void register(boolean acceptExisting) throws Exception {
        try { post("register", new Json.Obj().put("hostKey", hostKey).put("capability", capability), Duration.ofSeconds(8)); }
        catch (RelayFail e) { if (!acceptExisting || e.status != 409) throw e; }
    }
    static String validate(String value) throws Exception {
        URI uri = URI.create(value == null ? "" : value.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
            throw new IOException("Set a valid HTTPS Share relay address in Settings.");
        return "https://" + uri.getHost() + (uri.getPort() > 0 && uri.getPort() != 443 ? ":" + uri.getPort() : "") + "/v1/rooms/";
    }
    private Json.Obj post(String action, Json.Obj body, Duration timeout) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(base + room + "/" + action)).timeout(timeout)
                .header("content-type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body.write())).build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        Json.Obj data;
        try { data = ShareTransport.parse(response.body().getBytes(java.nio.charset.StandardCharsets.UTF_8), 1200 * 1024); }
        catch (Exception e) { throw new IOException("Share relay returned an invalid response."); }
        if (response.statusCode() < 200 || response.statusCode() >= 300)
            throw new RelayFail(response.statusCode(), data.str("error", "Share relay request failed."));
        return data;
    }
    private static final class RelayFail extends IOException {
        final int status;
        RelayFail(int status, String message) { super(message); this.status = status; }
    }
    Json.Obj poll() throws Exception { return post("poll", new Json.Obj().put("hostKey", hostKey), Duration.ofSeconds(32)); }
    void reply(String id, Json.Obj response) throws Exception { post("reply", new Json.Obj().put("hostKey", hostKey).put("id", id).put("response", response), Duration.ofSeconds(8)); }
    void close() { try { post("close", new Json.Obj().put("hostKey", hostKey), Duration.ofSeconds(3)); } catch (Exception ignored) { } }
    static Json.Obj send(String base, String room, String capability, String publicKey, String fingerprint, Json.Obj request) throws Exception {
        byte[] publicBytes = java.util.Base64.getUrlDecoder().decode(publicKey);
        String actual = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(publicBytes));
        if (!ShareSession.equal(actual, fingerprint)) throw new IOException("The relay host identity does not match the invitation.");
        ShareCrypto.Client encrypted = new ShareCrypto.Client(room, publicKey, request);
        String prefix = validate(base);
        HttpRequest call = HttpRequest.newBuilder(URI.create(prefix + room + "/send")).timeout(Duration.ofSeconds(35))
                .header("content-type", "application/json").POST(HttpRequest.BodyPublishers.ofString(new Json.Obj()
                        .put("capability", capability).put("request", encrypted.envelope).write())).build();
        HttpResponse<String> response = HTTP.send(call, HttpResponse.BodyHandlers.ofString());
        Json.Obj data;
        try { data = ShareTransport.parse(response.body().getBytes(java.nio.charset.StandardCharsets.UTF_8), 1200 * 1024); }
        catch (Exception e) { throw new IOException("Share relay returned an invalid response."); }
        if (response.statusCode() < 200 || response.statusCode() >= 300)
            throw new IOException(data.str("error", "Share relay request failed."));
        Json.Obj envelope = data.obj("response");
        if (envelope == null) throw new IOException("Share relay did not return a Share response.");
        Json.Obj result = encrypted.open(room, envelope);
        if (!result.bool("ok")) throw new RequestFail((int) result.longVal("code"), result.str("error", "Share request denied."));
        if (result.longVal("version") != ShareSession.VERSION) throw new RequestFail(409, "Incompatible Lark Share protocol response.");
        return result;
    }
}
