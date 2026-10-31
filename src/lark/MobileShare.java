package lark;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/** Per-browser guest bridges. Never exposes the local host's Share authority. */
final class MobileShare implements AutoCloseable {
    private static final Set<String> ACTIONS = Set.of("test", "join", "status", "files", "open", "sync", "presence", "leave");
    private static final long IDLE_MS = 30 * 60 * 1000L;
    private final Projects projects;
    private final Map<String, Client> clients = new HashMap<>();
    private static final class Client {
        final Share share;
        long touched = System.currentTimeMillis();
        Client(Projects projects) { share = new Share(projects); }
    }
    MobileShare(Projects projects) { this.projects = projects; }
    Json.Obj control(String key, Json.Obj body) throws Exception {
        if (key == null || !key.matches("[a-f0-9]{64}")) throw new RequestFail(400, "Missing mobile Share client identity.");
        String action = body.str("action", "status");
        if (!ACTIONS.contains(action)) throw new RequestFail(403, "Mobile Share allows guest collaboration only. Host controls stay on the host computer.");
        Client client;
        synchronized (this) {
            long now = System.currentTimeMillis();
            clients.entrySet().removeIf(entry -> {
                if (now - entry.getValue().touched < IDLE_MS) return false;
                entry.getValue().share.close(); return true;
            });
            client = clients.get(key);
            if (client == null) {
                if (clients.size() >= 16) throw new RequestFail(429, "Too many mobile Share clients. Leave an unused session or wait for it to expire.");
                client = new Client(projects); clients.put(key, client);
            }
            client.touched = now;
        }
        return client.share.control(body);
    }
    @Override public synchronized void close() {
        clients.values().forEach(client -> client.share.close()); clients.clear();
    }
}
