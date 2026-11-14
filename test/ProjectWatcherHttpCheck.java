package lark;

import java.net.*;
import java.net.http.*;
import java.nio.file.*;

/** Exercises the actual local HTTP routes backed by WatchService. */
public final class ProjectWatcherHttpCheck {
    private static final HttpClient CLIENT = HttpClient.newHttpClient();
    private static HttpResponse<String> request(String method, String url) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).header("X-Lark", "1");
        if (method.equals("POST")) b.POST(HttpRequest.BodyPublishers.ofString("{}"));
        else if (method.equals("DELETE")) b.DELETE(); else b.GET();
        return CLIENT.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }
    public static void main(String[] args) throws Exception {
        Settings settings = Settings.load(); Projects projects = new Projects(settings);
        Files.createDirectories(projects.root());
        Path selected = Files.createTempDirectory("lark-selected-folder-");
        Files.writeString(selected.resolve("Existing.java"), "class Existing {}\n");
        String id = projects.openFolder(selected);
        if (!projects.projectDir(id).equals(selected.toAbsolutePath().normalize()) || Files.exists(selected.resolve(".lark.json"))) throw new AssertionError("Selected folder was copied or modified");
        if (!id.equals(projects.openFolder(selected))) throw new AssertionError("Reopening a folder created a duplicate");
        String single = projects.openSingleFile(selected.resolve("Existing.java"));
        if (!projects.watchTarget(single).equals(selected.resolve("Existing.java").toAbsolutePath().normalize())) throw new AssertionError("Single-file watcher targeted the wrong file");
        int port; try (ServerSocket socket = new ServerSocket(0)) { port = socket.getLocalPort(); }
        Server server = Server.start(port, projects, new Runner(), new GitHub(settings), settings);
        try {
            String url = "http://127.0.0.1:" + server.port() + "/api/projects/" + id + "/watch";
            HttpResponse<String> response = request("POST", url);
            if (response.statusCode() != 200) throw new AssertionError(response.body());
            Json.Obj started = Json.parseObj(response.body()); String watch = started.str("id");
            Files.writeString(projects.projectDir(id).resolve("External.java"), "class External {}\n");
            boolean seen = false;
            for (int i = 0; i < 200; i++) {
                response = request("GET", url + "/" + watch + "?cursor=0");
                if (response.statusCode() != 200) throw new AssertionError(response.body());
                if (response.body().contains("External.java") && response.body().contains("class External")) { seen = true; break; }
                Thread.sleep(25);
            }
            if (!seen) throw new AssertionError("HTTP watcher missed external create");
            if (request("DELETE", url + "/" + watch).statusCode() != 200) throw new AssertionError("watch stop failed");
            if (request("GET", url + "/" + watch + "?cursor=0").statusCode() != 404) throw new AssertionError("stopped watcher remained available");
            System.out.println("Project watcher HTTP start, events and stop passed.");
        } finally { server.stop(); }
    }
}
