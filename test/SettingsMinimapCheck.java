package lark;

import java.nio.file.Files;
import java.nio.file.Path;

/** Run with LARK_HOME set to an isolated, disposable directory. */
public final class SettingsMinimapCheck {
    public static void main(String[] args) throws Exception {
        Path home = Settings.home();
        Path file = home.resolve("settings.json");
        if (System.getenv("LARK_HOME") == null || Files.exists(file))
            throw new IllegalStateException("Use an empty, isolated LARK_HOME");
        Files.createDirectories(home);
        if (!Settings.load().minimapEnabled) throw new AssertionError("new default");
        Files.writeString(file, "{}");
        if (Settings.load().minimapEnabled) throw new AssertionError("legacy default");
        Files.writeString(file, "{\"minimapEnabled\":true}");
        if (!Settings.load().minimapEnabled) throw new AssertionError("saved on");
        Files.writeString(file, "{\"minimapEnabled\":false}");
        if (Settings.load().minimapEnabled) throw new AssertionError("saved off");
        Settings saved = Settings.load(); saved.shareBird = "falcon"; saved.save();
        if (!Settings.load().shareBird.equals("falcon")) throw new AssertionError("saved bird");
        for (String bird : new String[]{"parrot", "puffin", "kingfisher", "flamingo", "woodpecker", "toucan", "penguin", "peacock", "cockatiel", "bluebird"}) {
            saved.shareBird = bird; saved.save();
            if (!Settings.load().shareBird.equals(bird)) throw new AssertionError("saved bird: " + bird);
        }
        for (String theme : new String[]{"lark-twilight", "lark-meadow"}) {
            saved.theme = theme; saved.save();
            if (!Settings.load().theme.equals(theme)) throw new AssertionError("saved theme: " + theme);
        }
        System.out.println("minimap and bird settings checks passed");
    }
}
