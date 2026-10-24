package ir.masoud.riskwatch;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

/** پخش صدای نرم آلارم روی کانال Alarm (با حالت بی‌صدا و مزاحم نشوید هم شنیده می‌شود) */
final class AlarmPlayer {
    private static MediaPlayer mp;
    private static Vibrator vib;
    private static final Handler H = new Handler(Looper.getMainLooper());
    private static final Runnable AUTO_STOP = new Runnable() { @Override public void run() { stop(); } };

    private AlarmPlayer() { }

    static synchronized void start(Context c, String level) {
        stop();
        boolean full = "full".equals(level);
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            int cur = am.getStreamVolume(AudioManager.STREAM_ALARM);
            int want = Math.round(max * 0.5f);
            if (cur < want) am.setStreamVolume(AudioManager.STREAM_ALARM, want, 0);
        } catch (Throwable t) { Log.w("RiskAlarm", "volume", t); }
        try {
            int res = c.getResources().getIdentifier(full ? "alarm_full" : "alarm_ready", "raw", c.getPackageName());
            mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            AssetFileDescriptor afd = c.getResources().openRawResourceFd(res);
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            mp.setLooping(true);
            mp.setVolume(0.8f, 0.8f);
            mp.prepare();
            mp.start();
        } catch (Throwable t) { Log.e("RiskAlarm", "play", t); }
        try {
            vib = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            long[] pat = full ? new long[]{0, 350, 300, 350, 2200} : new long[]{0, 250, 3600};
            if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(pat, 0));
            else vib.vibrate(pat, 0);
        } catch (Throwable t) { Log.w("RiskAlarm", "vibrate", t); }
        H.removeCallbacks(AUTO_STOP);
        H.postDelayed(AUTO_STOP, 20 * 60000L);   // اگر کسی تأیید نکرد، صدا بعد از ۲۰ دقیقه قطع می‌شود
    }

    static synchronized void stop() {
        H.removeCallbacks(AUTO_STOP);
        try { if (mp != null) { mp.stop(); mp.release(); } } catch (Throwable t) { }
        mp = null;
        try { if (vib != null) vib.cancel(); } catch (Throwable t) { }
    }
}
