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
import java.nio.file.attribute.PosixFilePermission;
import java.time.Duration;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Checks a remote update feed and stages a new lark.jar beside the running copy. */
public final class Updates {
    private final Settings settings;
    private volatile HttpClient http;

    public Updates(Settings settings) {
        this.settings = settings;
    }

    private HttpClient http() {
        HttpClient client = http;
        if (client != null) return client;
        synchronized (this) {
            if (http == null) {
                http = HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(10))
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .build();
            }
            return http;
        }
    }

    public Json.Obj check() {
        String feed = resolveFeed();
        boolean desktop = Desktop.isDesktop();
        Json.Obj result = new Json.Obj()
                .put("ok", true)
                .put("current", Settings.VERSION)
                .put("feed", feed == null ? "" : feed)
                .put("available", false)
                .put("edition", desktop ? "desktop" : "portable")
                .put("prompt", desktop);
        if (feed == null || feed.isBlank()) {
            return result.put("message", "No update feed is set.");
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
            // Desktop prompts every launch until updated; skip only soft-dismisses once.
            boolean skippedThis = newer && latest.equals(skipped) && !desktop;
            String download = info.download;
            result.put("available", newer && !skippedThis)
                    .put("latest", latest)
                    .put("notes", notes)
                    .put("download", download == null ? "" : download)
                    .put("skipped", skippedThis)
                    .put("page", info.page == null ? "" : info.page)
                    .put("required", desktop && newer);
            if (!newer) result.put("message", "You're on the latest Lark (" + Settings.VERSION + ").");
            else if (skippedThis) result.put("message", "Update " + latest + " is available, but you skipped it.");
            else if (desktop) result.put("message", "Lark Desktop " + latest + " is ready — update to keep your install current.");
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
            if (name.contains("desktop") && name.contains("update")) {
                downloads.put("desktop", url);
                if (name.contains("windows")) downloads.put("desktop-windows", url);
                else if (name.contains("mac") || name.contains("darwin")) downloads.put("desktop-mac", url);
                else if (name.contains("linux")) downloads.put("desktop-linux", url);
            } else if (name.contains("desktop") && name.contains("windows")) {
                downloads.put("desktop-windows", url);
            } else if (name.contains("desktop") && (name.contains("mac") || name.contains("darwin"))) {
                downloads.put("desktop-mac", url);
            } else if (name.contains("desktop") && name.contains("linux")) {
                downloads.put("desktop-linux", url);
            } else if (name.contains("windows")) downloads.put("windows", url);
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
        Path target = installDir.resolve("lark.jar");
        Path bak = installDir.resolve("lark.jar.bak");
        try {
            zip = Files.createTempFile("lark-update-", ".zip");
            downloadTo(downloadUrl, zip);
            // Seed launchers from the running jar first, then let the update zip
            // overwrite them. Never refresh AFTER extract — that would clobber the
            // new Start Lark.bat with the old one still loaded in memory.
            refreshLaunchers(installDir);
            if (Desktop.isDesktop()) refreshDesktopLaunchers(installDir);
            extractUpdate(zip, extracted, installDir);
            try {
                Files.move(extracted, pending, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(extracted, pending, StandardCopyOption.REPLACE_EXISTING);
            }
            if (!Files.isRegularFile(pending)) {
                throw new RequestFail(500, "The update downloaded, but Lark couldn't stage the new jar.");
            }
            // Windows Start Lark runs a COPY under %LOCALAPPDATA%\Lark\run, so the
            // install jar is usually free to replace while Lark is open. If AV or
            // Explorer still holds it, leave .pending for the launcher's retry loop.
            boolean applied = tryApplyPending(pending, target, bak);
            if (!applied) {
                for (int i = 0; i < 20 && !applied; i++) {
                    try {
                        Thread.sleep(300);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                    applied = tryApplyPending(pending, target, bak);
                }
            }
            if (applied) {
                return new Json.Obj()
                        .put("ok", true)
                        .put("pending", false)
                        .put("applied", true)
                        .put("canRestart", true)
                        .put("message", "Update installed. Click Restart Lark to open the new version.");
            }
            return new Json.Obj()
                    .put("ok", true)
                    .put("pending", true)
                    .put("applied", false)
                    .put("canRestart", true)
                    .put("message", "Update downloaded. Click Restart Lark — Start Lark will finish swapping the jar (close other Lark windows if it asks).");
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

    /** Spawns the portable or desktop launcher, then exits so Windows can finish any jar swap. */
    public Json.Obj restart() {
        Path dir = installDir();
        if (dir == null) throw new RequestFail(500, "Lark couldn't find its install folder.");
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        boolean desktop = Desktop.isDesktop();
        try {
            refreshLaunchers(dir);
            refreshDesktopLaunchers(dir);
            if (windows) {
                Path script;
                if (desktop) {
                    Path vbs = dir.resolve("Launch Lark Desktop.vbs");
                    Path bat = dir.resolve("Launch Lark Desktop.bat");
                    Path finish = dir.resolve("finish-update.bat");
                    if (Files.isRegularFile(vbs)) script = vbs;
                    else if (Files.isRegularFile(bat)) script = bat;
                    else script = Files.isRegularFile(finish) ? finish : dir.resolve("Start Lark.bat");
                } else {
                    Path finish = dir.resolve("finish-update.bat");
                    Path start = dir.resolve("Start Lark.bat");
                    script = Files.isRegularFile(finish) ? finish : start;
                }
                if (!Files.isRegularFile(script)) {
                    throw new RequestFail(500, "A Lark launcher is missing next to the install.");
                }
                new ProcessBuilder("cmd.exe", "/c", "start", "", script.toAbsolutePath().toString())
                        .directory(dir.toFile())
                        .start();
            } else {
                Path start;
                if (desktop) {
                    start = dir.resolve("start-lark-desktop.sh");
                    if (!Files.isRegularFile(start)) start = dir.resolve("Launch Lark Desktop.command");
                } else {
                    start = dir.resolve("start-lark.sh");
                    if (!Files.isRegularFile(start)) start = dir.resolve("Start Lark.command");
                }
                if (!Files.isRegularFile(start)) {
                    throw new RequestFail(500, "A Lark launcher is missing next to the install.");
                }
                new ProcessBuilder("/bin/sh", start.toAbsolutePath().toString())
                        .directory(dir.toFile())
                        .start();
            }
        } catch (RequestFail e) {
            throw e;
        } catch (Exception e) {
            throw new RequestFail(500, e.getMessage() == null ? "Couldn't restart Lark." : e.getMessage());
        }
        // Give finish-update.bat time to start before this JVM exits and unlocks files.
        Thread stopper = new Thread(() -> {
            try {
                Thread.sleep(1500);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            System.exit(0);
        }, "lark-restart");
        stopper.setDaemon(true);
        stopper.start();
        return new Json.Obj()
                .put("ok", true)
                .put("message", desktop ? "Restarting Lark Desktop…" : "Restarting Lark…");
    }

    private static boolean tryApplyPending(Path pending, Path target, Path bak) {
        if (!Files.isRegularFile(pending)) return Files.isRegularFile(target) && !Files.isRegularFile(pending);
        try {
            Files.deleteIfExists(bak);
            if (Files.isRegularFile(target)) {
                Files.move(target, bak, StandardCopyOption.REPLACE_EXISTING);
            }
            Files.move(pending, target, StandardCopyOption.REPLACE_EXISTING);
            Files.deleteIfExists(bak);
            return Files.isRegularFile(target) && !Files.isRegularFile(pending);
        } catch (IOException locked) {
            if (!Files.isRegularFile(target) && Files.isRegularFile(bak)) {
                try {
                    Files.move(bak, target, StandardCopyOption.REPLACE_EXISTING);
                } catch (IOException ignored) {
                    // Pending remains for the next Start Lark.
                }
            }
            return false;
        }
    }

    /** Writes Start Lark launchers from embedded jar resources into the install folder. */
    static void refreshLaunchers(Path installDir) {
        if (installDir == null || !Files.isDirectory(installDir)) return;
        writeLaunchResource("lark/launch/StartLark.bat", installDir.resolve("Start Lark.bat"));
        writeLaunchResource("lark/launch/StartLark.vbs", installDir.resolve("Start Lark.vbs"));
        writeLaunchResource("lark/launch/finish-update.bat", installDir.resolve("finish-update.bat"));
        writeLaunchResource("lark/launch/StopLarkClean.bat", installDir.resolve("Stop Lark and Clean Cache.bat"));
        writeLaunchResource("lark/launch/WipeLark.bat", installDir.resolve("Wipe Lark From This PC.bat"));
        writeLaunchResource("lark/launch/start-lark.sh", installDir.resolve("start-lark.sh"));
        writeLaunchResource("lark/launch/start-lark.sh", installDir.resolve("Start Lark.command"));
        chmodLaunchers(installDir, "start-lark.sh", "Start Lark.command");
    }

    /** Writes Lark Desktop launchers (hidden console / app-window entry). */
    static void refreshDesktopLaunchers(Path installDir) {
        if (installDir == null || !Files.isDirectory(installDir)) return;
        writeLaunchResource("lark/launch/LaunchDesktop.bat", installDir.resolve("Launch Lark Desktop.bat"));
        writeLaunchResource("lark/launch/LaunchDesktop.vbs", installDir.resolve("Launch Lark Desktop.vbs"));
        writeLaunchResource("lark/launch/start-lark-desktop.sh", installDir.resolve("start-lark-desktop.sh"));
        writeLaunchResource("lark/launch/start-lark-desktop.sh", installDir.resolve("Launch Lark Desktop.command"));
        writeLaunchResource("lark/launch/InstallDesktop.ps1", installDir.resolve("Install Lark Desktop.ps1"));
        writeLaunchResource("lark/launch/UninstallDesktop.ps1", installDir.resolve("Uninstall Lark Desktop.ps1"));
        try {
            if (!Files.isRegularFile(installDir.resolve("desktop.marker"))) {
                Files.writeString(installDir.resolve("desktop.marker"), "desktop\n");
            }
        } catch (IOException ignored) {
            // Best-effort channel marker.
        }
        chmodLaunchers(installDir, "start-lark-desktop.sh", "Launch Lark Desktop.command");
    }

    private static void chmodLaunchers(Path installDir, String... names) {
        try {
            Set<PosixFilePermission> perms = EnumSet.of(
                    PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE, PosixFilePermission.OWNER_EXECUTE,
                    PosixFilePermission.GROUP_READ, PosixFilePermission.GROUP_EXECUTE,
                    PosixFilePermission.OTHERS_READ, PosixFilePermission.OTHERS_EXECUTE);
            for (String name : names) {
                Path path = installDir.resolve(name);
                if (Files.isRegularFile(path)) {
                    try {
                        Files.setPosixFilePermissions(path, perms);
                    } catch (UnsupportedOperationException ignored) {
                        // Windows.
                    }
                }
            }
        } catch (IOException ignored) {
            // Best-effort chmod.
        }
    }

    private static void writeLaunchResource(String resource, Path target) {
        try (InputStream in = Updates.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) return;
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ignored) {
            // Keep whatever launcher is already on disk.
        }
    }

    static Path installDir() {
        String prop = System.getProperty("lark.install");
        if (prop != null && !prop.isBlank()) {
            Path dir = Path.of(prop).toAbsolutePath().normalize();
            if (Files.isDirectory(dir)) return dir;
        }
        String env = System.getenv("LARK_INSTALL");
        if (env != null && !env.isBlank()) {
            Path dir = Path.of(env).toAbsolutePath().normalize();
            if (Files.isDirectory(dir)) return dir;
        }
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
        // Always fall back to the public GitHub Releases feed so updates stay available.
        return Settings.DEFAULT_UPDATE_FEED;
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
        String url = "";
        if (Desktop.isDesktop()) {
            url = downloads.str("desktop-" + key, "");
            if (url.isBlank()) url = downloads.str("desktop", "");
        }
        if (url.isBlank()) url = downloads.str(key, "");
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
        HttpResponse<InputStream> response = http().send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new RequestFail(502, "Download failed (" + response.statusCode() + ").");
        }
        try (InputStream in = response.body()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** Pulls lark.jar and refreshes portable launchers from a release zip. */
    private void extractUpdate(Path zip, Path jarOut, Path installDir) throws IOException {
        Files.deleteIfExists(jarOut);
        boolean foundJar = false;
        try (ZipInputStream zin = new ZipInputStream(Files.newInputStream(zip))) {
            ZipEntry entry;
            while ((entry = zin.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                String name = entry.getName().replace('\\', '/');
                String base = name.contains("/") ? name.substring(name.lastIndexOf('/') + 1) : name;
                if ("lark.jar".equals(base)) {
                    Files.copy(zin, jarOut, StandardCopyOption.REPLACE_EXISTING);
                    foundJar = true;
                } else if ("Start Lark.bat".equals(base) || "Start Lark.vbs".equals(base)
                        || "finish-update.bat".equals(base)
                        || "Stop Lark and Clean Cache.bat".equals(base)
                        || "Wipe Lark From This PC.bat".equals(base)
                        || "start-lark.sh".equals(base) || "Start Lark.command".equals(base)
                        || "Launch Lark Desktop.bat".equals(base) || "Launch Lark Desktop.vbs".equals(base)
                        || "start-lark-desktop.sh".equals(base) || "Launch Lark Desktop.command".equals(base)
                        || "Install Lark Desktop.ps1".equals(base) || "Uninstall Lark Desktop.ps1".equals(base)
                        || "desktop.marker".equals(base)) {
                    Files.copy(zin, installDir.resolve(base), StandardCopyOption.REPLACE_EXISTING);
                }
            }
        }
        if (!foundJar) {
            throw new RequestFail(400, "That update zip didn't contain lark.jar.");
        }
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
            HttpResponse<String> response = http().send(builder.build(), HttpResponse.BodyHandlers.ofString());
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
