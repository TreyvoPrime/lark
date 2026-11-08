package lark;

import java.net.URI;
import java.net.http.*;

public final class ShareRelayWakeCheck {
    public static void main(String[] args) throws Exception {
        ShareRelay.wake(args[0]); ShareRelay.wake(args[0]);
        Thread.sleep(1000);
        HttpResponse<String> response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(args[0] + "/test/health-count")).GET().build(), HttpResponse.BodyHandlers.ofString());
        if (!"1".equals(response.body())) throw new AssertionError("Expected one user-initiated wake request, got " + response.body());
        Thread.sleep(1000);
        response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(args[0] + "/test/health-count")).GET().build(), HttpResponse.BodyHandlers.ofString());
        if (!"1".equals(response.body())) throw new AssertionError("Unexpected background wake traffic");
        System.out.println("User-initiated relay wake is deduplicated and does not create background traffic.");
    }
}
