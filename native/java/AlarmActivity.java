package ir.masoud.riskwatch;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** صفحه تمام‌صفحه آلارم؛ روی صفحه قفل هم باز می‌شود */
public class AlarmActivity extends Activity {
    private String key = "";

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        handle(getIntent());
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        handle(i);
    }

    private void handle(Intent i) {
        key = i.getStringExtra("key");
        if (i.getBooleanExtra("ack", false)) {
            AlarmHelper.ack(this, key);
            finish();
            return;
        }
        String level = i.getStringExtra("level");
        boolean full = "full".equals(level);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(48, 96, 48, 96);
        root.setBackgroundColor(full ? 0xFFB00018 : 0xFF8A5200);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        TextView t = new TextView(this);
        t.setText(i.getStringExtra("title"));
        t.setTextColor(Color.WHITE);
        t.setTextSize(34);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, 0, 0, 24);
        root.addView(t);

        TextView bd = new TextView(this);
        bd.setText(i.getStringExtra("body"));
        bd.setTextColor(Color.WHITE);
        bd.setTextSize(18);
        bd.setGravity(Gravity.CENTER);
        bd.setPadding(0, 0, 0, 24);
        root.addView(bd);

        String src = i.getStringExtra("src");
        if (src != null && !src.trim().isEmpty()) {
            TextView s = new TextView(this);
            s.setText(src.trim());
            s.setTextColor(0xFFFFE0E0);
            s.setTextSize(14);
            s.setPadding(0, 0, 0, 36);
            root.addView(s);
        }

        Button ack = new Button(this);
        ack.setText("دیدم، خاموش کن");
        ack.setTextSize(20);
        ack.setBackgroundColor(Color.WHITE);
        ack.setTextColor(0xFF111111);
        ack.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) {
            AlarmHelper.ack(AlarmActivity.this, key);
            finish();
        } });
        root.addView(ack, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 190));

        Button mute = new Button(this);
        mute.setText("فقط صدا را قطع کن");
        mute.setTextSize(15);
        mute.setBackgroundColor(0x33FFFFFF);
        mute.setTextColor(Color.WHITE);
        mute.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { AlarmPlayer.stop(); } });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 140);
        lp.topMargin = 24;
        root.addView(mute, lp);

        setContentView(root);
    }
}
