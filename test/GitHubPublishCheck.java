package lark;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Exercises repository creation and first push against a local GitHub API double. */
public final class GitHubPublishCheck {
    public static void main(String[] args) throws Exception {
        if (System.getenv("LARK_HOME") == null) throw new IllegalStateException("Use an isolated LARK_HOME");
        Settings settings = Settings.load(); settings.githubToken = "test-token-not-a-real-credential"; settings.githubLogin = "owner";
        Path project = settings.projectsDir().resolve("publish-test"); Files.createDirectories(project);
        String source = "class Main {}\n"; Files.writeString(project.resolve("Main.java"), source);
        byte[] binary = new byte[] {0, (byte) 0xff, 42}; Files.write(project.resolve("asset.bin"), binary);
        Files.writeString(project.resolve(".gitignore"), "build/\n");
        Files.createDirectories(project.resolve("build")); Files.writeString(project.resolve("build/generated.txt"), "generated");
        AtomicBoolean created = new AtomicBoolean(), initialized = new AtomicBoolean(), patched = new AtomicBoolean();
        AtomicReference<String> error = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath(), method = exchange.getRequestMethod();
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            int status = 200; String response = "{}";
            try {
                if (path.equals("/repos/owner/demo") && method.equals("GET")) {
                    if (!created.get()) { status = 404; response = "{\"message\":\"Not Found\"}"; }
                    else response = "{\"default_branch\":\"trunk\"}";
                } else if (path.equals("/user/repos") && method.equals("POST")) {
                    Json.Obj data = Json.parseObj(body);
                    if (!data.str("name").equals("demo") || data.bool("private") || !data.str("description").equals("Example")) throw new AssertionError("repository options");
                    created.set(true); status = 201;
                } else if (path.equals("/repos/owner/demo/git/ref/heads/trunk") && method.equals("GET")) {
                    if (!initialized.get()) { status = 409; response = "{\"message\":\"Git Repository is empty.\"}"; }
                    else response = "{\"object\":{\"sha\":\"parent\"}}";
                } else if (path.startsWith("/repos/owner/demo/contents/") && method.equals("PUT")) {
                    Json.Obj data = Json.parseObj(body);
                    byte[] expected = path.endsWith("/Main.java") ? source.getBytes(StandardCharsets.UTF_8)
                            : path.endsWith("/.gitignore") ? "build/\n".getBytes(StandardCharsets.UTF_8) : binary;
                    if (!java.util.Arrays.equals(Base64.getDecoder().decode(data.str("content")), expected)) throw new AssertionError("initial file content");
                    if (data.has("sha")) throw new AssertionError("initial upload must not overwrite");
                    initialized.set(true); status = 201;
                } else if (path.equals("/repos/owner/demo/git/blobs") && method.equals("POST")) {
                    Json.Obj data = Json.parseObj(body);
                    if (!data.str("encoding").equals("base64") || !java.util.Arrays.equals(binary, Base64.getDecoder().decode(data.str("content")))) throw new AssertionError("binary content");
                    response = "{\"sha\":\"binary-sha\"}"; status = 201;
                } else if (path.equals("/repos/owner/demo/git/commits/parent") && method.equals("GET")) response = "{\"tree\":{\"sha\":\"base\"}}";
                else if (path.equals("/repos/owner/demo/git/trees") && method.equals("POST")) {
                    Json.Obj data = Json.parseObj(body);
                    if (!data.str("base_tree").equals("base")) throw new AssertionError("missing base tree");
                    boolean foundBinary = false, foundIgnore = false;
                    for (Json.Value value : data.arr("tree").values()) {
                        Json.Obj item = (Json.Obj) value;
                        if (item.str("path").equals("asset.bin") && item.str("sha").equals("binary-sha")) foundBinary = true;
                        if (item.str("path").equals(".gitignore")) foundIgnore = true;
                        if (item.str("path").startsWith("build/")) throw new AssertionError("build output was included");
                    }
                    if (!foundBinary || !foundIgnore) throw new AssertionError("project files missing");
                    response = "{\"sha\":\"tree\"}"; status = 201;
                } else if (path.equals("/repos/owner/demo/git/commits") && method.equals("POST")) { response = "{\"sha\":\"commit\",\"html_url\":\"https://github.com/owner/demo/commit/commit\"}"; status = 201; }
                else if (path.equals("/repos/owner/demo/git/refs/heads/trunk") && method.equals("PATCH")) {
                    if (Json.parseObj(body).has("force")) throw new AssertionError("force push");
                    patched.set(true);
                } else { status = 500; error.set("Unexpected " + method + " " + path); }
            } catch (Throwable failure) { status = 500; error.set(failure.toString()); }
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(status, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        try {
            GitHub github = new GitHub(settings, URI.create("http://127.0.0.1:" + server.getAddress().getPort()));
            Path oversized = project.resolve("oversized.bin");
            try (var file = new java.io.RandomAccessFile(oversized.toFile(), "rw")) { file.setLength(10_000_001); }
            try { github.push(new Projects(settings), "publish-test", "owner", "demo", "main", "Initial", true, "Example", false); throw new AssertionError("Oversized project accepted"); }
            catch (RequestFail expected) { if (expected.status != 400 || created.get()) throw expected; }
            Files.delete(oversized);
            java.util.List<String> stages = new java.util.ArrayList<>();
            Json.Obj result = github.push(new Projects(settings), "publish-test", "owner", "demo", "main", "Initial", true, "Example", false, stages::add);
            if (!result.str("branch").equals("trunk") || !initialized.get() || !patched.get() || error.get() != null) throw new AssertionError("first push: " + error.get());
            if (stages.size() < 5 || stages.stream().noneMatch(x -> x.contains("Updating the branch"))) throw new AssertionError("Missing actual push progress");
            patched.set(false);
            try {
                github.push(new Projects(settings), "publish-test", "owner", "demo", "trunk", "Update", false, "", true, stage -> {
                    if (stage.startsWith("Preparing")) throw new RequestFail(409, "Cancelled");
                });
                throw new AssertionError("Cancellation ignored");
            } catch (RequestFail expected) { if (!expected.getMessage().equals("Cancelled")) throw expected; }
            if (patched.get()) throw new AssertionError("Cancelled push updated branch");
            try { github.push(new Projects(settings), "publish-test", "owner", "demo", "trunk", "Initial", true, "", true); throw new AssertionError("existing repo accepted as new"); }
            catch (RequestFail expected) { if (expected.status != 409) throw expected; }
            System.out.println("GitHub repository creation and empty-repository initialization checks passed.");
        } finally { server.stop(0); Projects.deleteTree(project); }
    }
}
