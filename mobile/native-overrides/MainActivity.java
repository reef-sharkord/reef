package com.uncord.app;

import android.content.SharedPreferences;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * REEF MainActivity. While the background-connection foreground service is active
 * (the "reef"/"bg_active" pref it sets), keep the WebView's JavaScript timers
 * running in the background so the server keepalive ping keeps firing and the
 * WebSocket survives being backgrounded. Best-effort: costs battery, and does NOT
 * help once the app is dismissed from recents — true killed-app delivery needs
 * push/FCM. (UNCORD_PLAN.md §3.6)
 *
 * Reads the flag via SharedPreferences (not a direct class ref) to avoid an
 * app-module → plugin-module compile dependency. The Java package stays
 * com.uncord.app (module namespace); the installed applicationId is com.reef.app.
 * Copied into the generated android/ project by mobile/build-apk.ps1.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onPause() {
        super.onPause();

        SharedPreferences prefs = getSharedPreferences("reef", MODE_PRIVATE);

        if (prefs.getBoolean("bg_active", false) && getBridge() != null) {
            WebView webView = getBridge().getWebView();

            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        }
    }
}
