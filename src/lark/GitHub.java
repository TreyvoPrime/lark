package lark;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

/** Pushes and pulls a project through the GitHub API. Git itself is not required. */
public final class GitHub {
    private final Settings settings;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public GitHub(Settings settings) {
        this.settings = settings;
    }

    public Json.Obj saveToken(String token) {
        if (token == null || token.isBlank()) {
            settings.githubToken = "";
            settings.githubLogin = "";
            settings.save();
            return new Json.Obj().put("ok", true).put("login", "");
        }
        token = token.trim();
        Api user = call(token, "GET", "/user", null);
        if (user.status == 401 || user.status == 403) {
            throw new RequestFail(401, "GitHub didn't accept that token.");
        }
        expectOk(token, user);
        String login = user.obj == null ? "" : user.obj.str("login", "");
        if (login.isBlank()) throw new RequestFail(502, "GitHub didn't return an account name.");
        settings.githubToken = token;
        settings.githubLogin = login;
        settings.save();
        return new Json.Obj().put("ok", true).put("login", login);
    }

    public Json.Obj repos() {
        String token = requireToken();
        Api res = call(token, "GET",
                "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", null);
        expectOk(token, res);
        Json.Arr repos = new Json.Arr();
        if (res.array != null) {
            for (Json.Value value : res.array.values()) {
                if (!(value instanceof Json.Obj repo)) continue;
                String full = repo.str("full_name", "");
                int slash = full.indexOf('/');
                if (slash <= 0) continue;
                repos.add(new Json.Obj()
                        .put("owner", full.substring(0, slash))
                        .put("name", full.substring(slash + 1))
                        .put("fullName", full)
                        .put("private", repo.bool("private"))
                        .put("defaultBranch", repo.str("default_branch", "main")));
            }
        }
        return new Json.Obj().put("ok", true).put("repos", repos);
    }

    public Json.Obj push(Projects projects, String projectId, String owner, String repo,
                         String branch, String message, boolean create) {
        String token = requireToken();
        owner = checkName(owner, "owner");
        repo = checkName(repo, "repository");
        branch = checkBranch(branch);
        if (message == null || message.isBlank()) message = "Update from Lark";
        if (message.length() > 400) message = message.substring(0, 400);

        List<Projects.TextFile> files = projects.texts(projectId);
        if (files.isEmpty()) throw new RequestFail(400, "There's nothing to push yet.");
        long total = 0;
        for (Projects.TextFile file : files) total += file.content().length();
        if (total > 2_000_000) throw new RequestFail(400, "This project is too large to push from Lark.");

        String repoPath = "/repos/" + enc(owner) + "/" + enc(repo);
        Api repoInfo = call(token, "GET", repoPath, null);
        if (repoInfo.status == 404) {
            if (!create) {
                throw new RequestFail(404, "No repository " + owner + "/" + repo
                        + ". Check the box to create it, or create it on GitHub first.");
            }
            createRepo(token, owner, repo);
            repoInfo = call(token, "GET", repoPath, null);
        }
        expectOk(token, repoInfo);
        String defaultBranch = repoInfo.obj.str("default_branch", "main");

        Api ref = call(token, "GET", repoPath + "/git/ref/heads/" + branchPath(branch), null);
        String parent = null;
        String baseTree = null;
        boolean empty = ref.status == 409 || messageHas(ref, "empty");
        if (ref.status == 200 && ref.obj != null) {
            Json.Obj object = ref.obj.obj("object");
            parent = object == null ? null : object.str("sha");
            if (parent == null) throw new RequestFail(502, "GitHub didn't return the current commit.");
            Api commit = call(token, "GET", repoPath + "/git/commits/" + enc(parent), null);
            expectOk(token, commit);
            Json.Obj tree = commit.obj.obj("tree");
            baseTree = tree == null ? null : tree.str("sha");
        } else if (!empty) {
            if (ref.status == 404) {
                throw new RequestFail(404, "The branch " + branch + " isn't on " + owner + "/" + repo
                        + ". The default branch is " + defaultBranch + ".");
            }
            expectOk(token, ref);
        }

        Json.Arr treeEntries = new Json.Arr();
        for (Projects.TextFile file : files) {
            treeEntries.add(new Json.Obj()
                    .put("path", file.path())
                    .put("mode", "100644")
                    .put("type", "blob")
                    .put("content", file.content()));
        }
        Json.Obj treeBody = new Json.Obj().put("tree", treeEntries);
        if (baseTree != null) treeBody.put("base_tree", baseTree);
        Api treeRes = call(token, "POST", repoPath + "/git/trees", treeBody.write());
        expectOk(token, treeRes);
        String treeSha = treeRes.obj.str("sha");
        if (treeSha == null) throw new RequestFail(502, "GitHub didn't return a tree.");

        Json.Arr parents = new Json.Arr();
        if (parent != null) parents.add(parent);
        Json.Obj commitBody = new Json.Obj()
                .put("message", message)
                .put("tree", treeSha)
                .put("parents", parents);
        Api commitRes = call(token, "POST", repoPath + "/git/commits", commitBody.write());
        expectOk(token, commitRes);
        String sha = commitRes.obj.str("sha");
        String url = commitRes.obj.str("html_url");
        if (sha == null) throw new RequestFail(502, "GitHub didn't return a commit.");

        if (parent == null) {
            Json.Obj refBody = new Json.Obj().put("ref", "refs/heads/" + branch).put("sha", sha);
            expectOk(token, call(token, "POST", repoPath + "/git/refs", refBody.write()));
        } else {
            Api patched = call(token, "PATCH", repoPath + "/git/refs/heads/" + branchPath(branch),
                    new Json.Obj().put("sha", sha).write());
            if (patched.status == 422) {
                throw new RequestFail(409, "The branch moved while Lark was pushing. Try again.");
            }
            expectOk(token, patched);
        }
        if (url == null || url.isBlank()) url = "https://github.com/" + owner + "/" + repo + "/commit/" + sha;
        return new Json.Obj().put("ok", true).put("url", url).put("sha", sha).put("files", files.size());
    }

    public Json.Obj pull(Projects projects, String owner, String repo, String branch) {
        String token = requireToken();
        owner = checkName(owner, "owner");
        repo = checkName(repo, "repository");
        branch = checkBranch(branch);
        String repoPath = "/repos/" + enc(owner) + "/" + enc(repo);
        Api tree = call(token, "GET", repoPath + "/git/trees/" + branchPath(branch) + "?recursive=1", null);
        if (tree.status == 404 || tree.status == 409) {
            throw new RequestFail(404, "Couldn't find " + owner + "/" + repo + " on branch " + branch + ".");
        }
        expectOk(token, tree);
        if (tree.obj.bool("truncated")) {
            throw new RequestFail(400, "That repository is too big for Lark to pull in one pass.");
        }
        Json.Arr entries = tree.obj.arr("tree");
        if (entries == null) throw new RequestFail(502, "GitHub didn't return a file tree.");

        List<Projects.TextFile> files = new ArrayList<>();
        for (Json.Value value : entries.values()) {
            if (!(value instanceof Json.Obj entry)) continue;
            if (!"blob".equals(entry.str("type"))) continue;
            String path = entry.str("path", "");
            if (path.isBlank() || Projects.skip(path) || !textPath(path)) continue;
            if (entry.longVal("size") > 400_000) continue;
            String sha = entry.str("sha");
            if (sha == null) continue;
            Api blob = call(token, "GET", repoPath + "/git/blobs/" + enc(sha), null);
            expectOk(token, blob);
            String encoded = blob.obj.str("content", "");
            byte[] data;
            try {
                data = Base64.getMimeDecoder().decode(encoded);
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (!Projects.isUtf8(data)) continue;
            try {
                Projects.checkRelative(path);
            } catch (RequestFail ignored) {
                continue;
            }
            files.add(new Projects.TextFile(path, new String(data, StandardCharsets.UTF_8)));
            if (files.size() > 200) throw new RequestFail(400, "That repository has too many text files for Lark.");
        }
        if (files.isEmpty()) throw new RequestFail(400, "That repository didn't have any text files Lark can open.");
        String id = projects.importFiles(repo, files);
        return new Json.Obj().put("ok", true).put("id", id).put("files", files.size());
    }

    private void createRepo(String token, String owner, String repo) {
        Json.Obj body = new Json.Obj()
                .put("name", repo)
                .put("private", true)
                .put("auto_init", false)
                .put("description", "Created from Lark");
        String login = settings.githubLogin == null ? "" : settings.githubLogin;
        String path = owner.equalsIgnoreCase(login) || login.isBlank()
                ? "/user/repos"
                : "/orgs/" + enc(owner) + "/repos";
        Api res = call(token, "POST", path, body.write());
        if ((res.status == 404 || res.status == 403) && path.startsWith("/user/")) {
            res = call(token, "POST", "/orgs/" + enc(owner) + "/repos", body.write());
        }
        expectOk(token, res);
    }

    private Api call(String token, String method, String path, String body) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("https://api.github.com" + path))
                    .timeout(Duration.ofSeconds(45))
                    .header("Authorization", "Bearer " + token)
                    .header("Accept", "application/vnd.github+json")
                    .header("User-Agent", "Lark-IDE")
                    .header("X-GitHub-Api-Version", "2022-11-28");
            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.header("Content-Type", "application/json");
                builder.method(method, HttpRequest.BodyPublishers.ofString(body));
            }
            HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            return Api.parse(response.statusCode(), response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RequestFail(502, "The GitHub request was interrupted.");
        } catch (IOException e) {
            throw new RequestFail(502, "Couldn't reach GitHub.");
        }
    }

    private void expectOk(String token, Api res) {
        if (res.status >= 200 && res.status < 300) return;
        String message = "GitHub returned " + res.status + ".";
        if (res.obj != null && res.obj.str("message") != null) message = res.obj.str("message");
        if (token != null && !token.isBlank() && message.contains(token)) message = message.replace(token, "••••");
        int status = res.status == 401 ? 401 : (res.status >= 400 && res.status < 500 ? 400 : 502);
        throw new RequestFail(status, message);
    }

    private String requireToken() {
        if (settings.githubToken == null || settings.githubToken.isBlank()) {
            throw new RequestFail(400, "Add a GitHub token first. It needs access to repository contents.");
        }
        return settings.githubToken;
    }

    private static boolean messageHas(Api res, String word) {
        if (res.obj == null) return false;
        String message = res.obj.str("message", "");
        return message.toLowerCase(Locale.ROOT).contains(word);
    }

    private static boolean textPath(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        String base = lower.contains("/") ? lower.substring(lower.lastIndexOf('/') + 1) : lower;
        if (base.equals("readme") || base.equals("license") || base.equals("makefile")) return true;
        return lower.endsWith(".java") || lower.endsWith(".txt") || lower.endsWith(".md")
                || lower.endsWith(".json") || lower.endsWith(".xml") || lower.endsWith(".properties")
                || lower.endsWith(".gradle") || lower.endsWith(".kts") || lower.endsWith(".yml")
                || lower.endsWith(".yaml") || lower.endsWith(".csv") || lower.endsWith(".html")
                || lower.endsWith(".css") || lower.endsWith(".js");
    }

    private static String checkName(String value, String label) {
        if (value == null) throw new RequestFail(400, "Enter the " + label + ".");
        value = value.trim();
        if (!value.matches("[A-Za-z0-9_.-]{1,100}")) {
            throw new RequestFail(400, "The " + label + " can use letters, numbers, dots, dashes, and underscores.");
        }
        return value;
    }

    static String checkBranch(String branch) {
        if (branch == null || branch.isBlank()) branch = "main";
        branch = branch.trim();
        if (branch.startsWith("/") || branch.endsWith("/") || branch.contains("..") || branch.contains("//")) {
            throw new RequestFail(400, "That branch name isn't valid.");
        }
        if (!branch.matches("[A-Za-z0-9_./-]{1,120}")) {
            throw new RequestFail(400, "That branch name isn't valid.");
        }
        return branch;
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String branchPath(String branch) {
        String[] parts = branch.split("/");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) out.append('/');
            out.append(enc(parts[i]));
        }
        return out.toString();
    }

    private record Api(int status, Json.Obj obj, Json.Arr array) {
        static Api parse(int status, String raw) {
            Json.Obj obj = null;
            Json.Arr array = null;
            if (raw != null && !raw.isBlank()) {
                try {
                    Json.Value value = Json.parse(raw);
                    if (value instanceof Json.Obj o) obj = o;
                    else if (value instanceof Json.Arr a) array = a;
                } catch (RuntimeException ignored) {
                    // Keep the status. The caller reports a plain GitHub error.
                }
            }
            return new Api(status, obj, array);
        }
    }
}
