package lark;

import java.nio.file.Files;
import java.nio.file.Path;

public final class ShareRelaySettingsCheck {
    public static void main(String[] args) throws Exception {
        Path file = Settings.home().resolve("settings.json");
        Files.createDirectories(file.getParent());
        Files.deleteIfExists(file);
        check(Settings.load().shareRelayUrl.equals(Settings.DEFAULT_SHARE_RELAY), "new install default");
        Files.writeString(file, "{\"shareRelayUrl\":\"\"}");
        check(Settings.load().shareRelayUrl.equals(Settings.DEFAULT_SHARE_RELAY), "legacy empty value");
        Files.writeString(file, "{\"shareRelayUrl\":\"https://example.org\"}");
        check(Settings.load().shareRelayUrl.equals("https://example.org"), "existing custom relay");
        Files.writeString(file, "{\"shareRelayUrl\":\"http://unsafe.example\",\"shareRelayConfigured\":true}");
        check(Settings.load().shareRelayUrl.equals(Settings.DEFAULT_SHARE_RELAY), "invalid relay migration");
        Settings settings = Settings.load(); settings.shareRelayUrl = ""; settings.save();
        check(Settings.load().shareRelayUrl.isEmpty(), "explicit local network choice");
        System.out.println("Default relay, existing custom relay, and local-network preference verified.");
    }
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
}
