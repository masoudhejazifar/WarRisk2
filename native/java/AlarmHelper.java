package ir.masoud.riskwatch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

final class AlarmHelper {
    static final String CH = "risk_alarm";
    static final int NID = 2;

    private AlarmHelper() { }

    static void start(Context c, String level, String infoJson) {
        String key = "", why = "", cityPart = "";
        StringBuilder src = new StringBuilder();
        try {
            JSONObject o = new JSONObject(infoJson);
            key = o.optString("key", "");
            why = o.optString("why", "");
            JSONArray cs = o.optJSONArray("cities");
            if (cs != null && cs.length() > 0) {
                StringBuilder b = new StringBuilder(" در ");
                for (int i = 0; i < cs.length(); i++) { if (i > 0) b.append("، "); b.append(cs.getString(i)); }
                cityPart = b.toString();
            }
            JSONArray items = o.optJSONArray("items");
            if (items != null) for (int i = 0; i < items.length() && i < 4; i++) {
                JSONObject it = items.getJSONObject(i);
                src.append("• ").append(it.optString("source")).append(": ").append(it.optString("title")).append("\n");
            }
        } catch (Throwable t) { }
        String title, body;
        if ("full".equals(level)) {
            title = "جنگ آغاز شد";
            body = "حمله" + cityPart + " از چند منبع مستقل تأیید شد. در آماده‌باش کامل باشید.";
        } else if ("ready".equals(level)) {
            title = "آماده‌باش خانواده";
            body = "نشانه‌های هشدار دیده شد (" + why + "). هنوز حمله‌ای تأیید نشده. مدارک، شارژ گوشی، آب و غذا و محل قرار را آماده کنید.";
        } else {
            title = "آماده‌باش";
            body = "یک منبع معتبر خبر حمله" + cityPart + " را با متن کامل داده است. در حال تأیید از منبع دوم.";
        }
        show(c, level, title, body, src.toString(), key);
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(CH) == null) {
                NotificationChannel ch = new NotificationChannel(CH, "آلارم", NotificationManager.IMPORTANCE_HIGH);
                ch.setSound(null, null);
                ch.enableVibration(false);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
        }
    }

    static void show(Context c, String level, String title, String body, String src, String key) {
        ensureChannel(c);
        Intent i = new Intent(c, AlarmActivity.class);
        i.putExtra("level", level).putExtra("title", title).putExtra("body", body).putExtra("src", src).putExtra("key", key);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int fl = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pi = PendingIntent.getActivity(c, 20, i, fl);
        Intent ack = new Intent(c, AlarmActivity.class);
        ack.putExtra("ack", true).putExtra("key", key);
        ack.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pAck = PendingIntent.getActivity(c, 21, ack, fl);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_dialog_alert)
         .setContentTitle(title)
         .setContentText(body)
         .setStyle(new Notification.BigTextStyle().bigText(body))
         .setCategory(Notification.CATEGORY_ALARM)
         .setPriority(Notification.PRIORITY_MAX)
         .setVisibility(Notification.VISIBILITY_PUBLIC)
         .setOngoing(true)
         .setAutoCancel(false)
         .setContentIntent(pi)
         .setFullScreenIntent(pi, true)
         .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "دیدم، خاموش کن", pAck).build());
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(NID, b.build());
        AlarmPlayer.start(c, level);
        try { c.startActivity(i); } catch (Throwable t) { }   // اگر اجازه نمایش روی برنامه‌های دیگر باشد مستقیم باز می‌شود
    }

    static void ack(Context c, String key) {
        try {
            if (key != null && !key.isEmpty() && !"test".equals(key)) {
                SharedPreferences p = c.getSharedPreferences("risk", Context.MODE_PRIVATE);
                JSONArray a = new JSONArray(p.getString("c_acks", "[]"));
                a.put(key);
                JSONArray out = new JSONArray();
                for (int i = Math.max(0, a.length() - 50); i < a.length(); i++) out.put(a.get(i));
                p.edit().putString("c_acks", out.toString()).apply();
            }
        } catch (Throwable t) { }
        stop(c);
    }

    static void stop(Context c) {
        AlarmPlayer.stop();
        try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NID); } catch (Throwable t) { }
    }
}
