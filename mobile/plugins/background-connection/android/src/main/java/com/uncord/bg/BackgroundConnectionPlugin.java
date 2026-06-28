package com.uncord.bg;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Starts/stops a foreground service that keeps the app process (and therefore
 * its WebView WebSocket connections) alive while Uncord is backgrounded. Called
 * from the web layer while the app is in the foreground (enable when connected),
 * which avoids Android 12+'s background-foreground-service-start restriction.
 */
@CapacitorPlugin(name = "BackgroundConnection")
public class BackgroundConnectionPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        Intent intent = new Intent(getContext(), ForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ForegroundService.class));
        call.resolve();
    }
}
