package rocks.lark.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.*;
import android.widget.*;

/** Secure browser client. Java compilation stays on the explicitly connected host. */
public final class MainActivity extends Activity {
    private WebView editor;
    private Uri host;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(16,16,16,16);
        TextView title = new TextView(this); title.setText("Lark Mobile · Connect to your host\nEnter the HTTPS phone link shown by Lark Mobile. Java runs on that host. The host certificate must be trusted by Android."); layout.addView(title);
        EditText address = new EditText(this); address.setSingleLine(true); address.setHint("https://host:43125/?pair=…"); address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); layout.addView(address);
        Button connect = new Button(this); connect.setText("Connect"); layout.addView(connect);
        editor = new WebView(this); layout.addView(editor, new LinearLayout.LayoutParams(-1, 0, 1));
        WebSettings settings = editor.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        editor.setWebChromeClient(new WebChromeClient()); // Enable the editor's native alert/confirm/prompt flows.
        CookieManager.getInstance().setAcceptThirdPartyCookies(editor, false);
        editor.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl(); return host == null || !"https".equals(uri.getScheme()) || !host.getHost().equals(uri.getHost()) || host.getPort()!=uri.getPort();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) Toast.makeText(MainActivity.this, "Cannot reach the Lark host. Check its HTTPS address and your network, then reconnect.", Toast.LENGTH_LONG).show();
            }
        }); // Default SSL error handling rejects invalid/untrusted certificates.
        connect.setOnClickListener(view -> {
            Uri uri=Uri.parse(address.getText().toString().trim());
            if (!"https".equals(uri.getScheme()) || uri.getHost()==null || uri.getUserInfo()!=null) { Toast.makeText(this,"Enter a valid HTTPS host link.",Toast.LENGTH_LONG).show(); return; }
            host=uri; editor.loadUrl(uri.toString()); address.setText("");
        });
        setContentView(layout);
    }
    @Override public void onBackPressed() { if (editor.canGoBack()) editor.goBack(); else super.onBackPressed(); }
    @Override public void onDestroy() { editor.destroy(); super.onDestroy(); }
}
