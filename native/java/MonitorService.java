package ir.masoud.riskwatch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** سرویس همیشه‌فعال: یک WebView نامرئی کد رصد (همان core.js) را اجرا می‌کند و هر دقیقه آن را صدا می‌زند. */
public class MonitorService extends Service {
    static final String TAG = "RiskMonitor";
    static final String CH = "risk_monitor";
    static final int NID = 1;
    static final String UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
    static volatile boolean running = false;
    static MonitorService inst;

    private Handler main;
    private WebView web;
    private PowerManager.WakeLock wl;
    private SharedPreferences prefs;
    private final ExecutorService pool = Executors.newFixedThreadPool(6);

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            doTick();
            main.postDelayed(this, intervalMs());
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        main = new Handler(Looper.getMainLooper());
        prefs = getSharedPreferences("risk", MODE_PRIVATE);
        inst = this;
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        startFg("در حال رصد…");
        running = true;
        applyWakeLock();
        if (web == null) createWeb();
        main.removeCallbacks(tick);
        main.postDelayed(tick, 6000);
        return START_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onDestroy() {
        running = false;
        inst = null;
        main.removeCallbacks(tick);
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable t) { }
        try { if (web != null) { web.destroy(); web = null; } } catch (Throwable t) { }
        pool.shutdownNow();
        super.onDestroy();
    }

    // ---------- اعلان دائمی ----------
    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(CH) == null) {
                NotificationChannel c = new NotificationChannel(CH, "رصد پس‌زمینه", NotificationManager.IMPORTANCE_LOW);
                c.setShowBadge(false);
                nm.createNotificationChannel(c);
            }
        }
    }

    private Notification buildNote(String text) {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_dialog_info)
         .setContentTitle("پایش خطر")
         .setContentText(text)
         .setContentIntent(pi)
         .setOngoing(true)
         .setCategory(Notification.CATEGORY_SERVICE);
        return b.build();
    }

    private void startFg(String text) {
        ensureChannel();
        Notification n = buildNote(text);
        if (Build.VERSION.SDK_INT >= 34) startForeground(NID, n, 0x40000000);   // FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        else startForeground(NID, n);
    }

    private void updateNote(String text) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(NID, buildNote(text));
        } catch (Throwable t) { }
    }

    // ---------- قفل بیدار ماندن / زمان‌بندی ----------
    long intervalMs() {
        int m = 1;
        try {
            String s = prefs.getString("settings", "");
            if (!s.isEmpty()) m = new JSONObject(s).optInt("interval", 1);
        } catch (Throwable t) { }
        if (m < 1) m = 1;
        if (m > 30) m = 30;
        return m * 60000L;
    }

    void applyWakeLock() {
        boolean wake = true;
        try {
            String s = prefs.getString("settings", "");
            if (!s.isEmpty()) wake = new JSONObject(s).optBoolean("wake", true);
        } catch (Throwable t) { }
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (wake) {
                if (wl == null) { wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "riskwatch:monitor"); wl.setReferenceCounted(false); }
                if (!wl.isHeld()) wl.acquire();
            } else if (wl != null && wl.isHeld()) {
                wl.release();
            }
        } catch (Throwable t) { Log.e(TAG, "wakelock", t); }
    }

    static void reconfigure() {
        final MonitorService s = inst;
        if (s == null) return;
        s.main.post(new Runnable() { @Override public void run() {
            s.applyWakeLock();
            s.main.removeCallbacks(s.tick);
            s.main.postDelayed(s.tick, 1000);
        } });
    }

    static void checkNow() {
        final MonitorService s = inst;
        if (s == null) return;
        s.main.post(new Runnable() { @Override public void run() { s.doTick(); } });
    }

    void doTick() {
        if (web != null) web.evaluateJavascript("window.tick && window.tick()", null);
    }

    // ---------- WebView نامرئی ----------
    private void createWeb() {
        try {
            web = new WebView(getApplicationContext());
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setAllowFileAccess(true);
            web.addJavascriptInterface(new Bridge(), "Android");
            web.setWebViewClient(new WebViewClient());
            web.setWebChromeClient(new WebChromeClient() {
                @Override public boolean onConsoleMessage(ConsoleMessage m) {
                    Log.d(TAG, "JS: " + m.message());
                    return true;
                }
            });
            web.loadUrl("file:///android_asset/public/headless.html");
            web.onResume();
            web.resumeTimers();
        } catch (Throwable t) {
            Log.e(TAG, "createWeb", t);
        }
    }

    private void onStateJson(String json) {
        String text = "در حال رصد";
        try {
            JSONObject o = new JSONObject(json);
            JSONObject r = o.optJSONObject("result");
            int score = r != null ? r.optInt("final", -1) : -1;
            String lvl = (r != null && r.optJSONObject("level") != null) ? r.getJSONObject("level").optString("name", "") : "";
            long last = o.optLong("lastCheck", 0);
            String t = last > 0 ? new SimpleDateFormat("HH:mm", Locale.US).format(new Date(last)) : "";
            JSONObject ready = o.optJSONObject("ready");
            boolean rd = ready != null && "ready".equals(ready.optString("level"));
            text = (score >= 0 ? "نمره " + Gauge.fa(score) + " • " + lvl : "در حال رصد") + (rd ? " • آماده‌باش خانواده" : "") + (t.isEmpty() ? "" : " • " + Gauge.fa(t));
        } catch (Throwable t) { }
        updateNote(text);
        RiskWidgetProvider.refresh(this);
    }

    // ---------- پل بین جاوااسکریپت و اندروید ----------
    class Bridge {
        @JavascriptInterface public void httpGet(final int id, final String url, final int timeoutMs) {
            pool.execute(new Runnable() { @Override public void run() {
                HttpURLConnection c = null;
                int status = 0; String b64 = ""; String err = "";
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(timeoutMs);
                    c.setReadTimeout(timeoutMs);
                    c.setInstanceFollowRedirects(true);
                    c.setRequestProperty("User-Agent", UA);
                    c.setRequestProperty("Accept", "application/rss+xml, application/xml, text/xml, text/html, application/json, */*");
                    c.setRequestProperty("Accept-Language", "fa,en;q=0.8");
                    status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in != null) {
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        byte[] buf = new byte[16384]; int n, total = 0;
                        while ((n = in.read(buf)) > 0 && total < 3000000) { bo.write(buf, 0, n); total += n; }
                        in.close();
                        b64 = Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                    }
                } catch (Throwable t) {
                    err = t.getClass().getSimpleName() + ": " + t.getMessage();
                } finally {
                    if (c != null) c.disconnect();
                }
                final String js = "window.__httpDone(" + id + "," + status + ",'" + b64 + "'," + JSONObject.quote(err) + ")";
                main.post(new Runnable() { @Override public void run() { if (web != null) web.evaluateJavascript(js, null); } });
            } });
        }
        @JavascriptInterface public String prefGet(String k) { return prefs.getString(k, ""); }
        @JavascriptInterface public void prefSet(String k, String v) { prefs.edit().putString(k, v).apply(); }
        @JavascriptInterface public void onState(final String json) {
            prefs.edit().putString("state", json).apply();
            main.post(new Runnable() { @Override public void run() { onStateJson(json); } });
        }
        @JavascriptInterface public void alarm(final String level, final String infoJson) {
            main.post(new Runnable() { @Override public void run() { AlarmHelper.start(MonitorService.this, level, infoJson); } });
        }
        @JavascriptInterface public void log(String m) { Log.d(TAG, m); }
    }
}
