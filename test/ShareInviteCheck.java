package lark;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Pasted-invitation parsing plus a real two-process TLS join on loopback. */
public final class ShareInviteCheck {
    static int checks;
    static void check(boolean ok, String msg) { checks++; if (!ok) throw new AssertionError(msg); }

    public static void main(String[] args) throws Exception {
        if (args.length > 1 && args[0].equals("host")) { host(Path.of(args[1])); return; }
        Path root = Files.createTempDirectory("lark-invite-test-");
        Files.writeString(root.resolve("Main.java"), "class Main {}\n");
        Process child = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-cp", System.getProperty("java.class.path"), "lark.ShareInviteCheck", "host", root.toString())
                .redirectError(ProcessBuilder.Redirect.INHERIT).start();
        try {
            BufferedReader out = new BufferedReader(new InputStreamReader(child.getInputStream(), StandardCharsets.UTF_8));
            String invite = out.readLine();
            check(invite != null && !invite.isBlank(), "Host process printed no invitation");
            for (String pasted : mangled(invite)) {
                Json.Obj parsed = Share.decodeInvitation(pasted);
                check(parsed.str("invitation", "").matches("[a-f0-9]{64}"), "Mangled paste not recovered: " + pasted.replace("\n", "\\n"));
            }
            for (String bad : List.of("", "hello", invite.substring(0, invite.length() / 2), invite.substring(0, 30) + "!!" + invite.substring(30))) {
                try { Share.decodeInvitation(bad); check(false, "Bad invitation accepted: " + bad); }
                catch (RequestFail e) { check(e.status == 400 && e.getMessage().startsWith("Invalid invitation"), "Unclear error: " + e.getMessage()); }
            }
            // Real join from this process to the host process, using a wrapped, smart-quoted paste.
            Json.Obj target = Share.decodeInvitation("\u201C" + wrap(invite, 60) + "\u201D");
            Json.Obj reply = ShareTransport.exchange(target.str("address"), (int) target.longVal("port"), target.str("fingerprint"),
                    new Json.Obj().put("version", ShareSession.VERSION).put("session", target.str("session")).put("action", "join")
                            .put("invitation", target.str("invitation")).put("name", "Guest"));
            check(reply.bool("ok") && reply.str("device", "").length() > 0, "Two-process join failed: " + reply.write());
            Json.Obj poll = ShareTransport.exchange(target.str("address"), (int) target.longVal("port"), target.str("fingerprint"),
                    new Json.Obj().put("version", ShareSession.VERSION).put("session", target.str("session")).put("action", "poll")
                            .put("device", reply.str("device")).put("credential", reply.str("credential")));
            check("pending".equals(poll.str("status", "")), "Guest skipped host approval: " + poll.write());
            String wrongPin = "0".repeat(64);
            try { ShareTransport.exchange(target.str("address"), (int) target.longVal("port"), wrongPin, new Json.Obj()); check(false, "Wrong pin accepted"); }
            catch (Exception expected) { checks++; }
            System.out.println("ShareInviteCheck: " + checks + " checks passed (mangled pastes, two-process TLS join, approval still required).");
        } finally { child.destroy(); Projects.deleteTree(root); }
    }

    static List<String> mangled(String invite) {
        String padded = invite + "=".repeat((4 - invite.length() % 4) % 4);
        return List.of(invite, "  " + invite + "\r\n", wrap(invite, 76), wrap(invite, 40).replace("\n", "\r\n "),
                "\u200B" + invite.substring(0, 20) + "\u200D" + invite.substring(20) + "\uFEFF",
                "\u201C" + invite + "\u201D", "\"" + invite + "\"", "```\n" + invite + "\n```", "<" + invite + ">",
                "Lark invitation: " + invite, padded.replace('-', '+').replace('_', '/'),
                java.net.URLEncoder.encode(padded.replace('-', '+').replace('_', '/'), StandardCharsets.UTF_8));
    }
    static String wrap(String s, int width) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i += width) b.append(s, i, Math.min(s.length(), i + width)).append('\n');
        return b.toString();
    }

    static void host(Path root) throws Exception {
        ShareSession session = new ShareSession(root, "Invite test", "Host");
        ShareTransport transport = new ShareTransport(session, ShareTransport.lanAddress("127.0.0.1"), 0, 40);
        Json.Obj invitation = new Json.Obj().put("version", ShareSession.VERSION).put("address", "127.0.0.1")
                .put("port", transport.port()).put("fingerprint", transport.fingerprint)
                .put("session", session.id()).put("invitation", session.invitation());
        System.out.println(Base64.getUrlEncoder().withoutPadding().encodeToString(invitation.write().getBytes(StandardCharsets.UTF_8)));
        System.out.flush();
        Thread.sleep(60_000);
        transport.close();
    }
}
