package lark;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/** Preferences stored in the home folder. The GitHub token never leaves this machine except for GitHub. */
public final class Settings {
    public static final String VERSION = "1.6.7";
    /** Default public update feed — always the latest GitHub release JSON companion. */
    public static final String DEFAULT_UPDATE_FEED =
            "https://github.com/TreyvoPrime/lark/releases/latest/download/update.json";
    public static final Set<String> THEMES = Set.of("desk", "daylight", "moss", "ember", "fog");
    private static final Map<String, String> THEME_ALIASES = Map.of(
            "ink", "desk",
            "paper", "daylight",
            "tide", "moss",
            "copper", "ember",
            "chalk", "fog"
    );

    public String theme = "desk";
    public int fontSize = 14;
    public int zoom = 100;
    public String githubToken = "";
    public String githubRefreshToken = "";
    public long githubTokenExpiresAt;
    public String githubLogin = "";
    public String githubClientId = "";
    public String githubClientSecret = "";
    public String githubAppSlug = "";
    public String lastProject = "";
    public String updateFeed = "";
    public String skippedUpdate = "";
    public long lastUpdateCheck;
    public boolean initialized;

    private final Path file;

    private Settings(Path file) {
        this.file = file;
    }

    public static Path home() {
        String override = System.getenv("LARK_HOME");
        if (override != null && !override.isBlank()) return Path.of(override);
        return Path.of(System.getProperty("user.home"), ".lark");
    }

    public static Settings load() {
        Path file = home().resolve("settings.json");
        Settings settings = new Settings(file);
        if (!Files.isRegularFile(file)) return settings;
        try {
            Json.Obj obj = Json.parseObj(Files.readString(file));
            String theme = obj.str("theme", "desk");
            theme = THEME_ALIASES.getOrDefault(theme, theme);
            settings.theme = THEMES.contains(theme) ? theme : "desk";
            int loadedFont = (int) obj.longVal("fontSize");
            settings.fontSize = loadedFont > 0 ? clamp(loadedFont, 11, 28, 14) : 14;
            int loadedZoom = (int) obj.longVal("zoom");
            settings.zoom = loadedZoom > 0 ? clamp(loadedZoom, 80, 160, 100) : 100;
            settings.githubToken = obj.str("githubToken", "");
            settings.githubRefreshToken = obj.str("githubRefreshToken", "");
            settings.githubTokenExpiresAt = obj.longVal("githubTokenExpiresAt");
            settings.githubLogin = obj.str("githubLogin", "");
            settings.githubClientId = obj.str("githubClientId", "");
            settings.githubClientSecret = obj.str("githubClientSecret", "");
            settings.githubAppSlug = obj.str("githubAppSlug", "");
            settings.lastProject = obj.str("lastProject", "");
            settings.updateFeed = obj.str("updateFeed", "");
            settings.skippedUpdate = obj.str("skippedUpdate", "");
            settings.lastUpdateCheck = obj.longVal("lastUpdateCheck");
            settings.initialized = obj.bool("initialized");
        } catch (RuntimeException | IOException ignored) {
            // A broken settings file should not stop the editor from opening.
        }
        return settings;
    }

    public synchronized void save() {
        try {
            Files.createDirectories(file.getParent());
            Json.Obj obj = new Json.Obj()
                    .put("theme", theme)
                    .put("fontSize", fontSize)
                    .put("zoom", zoom)
                    .put("githubToken", githubToken == null ? "" : githubToken)
                    .put("githubRefreshToken", githubRefreshToken == null ? "" : githubRefreshToken)
                    .put("githubTokenExpiresAt", githubTokenExpiresAt)
                    .put("githubLogin", githubLogin == null ? "" : githubLogin)
                    .put("githubClientId", githubClientId == null ? "" : githubClientId)
                    .put("githubClientSecret", githubClientSecret == null ? "" : githubClientSecret)
                    .put("githubAppSlug", githubAppSlug == null ? "" : githubAppSlug)
                    .put("lastProject", lastProject == null ? "" : lastProject)
                    .put("updateFeed", updateFeed == null ? "" : updateFeed)
                    .put("skippedUpdate", skippedUpdate == null ? "" : skippedUpdate)
                    .put("lastUpdateCheck", lastUpdateCheck)
                    .put("initialized", initialized);
            Files.writeString(file, obj.write());
            try {
                Files.setPosixFilePermissions(file, EnumSet.of(
                        PosixFilePermission.OWNER_READ,
                        PosixFilePermission.OWNER_WRITE));
            } catch (UnsupportedOperationException ignored) {
                // Windows has no POSIX permissions.
            }
        } catch (IOException e) {
            throw new RequestFail(500, "Couldn't save settings.");
        }
    }

    public void clearGithubSession() {
        githubToken = "";
        githubRefreshToken = "";
        githubTokenExpiresAt = 0;
        githubLogin = "";
    }

    public Path projectsDir() {
        return home().resolve("projects");
    }

    public static int clamp(int value, int min, int max, int fallback) {
        if (value < min || value > max) return fallback;
        return value;
    }
}
