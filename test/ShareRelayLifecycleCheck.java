package lark;

import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

public final class ShareRelayLifecycleCheck {
    public static void main(String[] args) throws Exception {
        List<String> stages = new ArrayList<>();
        ShareRelay.waitReady(args[0], stages::add);
        if (!stages.contains("WAKING") || !stages.contains("WAITING") || !stages.contains("CONNECTING")) throw new AssertionError("Cold start stages missing: " + stages);
        long began = System.nanoTime();
        try { ShareRelay.waitReady(args[1], ignored -> {}, 350); throw new AssertionError("Unavailable relay did not time out"); }
        catch (java.io.IOException expected) { if (java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - began) > 3000) throw new AssertionError("Relay timeout took too long"); }
        Settings settings = Settings.load(); settings.shareRelayUrl = args[1];
        Projects projects = new Projects(settings); String id = projects.create("Lifecycle test", "empty");
        Share share = new Share(projects, settings);
        AtomicReference<Throwable> result = new AtomicReference<>();
        Json.Obj request = new Json.Obj().put("action", "host").put("project", id).put("name", "Test").put("displayName", "Host");
        Thread host = new Thread(() -> {
            try { share.control(request); }
            catch (Throwable error) { result.set(error); }
        });
        host.start();
        long until = System.currentTimeMillis() + 15_000;
        while (!share.control(new Json.Obj().put("action", "relay-progress")).str("state").equals("WAKING") && System.currentTimeMillis() < until) Thread.sleep(50);
        AtomicReference<Throwable> duplicateResult = new AtomicReference<>();
        Thread duplicate = new Thread(() -> { try { share.control(request); } catch (Throwable error) { duplicateResult.set(error); } });
        duplicate.start(); Thread.sleep(150);
        try { share.control(new Json.Obj().put("action", "host").put("project", id)); throw new AssertionError("Duplicate host attempt accepted"); }
        catch (RequestFail expected) { if (expected.status != 409) throw expected; }
        share.control(new Json.Obj().put("action", "relay-cancel"));
        host.join(5000); duplicate.join(5000);
        if (host.isAlive() || duplicate.isAlive() || result.get() == null || duplicateResult.get() == null || share.control(new Json.Obj().put("action", "status")).bool("hosting")) throw new AssertionError("Cancelled startup left a host session active");
        share.close(); projects.delete(id);
        System.out.println("Cold-start retry stages, duplicate attempts and host cancellation cleanup verified.");
    }
}
