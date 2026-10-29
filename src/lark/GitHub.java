package lark;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

/** Pushes and pulls a project through the GitHub API. Git itself is not required. */
public final class GitHub {
    private final Settings settings;
    private volatile HttpClient http;

    private final SecureRandom random = new SecureRandom();
    private volatile int generation;
    private String pendingState = "";
    private String pendingBase = "";
    private long pendingUntil;
    private boolean expectInstall;

    public GitHub(Settings settings) {
        this.settings = settings;
    }

    private HttpClient http() {
        HttpClient client = http;
        if (client != null) return client;
        synchronized (this) {
            if (http == null) {
                http = HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(15))
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .build();
            }
            return http;
        }
    }

    public synchronized Json.Obj saveToken(String token) {
        pendingState = "";
        pendingUntil = 0;
        if (token == null || token.isBlank()) {
            settings.clearGithubSession();
            settings.save();
            generation++;
            return new Json.Obj().put("ok", true).put("login", "");
        }
        token = cleanToken(token);
        if (token.length() < 20) {
            throw new RequestFail(400, "That doesn't look like a complete GitHub token. Copy the whole token and paste it again.");
        }
        Api user = call(token, "GET", "/user", null);
        if (user.status == 401 || user.status == 403) {
            throw new RequestFail(401, explainRejectedToken(token, user));
        }
        expectOk(token, user);
        String login = user.obj == null ? "" : user.obj.str("login", "");
        if (login.isBlank()) throw new RequestFail(502, "GitHub didn't return an account name.");
        settings.githubToken = token;
        settings.githubLogin = login;
        // A pasted personal access token does not expire the way app tokens do.
        if (!token.startsWith("ghu_") && !token.startsWith("gho_")) {
            settings.githubRefreshToken = "";
            settings.githubTokenExpiresAt = 0;
        }
        settings.save();
        generation++;
        return new Json.Obj().put("ok", true).put("login", login);
    }

    public void storeOAuthTokens(String accessToken, String refreshToken, long expiresInSeconds) {
        accessToken = cleanToken(accessToken);
        if (accessToken.isBlank()) throw new RequestFail(401, "GitHub didn't return an access token.");
        settings.githubToken = accessToken;
        settings.githubRefreshToken = refreshToken == null ? "" : refreshToken.trim();
        if (expiresInSeconds > 0) {
            settings.githubTokenExpiresAt = System.currentTimeMillis() + Math.max(60, expiresInSeconds - 120) * 1000L;
        } else {
            settings.githubTokenExpiresAt = 0;
        }
        Api user = call(accessToken, "GET", "/user", null);
        if (user.status == 401 || user.status == 403) {
            settings.clearGithubSession();
            settings.save();
            throw new RequestFail(401, explainRejectedToken(accessToken, user));
        }
        expectOk(accessToken, user);
        String login = user.obj == null ? "" : user.obj.str("login", "");
        if (login.isBlank()) throw new RequestFail(502, "GitHub didn't return an account name.");
        settings.githubLogin = login;
        settings.save();
        generation++;
    }

    public synchronized Json.Obj beginLogin(String base) {
        String state = newState();
        pendingState = state;
        pendingBase = base;
        pendingUntil = System.currentTimeMillis() + 15 * 60_000L;
        expectInstall = false;
        String url;
        if (settings.githubClientId == null || settings.githubClientId.isBlank()) {
            url = base + "/api/github/begin?state=" + enc(state);
        } else {
            url = authorizeUrl(base, state);
        }
        return new Json.Obj().put("ok", true).put("url", url).put("generation", generation);
    }

    public Json.Obj status() {
        boolean tokenSet = settings.githubToken != null && !settings.githubToken.isBlank();
        return new Json.Obj()
                .put("ok", true)
                .put("tokenSet", tokenSet)
                .put("login", settings.githubLogin == null ? "" : settings.githubLogin)
                .put("generation", generation);
    }

    public synchronized String beginPage(String state) {
        if (!fresh(state)) return page("Sign-in expired", "<p>Close this window and click Sign in with GitHub again.</p>");
        String appName = "Lark " + state.substring(0, 4);
        Json.Obj manifest = new Json.Obj()
                .put("name", appName)
                .put("url", pendingBase + "/")
                .put("description", "Lark edits Java on this computer and clones repositories you choose.")
                .put("redirect_url", pendingBase + "/api/github/created/" + state)
                .put("callback_urls", new Json.Arr().add(pendingBase + "/api/github/oauth"))
                .put("public", false)
                .put("request_oauth_on_install", true)
                .put("default_events", new Json.Arr())
                .put("default_permissions", new Json.Obj().put("contents", "write").put("metadata", "read"))
                .put("hook_attributes", new Json.Obj().put("url", "https://lark.rocks/").put("active", false));
        return """
                <!DOCTYPE html>
                <html lang="en"><head><meta charset="utf-8"><title>Sign in to GitHub</title>
                <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#12110f;color:#f3eee4;font-family:Inter,Segoe UI,sans-serif}
                main{width:min(460px,calc(100% - 32px));background:#1c1a17;border:1px solid #322e28;border-radius:16px;padding:24px}
                h1{font-family:Georgia,serif;font-weight:500;font-size:32px;margin:0 0 8px}
                p{color:#a3988a;line-height:1.5}button{background:#e3a45a;color:#2a1c0c;border:0;border-radius:10px;padding:12px 16px;font-weight:700;cursor:pointer}</style>
                </head><body><main>
                <h1>Continue on GitHub</h1>
                <p>GitHub will ask you to add Lark to your account, then to authorize it. Choose the repositories you want Lark to access. Lark never sees your GitHub password.</p>
                <form method="post" action="https://github.com/settings/apps/new">
                <input type="hidden" name="manifest" value="__MANIFEST__">
                <button type="submit">Continue to GitHub</button>
                </form></main>
                </body></html>
                """.replace("__MANIFEST__", esc(manifest.write()));
    }

    public synchronized String createdPage(String state, String code) {
        if (!fresh(state)) return page("Sign-in expired", "<p>Close this window and click Sign in with GitHub again.</p>");
        if (code == null || code.isBlank()) {
            return page("GitHub didn't finish", "<p>Close this window and click Sign in with GitHub again.</p>");
        }
        Api created = postAbsolute("https://api.github.com/app-manifests/" + enc(code) + "/conversions", null, "application/vnd.github+json");
        if (created.status < 200 || created.status >= 300 || created.obj == null) {
            return page("GitHub didn't add Lark", "<p>" + esc(githubMessage(created)) + "</p>");
        }
        String clientId = created.obj.str("client_id", "");
        String secret = created.obj.str("client_secret", "");
        String slug = created.obj.str("slug", "");
        if (clientId.isBlank() || secret.isBlank() || !slug.matches("[A-Za-z0-9-]{1,80}")) {
            return page("GitHub didn't add Lark", "<p>The response was missing the app details. Close this window and try again.</p>");
        }
        settings.githubClientId = clientId;
        settings.githubClientSecret = secret;
        settings.githubAppSlug = slug;
        settings.save();
        expectInstall = true;
        String install = "https://github.com/apps/" + slug + "/installations/new?state=" + enc(state);
        return page("Choose your repositories", """
                <p>On the next GitHub page, choose the repositories you want Lark to access and authorize Lark. Then this window can close.</p>
                <p><a href="%s">Continue to GitHub</a></p>
                """.formatted(esc(install)));
    }

    public synchronized String oauthPage(String code, String state, String error, String description) {
        if (!fresh(state)) return page("Sign-in expired", "<p>Close this window and click Sign in with GitHub again.</p>");
        if (error != null && !error.isBlank()) {
            pendingState = "";
            String extra = "";
            if (settings.githubAppSlug != null && settings.githubAppSlug.matches("[A-Za-z0-9-]{1,80}")) {
                extra = "<p><a href=\"https://github.com/apps/" + settings.githubAppSlug
                        + "/installations/new\">Choose repositories on GitHub</a></p>";
            }
            String why = description == null || description.isBlank() ? "Authorization was cancelled." : description;
            return page("Not signed in", "<p>" + esc(why) + "</p>" + extra);
        }
        if (code == null || code.isBlank()) {
            return page("GitHub didn't finish", "<p>Close this window and click Sign in with GitHub again.</p>");
        }
        pendingState = "";
        Json.Obj body = new Json.Obj()
                .put("client_id", settings.githubClientId)
                .put("client_secret", settings.githubClientSecret)
                .put("code", code)
                .put("redirect_uri", pendingBase + "/api/github/oauth");
        Api token = postAbsolute("https://github.com/login/oauth/access_token", body.write(), "application/json");
        if (token.obj == null || token.obj.str("access_token") == null) {
            return page("GitHub didn't authorize Lark", "<p>" + esc(githubMessage(token)) + "</p>");
        }
        try {
            applyTokenResponse(token.obj);
            expectInstall = false;
            pendingState = "";
            String login = settings.githubLogin == null ? "" : settings.githubLogin;
            return page("Signed in", "<p>Lark is connected as @" + esc(login) + ". You can close this window.</p>");
        } catch (RequestFail e) {
            return page("GitHub didn't authorize Lark", "<p>" + esc(e.getMessage()) + "</p>");
        }
    }

    private void applyTokenResponse(Json.Obj body) {
        String access = body.str("access_token", "");
        String refresh = body.str("refresh_token", "");
        long expires = body.longVal("expires_in");
        if (expires <= 0) {
            String raw = body.str("expires_in", "");
            if (!raw.isBlank()) {
                try { expires = Long.parseLong(raw.trim()); } catch (NumberFormatException ignored) { expires = 0; }
            }
        }
        storeOAuthTokens(access, refresh, expires);
    }

    private synchronized void refreshAccessToken() {
        if (settings.githubRefreshToken == null || settings.githubRefreshToken.isBlank()) {
            throw new RequestFail(401, "Your GitHub sign-in expired. Open GitHub in Lark and connect again.");
        }
        if (settings.githubClientId == null || settings.githubClientId.isBlank()
                || settings.githubClientSecret == null || settings.githubClientSecret.isBlank()) {
            throw new RequestFail(401, "Your GitHub sign-in expired. Open GitHub in Lark and connect again.");
        }
        Json.Obj body = new Json.Obj()
                .put("client_id", settings.githubClientId)
                .put("client_secret", settings.githubClientSecret)
                .put("grant_type", "refresh_token")
                .put("refresh_token", settings.githubRefreshToken);
        Api token = postAbsolute("https://github.com/login/oauth/access_token", body.write(), "application/json");
        if (token.obj == null || token.obj.str("access_token") == null) {
            settings.clearGithubSession();
            settings.save();
            generation++;
            throw new RequestFail(401, "GitHub needs you to connect again. Your last sign-in expired.");
        }
        applyTokenResponse(token.obj);
    }

    private String authorizeUrl(String base, String state) {
        return "https://github.com/login/oauth/authorize?client_id=" + enc(settings.githubClientId)
                + "&redirect_uri=" + enc(base + "/api/github/oauth")
                + "&state=" + enc(state);
    }

    private boolean fresh(String state) {
        return state != null && !state.isBlank() && state.equals(pendingState) && System.currentTimeMillis() <= pendingUntil;
    }

    private String newState() {
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format("%02x", b));
        return out.toString();
    }

    public Json.Obj repos() {
        String token = requireToken();
        Json.Arr repos = new Json.Arr();
        for (int page = 1; page <= 5; page++) {
            Api res = call(token, "GET", "/user/repos?per_page=100&page=" + page
                    + "&sort=updated&affiliation=owner,collaborator,organization_member", null);
            expectOk(token, res);
            int count = 0;
            if (res.array != null) {
                for (Json.Value value : res.array.values()) {
                    if (!(value instanceof Json.Obj repo)) continue;
                    count++;
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
            if (count < 100) break;
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

    private Api postAbsolute(String url, String json, String accept) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(45))
                    .header("Accept", accept)
                    .header("User-Agent", "Lark-IDE");
            if (json == null) builder.POST(HttpRequest.BodyPublishers.noBody());
            else {
                builder.header("Content-Type", "application/json");
                builder.POST(HttpRequest.BodyPublishers.ofString(json));
            }
            HttpResponse<String> response = http().send(builder.build(), HttpResponse.BodyHandlers.ofString());
            return Api.parse(response.statusCode(), response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RequestFail(502, "The GitHub request was interrupted.");
        } catch (IOException e) {
            throw new RequestFail(502, "Couldn't reach GitHub.");
        }
    }

    private static String githubMessage(Api res) {
        if (res == null) return "GitHub didn't answer.";
        if (res.obj != null) {
            String description = res.obj.str("error_description");
            if (description != null && !description.isBlank()) return description;
            String message = res.obj.str("message");
            if (message != null && !message.isBlank()) return message;
            String error = res.obj.str("error");
            if (error != null && !error.isBlank()) return error;
        }
        return "GitHub returned " + res.status + ".";
    }

    private static String page(String title, String body) {
        return """
                <!DOCTYPE html>
                <html lang="en"><head><meta charset="utf-8"><title>__TITLE__</title>
                <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#12110f;color:#f3eee4;font-family:Inter,Segoe UI,sans-serif}
                main{width:min(460px,calc(100% - 32px));background:#1c1a17;border:1px solid #322e28;border-radius:16px;padding:24px}
                h1{font-family:Georgia,serif;font-weight:500;font-size:32px;margin:0 0 8px}p,a{line-height:1.5}p{color:#a3988a}a{color:#e3a45a}</style>
                </head><body><main><h1>__TITLE__</h1>__BODY__</main></body></html>
                """.replace("__TITLE__", esc(title)).replace("__BODY__", body);
    }

    private static String esc(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private Api call(String token, String method, String path, String body) {
        Api first = callOnce(token, method, path, body);
        if (first.status != 401 && first.status != 403) return first;
        if (settings.githubRefreshToken == null || settings.githubRefreshToken.isBlank()) return first;
        if (token == null || !token.equals(settings.githubToken)) return first;
        try {
            refreshAccessToken();
        } catch (RequestFail ignored) {
            return first;
        }
        return callOnce(settings.githubToken, method, path, body);
    }

    private Api callOnce(String token, String method, String path, String body) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("https://api.github.com" + path))
                    .timeout(Duration.ofSeconds(45))
                    .header("Authorization", "Bearer " + token)
                    .header("Accept", "application/vnd.github+json")
                    .header("User-Agent", "Lark-IDE/" + Settings.VERSION)
                    .header("X-GitHub-Api-Version", "2022-11-28");
            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.header("Content-Type", "application/json");
                builder.method(method, HttpRequest.BodyPublishers.ofString(body));
            }
            HttpResponse<String> response = http().send(builder.build(), HttpResponse.BodyHandlers.ofString());
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
        if (res.status == 401 || res.status == 403) {
            message = explainRejectedToken(token, res);
        } else if (message.toLowerCase(Locale.ROOT).contains("resource not accessible")) {
            message = "That GitHub token can see your account, but not this repository. "
                    + "Create a classic token with the repo scope, or give a fine-grained token Contents access to the repos you need.";
        }
        int status = res.status == 401 ? 401 : (res.status >= 400 && res.status < 500 ? 400 : 502);
        throw new RequestFail(status, message);
    }

    private String requireToken() {
        ensureFreshToken();
        if (settings.githubToken == null || settings.githubToken.isBlank()) {
            throw new RequestFail(400, "Connect to GitHub first.");
        }
        return settings.githubToken;
    }

    private synchronized void ensureFreshToken() {
        if (settings.githubToken == null || settings.githubToken.isBlank()) return;
        if (settings.githubTokenExpiresAt <= 0) return;
        if (System.currentTimeMillis() < settings.githubTokenExpiresAt) return;
        refreshAccessToken();
    }

    private static String cleanToken(String token) {
        if (token == null) return "";
        return token.trim().replaceAll("\\s+", "");
    }

    private String explainRejectedToken(String token, Api res) {
        String raw = githubMessage(res).toLowerCase(Locale.ROOT);
        if (token != null && token.startsWith("github_pat_")) {
            return "GitHub rejected that fine-grained token. For Lark, create a classic token with the repo scope "
                    + "(it starts with ghp_), then paste it here.";
        }
        if (raw.contains("bad credentials") || raw.contains("invalid") || raw.contains("expired")
                || raw.contains("requires authentication")) {
            return "GitHub says that token is invalid or expired. Create a new classic token with the repo scope and paste it again.";
        }
        if (raw.contains("resource not accessible")) {
            return "That token cannot reach the repositories Lark needs. Create a classic token with the repo scope.";
        }
        String message = githubMessage(res);
        if (message.isBlank() || message.startsWith("GitHub returned")) {
            return "GitHub didn't accept that token. Create a classic token with the repo scope and try again.";
        }
        return message;
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
