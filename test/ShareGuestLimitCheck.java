package lark;

import java.nio.file.Files;
import java.nio.file.Path;

/** The configured limit includes requests awaiting host approval. */
public final class ShareGuestLimitCheck {
    public static void main(String[] args) throws Exception {
        Path project = Files.createTempDirectory("lark-share-limit-");
        Path source = Files.writeString(project.resolve("Main.java"), "class Main {}\n");
        try {
            for (int limit : new int[]{1, 3}) {
                try (ShareSession session = new ShareSession(project, "Project", "Host")) {
                    session.guestLimit(limit);
                    for (int n = 0; n < limit; n++) {
                        session.request(new Json.Obj().put("version", ShareSession.VERSION)
                            .put("client", ShareSession.token()).put("name", "Guest"), "peer-" + n);
                    }
                    if (!session.discoveryInfo().str("status").equals("full")) throw new AssertionError("session should be full");
                    try {
                        session.request(new Json.Obj().put("version", ShareSession.VERSION)
                            .put("client", ShareSession.token()).put("name", "Extra"), "extra");
                        throw new AssertionError("limit not enforced");
                    } catch (RequestFail expected) {
                        if (expected.status != 429) throw expected;
                    }
                }
            }
        } finally { Files.deleteIfExists(source); Files.deleteIfExists(project); }
    }
}
