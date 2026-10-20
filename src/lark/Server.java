package lark;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.concurrent.Executors;

/** Local-only HTTP server. The editor in the browser talks to this, and nowhere else. */
public final class Server {
    private final HttpServer http;
    private final int port;
    private final Projects projects;
    private final Runner runner;
    private final GitHub github;
    private final Updates updates;
    private final Terminal terminal;
    private final Settings settings;
    private final Path webDir;

    private Server(HttpServer http, int port, Projects projects, Runner runner, GitHub github, Updates updates,
                   Terminal terminal, Settings settings, Path webDir) {
        this.http = http;
        this.port = port;
        this.projects = projects;
        this.runner = runner;
        this.github = github;
        this.updates = updates;
        this.terminal = terminal;
        this.settings = settings;
        this.webDir = webDir;
    }

    public static Server start(int port, Projects projects, Runner runner, GitHub github, Settings settings) throws IOException {
        HttpServer http = null;
        IOException last = null;
        int chosen = port;
        for (int candidate = port; candidate < port + 20; candidate++) {
            try {
                http = HttpServer.create(new InetSocketAddress("127.0.0.1", candidate), 0);
                chosen = candidate;
                break;
            } catch (IOException e) {
                last = e;
            }
        }
        if (http == null) throw last == null ? new IOException("No free port") : last;
        Server server = new Server(http, chosen, projects, runner, github, new Updates(settings), new Terminal(),
                settings, findWeb());
        http.createContext("/", server::handle);
        http.setExecutor(Executors.newFixedThreadPool(8, runnable -> {
            Thread thread = new Thread(runnable, "lark-http");
            thread.setDaemon(true);
            return thread;
        }));
        http.start();
        return server;
    }

    public int port() {
        return port;
    }

    public void stop() {
        try {
            terminal.shutdown();
        } catch (Exception ignored) {
            // Best-effort.
        }
        http.stop(0);
    }

    private void handle(HttpExchange exchange) {
        try {
            String host = exchange.getRequestHeaders().getFirst("Host");
            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI().getPath();
            if (!localHost(host) && !publicDownload(path, method)) {
                sendJson(exchange, 403, new Json.Obj().put("ok", false).put("error", "Lark only answers on localhost."));
                return;
            }
            if (downloadName(path) != null && ("GET".equals(method) || "HEAD".equals(method))) {
                sendDownload(exchange, method, downloadName(path));
            } else if ("/update.json".equals(path) && ("GET".equals(method) || "HEAD".equals(method))) {
                sendUpdateFeed(exchange, method);
            } else if (path.startsWith("/api/")) {
                if (!method.equals("GET") && !method.equals("HEAD")) {
                    String mark = exchange.getRequestHeaders().getFirst("X-Lark");
                    if (!"1".equals(mark)) {
                        sendJson(exchange, 400, new Json.Obj().put("ok", false).put("error", "Missing the Lark header."));
                        return;
                    }
                }
                api(exchange, method, path);
            } else {
                staticFile(exchange, path);
            }
        } catch (RequestFail e) {
            try {
                sendJson(exchange, e.status, new Json.Obj().put("ok", false).put("error", e.getMessage()));
            } catch (IOException ignored) {
                // The browser went away.
            }
        } catch (IOException e) {
            String message = e.getMessage() == null ? "" : e.getMessage();
            if (message.contains("Broken pipe") || message.contains("Connection reset")) return;
            e.printStackTrace(System.err);
        } catch (Exception e) {
            e.printStackTrace(System.err);
            try {
                sendJson(exchange, 500, new Json.Obj().put("ok", false).put("error", "Something went wrong inside Lark."));
            } catch (IOException ignored) {
                // Already failing.
            }
        }
    }

    private void api(HttpExchange exchange, String method, String path) throws IOException {
        String[] parts = path.split("/");
        if ("GET".equals(method) && "/api/health".equals(path)) {
            sendJson(exchange, 200, new Json.Obj()
                    .put("ok", true)
                    .put("version", Settings.VERSION)
                    .put("edition", Desktop.isDesktop() ? "desktop" : "portable")
                    .put("channel", Desktop.isDesktop() ? Desktop.CHANNEL : "portable"));
            return;
        }
        if ("/api/settings".equals(path)) {
            if ("GET".equals(method)) {
                sendJson(exchange, 200, settingsJson());
                return;
            }
            if ("PUT".equals(method)) {
                Json.Obj body = body(exchange);
                if (body.has("theme")) {
                    String theme = body.str("theme", "desk");
                    if ("ink".equals(theme)) theme = "desk";
                    if ("paper".equals(theme)) theme = "daylight";
                    if ("tide".equals(theme)) theme = "moss";
                    if ("copper".equals(theme)) theme = "ember";
                    if ("chalk".equals(theme)) theme = "fog";
                    if (!Settings.THEMES.contains(theme)) throw new RequestFail(400, "Unknown theme.");
                    settings.theme = theme;
                }
                if (body.has("lastProject")) settings.lastProject = body.str("lastProject", "");
                if (body.has("fontSize")) {
                    int size = (int) body.longVal("fontSize");
                    settings.fontSize = Settings.clamp(size, 11, 28, settings.fontSize);
                }
                if (body.has("zoom")) {
                    int zoom = (int) body.longVal("zoom");
                    settings.zoom = Settings.clamp(zoom, 80, 160, settings.zoom);
                }
                if (body.has("updateFeed")) settings.updateFeed = body.str("updateFeed", "").trim();
                settings.save();
                sendJson(exchange, 200, settingsJson());
                return;
            }
        }
        if ("/api/update/check".equals(path) && "GET".equals(method)) {
            sendJson(exchange, 200, updates.check());
            return;
        }
        if ("/api/update/install".equals(path) && "POST".equals(method)) {
            Json.Obj body = body(exchange);
            sendJson(exchange, 200, updates.install(body.str("download", "")));
            return;
        }
        if ("/api/update/skip".equals(path) && "POST".equals(method)) {
            sendJson(exchange, 200, updates.skip(body(exchange).str("version", "")));
            return;
        }
        if ("/api/update/restart".equals(path) && "POST".equals(method)) {
            sendJson(exchange, 200, updates.restart());
            return;
        }
        if ("/api/projects".equals(path) && "GET".equals(method)) {
            Json.Arr list = new Json.Arr();
            for (Json.Obj project : projects.list()) list.add(project);
            sendJson(exchange, 200, new Json.Obj().put("ok", true).put("projects", list));
            return;
        }
        if ("/api/projects".equals(path) && "POST".equals(method)) {
            Json.Obj body = body(exchange);
            String template = body.str("template", "empty");
            if (!template.equals("library") && !template.equals("empty")) template = "empty";
            String id = projects.create(body.str("name", ""), template);
            sendJson(exchange, 200, new Json.Obj().put("ok", true).put("id", id));
            return;
        }
        if ("/api/import".equals(path) && "POST".equals(method)) {
            String type = exchange.getRequestHeaders().getFirst("Content-Type");
            if (type != null && type.startsWith("application/zip")) {
                byte[] data = exchange.getRequestBody().readNBytes(8_000_001);
                if (data.length > 8_000_000) throw new RequestFail(400, "That zip is too large.");
                String name = query(exchange, "name");
                String id = projects.importZip(name, new ByteArrayInputStream(data));
                sendJson(exchange, 200, new Json.Obj().put("ok", true).put("id", id));
                return;
            }
            Json.Obj body = body(exchange);
            Json.Arr arr = body.arr("files");
            if (arr == null) throw new RequestFail(400, "Missing files.");
            java.util.ArrayList<Projects.TextFile> files = new java.util.ArrayList<>();
            for (int i = 0; i < arr.size(); i++) {
                if (!(arr.get(i) instanceof Json.Obj file)) continue;
                files.add(new Projects.TextFile(file.str("path", ""), file.str("content", "")));
            }
            String id = projects.importFiles(body.str("name", "Imported"), files);
            sendJson(exchange, 200, new Json.Obj().put("ok", true).put("id", id));
            return;
        }
        if ("/api/run".equals(path) && "POST".equals(method)) {
            Json.Obj body = body(exchange);
            String args = body.str("args", "");
            String stdin = body.str("stdin", "");
            if (args.length() > 2_000) throw new RequestFail(400, "Those arguments are too long.");
            if (stdin.length() > 100_000) throw new RequestFail(400, "That input is too long.");
            String id = runner.start(projects.projectDir(body.str("project", "")),
                    body.str("mainClass", ""), args, stdin);
            sendJson(exchange, 200, new Json.Obj().put("ok", true).put("id", id));
            return;
        }
        if (parts.length == 4 && "api".equals(parts[1]) && "run".equals(parts[2]) && "GET".equals(method)) {
            sendJson(exchange, 200, runner.snapshot(decode(parts[3])));
            return;
        }
        if (parts.length == 5 && "api".equals(parts[1]) && "run".equals(parts[2]) && "stop".equals(parts[4])
                && "POST".equals(method)) {
            runner.stop(decode(parts[3]));
            sendJson(exchange, 200, new Json.Obj().put("ok", true));
            return;
        }
        if (parts.length == 5 && "api".equals(parts[1]) && "run".equals(parts[2]) && "input".equals(parts[4])
                && "POST".equals(method)) {
            Json.Obj body = body(exchange);
            runner.writeInput(decode(parts[3]), body.str("text", ""));
            sendJson(exchange, 200, new Json.Obj().put("ok", true));
            return;
        }
        if ("/api/terminal".equals(path) && "POST".equals(method)) {
            Json.Obj body = body(exchange);
            String projectId = body.str("project", "");
            Path cwd = projectId.isBlank()
                    ? settings.projectsDir()
                    : projects.projectDir(projectId);
            sendJson(exchange, 200, terminal.start(cwd));
            return;
        }
        if (parts.length == 4 && "api".equals(parts[1]) && "terminal".equals(parts[2]) && "GET".equals(method)) {
            sendJson(exchange, 200, terminal.snapshot(decode(parts[3])));
            return;
        }
        if (parts.length == 5 && "api".equals(parts[1]) && "terminal".equals(parts[2]) && "input".equals(parts[4])
                && "POST".equals(method)) {
            Json.Obj body = body(exchange);
            terminal.write(decode(parts[3]), body.str("text", ""));
            sendJson(exchange, 200, new Json.Obj().put("ok", true));
            return;
        }
        if (parts.length == 5 && "api".equals(parts[1]) && "terminal".equals(parts[2]) && "stop".equals(parts[4])
                && "POST".equals(method)) {
            sendJson(exchange, 200, terminal.stop(decode(parts[3])));
            return;
        }
        if ("/api/github/token".equals(path) && "POST".equals(method)) {
            sendJson(exchange, 200, github.saveToken(body(exchange).str("token", "")));
            return;
        }
        if ("/api/github/repos".equals(path) && "GET".equals(method)) {
            sendJson(exchange, 200, github.repos());
            return;
        }
        if ("/api/github/push".equals(path) && "POST".equals(method)) {
            Json.Obj body = body(exchange);
            sendJson(exchange, 200, github.push(projects, body.str("project", ""), body.str("owner", ""),
                    body.str("repo", ""), body.str("branch", "main"), body.str("message", ""), body.bool("create")));
            return;
        }
        if ("/api/github/pull".equals(path) && "POST".equals(method)) {
            Json.Obj body = body(exchange);
            sendJson(exchange, 200, github.pull(projects, body.str("owner", ""), body.str("repo", ""),
                    body.str("branch", "main")));
            return;
        }
        if ("/api/github/login".equals(path) && "POST".equals(method)) {
            sendJson(exchange, 200, github.beginLogin("http://127.0.0.1:" + port));
            return;
        }
        if ("/api/github/status".equals(path) && "GET".equals(method)) {
            sendJson(exchange, 200, github.status());
            return;
        }
        if ("/api/github/begin".equals(path) && "GET".equals(method)) {
            sendHtml(exchange, github.beginPage(query(exchange, "state")));
            return;
        }
        if (path.startsWith("/api/github/created/") && "GET".equals(method)) {
            sendHtml(exchange, github.createdPage(decode(path.substring("/api/github/created/".length())), query(exchange, "code")));
            return;
        }
        if ("/api/github/oauth".equals(path) && "GET".equals(method)) {
            sendHtml(exchange, github.oauthPage(query(exchange, "code"), query(exchange, "state"),
                    query(exchange, "error"), query(exchange, "error_description")));
            return;
        }
        if (parts.length >= 4 && "api".equals(parts[1]) && "projects".equals(parts[2])) {
            String id = decode(parts[3]);
            String tail = parts.length >= 5 ? parts[4] : "";
            if (parts.length == 4 && "GET".equals(method)) {
                sendJson(exchange, 200, new Json.Obj().put("ok", true).put("project", projects.read(id)));
                return;
            }
            if (parts.length == 4 && "PUT".equals(method)) {
                Json.Obj body = body(exchange);
                projects.updateMeta(id, body.str("name"), body.str("mainClass"), body.has("name"), body.has("mainClass"));
                sendJson(exchange, 200, new Json.Obj().put("ok", true));
                return;
            }
            if (parts.length == 4 && "DELETE".equals(method)) {
                projects.delete(id);
                sendJson(exchange, 200, new Json.Obj().put("ok", true));
                return;
            }
            if ("file".equals(tail) && parts.length == 5 && "PUT".equals(method)) {
                Json.Obj body = body(exchange);
                projects.writeFile(id, body.str("path", ""), body.str("content", ""));
                sendJson(exchange, 200, new Json.Obj().put("ok", true));
                return;
            }
            if ("file".equals(tail) && parts.length == 5 && "DELETE".equals(method)) {
                String rel = query(exchange, "path");
                if (rel == null) throw new RequestFail(400, "Missing a path.");
                projects.deletePath(id, rel);
                sendJson(exchange, 200, new Json.Obj().put("ok", true));
                return;
            }
            if ("mkdir".equals(tail) && "POST".equals(method)) {
                projects.mkdir(id, body(exchange).str("path", ""));
                sendJson(exchange, 200, new Json.Obj().put("ok", true));
                return;
            }
            if ("move".equals(tail) && "POST".equals(method)) {
                Json.Obj body = body(exchange);
                projects.move(id, body.str("from", ""), body.str("to", ""));
                sendJson(exchange, 200, new Json.Obj().put("ok", true));
                return;
            }
            if ("export".equals(tail) && "GET".equals(method)) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                projects.exportZip(id, buf);
                exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"" + id + ".zip\"");
                send(exchange, 200, "application/zip", buf.toByteArray());
                return;
            }
        }
        sendJson(exchange, 404, new Json.Obj().put("ok", false).put("error", "No such API."));
    }

    private Json.Obj settingsJson() {
        return new Json.Obj()
                .put("ok", true)
                .put("theme", settings.theme)
                .put("fontSize", settings.fontSize)
                .put("zoom", settings.zoom)
                .put("tokenSet", settings.githubToken != null && !settings.githubToken.isBlank())
                .put("githubLogin", settings.githubLogin == null ? "" : settings.githubLogin)
                .put("lastProject", settings.lastProject == null ? "" : settings.lastProject)
                .put("updateFeed", settings.updateFeed == null ? "" : settings.updateFeed)
                .put("javaVersion", System.getProperty("java.version", ""))
                .put("projectsDir", settings.projectsDir().toString())
                .put("version", Settings.VERSION)
                .put("edition", Desktop.isDesktop() ? "desktop" : "portable")
                .put("channel", Desktop.isDesktop() ? Desktop.CHANNEL : "portable");
    }

    private static String downloadName(String path) {
        if ("/lark.zip".equals(path)) return "lark.zip";
        if ("/lark-windows.zip".equals(path)) return "lark-windows.zip";
        if ("/lark-mac.zip".equals(path)) return "lark-mac.zip";
        if ("/lark-linux.zip".equals(path)) return "lark-linux.zip";
        return null;
    }

    private void sendUpdateFeed(HttpExchange exchange, String method) throws IOException {
        Path file = findRelease("update.json");
        byte[] data;
        if (file != null) {
            data = Files.readAllBytes(file);
        } else {
            String json = new Json.Obj()
                    .put("version", Settings.VERSION)
                    .put("notes", "Current Lark build on this machine.")
                    .put("downloads", new Json.Obj()
                            .put("windows", "/lark-windows.zip")
                            .put("mac", "/lark-mac.zip")
                            .put("linux", "/lark-linux.zip")
                            .put("any", "/lark.zip"))
                    .write();
            data = json.getBytes(StandardCharsets.UTF_8);
        }
        if ("HEAD".equals(method)) {
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
            return;
        }
        send(exchange, 200, "application/json; charset=utf-8", data);
    }

    /** A portable copy: the jar plus launchers for Windows, Mac, and Linux. */
    private void sendDownload(HttpExchange exchange, String method, String name) throws IOException {
        Path zip = findRelease(name);
        if (zip == null) {
            send(exchange, 404, "text/plain; charset=utf-8",
                    (name + " is not packed on this computer yet.").getBytes(StandardCharsets.UTF_8));
            return;
        }
        byte[] data = Files.readAllBytes(zip);
        exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"" + name + "\"");
        if ("HEAD".equals(method)) {
            exchange.getResponseHeaders().set("Content-Type", "application/zip");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
            return;
        }
        send(exchange, 200, "application/zip", data);
    }

    private void staticFile(HttpExchange exchange, String path) throws IOException {
        if (path.equals("/")) path = "/index.html";
        if (path.contains("..")) {
            send(exchange, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        String rel = path.startsWith("/") ? path.substring(1) : path;
        byte[] data = readWeb(rel);
        if (data == null) {
            send(exchange, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        // Stamp asset URLs so browsers cannot keep a stale app.js after an update.
        if (rel.endsWith(".html")) {
            String html = new String(data, StandardCharsets.UTF_8)
                    .replace("__LARK_V__", Settings.VERSION);
            data = html.getBytes(StandardCharsets.UTF_8);
        }
        send(exchange, 200, mime(rel), data);
    }

    private byte[] readWeb(String rel) throws IOException {
        if (webDir != null) {
            Path file = webDir.resolve(rel).normalize();
            if (file.startsWith(webDir) && Files.isRegularFile(file)) return Files.readAllBytes(file);
        }
        try (InputStream in = Lark.class.getResourceAsStream("/web/" + rel)) {
            if (in == null) return null;
            return in.readAllBytes();
        }
    }

    private static Path findWeb() {
        // Packaged launches (java -jar … / Start Lark) must use the UI packed in
        // the jar. A leftover web/ folder next to an unzip — or beside the run
        // copy — used to serve stale app.js and resurrect bugs like "on is not defined".
        try {
            var location = Lark.class.getProtectionDomain().getCodeSource().getLocation();
            if (location != null) {
                Path path = Path.of(location.toURI());
                if (Files.isRegularFile(path) && path.getFileName().toString().endsWith(".jar")) {
                    return null;
                }
            }
        } catch (Exception ignored) {
            // Fall through to the source-tree web/ folder for java -cp builds.
        }
        String install = System.getProperty("lark.install");
        if (install != null && !install.isBlank()) return null;
        if ("jar".equalsIgnoreCase(System.getProperty("lark.ui", ""))) return null;

        Path cwd = Path.of("web").toAbsolutePath().normalize();
        if (Files.isRegularFile(cwd.resolve("index.html"))) return cwd;
        return null;
    }

    private static Path findRelease(String name) {
        Path cwd = Path.of("release", name).toAbsolutePath().normalize();
        if (Files.isRegularFile(cwd)) return cwd;
        try {
            var location = Lark.class.getProtectionDomain().getCodeSource().getLocation();
            if (location != null) {
                Path parent = Path.of(location.toURI()).getParent();
                Path beside = parent.resolve("release").resolve(name);
                if (Files.isRegularFile(beside)) return beside.normalize();
                Path sibling = parent.resolve(name);
                if (Files.isRegularFile(sibling)) return sibling.normalize();
            }
        } catch (Exception ignored) {
            // Missing release files are fine for a portable copy.
        }
        return null;
    }

    private static String mime(String rel) {
        if (rel.endsWith(".html")) return "text/html; charset=utf-8";
        if (rel.endsWith(".css")) return "text/css; charset=utf-8";
        if (rel.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (rel.endsWith(".svg")) return "image/svg+xml";
        if (rel.endsWith(".png")) return "image/png";
        if (rel.endsWith(".woff2")) return "font/woff2";
        if (rel.endsWith(".woff")) return "font/woff";
        if (rel.endsWith(".map")) return "application/json";
        if (rel.endsWith(".txt")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }

    private static Json.Obj body(HttpExchange exchange) throws IOException {
        byte[] data = exchange.getRequestBody().readNBytes(5_000_001);
        if (data.length == 0) throw new RequestFail(400, "That request was empty.");
        if (data.length > 5_000_000) throw new RequestFail(400, "That request is too large.");
        return Json.parseObj(new String(data, StandardCharsets.UTF_8));
    }

    private static String query(HttpExchange exchange, String key) {
        String raw = exchange.getRequestURI().getRawQuery();
        if (raw == null) return null;
        for (String part : raw.split("&")) {
            int eq = part.indexOf('=');
            String name = URLDecoder.decode(eq < 0 ? part : part.substring(0, eq), StandardCharsets.UTF_8);
            if (!name.equals(key)) continue;
            return URLDecoder.decode(eq < 0 ? "" : part.substring(eq + 1), StandardCharsets.UTF_8);
        }
        return null;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    /** The zip and its save page can be opened from a normal browser. Everything else stays on this machine. */
    private static boolean publicDownload(String path, String method) {
        if (!"GET".equals(method) && !"HEAD".equals(method)) return false;
        return downloadName(path) != null || "/update.json".equals(path)
                || "/download.html".equals(path) || "/favicon.svg".equals(path);
    }

    static boolean localHost(String host) {
        if (host == null || host.isBlank()) return false;
        String value = host.toLowerCase(Locale.ROOT);
        String name = value;
        if (value.startsWith("[")) {
            int end = value.indexOf(']');
            name = end > 0 ? value.substring(0, end + 1) : value;
        } else {
            int colon = value.lastIndexOf(':');
            if (colon > 0) name = value.substring(0, colon);
        }
        return name.equals("127.0.0.1") || name.equals("localhost") || name.equals("[::1]") || name.equals("::1");
    }

    private static void sendJson(HttpExchange exchange, int status, Json.Value value) throws IOException {
        send(exchange, status, "application/json; charset=utf-8", value.write().getBytes(StandardCharsets.UTF_8));
    }

    private static void sendHtml(HttpExchange exchange, String html) throws IOException {
        send(exchange, 200, "text/html; charset=utf-8", html.getBytes(StandardCharsets.UTF_8));
    }

    private static void send(HttpExchange exchange, int status, String type, byte[] data) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, data.length);
        exchange.getResponseBody().write(data);
        exchange.close();
    }
}
