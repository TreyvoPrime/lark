package lark;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.EnumSet;
import java.util.Set;

/** Preferences stored in the home folder. The GitHub token never leaves this machine except for GitHub. */
public final class Settings {
    public static final String VERSION = "1.0.0";
    public static final Set<String> THEMES = Set.of("ink", "paper", "tide", "copper", "chalk");

    public String theme = "ink";
    public String githubToken = "";
    public String githubLogin = "";
    public String lastProject = "";
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
            String theme = obj.str("theme", "ink");
            settings.theme = THEMES.contains(theme) ? theme : "ink";
            settings.githubToken = obj.str("githubToken", "");
            settings.githubLogin = obj.str("githubLogin", "");
            settings.lastProject = obj.str("lastProject", "");
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
                    .put("githubToken", githubToken == null ? "" : githubToken)
                    .put("githubLogin", githubLogin == null ? "" : githubLogin)
                    .put("lastProject", lastProject == null ? "" : lastProject)
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

    public Path projectsDir() {
        return home().resolve("projects");
    }
}
