package com.ball46.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://ball46.com/?source=android-app";
    private WebView webView;
    private FrameLayout appRoot;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        appRoot = new FrameLayout(this);
        appRoot.setBackgroundColor(Color.BLACK);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        appRoot.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(appRoot);

        // Android 15 enforces edge-to-edge for targetSdk 35. Keep web content
        // inside the real OS system bar and display cutout insets.
        if (Build.VERSION.SDK_INT >= 35) {
            appRoot.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets safe = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
            appRoot.requestApplyInsets();
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " BALL46Android/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (isBall46Url(url)) view.setVisibility(View.INVISIBLE);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                revealWithMobileFavoritesHidden(view, url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                revealWithMobileFavoritesHidden(view, url);
            }

            private boolean isBall46(Uri uri) {
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                return host.equals("ball46.com") || host.endsWith(".ball46.com");
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();

                if ((scheme.equals("https") || scheme.equals("http")) && isBall46(uri)) {
                    return false;
                }

                openExternal(uri);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;

                String html = "<!doctype html><html><meta name='viewport' content='width=device-width,initial-scale=1'>"
                        + "<body style='margin:0;background:#050807;color:#fff;font-family:Arial,sans-serif;"
                        + "display:grid;place-items:center;height:100vh;text-align:center'>"
                        + "<div><div style='font-size:42px;font-weight:900'>ball<span style='color:#31D4A3'>46</span></div>"
                        + "<p style='color:#aab5b0'>Unable to connect.</p>"
                        + "<a href='" + HOME_URL + "' style='display:inline-block;text-decoration:none;border-radius:12px;"
                        + "padding:12px 20px;background:#31D4A3;color:#04120f;font-weight:900'>Retry</a>"
                        + "</div></body></html>";

                view.loadDataWithBaseURL(HOME_URL, html, "text/html", "UTF-8", null);
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                openExternal(Uri.parse(url)));

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean isBall46Url(String url) {
        Uri uri = Uri.parse(url == null ? "" : url);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(java.util.Locale.ROOT);
        return host.equals("ball46.com") || host.endsWith(".ball46.com");
    }

    private void revealWithMobileFavoritesHidden(WebView view, String url) {
        if (!isBall46Url(url)) {
            view.setVisibility(View.VISIBLE);
            return;
        }
        // The current live website injects mobile star elements on card refresh.
        // Beta 2 disables only these controls inside the Android WebView; it never
        // changes the production website, data updates, Signals, or desktop UI.
        // Keep the WebView hidden until the style is installed to avoid first-paint flicker.
        String javascript = "(function(){"
                + "if(!document.getElementById('b46-android-beta2-no-mobile-favorites')){"
                + "var s=document.createElement('style');"
                + "s.id='b46-android-beta2-no-mobile-favorites';"
                + "s.textContent='@media(max-width:760px){#b46gn-cards [data-b46-pin-mobile],#b46gn-cards .b46-pin-v2-mobile,.b46-pin-v2-star{display:none!important;pointer-events:none!important;}}';"
                + "(document.head||document.documentElement).appendChild(s);"
                + "}return true;})()";
        view.evaluateJavascript(javascript, ignored -> {
            // An old navigation callback must never reveal a newer unprotected page.
            if (url != null && url.equals(view.getUrl())) {
                view.setVisibility(View.VISIBLE);
            }
        });
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
