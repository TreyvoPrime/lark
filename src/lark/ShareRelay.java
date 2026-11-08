package lark;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Consumer;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;

/** HTTPS-only bounded request broker. The remote service is trusted with Share traffic in this prototype. */
final class ShareRelay {
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final String base, room, hostKey, capability;
    private final long readinessLatency;

    ShareRelay(String base, String room, String hostKey, String capability) throws Exception {
        this(base, room, hostKey, capability, ignored -> {});
    }
    ShareRelay(String base, String room, String hostKey, String capability, Consumer<String> progress) throws Exception {
        this.base = validate(base); this.room = room; this.hostKey = hostKey; this.capability = capability;
        readinessLatency = waitReady(base, progress);
        progress.accept("REGISTERING");
        register();
    }
    static long waitReady(String address, Consumer<String> progress) throws Exception {
        return waitReady(address, progress, 100_000);
    }
    static long waitReady(String address, Consumer<String> progress, long timeoutMs) throws Exception {
        String prefix = validate(address);
        String root = prefix.substring(0, prefix.length() - "/v1/rooms/".length());
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        int attempt = 0;
        progress.accept("CHECKING");
        while (System.nanoTime() < deadline) {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException("Relay connection cancelled.");
            boolean reached = false;
            try {
                long remainingMs = Math.max(1, java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime()));
                HttpRequest request = HttpRequest.newBuilder(URI.create(root + "/health")).timeout(Duration.ofMillis(Math.min(8000, remainingMs))).GET().build();
                long began = System.nanoTime();
                HttpResponse<String> response = HTTP.send(request, limited(1024));
                reached = true;
                if (response.statusCode() == 200 && Json.parseObj(response.body()).bool("ok")) {
                    progress.accept("CONNECTING"); return java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - began);
                }
            } catch (InterruptedException e) { throw e; }
              catch (Exception ignored) { }
            progress.accept(attempt++ == 0 && reached ? "WAKING" : "WAITING");
            long delay = Math.min(10_000L, 1000L << Math.min(attempt - 1, 3));
            delay += ThreadLocalRandom.current().nextLong(250);
            long remaining = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
            if (remaining > 0) Thread.sleep(Math.min(delay, remaining));
        }
        throw new IOException("Unable to reach the Lark Share relay. Check your internet connection or retry.");
    }
    long readinessLatency() { return readinessLatency; }
    private static HttpResponse.BodyHandler<String> limited(int limit) {
        return info -> new HttpResponse.BodySubscriber<>() {
            private final CompletableFuture<String> result = new CompletableFuture<>();
            private final java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            private Flow.Subscription subscription;
            public CompletionStage<String> getBody() { return result; }
            public void onSubscribe(Flow.Subscription value) { subscription = value; value.request(1); }
            public void onNext(List<ByteBuffer> buffers) {
                for (ByteBuffer buffer : buffers) {
                    if (buffer.remaining() > limit - bytes.size()) { subscription.cancel(); result.completeExceptionally(new IOException("Relay response exceeds its size limit.")); return; }
                    byte[] part = new byte[buffer.remaining()]; buffer.get(part); bytes.writeBytes(part);
                }
                subscription.request(1);
            }
            public void onError(Throwable error) { result.completeExceptionally(error); }
            public void onComplete() { result.complete(bytes.toString(java.nio.charset.StandardCharsets.UTF_8)); }
        };
    }
    void restore() throws Exception { register(); }
    private void register() throws Exception {
        IOException failure = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try { post("register", new Json.Obj().put("hostKey", hostKey).put("capability", capability), Duration.ofSeconds(20)); return; }
            catch (RelayFail e) { if (e.status < 500 && e.status != 429) throw e; failure = e; }
            catch (IOException e) { failure = e; }
            if (attempt < 2) Thread.sleep((500L << attempt) + ThreadLocalRandom.current().nextLong(250));
        }
        throw failure == null ? new IOException("Relay registration failed.") : failure;
    }
    static String validate(String value) throws Exception {
        URI uri = URI.create(value == null ? "" : value.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
            throw new IOException("Set a valid HTTPS relay address in Share connection settings.");
        return "https://" + uri.getHost() + (uri.getPort() > 0 && uri.getPort() != 443 ? ":" + uri.getPort() : "") + "/v1/rooms/";
    }
    private Json.Obj post(String action, Json.Obj body, Duration timeout) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(base + room + "/" + action)).timeout(timeout)
                .header("content-type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body.write())).build();
        HttpResponse<String> response = HTTP.send(request, limited(1200 * 1024));
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
        HttpResponse<String> response = HTTP.send(call, limited(1200 * 1024));
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
