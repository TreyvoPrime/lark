package lark;

/** State failures must be rejected before any network token exchange. */
public final class GitHubAuthCheck {
    public static void main(String[] args) {
        GitHub github = new GitHub(Settings.load());
        String url = github.beginLogin("http://127.0.0.1:8767").str("url");
        String state = url.substring(url.lastIndexOf("state=") + 6);
        String manifest = github.beginPage(state);
        check(manifest.contains("&quot;hook_attributes&quot;:{&quot;url&quot;:&quot;https://lark.rocks/&quot;,&quot;active&quot;:false}"));
        check(github.oauthPage("unused", "wrong", "", "").contains("Sign-in expired"));
        check(github.oauthPage("unused", "", "", "").contains("Sign-in expired"));
        check(github.oauthPage("", state, "access_denied", "Cancelled").contains("Not signed in"));
        check(github.oauthPage("unused", state, "", "").contains("Sign-in expired"));
        System.out.println("GitHub state checks passed");
    }
    private static void check(boolean result) {
        if (!result) throw new AssertionError("Authentication state regression");
    }
}
