package com.uncord.bg;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * Ongoing foreground service: an ongoing notification keeps the process at
 * foreground priority (so Android won't kill it for memory while backgrounded)
 * and a partial wake lock keeps the CPU available so the WebView's keep-alive
 * pings can still fire. This is the native capability the browser fundamentally
 * lacks (UNCORD_PLAN.md §3.6) — best-effort; OS power policies still apply.
 */
public class ForegroundService extends Service {

    private static final String CHANNEL_ID = "uncord_connection";
    private static final int NOTIFICATION_ID = 4711;
    // True while the service is running. MainActivity reads this to keep the
    // WebView's JS awake in the background only while connected. (best-effort
    // keep-alive — the proper killed-app fix is push/FCM.)
    public static volatile boolean isRunning = false;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("REEF")
                .setContentText("Keeping your servers connected")
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        startForeground(NOTIFICATION_ID, notification);
        isRunning = true;
        // Flag read by MainActivity (app module) to keep the WebView awake in the
        // background while connected. Use prefs to avoid a cross-module class ref.
        getSharedPreferences("reef", MODE_PRIVATE)
                .edit().putBoolean("bg_active", true).apply();

        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "uncord:connection");
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) {
            wakeLock.acquire();
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        getSharedPreferences("reef", MODE_PRIVATE)
                .edit().putBoolean("bg_active", false).apply();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Connection", NotificationManager.IMPORTANCE_LOW);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
