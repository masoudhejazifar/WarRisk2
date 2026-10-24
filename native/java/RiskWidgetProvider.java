package ir.masoud.riskwatch;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class RiskWidgetProvider extends AppWidgetProvider {

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        RemoteViews rv = build(c);
        for (int id : ids) m.updateAppWidget(id, rv);
    }

    @Override public void onEnabled(Context c) {
        super.onEnabled(c);
        try {
            Intent s = new Intent(c, MonitorService.class);
            if (android.os.Build.VERSION.SDK_INT >= 26) c.startForegroundService(s); else c.startService(s);
        } catch (Throwable t) { }
    }

    static RemoteViews build(Context c) {
        int score = -1; String lvl = "در حال شروع"; String time = ""; boolean stale = false; String banner = "";
        try {
            SharedPreferences p = c.getSharedPreferences("risk", Context.MODE_PRIVATE);
            String js = p.getString("state", "");
            if (!js.isEmpty()) {
                JSONObject o = new JSONObject(js);
                JSONObject r = o.optJSONObject("result");
                if (r != null) {
                    score = r.optInt("final", -1);
                    if (r.optJSONObject("level") != null) lvl = r.getJSONObject("level").optString("name", "");
                }
                long last = o.optLong("lastCheck", 0);
                if (last > 0) {
                    time = Gauge.fa(new SimpleDateFormat("HH:mm", Locale.US).format(new Date(last)));
                    stale = System.currentTimeMillis() - last > 5 * 60000L;
                }
                JSONObject al = o.optJSONObject("alert");
                JSONObject rd = o.optJSONObject("ready");
                if (al != null && "full".equals(al.optString("level"))) banner = "جنگ آغاز شد";
                else if (al != null && "standby".equals(al.optString("level"))) banner = "آماده‌باش";
                else if (rd != null && "ready".equals(rd.optString("level"))) banner = "آماده‌باش خانواده";
            }
        } catch (Throwable t) { }
        Bitmap bm = Gauge.draw(score, lvl, time, stale, banner);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_risk);
        rv.setImageViewBitmap(R.id.widget_img, bm);
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open != null) {
            PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            rv.setOnClickPendingIntent(R.id.widget_root, pi);
        }
        return rv;
    }

    static void refresh(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, RiskWidgetProvider.class));
            if (ids == null || ids.length == 0) return;
            RemoteViews rv = build(c);
            for (int id : ids) m.updateAppWidget(id, rv);
        } catch (Throwable t) { }
    }
}
