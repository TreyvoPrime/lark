package lark;

public final class UpdateUrlCheck {
    public static void main(String[] args) {
        String good = "https://github.com/TreyvoPrime/lark/releases/download/v4.4/lark-desktop-update.zip";
        if (!Updates.allowedDownloadUrl(good)) throw new AssertionError("Official versioned release rejected");
        for (String bad : new String[]{"https://github.com.evil.example/TreyvoPrime/lark/releases/download/v4.4/lark.zip", "https://github.com/other/lark/releases/download/v4.4/lark.zip", "https://github.com/TreyvoPrime/lark/releases/download/v4.4/%2e%2e/file"})
            if (Updates.allowedDownloadUrl(bad)) throw new AssertionError("Untrusted URL accepted: " + bad);
        System.out.println("Official versioned update URL accepted; untrusted URLs rejected.");
    }
}
