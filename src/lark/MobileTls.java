package lark;

import com.sun.net.httpserver.*;
import javax.net.ssl.*;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.security.*;
import java.util.Arrays;

/** Browser-trusted HTTPS identity supplied by the host administrator. */
final class MobileTls {
    static boolean configured() { return !System.getProperty("lark.mobile.keystore", "").isBlank(); }
    static HttpServer create(String bind, int port) throws java.io.IOException {
        if (!configured()) return HttpServer.create(new InetSocketAddress(bind, port), 0);
        String secret = System.getenv("LARK_MOBILE_KEYSTORE_PASSWORD");
        if (secret == null || secret.isBlank()) throw new java.io.IOException("Set LARK_MOBILE_KEYSTORE_PASSWORD for the HTTPS keystore.");
        char[] password = secret.toCharArray();
        try {
            KeyStore keys = KeyStore.getInstance("PKCS12");
            try (var input = Files.newInputStream(Path.of(System.getProperty("lark.mobile.keystore")))) { keys.load(input, password); }
            KeyManagerFactory managers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            managers.init(keys, password);
            SSLContext context = SSLContext.getInstance("TLS"); context.init(managers.getKeyManagers(), null, null);
            HttpsServer server = HttpsServer.create(new InetSocketAddress(bind, port), 0);
            server.setHttpsConfigurator(new HttpsConfigurator(context)); return server;
        } catch (Exception e) { throw new java.io.IOException("Cannot initialize the mobile HTTPS identity. Check the PKCS12 certificate, password and JDK.", e); }
        finally { Arrays.fill(password, '\0'); }
    }
    static String scheme() { return configured() ? "https" : "http"; }
}
