package lark;

import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** Loopback-only control bridge; peer credentials never reach the browser or disk. */
final class Share implements AutoCloseable {
    private final Projects projects;
    private ShareSession hosting;
    private ShareTransport transport;
    private Json.Obj target, hostInvitation;
    private String device, credential;
    private String connection = "Disconnected";

    Share(Projects projects) { this.projects = projects; }

    synchronized Json.Obj control(Json.Obj body) throws Exception {
        String action = body.str("action", "status");
        switch (action) {
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
                hosting = session;
                connection = "Connected";
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
                        .put("name", ShareSession.label(body.str("displayName", ""))));
                device = result.str("device"); credential = result.str("credential");
                target = parsed;
                connection = "Waiting for Approval";
                return status();
            }
            case "decide" -> {
                if (hosting == null) throw new RequestFail(403, "Only the host can approve or revoke devices.");
                hosting.decide(body.str("device", ""), body.bool("approve"));
                return status();
            }
            case "files" -> {
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
        Json.Obj result = ShareSession.ok().put("connection", connection).put("hosting", hosting != null)
                .put("joined", target != null).put("mode", "Read-only source snapshot — editing and discovery are not available in this milestone.");
        if (hosting != null) result.put("session", hosting.localStatus()).put("port", transport.port()).put("fingerprint", transport.fingerprint);
        if (target != null) {
            try {
                Json.Obj remote = peer("poll");
                connection = remote.str("status", "pending").equals("approved") ? "Connected" : "Waiting for Approval";
                result.put("session", remote);
            } catch (Exception e) {
                // Keep the pinned target and credential for a subsequent retry; never auto-join anew.
                result.put("error", e instanceof RequestFail ? e.getMessage() : "Cannot reach the pinned host. Check Wi-Fi and firewall; retry or leave.");
            }
            result.put("connection", connection);
        }
        return result;
    }
    @Override public synchronized void close() {
        if (transport != null) transport.close();
        else if (hosting != null) hosting.close();
        transport = null; hosting = null; target = null; hostInvitation = null; device = null; credential = null;
        connection = "Disconnected";
    }
}
