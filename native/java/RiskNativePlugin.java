package ir.masoud.riskwatch;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** پل بین صفحه اپ و سرویس پس‌زمینه */
@CapacitorPlugin(name = "RiskNative")
public class RiskNativePlugin extends Plugin {

    private SharedPreferences prefs() { return getContext().getSharedPreferences("risk", Context.MODE_PRIVATE); }

    @PluginMethod
    public void startService(PluginCall call) {
        try {
            Context c = getContext();
            Intent s = new Intent(c, MonitorService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(s); else c.startService(s);
            call.resolve();
        } catch (Throwable t) {
            call.reject("startService: " + t.getMessage());
        }
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject r = new JSObject();
        r.put("state", prefs().getString("state", ""));
        r.put("running", MonitorService.running);
        call.resolve(r);
    }

    @PluginMethod
    public void checkNow(PluginCall call) {
        MonitorService.checkNow();
        call.resolve();
    }

    @PluginMethod
    public void setSettings(PluginCall call) {
        String j = call.getString("json", "{}");
        prefs().edit().putString("settings", j).apply();
        MonitorService.reconfigure();
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        boolean notif = true;
        try { notif = ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled(); } catch (Throwable t) { }
        boolean battery = true;
        try { battery = ((PowerManager) c.getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(c.getPackageName()); } catch (Throwable t) { }
        boolean fs = true;
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
                fs = (Boolean) nm.getClass().getMethod("canUseFullScreenIntent").invoke(nm);
            } catch (Throwable t) { fs = true; }
        }
        r.put("notifications", notif);
        r.put("battery", battery);
        r.put("fullScreen", fs);
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("brand", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        r.put("running", MonitorService.running);
        call.resolve(r);
    }

    @PluginMethod
    public void openSetting(PluginCall call) {
        String name = call.getString("name", "app");
        Activity a = getActivity();
        Context c = getContext();
        String pkg = c.getPackageName();
        try {
            Intent i = null;
            if ("notifications".equals(name)) {
                boolean asked = prefs().getBoolean("askedNotif", false);
                boolean on = ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled();
                if (Build.VERSION.SDK_INT >= 33 && !on && !asked && a != null) {
                    prefs().edit().putBoolean("askedNotif", true).apply();
                    a.requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1001);
                    call.resolve();
                    return;
                }
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
            } else if ("battery".equals(name)) {
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
            } else if ("fullscreen".equals(name)) {
                if (Build.VERSION.SDK_INT >= 34) i = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", Uri.parse("package:" + pkg));
                else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            } else {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                c.startActivity(i);
            } catch (Throwable t) {
                Intent f = "battery".equals(name) ? new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                        : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
                f.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(f);
            }
            call.resolve();
        } catch (Throwable t) {
            call.reject("openSetting: " + t.getMessage());
        }
    }

    @PluginMethod
    public void testAlarm(PluginCall call) {
        final String level = call.getString("level", "full");
        Integer d = call.getInt("delay", 0);
        final long delay = (d == null ? 0 : d) * 1000L;
        final Context c = getContext();
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() { @Override public void run() {
            AlarmHelper.show(c, level, "آلارم آزمایشی", "این فقط یک آزمایش است. اگر صدا و نمایش درست بود، آلارم کار می‌کند.", "", "test");
        } }, delay);
        call.resolve();
    }

    /** تست اتصال از همان مسیر شبکه‌ای که سرویس استفاده می‌کند */
    @PluginMethod
    public void httpGet(final PluginCall call) {
        final String url = call.getString("url", "");
        new Thread(new Runnable() { @Override public void run() {
            JSObject r = new JSObject();
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(10000);
                c.setRequestProperty("User-Agent", MonitorService.UA);
                int st = c.getResponseCode();
                InputStream in = st >= 400 ? c.getErrorStream() : c.getInputStream();
                int total = 0;
                if (in != null) { byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0 && total < 3000000) total += n; in.close(); }
                r.put("status", st);
                r.put("length", total);
            } catch (Throwable t) {
                r.put("error", t.getClass().getSimpleName() + ": " + t.getMessage());
            } finally {
                if (c != null) c.disconnect();
            }
            call.resolve(r);
        } }).start();
    }
}
