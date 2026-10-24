package ir.masoud.riskwatch;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;

/** رسم نیم‌دایره (چپ سبز، راست قرمز) برای ویجت */
final class Gauge {
    private Gauge() { }

    static String fa(Object v) {
        String s = String.valueOf(v);
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            b.append(c >= '0' && c <= '9' ? (char) ('۰' + (c - '0')) : c);
        }
        return b.toString();
    }

    static int levelColor(int score) {
        if (score < 0) return 0xFF93A0B3;
        if (score <= 25) return 0xFF00C853;
        if (score <= 50) return 0xFFFFC400;
        if (score <= 75) return 0xFFFF7A00;
        return 0xFFFF2B2B;
    }

    static Bitmap draw(int score, String levelName, String timeText, boolean stale, String banner) {
        final int W = 640, H = 300;
        Bitmap bm = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF161C26);
        cv.drawRoundRect(new RectF(0, 0, W, H), 32, 32, p);

        float cx = 200, cy = 232, r = 138;
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(40);
        p.setShader(new LinearGradient(cx - r, 0, cx + r, 0,
                new int[]{0xFF00D65A, 0xFF8BD62A, 0xFFFFC400, 0xFFFF6A00, 0xFFE0001A},
                new float[]{0f, 0.28f, 0.5f, 0.74f, 1f}, Shader.TileMode.CLAMP));
        cv.drawArc(new RectF(cx - r, cy - r, cx + r, cy + r), 180, 180, false, p);
        p.setShader(null);

        if (score >= 0) {
            double th = Math.PI * (1.0 - score / 100.0);
            float nx = (float) (cx + (r - 24) * Math.cos(th));
            float ny = (float) (cy - (r - 24) * Math.sin(th));
            p.setColor(0xFFFFFFFF);
            p.setStrokeWidth(10);
            p.setStrokeCap(Paint.Cap.ROUND);
            cv.drawLine(cx, cy, nx, ny, p);
            p.setStyle(Paint.Style.FILL);
            cv.drawCircle(cx, cy, 18, p);
        }

        p.setStyle(Paint.Style.FILL);
        p.setTextAlign(Paint.Align.CENTER);
        int col = levelColor(score);
        p.setColor(col);
        p.setFakeBoldText(true);
        p.setTextSize(118);
        cv.drawText(score >= 0 ? fa(score) : "—", 470, 150, p);
        p.setTextSize(44);
        cv.drawText(banner != null && !banner.isEmpty() ? banner : levelName, 470, 205, p);
        p.setFakeBoldText(false);
        p.setTextSize(28);
        p.setColor(stale ? 0xFFFF6B6B : 0xFF93A0B3);
        cv.drawText(stale ? "داده قدیمی • " + timeText : "آخرین بررسی " + timeText, 470, 258, p);
        return bm;
    }
}
