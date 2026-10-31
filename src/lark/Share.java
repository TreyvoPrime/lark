package lark;

import java.net.InetAddress;
import java.net.NetworkInterface;
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

    Share(Projects projects, Settings settings) { this.projects = projects; this.settings = settings; }

    synchronized Json.Obj control(Json.Obj body) throws Exception {
        String action = body.str("action", "status");
        switch (action) {
            case "nearby" -> {
                String address = body.str("address", "");
                if (address.isBlank()) address = Mobile.lanAddresses().stream().findFirst().orElseThrow(() -> new RequestFail(400, "No LAN interface is available. Use a private invitation."));
                return ShareSession.ok().put("sessions", ShareDiscovery.nearby(ShareTransport.lanAddress(address)));
            }
            case "interfaces" -> {
                Json.Arr addresses = new Json.Arr();
                addresses.add(new Json.Obj().put("address", "127.0.0.1"));
                Mobile.lanAddresses().forEach(ip -> addresses.add(new Json.Obj().put("address", ip)));
                return ShareSession.ok().put("addresses", addresses);
            }
            case "host" -> {
                if (hosting != null || target != null) throw new RequestFail(409, "End or leave your current Share session first.");
                InetAddress bind = ShareTransport.lanAddress(body.str("address", ""));
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
                session.onClose = () -> { if (discovery != null) discovery.close(); };
                hostInvitation = new Json.Obj().put("version", ShareSession.VERSION).put("address", bind.getHostAddress())
                        .put("port", transport.port()).put("fingerprint", transport.fingerprint)
                        .put("session", session.id()).put("invitation", session.invitation());
                // An invitation is sensitive and is returned ONLY for an explicit local host action.
                return status().put("invitation", Base64.getUrlEncoder().withoutPadding().encodeToString(hostInvitation.write().getBytes(StandardCharsets.UTF_8)))
                        .put("fingerprint", transport.fingerprint);
            }
            case "invitation" -> {
                if (hosting == null) throw new RequestFail(403, "Only the host can issue invitations.");
                hosting.localStatus();
                return ShareSession.ok().put("invitation", Base64.getUrlEncoder().withoutPadding()
                        .encodeToString(hostInvitation.write().getBytes(StandardCharsets.UTF_8))).put("fingerprint", transport.fingerprint);
            }
            case "join" -> {
                if (hosting != null || target != null) throw new RequestFail(409, "End or leave your current Share session first.");
                if (!body.bool("verified")) throw new RequestFail(400, "Verify the invitation with the host over a trusted channel first.");
                String invitation = body.str("invitation", "");
                if (invitation.length() > 2048) throw new RequestFail(400, "Invalid invitation.");
                Json.Obj parsed;
                try { parsed = ShareTransport.parse(Base64.getUrlDecoder().decode(invitation)); }
                catch (RuntimeException | java.io.IOException e) { throw new RequestFail(400, "Invalid invitation."); }
                if (parsed.longVal("version") != ShareSession.VERSION) throw new RequestFail(409, "Incompatible Lark Share protocol.");
                if (!parsed.str("session", "").matches("[a-f0-9]{64}") || !parsed.str("invitation", "").matches("[a-f0-9]{64}"))
                    throw new RequestFail(400, "Invalid invitation credentials.");
                Json.Obj result = send(parsed, request(parsed, "join").put("invitation", parsed.str("invitation"))
                        .put("name", ShareSession.label(body.str("displayName", ""))).put("bird", ShareSession.bird(settings.shareBird)));
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
                result.put("error", e instanceof RequestFail ? e.getMessage() : "Cannot reach the pinned host. Check Wi-Fi and firewall; retry or leave.");
            }
            result.put("connection", connection);
        }
        return result;
    }
    private void discoverable(boolean enabled) {
        if (discovery != null) { discovery.close(); discovery = null; }
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
    synchronized void guardRun(String id) {
        if (hosting != null && id.equals(projectId)) hosting.saveForRun();
        if (hosting != null && id.equals(projectId) && hosting.needsReview())
            throw new RequestFail(409, "Collaborators changed this project. Open Share → Review Changes before running, debugging, testing or opening a terminal.");
    }
    @Override public synchronized void close() {
        if (discovery != null) discovery.close(); discovery = null;
        if (transport != null) transport.close();
        else if (hosting != null) hosting.close();
        transport = null; hosting = null; target = null; hostInvitation = null; device = null; credential = null;
        connection = "Disconnected"; projectId = null; reviewed = null; avatarDirty = false;
    }
}
