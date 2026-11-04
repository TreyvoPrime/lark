package lark;

import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.List;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** Loopback-only control bridge; peer credentials never reach the browser or disk. */
final class Share implements AutoCloseable {
    private final Projects projects;
    private final Settings settings;
    private ShareSession hosting;
    private ShareTransport transport;
    private ShareDiscovery discovery;
    private InetAddress bindAddress;
    private String discoveryError = "";
    private Json.Obj target, hostInvitation;
    private String device, credential, projectId, reviewed;
    private String connection = "Disconnected";
    private boolean avatarDirty;
    private ShareCode codes;
    /** Random per-run client key so a host can keep a denied computer blocked and refuse duplicate requests. */
    private final String client = ShareSession.token();
    private final java.util.Map<String, Object[]> nearbySeen = new java.util.LinkedHashMap<>(); // id -> {card, lastSeenMs}
    private final java.util.Set<String> deniedSessions = new java.util.HashSet<>();

    Share(Projects projects, Settings settings) { this.projects = projects; this.settings = settings; }

    Json.Obj control(Json.Obj body) throws Exception {
        if ("nearby".equals(body.str("action", "status"))) {
            // The LAN scan takes about 2 s and the Nearby page repeats it every few seconds. Running it outside the
            // lock keeps the host's own edits, status polls and approvals from stalling while the list is open.
            String address = body.str("address", "");
            if (!address.isBlank()) return ShareSession.ok().put("sessions", ShareDiscovery.nearby(ShareTransport.lanAddress(address)));
            // Search every LAN adapter at once (wired, Wi-Fi, ...) so a host on Ethernet is found even if
            // the first adapter is Wi-Fi or a virtual Hyper-V/VirtualBox adapter.
            return ShareSession.ok().put("sessions", nearbyCards(nearbyAll(), System.currentTimeMillis()));
        }
        return controlLocked(body);
    }
    private synchronized Json.Obj controlLocked(Json.Obj body) throws Exception {
        String action = body.str("action", "status");
        switch (action) {
            case "interfaces" -> {
                Json.Arr addresses = new Json.Arr();
                addresses.add(new Json.Obj().put("address", "127.0.0.1"));
                Mobile.lanInterfaces().forEach(nif -> addresses.add(new Json.Obj().put("address", nif[0]).put("name", nif[1])));
                return ShareSession.ok().put("addresses", addresses);
            }
            case "host" -> {
                if (hosting != null || target != null) throw new RequestFail(409, "End or leave your current Share session first.");
                String requestedAddress = body.str("address", "");
                if (requestedAddress.isBlank()) {
                    requestedAddress = Mobile.lanAddresses().stream().findFirst()
                            .orElseThrow(() -> new RequestFail(503, "Connection unavailable on this network."));
                }
                InetAddress bind = ShareTransport.lanAddress(requestedAddress);
                if (!bind.isLoopbackAddress() && NetworkInterface.getByInetAddress(bind) == null)
                    throw new RequestFail(400, "Select an interface on this computer.");
                long port = body.longVal("port");
                if (port < 0 || port > 65535) throw new RequestFail(400, "Invalid Share port.");
                ShareSession session = new ShareSession(projects.projectDir(body.str("project", "")), body.str("name", ""), body.str("displayName", ""));
                try { transport = new ShareTransport(session, bind, (int) port); }
                catch (Exception e) { session.close(); throw e; }
                session.avatar(settings.shareBird);
                hosting = session; bindAddress = bind; projectId = body.str("project", "");
                connection = "Connected";
                if (!body.has("discovery") || body.bool("discovery")) discoverable(true);
                if (discovery != null) {
                    codes = new ShareCode(transport.fingerprint, System::currentTimeMillis);
                    transport.codes = codes;
                    codes.create(ShareCode.DEFAULT_TTL);
                }
                session.onClose = () -> { if (discovery != null) discovery.close(); };
                hostInvitation = new Json.Obj().put("version", ShareSession.VERSION).put("address", bind.getHostAddress())
                        .put("port", transport.port()).put("fingerprint", transport.fingerprint)
                        .put("session", session.id()).put("invitation", session.invitation());
                // An invitation is sensitive and is returned ONLY for an explicit local host action.
                return status().put("invitation", Base64.getUrlEncoder().withoutPadding().encodeToString(hostInvitation.write().getBytes(StandardCharsets.UTF_8)))
                        .put("fingerprint", transport.fingerprint).put("address", bind.getHostAddress());
            }
            case "invitation" -> {
                if (hosting == null) throw new RequestFail(403, "Only the host can issue invitations.");
                hosting.localStatus();
                return ShareSession.ok().put("invitation", Base64.getUrlEncoder().withoutPadding()
                        .encodeToString(hostInvitation.write().getBytes(StandardCharsets.UTF_8))).put("fingerprint", transport.fingerprint).put("address", bindAddress.getHostAddress());
            }
            case "request" -> {
                // Request Access from a Nearby card. No invitation secret: the host sees a pending request and decides.
                if (hosting != null || target != null) throw new RequestFail(409, "End or leave your current Share session first.");
                String address = body.str("address", ""); long port = body.longVal("port");
                ShareTransport.lanAddress(address);
                if (port < 1 || port > 65535) throw new RequestFail(400, "Invalid Share port.");
                String[] seen = new String[1];
                Json.Obj reply;
                try {
                    reply = ShareTransport.exchange(address, (int) port, null, new Json.Obj().put("version", ShareSession.VERSION).put("action", "request")
                            .put("name", ShareSession.label(body.str("displayName", ""))).put("bird", ShareSession.bird(settings.shareBird))
                            .put("client", client).put("device", deviceName()), seen);
                } catch (RequestFail e) { throw e; }
                catch (Exception e) { throw new RequestFail(503, "Couldn't reach that host. It may have stopped sharing, or your network blocks computers from connecting to each other (common on school and guest Wi-Fi)."); }
                if (!reply.bool("ok")) throw new RequestFail((int) reply.longVal("code"), reply.str("error", "The host refused the request."));
                if (seen[0] == null || !reply.str("session", "").matches("[a-f0-9]{64}")) throw new RequestFail(502, "That host gave an invalid answer.");
                // Trust on first use: from now on every request is pinned to this certificate. Both screens show
                // the same verification snippet so the host can confirm it's really this guest's connection.
                target = new Json.Obj().put("version", ShareSession.VERSION).put("address", address).put("port", port)
                        .put("fingerprint", seen[0]).put("session", reply.str("session"));
                device = reply.str("device"); credential = reply.str("credential");
                connection = "Waiting for Approval";
                return status();
            }
            case "code" -> {
                if (hosting == null) throw new RequestFail(403, "Only the host can create a Lark code.");
                if (discovery == null) throw new RequestFail(409, "Turn on LAN discovery to use a short Lark code. The long private invitation works without it.");
                long minutes = body.has("minutes") ? body.longVal("minutes") : 15;
                if (minutes < 1 || minutes > 60) throw new RequestFail(400, "A Lark code can last 1 to 60 minutes.");
                if (codes == null) { codes = new ShareCode(transport.fingerprint, System::currentTimeMillis); transport.codes = codes; }
                codes.create(minutes * 60_000L);
                return status();
            }
            case "code-revoke" -> {
                if (hosting == null) throw new RequestFail(403, "Only the host can revoke a Lark code.");
                if (codes != null) codes.revoke();
                return status();
            }
            case "join" -> {
                if (hosting != null || target != null) throw new RequestFail(409, "End or leave your current Share session first.");
                String shortCode = ShareCode.normalize(body.str("invitation", ""));
                if (shortCode == null && looksLikeShortCode(body.str("invitation", "")))
                    throw new RequestFail(400, "Enter a six-character share code, such as 7K9M2P. Codes never contain 0, O, 1, I or L.");
                if (shortCode == null && !body.bool("verified")) throw new RequestFail(400, "Verify the invitation with the host over a trusted channel first.");
                String invitation = body.str("invitation", "");
                if (invitation.length() > 8192) throw new RequestFail(400, "Invalid invitation: that's too long to be a Lark invitation. Copy just the invitation text.");
                Json.Obj parsed = shortCode != null ? resolveCode(shortCode, nearbyAll()) : decodeInvitation(invitation);
                if (parsed.longVal("version") != ShareSession.VERSION) throw new RequestFail(409, "Incompatible Lark Share protocol.");
                if (!parsed.str("session", "").matches("[a-f0-9]{64}") || !parsed.str("invitation", "").matches("[a-f0-9]{64}"))
                    throw new RequestFail(400, "Invalid invitation credentials.");
                Json.Obj result;
                try { result = send(parsed, request(parsed, "join").put("invitation", parsed.str("invitation")).put("client", client).put("device", deviceName())
                        .put("name", ShareSession.label(body.str("displayName", ""))).put("bird", ShareSession.bird(settings.shareBird))); }
                catch (RequestFail e) { throw e; }
                catch (Exception e) {
                    if (ShareTransport.lanAddress(parsed.str("address", "")).isLoopbackAddress())
                        throw new RequestFail(503, "This invitation points at 127.0.0.1 (\"this computer only\"), so it can't work from another computer. On the host, end the session and host again on its Wi-Fi or Ethernet address, then send the new invitation.");
                    throw new RequestFail(503, "Couldn't reach the host at " + parsed.str("address", "?") + ":" + parsed.longVal("port")
                            + ". Make sure you're on the same network, or have the host pick a different address (its Ethernet or Wi-Fi adapter) and send a new invitation. If it still fails, set the host's network to Private in Windows and allow Lark through the firewall.");
                }
                device = result.str("device"); credential = result.str("credential");
                target = parsed;
                connection = "Waiting for Approval";
                return status();
            }
            case "avatar" -> {
                String bird = ShareSession.bird(body.str("bird", "classic"));
                settings.shareBird = bird; settings.save();
                if (hosting != null) hosting.avatar(bird);
                else if (target != null) avatarDirty = true;
                return ShareSession.ok();
            }
            case "decide" -> {
                if (hosting == null) throw new RequestFail(403, "Only the host can approve or revoke devices.");
                hosting.decide(body.str("device", ""), body.bool("approve"), body.str("role", "editor"));
                return status();
            }
            case "open", "sync", "presence" -> {
                if (hosting != null) return hosting.hostCommand(body);
                if (target == null) throw new RequestFail(409, "Join a Share session first.");
                Json.Obj request = request(target, action).put("device", device).put("credential", credential)
                        .put("path", body.str("path", "")).put("writer", body.str("writer", "")).put("since", body.longVal("since"))
                        .put("anchor", body.str("anchor", "")).put("head", body.str("head", ""));
                if (body.obj("operation") != null) request.put("operation", body.obj("operation"));
                if (body.obj("operation") != null && body.arr("operations") != null) request.put("operations", body.arr("operations"));
                return send(target, request);
            }
            case "review" -> {
                if (hosting == null) throw new RequestFail(403, "Only the host can review shared changes.");
                Json.Obj review = hosting.review(); reviewed = review.write();
                return review;
            }
            case "acknowledge" -> {
                if (hosting == null || reviewed == null || !reviewed.equals(hosting.review().write())) throw new RequestFail(409, "Source changed. Review again before running.");
                hosting.acknowledgeRun(); reviewed = null; return status();
            }
            case "security" -> {
                if (hosting == null) throw new RequestFail(403, "Only the host can change security settings.");
                hosting.settings(body.str("role", "editor"), body.longVal("minutes"));
                if (body.has("discovery")) discoverable(body.bool("discovery")); return status();
            }
            case "files" -> {
                if (hosting != null) return hosting.hostCommand(body);
                if (target == null) throw new RequestFail(409, "Join a Share session first.");
                return peer(action);
            }
            case "source" -> {
                if (target == null) throw new RequestFail(409, "Join a Share session first.");
                return sendPeer("read", body.str("path", ""));
            }
            case "end" -> { if (hosting == null) throw new RequestFail(403, "Only the host can end this session."); close(); return status(); }
            case "leave" -> {
                if (target != null) { try { peer("leave"); } catch (Exception ignored) { } }
                close(); return status();
            }
            case "status" -> { return status(); }
            default -> throw new RequestFail(400, "Unknown Share control.");
        }
    }
    /**
     * Pasted invitations arrive mangled by chat apps and mail: wrapped lines, zero-width characters,
     * smart quotes, code fences, standard (+/=) Base64, percent-encoding or a "Lark invitation:" label.
     * Only the characters of the encoded invitation are kept; nothing about its contents is trusted
     * more than before (credentials are still format-checked and the TLS fingerprint still pinned).
     */
    static String normalizeInvitation(String raw) {
        if (raw == null) return "";
        String text = raw;
        if (text.contains("%")) {
            try { text = java.net.URLDecoder.decode(text.replace("+", "%2B"), StandardCharsets.UTF_8); } catch (IllegalArgumentException ignored) { }
        }
        text = text.replaceAll("[\\u200B-\\u200F\\u2028-\\u202F\\u2060-\\u206F\\uFEFF\\u00AD]", "").replaceAll("\\s+", "");
        StringBuilder best = new StringBuilder(), run = new StringBuilder();
        for (int i = 0; i <= text.length(); i++) {
            char c = i < text.length() ? text.charAt(i) : ' ';
            boolean b64 = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '+' || c == '/';
            if (b64) run.append(c);
            else { if (run.length() > best.length()) best = run; run = new StringBuilder(); }
        }
        return best.toString().replace('+', '-').replace('/', '_');
    }
    static Json.Obj decodeInvitation(String raw) {
        String clean = normalizeInvitation(raw);
        if (clean.length() < 40 || clean.length() > 2048) throw new RequestFail(400, "Invalid invitation: it looks incomplete. Ask the host to copy the whole invitation again.");
        try { return ShareTransport.parse(Base64.getUrlDecoder().decode(clean)); }
        catch (RuntimeException | java.io.IOException e) {
            throw new RequestFail(400, "Invalid invitation: part of it is missing or changed. Ask the host to press Copy invitation and send it again.");
        }
    }
    private static String deviceName() {
        String name = System.getenv("COMPUTERNAME");
        if (name == null || name.isBlank()) name = System.getenv("HOSTNAME"); // bash doesn't export this, so usually unset
        if (name == null || name.isBlank()) {
            // macOS and Linux: the computer's network name, e.g. "Treys-MacBook-Air.local" -> "Treys-MacBook-Air".
            try { name = java.net.InetAddress.getLocalHost().getHostName().replaceFirst("\\.(local|lan|home)$", ""); } catch (Exception e) { name = null; }
            if (name != null && (name.isBlank() || name.matches("[0-9.:]+") || name.equalsIgnoreCase("localhost"))) name = null;
        }
        if (name == null || name.isBlank()) name = System.getProperty("os.name", "Computer");
        return ShareSession.label(name);
    }
    /**
     * One card per session id. Sessions that stop answering show as "unavailable" for 30 s, then disappear.
     * Status reflects this computer's own request: pending / connected / denied.
     */
    synchronized Json.Arr nearbyCards(List<Json.Obj> found, long now) {
        for (Json.Obj item : found) {
            String id = item.str("id", "");
            if (!id.matches("[a-f0-9]{12}")) id = item.str("instance", "");
            if (id.isEmpty()) continue;
            item.put("id", id).put("bird", ShareSession.bird(item.str("bird", "classic")));
            nearbySeen.put(id, new Object[]{item, now});
        }
        nearbySeen.values().removeIf(v -> now - (long) v[1] > 30_000);
        Json.Arr out = new Json.Arr();
        for (var entry : nearbySeen.entrySet()) {
            Json.Obj card = (Json.Obj) entry.getValue()[0];
            String id = entry.getKey(), state = now - (long) entry.getValue()[1] > 0 ? "unavailable" : card.str("status", "available");
            if (!state.equals("full") && !state.equals("unavailable")) state = "available";
            // Denied wins: after a denial the guest still holds the old target until it leaves.
            if (deniedSessions.contains(id)) state = "denied";
            else if (target != null && target.str("session", "").startsWith(id)) state = connection.equals("Connected") ? "connected" : "pending";
            out.add(new Json.Obj().put("id", id).put("name", card.str("name", "Lark")).put("host", card.str("host", "Host")).put("bird", card.str("bird", "classic"))
                    .put("address", card.str("address", "")).put("port", card.longVal("port")).put("count", card.str("count", "")).put("status", state));
        }
        return out;
    }
    static boolean looksLikeShortCode(String raw) {
        String s = raw == null ? "" : raw.replaceAll("[^A-Za-z0-9]", "");
        return s.length() <= 16 && (s.length() <= 9 || s.toUpperCase(java.util.Locale.ROOT).startsWith("LARK"));
    }
    private static List<Json.Obj> nearbyAll() {
        List<String> all = Mobile.lanAddresses().stream().limit(6).toList();
        if (all.isEmpty()) throw new RequestFail(400, "No LAN interface is available. Use a private invitation.");
        List<java.util.concurrent.CompletableFuture<Json.Arr>> scans = all.stream().map(ip -> java.util.concurrent.CompletableFuture.supplyAsync(() -> {
            try { return ShareDiscovery.nearby(ShareTransport.lanAddress(ip)); } catch (Exception e) { return new Json.Arr(); }
        })).toList();
        java.util.Map<String, Json.Obj> found = new java.util.LinkedHashMap<>();
        for (var scan : scans) for (Json.Value item : scan.join().values()) if (item instanceof Json.Obj obj) found.putIfAbsent(obj.str("instance", ""), obj);
        return new java.util.ArrayList<>(found.values());
    }
    /**
     * Finds which nearby host holds this code. Discovery data is untrusted: a host only counts once it returns
     * a MAC keyed by the code over the certificate fingerprint we actually saw, and we then pin that fingerprint.
     */
    static Json.Obj resolveCode(String code, List<Json.Obj> candidates) {
        List<Json.Obj> list = candidates.stream().filter(c -> c.longVal("port") > 0 && c.longVal("port") < 65536).limit(32).toList();
        List<java.util.concurrent.CompletableFuture<Object>> tries = list.stream().map(c -> java.util.concurrent.CompletableFuture.supplyAsync(() -> {
            try { return tryCode(code, c.str("address", ""), (int) c.longVal("port")); }
            catch (RequestFail e) { return e; }
            catch (Exception e) { return null; }
        })).toList();
        RequestFail best = null; boolean stale = false;
        for (var t : tries) {
            Object r = t.join();
            if (r instanceof Json.Obj found) return found;
            // A 410 at hello only means that host's own code is expired or revoked, not that it was this code,
            // so it must not hide the real answer (e.g. another Lark host in the same classroom).
            if (r instanceof RequestFail e && e.status == 410) stale = true;
            else if (r instanceof RequestFail e && e.status != 404 && best == null) best = e;
        }
        if (best != null) throw best;
        throw new RequestFail(404, "No Lark session with that code was found on this network. Check the code, and that both computers are on the same Wi-Fi or wired network. "
                + (stale ? "If the code is older than its time limit or the host revoked it, ask for a new one. " : "")
                + "School and guest networks often block computers from finding each other; the long private invitation still works anywhere the host can be reached.");
    }
    private static Json.Obj tryCode(String code, String address, int port) throws Exception {
        String guestNonce = ShareSession.token();
        String[] seen = new String[1];
        Json.Obj hello = ShareTransport.exchange(address, port, null, new Json.Obj().put("version", ShareSession.VERSION).put("action", "code-hello").put("nonce", guestNonce), seen);
        if (!hello.bool("ok")) throw new RequestFail((int) hello.longVal("code"), hello.str("error", "Lark code refused."));
        if (seen[0] == null || !hello.str("nonce", "").matches("[a-f0-9]{64}")) return null;
        byte[] key = ShareCode.key(code, seen[0]);
        // Wrong code or a spoofed responder: its MAC can't match, so we never send our proof to it.
        if (!ShareSession.equal(ShareCode.mac(key, "host", seen[0], guestNonce, hello.str("nonce")), hello.str("proof", ""))) return null;
        Json.Obj claim = ShareTransport.exchange(address, port, seen[0], new Json.Obj().put("version", ShareSession.VERSION).put("action", "code-claim")
                .put("nonce", hello.str("nonce")).put("proof", ShareCode.mac(key, "guest", seen[0], guestNonce, hello.str("nonce"))));
        if (!claim.bool("ok")) throw new RequestFail((int) claim.longVal("code"), claim.str("error", "Lark code refused."));
        if (!claim.str("session", "").matches("[a-f0-9]{64}") || !claim.str("invitation", "").matches("[a-f0-9]{64}")) return null;
        return new Json.Obj().put("version", ShareSession.VERSION).put("address", address).put("port", port).put("fingerprint", seen[0])
                .put("session", claim.str("session")).put("invitation", claim.str("invitation"));
    }
    private Json.Obj peer(String action) throws Exception { return sendPeer(action, ""); }
    private Json.Obj sendPeer(String action, String path) throws Exception {
        try {
            Json.Obj result = send(target, request(target, action).put("device", device).put("credential", credential).put("path", path));
            connection = "Connected";
            return result;
        } catch (RequestFail e) {
            connection = "Connection Lost";
            throw e;
        } catch (Exception e) { connection = "Reconnecting"; throw e; }
    }
    private static Json.Obj request(Json.Obj target, String action) {
        return new Json.Obj().put("version", ShareSession.VERSION).put("session", target.str("session")).put("action", action);
    }
    private static Json.Obj send(Json.Obj target, Json.Obj request) throws Exception {
        long port = target.longVal("port");
        if (port < 1 || port > 65535) throw new RequestFail(400, "Invalid invitation port.");
        Json.Obj reply = ShareTransport.exchange(target.str("address"), (int) port, target.str("fingerprint"), request);
        if (!reply.bool("ok")) throw new RequestFail((int) reply.longVal("code"), reply.str("error", "Share request denied."));
        if (reply.longVal("version") != ShareSession.VERSION) throw new RequestFail(409, "Incompatible Lark Share protocol response.");
        return reply;
    }
    private Json.Obj status() throws Exception {
        if (hosting != null && hosting.expired()) close();
        Json.Obj result = ShareSession.ok().put("bird", ShareSession.bird(settings.shareBird)).put("connection", connection).put("hosting", hosting != null)
                .put("joined", target != null).put("mode", "collaborative").put("project", projectId).put("sessionId", hosting != null ? hosting.id() : target != null ? target.str("session") : "").put("identity", hosting != null ? "host" : device);
        if (hosting != null && codes != null) { Json.Obj c = codes.status(); result.put("code", c.str("code", "")).put("codeState", c.str("codeState", "none")).put("codeExpiresIn", c.longVal("codeExpiresIn")); }
        if (hosting != null) result.put("verification", ShareTransport.verification(transport.fingerprint));
        if (target != null) result.put("verification", ShareTransport.verification(target.str("fingerprint", "")));
        if (hosting != null) result.put("discovery", discovery != null).put("discoveryError", discoveryError).put("session", hosting.localStatus()).put("port", transport.port()).put("fingerprint", transport.fingerprint);
        if (target != null) {
            try {
                if (avatarDirty) {
                    try {
                        send(target, request(target, "avatar").put("device", device).put("credential", credential).put("bird", ShareSession.bird(settings.shareBird)));
                    } catch (RequestFail e) {
                        // Protocol-v2 hosts predating birds reject this optional operation.
                        // Continue polling them; authentication failures still propagate.
                        if (e.status != 403 || !"Share does not allow that operation.".equals(e.getMessage())) throw e;
                    }
                    avatarDirty = false;
                }
                Json.Obj remote = peer("poll");
                connection = remote.str("status", "pending").equals("approved") ? "Connected" : "Waiting for Approval";
                result.put("session", remote);
            } catch (Exception e) {
                // Keep the pinned target and credential for a subsequent retry; never auto-join anew.
                connection = e instanceof RequestFail ? "Connection Lost" : "Reconnecting";
                if (e instanceof RequestFail f && f.getMessage().contains("denied") && target.str("session", "").length() >= 12) deniedSessions.add(target.str("session").substring(0, 12));
                result.put("error", e instanceof RequestFail ? e.getMessage() : "Cannot reach the pinned host. Make sure both computers are on the same network (wired or Wi-Fi), the host picked the right adapter, and the firewall allows Lark; then retry or leave.");
            }
            result.put("connection", connection);
        }
        return result;
    }
    private void discoverable(boolean enabled) {
        if (discovery != null) { discovery.close(); discovery = null; }
        if (!enabled && codes != null) codes.revoke(); // codes are resolved only via discovery
        discoveryError = "";
        if (enabled) {
            try { discovery = new ShareDiscovery(bindAddress, transport.port(), hosting.id(), hosting::discoveryInfo); }
            catch (Exception e) { discoveryError = "LAN discovery unavailable on this interface. Use the private invitation; check multicast/firewall settings."; }
        }
    }
    synchronized void guardWrite(String id, String path) {
        if (hosting != null && id.equals(projectId) && (path == null || hosting.shares(path)))
            throw new RequestFail(409, "This project is shared. Use synchronized documents; file structure changes are locked until Share ends.");
    }
    /** True while this Lark is a guest in someone else's Share session. */
    synchronized boolean joined() { return target != null && hosting == null; }
    synchronized void guardRun(String id) {
        if (hosting != null && id.equals(projectId)) hosting.saveForRun();
        if (hosting != null && id.equals(projectId) && hosting.needsReview())
            throw new RequestFail(409, "Collaborators changed this project. Open Share → Review Changes before running, debugging, testing or opening a terminal.");
    }
    @Override public synchronized void close() {
        if (discovery != null) discovery.close(); discovery = null;
        if (transport != null) transport.close();
        else if (hosting != null) hosting.close();
        transport = null; hosting = null; codes = null; target = null; hostInvitation = null; device = null; credential = null;
        connection = "Disconnected"; projectId = null; reviewed = null; avatarDirty = false;
    }
}
