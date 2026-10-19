package lark;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Checks a remote update feed and stages a new lark.jar beside the running copy. */
public final class Updates {
    private final Settings settings;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public Updates(Settings settings) {
        this.settings = settings;
    }

    public Json.Obj check() {
        String feed = resolveFeed();
        Json.Obj result = new Json.Obj()
                .put("ok", true)
                .put("current", Settings.VERSION)
                .put("feed", feed == null ? "" : feed)
                .put("available", false);
        if (feed == null || feed.isBlank()) {
            return result.put("message",
                    "No update feed is set. Paste one under Aa → Updates, or keep update-feed.url next to Lark.");
        }
        try {
            Api remote = get(normalizeFeed(feed));
            if (remote.status < 200 || remote.status >= 300 || remote.obj == null) {
                return result.put("message", "Couldn't read the update feed (" + remote.status + ").");
            }
            FeedInfo info = parseFeed(feed, remote.obj);
            String latest = info.version;
            String notes = info.notes;
            String skipped = settings.skippedUpdate == null ? "" : settings.skippedUpdate;
            boolean newer = compareVersions(latest, Settings.VERSION) > 0;
            boolean skippedThis = newer && latest.equals(skipped);
            String download = info.download;
            result.put("available", newer && !skippedThis)
                    .put("latest", latest)
                    .put("notes", notes)
                    .put("download", download == null ? "" : download)
                    .put("skipped", skippedThis)
                    .put("page", info.page == null ? "" : info.page);
            if (!newer) result.put("message", "You're on the latest Lark (" + Settings.VERSION + ").");
            else if (skippedThis) result.put("message", "Update " + latest + " is available, but you skipped it.");
            else result.put("message", "Lark " + latest + " is available.");
            settings.lastUpdateCheck = System.currentTimeMillis();
            settings.save();
            return result;
        } catch (RequestFail e) {
            return result.put("message", e.getMessage());
        }
    }

    private record FeedInfo(String version, String notes, String download, String page) {}

    /** Accepts Lark update.json or a GitHub Releases /latest (or repo) URL. */
    private FeedInfo parseFeed(String feed, Json.Obj obj) {
        if (obj.has("tag_name") || obj.has("assets")) {
            String tag = obj.str("tag_name", obj.str("name", "")).trim();
            if (tag.startsWith("v") || tag.startsWith("V")) tag = tag.substring(1);
            String notes = obj.str("body", obj.str("name", ""));
            String page = obj.str("html_url", "");
            Json.Obj downloads = assetsToDownloads(obj.arr("assets"));
            String download = pickDownload(feed, downloads);
            return new FeedInfo(tag, notes, download, page);
        }
        String latest = obj.str("version", "").trim();
        String notes = obj.str("notes", "");
        String download = pickDownload(feed, obj.obj("downloads"));
        String page = obj.str("page", "");
        return new FeedInfo(latest, notes, download, page);
    }

    private static Json.Obj assetsToDownloads(Json.Arr assets) {
        Json.Obj downloads = new Json.Obj();
        if (assets == null) return downloads;
        for (int i = 0; i < assets.size(); i++) {
            if (!(assets.get(i) instanceof Json.Obj asset)) continue;
            String name = asset.str("name", "").toLowerCase(Locale.ROOT);
            String url = asset.str("browser_download_url", "");
            if (url.isBlank()) continue;
            if (name.contains("windows")) downloads.put("windows", url);
            else if (name.contains("mac") || name.contains("darwin")) downloads.put("mac", url);
            else if (name.contains("linux")) downloads.put("linux", url);
            else if (name.equals("lark.zip") || name.endsWith("/lark.zip")) downloads.put("any", url);
            else if (name.contains("lark") && name.endsWith(".zip") && !downloads.has("any")) downloads.put("any", url);
        }
        return downloads;
    }

    static String normalizeFeed(String feed) {
        if (feed == null) return "";
        String value = feed.trim();
        if (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        // https://github.com/owner/repo  -> releases/latest API
        if (value.matches("(?i)https://github\\.com/[^/]+/[^/]+")) {
            return "https://api.github.com/repos/" + value.substring("https://github.com/".length()) + "/releases/latest";
        }
        if (value.matches("(?i)https://github\\.com/[^/]+/[^/]+/releases(/latest)?")) {
            String path = value.substring("https://github.com/".length());
            String[] parts = path.split("/");
            return "https://api.github.com/repos/" + parts[0] + "/" + parts[1] + "/releases/latest";
        }
        return value;
    }

    public Json.Obj install(String downloadUrl) {
        if (downloadUrl == null || downloadUrl.isBlank()) {
            Json.Obj checked = check();
            downloadUrl = checked.str("download", "");
            if (!checked.bool("available") || downloadUrl.isBlank()) {
                throw new RequestFail(400, checked.str("message", "No update is ready to install."));
            }
        }
        Path installDir = installDir();
        if (installDir == null) {
            throw new RequestFail(500, "Lark couldn't find its install folder.");
        }
        Path zip = null;
        Path extracted = installDir.resolve("lark.jar.extracted");
        Path pending = installDir.resolve("lark.jar.pending");
        try {
            zip = Files.createTempFile("lark-update-", ".zip");
            downloadTo(downloadUrl, zip);
            extractJar(zip, extracted);
            try {
                Files.move(extracted, pending, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(extracted, pending, StandardCopyOption.REPLACE_EXISTING);
            }
            if (!Files.isRegularFile(pending)) {
                throw new RequestFail(500, "The update downloaded, but Lark couldn't stage the new jar.");
            }
            return new Json.Obj()
                    .put("ok", true)
                    .put("pending", true)
                    .put("message", "Update ready. Close Lark, then open Start Lark again. The new version loads automatically.");
        } catch (RequestFail e) {
            throw e;
        } catch (Exception e) {
            throw new RequestFail(502, e.getMessage() == null ? "Couldn't install that update." : e.getMessage());
        } finally {
            if (zip != null) {
                try {
                    Files.deleteIfExists(zip);
                } catch (IOException ignored) {
                    // Temp cleanup is best-effort.
                }
            }
            try {
                Files.deleteIfExists(extracted);
            } catch (IOException ignored) {
                // Best-effort.
            }
        }
    }

    public Json.Obj skip(String version) {
        settings.skippedUpdate = version == null ? "" : version.trim();
        settings.save();
        return new Json.Obj().put("ok", true).put("skippedUpdate", settings.skippedUpdate);
    }

    public Json.Obj saveFeed(String feed) {
        settings.updateFeed = feed == null ? "" : feed.trim();
        settings.save();
        return new Json.Obj().put("ok", true).put("updateFeed", settings.updateFeed);
    }

    String resolveFeed() {
        if (settings.updateFeed != null && !settings.updateFeed.isBlank()) return settings.updateFeed.trim();
        String env = System.getenv("LARK_UPDATE_FEED");
        if (env != null && !env.isBlank()) return env.trim();
        Path beside = installDir();
        if (beside != null) {
            Path file = beside.resolve("update-feed.url");
            if (Files.isRegularFile(file)) {
                try {
                    String line = Files.readString(file).trim().lines().findFirst().orElse("").trim();
                    if (!line.isBlank()) {
                        settings.updateFeed = line;
                        settings.save();
                        return line;
                    }
                } catch (IOException ignored) {
                    // Fall through.
                }
            }
        }
        return "";
    }

    static int compareVersions(String a, String b) {
        int[] left = parts(a);
        int[] right = parts(b);
        for (int i = 0; i < 3; i++) {
            if (left[i] != right[i]) return Integer.compare(left[i], right[i]);
        }
        return 0;
    }

    private static int[] parts(String version) {
        int[] out = new int[3];
        if (version == null) return out;
        String clean = version.trim();
        if (clean.startsWith("v") || clean.startsWith("V")) clean = clean.substring(1);
        String[] bits = clean.split("[^0-9]+");
        for (int i = 0; i < Math.min(3, bits.length); i++) {
            if (bits[i].isBlank()) continue;
            try {
                out[i] = Integer.parseInt(bits[i]);
            } catch (NumberFormatException ignored) {
                out[i] = 0;
            }
        }
        return out;
    }

    private String pickDownload(String feed, Json.Obj downloads) {
        if (downloads == null) return null;
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String key = "linux";
        if (os.contains("win")) key = "windows";
        else if (os.contains("mac")) key = "mac";
        String url = downloads.str(key, "");
        if (url.isBlank()) url = downloads.str("any", "");
        if (url.isBlank()) return null;
        return absolutize(feed, url);
    }

    private static String absolutize(String feed, String url) {
        try {
            return URI.create(feed).resolve(url).toString();
        } catch (Exception e) {
            return url;
        }
    }

    private void downloadTo(String url, Path target) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofMinutes(3))
                .header("User-Agent", "Lark-IDE/" + Settings.VERSION)
                .GET()
                .build();
        HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new RequestFail(502, "Download failed (" + response.statusCode() + ").");
        }
        try (InputStream in = response.body()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void extractJar(Path zip, Path out) throws IOException {
        Files.deleteIfExists(out);
        try (ZipInputStream zin = new ZipInputStream(Files.newInputStream(zip))) {
            ZipEntry entry;
            while ((entry = zin.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                String name = entry.getName().replace('\\', '/');
                String base = name.contains("/") ? name.substring(name.lastIndexOf('/') + 1) : name;
                if (!"lark.jar".equals(base)) continue;
                Files.copy(zin, out, StandardCopyOption.REPLACE_EXISTING);
                return;
            }
        }
        throw new RequestFail(400, "That update zip didn't contain lark.jar.");
    }

    static Path installDir() {
        try {
            var location = Lark.class.getProtectionDomain().getCodeSource().getLocation();
            if (location != null) {
                Path path = Path.of(location.toURI());
                if (Files.isRegularFile(path) && path.getFileName().toString().endsWith(".jar")) {
                    return path.getParent();
                }
            }
        } catch (Exception ignored) {
            // Fall through to the working directory.
        }
        return Path.of("").toAbsolutePath().normalize();
    }

    private Api get(String url) {
        try {
            boolean github = url.contains("api.github.com");
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(20))
                    .header("User-Agent", "Lark-IDE/" + Settings.VERSION)
                    .GET();
            if (github) {
                builder.header("Accept", "application/vnd.github+json");
                builder.header("X-GitHub-Api-Version", "2022-11-28");
            } else {
                builder.header("Accept", "application/json");
            }
            HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            return Api.parse(response.statusCode(), response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RequestFail(502, "The update check was interrupted.");
        } catch (IOException e) {
            throw new RequestFail(502, "Couldn't reach the update feed.");
        }
    }

    private record Api(int status, Json.Obj obj) {
        static Api parse(int status, String raw) {
            Json.Obj obj = null;
            if (raw != null && !raw.isBlank()) {
                try {
                    Json.Value value = Json.parse(raw);
                    if (value instanceof Json.Obj o) obj = o;
                } catch (RuntimeException ignored) {
                    // Keep status only.
                }
            }
            return new Api(status, obj);
        }
    }
}
