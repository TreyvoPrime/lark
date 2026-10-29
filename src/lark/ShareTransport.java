package lark;

import javax.net.ssl.*;
import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.concurrent.*;

/** Dedicated TLS 1.3, bounded, request/reply LAN protocol. Never dispatches desktop APIs. */
final class ShareTransport implements AutoCloseable {
    private static final ScheduledThreadPoolExecutor CLIENT_DEADLINES = clientDeadlines();
    private final ShareSession session;
    private final int connectionLimit;
    private final SSLServerSocket listener;
    private final ThreadPoolExecutor workers;
    private final ScheduledExecutorService timer;
    private final Set<Socket> sockets = ConcurrentHashMap.newKeySet();
    private final Map<String, long[]> rates = new LinkedHashMap<>();
    final String fingerprint;
    private volatile boolean closed;

    ShareTransport(ShareSession session, InetAddress bind, int port) throws Exception {
        this(session, bind, port, 1200);
    }
    // A lower bound lets integration tests exercise the real limiter without a minute-long flood.
    ShareTransport(ShareSession session, InetAddress bind, int port, int connectionLimit) throws Exception {
        if (connectionLimit < 1 || connectionLimit > 1200) throw new IllegalArgumentException("Invalid connection limit");
        this.connectionLimit = connectionLimit;
        this.session = session;
        Identity identity = identity();
        fingerprint = identity.fingerprint;
        listener = (SSLServerSocket) identity.context.getServerSocketFactory().createServerSocket();
        try {
            listener.setEnabledProtocols(new String[]{"TLSv1.3"});
            listener.bind(new InetSocketAddress(bind, port), 8);
        } catch (Exception e) { listener.close(); throw e; }
        workers = new ThreadPoolExecutor(0, 8, 30, TimeUnit.SECONDS, new SynchronousQueue<>(), daemon("lark-share-peer"));
        timer = Executors.newSingleThreadScheduledExecutor(daemon("lark-share-deadlines"));
        timer.scheduleAtFixedRate(() -> { if (session.expired()) close(); }, 1, 1, TimeUnit.SECONDS);
        Thread accept = daemon("lark-share-listen").newThread(this::accept);
        accept.start();
    }

    int port() { return listener.getLocalPort(); }
    private void accept() {
        while (!closed) {
            try {
                SSLSocket socket = (SSLSocket) listener.accept();
                if (!allowed(socket.getInetAddress())) { socket.close(); continue; }
                sockets.add(socket);
                if (closed) { socket.close(); sockets.remove(socket); break; }
                try { workers.execute(() -> serve(socket)); }
                catch (RejectedExecutionException e) { sockets.remove(socket); socket.close(); }
            } catch (IOException e) { if (!closed) close(); }
        }
    }
    private synchronized boolean allowed(InetAddress address) {
        String key = address.getHostAddress();
        long now = System.currentTimeMillis();
        if (!rates.containsKey(key) && rates.size() >= 256) rates.remove(rates.keySet().iterator().next());
        long[] slot = rates.computeIfAbsent(key, k -> new long[]{now, 0});
        if (now - slot[0] >= 60_000) { slot[0] = now; slot[1] = 0; }
        return ++slot[1] <= connectionLimit;
    }
    private void serve(SSLSocket socket) {
        ScheduledFuture<?> deadline = null;
        try (socket) {
            deadline = timer.schedule(() -> { try { socket.close(); } catch (IOException ignored) { } }, 8, TimeUnit.SECONDS);
            socket.setSoTimeout(5000);
            socket.startHandshake();
            Json.Obj response;
            try { response = session.command(read(socket.getInputStream(), 16 * 1024)); }
            catch (RequestFail e) { response = error(e.status, e.getMessage()); }
            catch (Exception e) { response = error(400, "Invalid Share message."); }
            write(socket.getOutputStream(), response);
        } catch (Exception ignored) {
            // Untrusted peers and failed handshakes must not affect the IDE or log credentials.
        } finally {
            if (deadline != null) deadline.cancel(false);
            sockets.remove(socket);
        }
    }
    static Json.Obj error(int code, String message) { return new Json.Obj().put("ok", false).put("code", code).put("error", message); }

    static Json.Obj exchange(String host, int port, String fingerprint, Json.Obj request) throws Exception {
        InetAddress address = lanAddress(host);
        if (port < 1 || port > 65535 || fingerprint == null || !fingerprint.matches("[a-fA-F0-9]{64}"))
            throw new RequestFail(400, "Enter the invitation's port and SHA-256 fingerprint.");
        SSLContext context = SSLContext.getInstance("TLSv1.3");
        context.init(null, new TrustManager[]{new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            public void checkClientTrusted(X509Certificate[] chain, String authType) throws java.security.cert.CertificateException {
                throw new java.security.cert.CertificateException("Client certificates are not used.");
            }
            public void checkServerTrusted(X509Certificate[] chain, String authType) throws java.security.cert.CertificateException {
                try {
                    if (chain == null || chain.length == 0) throw new GeneralSecurityException();
                    chain[0].checkValidity();
                    if (!ShareSession.equal(fingerprint.toLowerCase(Locale.ROOT), fingerprint(chain[0]))) throw new GeneralSecurityException();
                } catch (Exception e) { throw new java.security.cert.CertificateException("Host certificate does not match the verified invitation."); }
            }
        }}, new SecureRandom());
        try (SSLSocket socket = (SSLSocket) context.getSocketFactory().createSocket()) {
            ScheduledFuture<?> deadline = CLIENT_DEADLINES.schedule(() -> {
                try { socket.close(); } catch (IOException ignored) { }
            }, 8, TimeUnit.SECONDS);
            try {
                socket.setEnabledProtocols(new String[]{"TLSv1.3"});
                socket.connect(new InetSocketAddress(address, port), 3000);
                socket.setSoTimeout(5000);
                socket.startHandshake();
                write(socket.getOutputStream(), request);
                return read(socket.getInputStream(), ShareSession.MAX_FRAME);
            } finally { deadline.cancel(false); }
        }
    }
    private static ScheduledThreadPoolExecutor clientDeadlines() {
        ScheduledThreadPoolExecutor timer = new ScheduledThreadPoolExecutor(1, daemon("lark-share-client-deadline"));
        timer.setRemoveOnCancelPolicy(true);
        timer.setKeepAliveTime(1, TimeUnit.SECONDS);
        timer.allowCoreThreadTimeOut(true);
        return timer; // No thread is started until Share is used; idle threads expire.
    }

    static InetAddress lanAddress(String host) throws Exception {
        // Numeric addresses only: no DNS rebinding, public Internet targets, or hostnames.
        if (host == null || !host.matches("[0-9a-fA-F:.]+")) throw new RequestFail(400, "Enter a numeric LAN IP address.");
        InetAddress address = InetAddress.getByName(host);
        if (!(address.isLoopbackAddress() || address.isSiteLocalAddress() || address.isLinkLocalAddress()) || address.isMulticastAddress())
            throw new RequestFail(400, "Share accepts only local-network IP addresses.");
        return address;
    }
    static Json.Obj read(InputStream input, int limit) throws IOException {
        DataInputStream in = new DataInputStream(input);
        int length = in.readInt();
        if (length < 2 || length > limit) throw new IOException("Share message exceeds its size limit.");
        byte[] bytes = in.readNBytes(length);
        if (bytes.length != length) throw new EOFException("Incomplete Share message.");
        return parse(bytes);
    }
    static Json.Obj parse(byte[] bytes) throws IOException {
        if (bytes.length > ShareSession.MAX_FRAME) throw new IOException("Share message exceeds its size limit.");
        String text = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
        // The existing JSON parser is recursive. Bound nesting before calling it.
        int depth = 0; boolean quoted = false, escape = false;
        for (char c : text.toCharArray()) {
            if (quoted) {
                if (escape) escape = false;
                else if (c == '\\') escape = true;
                else if (c == '"') quoted = false;
            } else if (c == '"') quoted = true;
            else if (c == '{' || c == '[') { if (++depth > 16) throw new IOException("Share message is too deeply nested."); }
            else if (c == '}' || c == ']') { if (--depth < 0) throw new IOException("Invalid Share JSON."); }
        }
        try { return Json.parseObj(text); }
        catch (RuntimeException e) { throw new IOException("Invalid Share JSON."); }
    }
    static void write(OutputStream output, Json.Obj value) throws IOException {
        byte[] bytes = value.write().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > ShareSession.MAX_FRAME) throw new IOException("Share response exceeds its size limit.");
        DataOutputStream out = new DataOutputStream(output);
        out.writeInt(bytes.length); out.write(bytes); out.flush();
    }

    private record Identity(SSLContext context, String fingerprint) { }
    private static Identity identity() throws Exception {
        Path parent = Settings.home().resolve("share");
        Files.createDirectories(parent);
        Path dir = Files.createTempDirectory(parent, "identity-");
        Path passwordFile = dir.resolve("password"), store = dir.resolve("identity.p12");
        char[] password = ShareSession.token().toCharArray();
        try {
            if (Files.getFileStore(dir).supportsFileAttributeView("posix")) Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("rwx------"));
            Files.writeString(passwordFile, new String(password), StandardOpenOption.CREATE_NEW);
            Path keytool = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool");
            Process process = new ProcessBuilder(keytool.toString(), "-genkeypair", "-alias", "share", "-keyalg", "EC", "-groupname", "secp256r1",
                    "-storetype", "PKCS12", "-keystore", store.toString(), "-storepass:file", passwordFile.toString(),
                    "-dname", "CN=Lark Share ephemeral session", "-validity", "2", "-noprompt")
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            if (!process.waitFor(20, TimeUnit.SECONDS)) { process.destroyForcibly(); process.waitFor(); throw new IOException("Share certificate generation timed out."); }
            if (process.exitValue() != 0) throw new IOException("Could not generate Share identity with this JDK's keytool.");
            KeyStore keys = KeyStore.getInstance("PKCS12");
            try (InputStream in = Files.newInputStream(store)) { keys.load(in, password); }
            KeyManagerFactory factory = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            factory.init(keys, password);
            SSLContext context = SSLContext.getInstance("TLSv1.3");
            context.init(factory.getKeyManagers(), null, new SecureRandom());
            return new Identity(context, fingerprint((X509Certificate) keys.getCertificate("share")));
        } finally {
            Arrays.fill(password, '\0');
            Files.deleteIfExists(passwordFile); Files.deleteIfExists(store); Files.deleteIfExists(dir);
        }
    }
    private static String fingerprint(X509Certificate certificate) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
    }
    static ThreadFactory daemon(String name) { return r -> { Thread t = new Thread(r, name); t.setDaemon(true); return t; }; }
    @Override public synchronized void close() {
        if (closed) return;
        closed = true;
        session.close();
        try { listener.close(); } catch (IOException ignored) { }
        for (Socket socket : sockets) { try { socket.close(); } catch (IOException ignored) { } }
        sockets.clear(); workers.shutdownNow(); timer.shutdownNow(); rates.clear();
    }
}
