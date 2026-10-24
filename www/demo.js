/* سناریوهای آزمایشی — برای دیدن رفتار اپ بدون نیاز به خبر واقعی */
(function (root) {
'use strict';
const M = 60e3;
function mk(source, group, title, body, minsAgo, now) {
  return { source, group, title, body, link: 'demo://' + group + '/' + encodeURIComponent(title).slice(0, 40),
    ts: now - minsAgo * M, fullText: true };
}

function mkt(level) {
  const L = { calm: [0.4, 0.2, 16, 0.3, 0.1, 0.1, 0.5], tension: [3.4, 1.2, 22, -1.0, -0.6, 0.6, -1.0], ready: [6.4, 2.1, 27, -3.5, -1.8, 1.6, -4.2], war: [9.2, 3.1, 33, -5.2, -2.6, 2.4, -7.0] }[level];
  const names = [['brent','نفت برنت',72.4],['gold','طلا',5120],['vix','شاخص ترس (VIX)',L[2]],['ta125','بورس تل‌آویو',2410],['es','آتی S&P 500',6900],['ils','دلار به شکل اسرائیل',3.62],['btc','بیت‌کوین (۲۴ ساعته)',92000]];
  const items = names.map((n, i) => ({ key: n[0], name: n[1], price: n[2], ch3: L[i] / 3, ch24: n[0] === 'vix' ? 4 : L[i], stale: false }));
  const E = (typeof window !== 'undefined' && window.Engine) || require('./engine.js');
  const r = E.marketRisk(items);
  return { risk: r.risk, note: r.note, items, t: Date.now() };
}
function crowd(p, jump) {
  const risk = p >= 0.7 ? 80 : p >= 0.5 ? 60 : p >= 0.35 ? 45 : p >= 0.2 ? 32 : 20;
  return { risk: jump ? Math.min(100, risk + 15) : risk, note: 'احتمال حمله (کوتاه‌مدت): ' + Math.round(p * 100) + '٪' + (jump ? ' • جهش ' + Math.round(jump * 100) + ' واحدی در ۲۴ ساعت' : ''),
    items: [{ q: 'US strikes Iran by November 30?', p }, { q: 'Israel strikes Iran by December 31?', p: Math.max(0.05, p - 0.1) }], t: Date.now() };
}
const SCENARIOS = {
  calm: {
    label: 'آرام',
    markets: () => mkt('calm'), crowd: () => crowd(0.12),
    internet: { risk: 15, note: 'اینترنت عادی' }, flights: { risk: 20, note: 'ترافیک عادی' },
    items: n => [
      mk('رویترز','reuters','Iran and European powers agree to hold new talks','Diplomats said talks on the nuclear file would resume next month. Negotiators described the atmosphere as constructive and flights across the region are operating normally.',90,n),
      mk('BBC فارسی','bbc','از سرگیری پروازها در حریم هوایی ایران','شرکت‌های هواپیمایی پروازهای ایران را از سر گرفتند و حریم هوایی بازگشایی شد.',200,n),
    ],
  },
  tension: {
    label: 'تنش بالا می‌رود',
    markets: () => mkt('tension'), crowd: () => crowd(0.27),
    internet: { risk: 15, note: 'اینترنت عادی' }, flights: { risk: 40, note: 'ترافیک کمی کمتر از عادی' },
    items: n => [
      mk('رویترز','reuters','US sends aircraft carrier to the Gulf as tensions with Iran escalate','The Pentagon said it deployed a carrier strike group. Officials warned of further escalation.',50,n),
      mk('الجزیره','aljazeera','US embassies in the region face new pressure as tensions with Iran rise','The State Department issued a level 4 travel advisory urging citizens not to travel to Iran or Iraq.',70,n),
      mk('AP','ap','Airlines cancel flights to Iran as travel restrictions expand','Several airlines suspended flights to Tehran while Iraq limited some routes.',35,n),
      mk('BBC فارسی','bbc','جلسه اضطراری شورای امنیت درباره ایران','شورای امنیت به صورت اضطراری درباره ایران تشکیل جلسه داد.',25,n),
    ],
  },
  ready: {
    label: 'شب قبل از حمله (آماده‌باش)',
    markets: () => mkt('ready'), crowd: () => crowd(0.56, 0.2),
    internet: { risk: 15, note: 'اینترنت عادی' }, flights: { risk: 70, note: 'ترافیک بسیار کمتر از عادی' },
    items: n => [
      mk('رویترز','reuters','US embassy orders departure of non-emergency staff amid Iran tensions, ambassador tells staff to leave today','The State Department ordered departure of non-emergency embassy personnel and their families. Staff wishing to leave should do so today while commercial flights remain available.',120,n),
      mk('الجزیره','aljazeera','Airlines suspend flights to Tehran as US military buildup near Iran nears completion','Several airlines cancelled flights and Turkish carriers suspended service. Officials said the buildup was nearing completion.',90,n),
      mk('AP','ap','Russia evacuates specialists from Iran Bushehr plant as tensions peak','Rosatom said it was evacuating staff from Iran. Moscow urged all sides to avoid targeting nuclear sites.',60,n),
    ],
  },
  clickbait: {
    label: 'تیتر زرد (باید رد شود)',
    markets: () => mkt('calm'), crowd: () => crowd(0.15),
    internet: { risk: 15, note: 'اینترنت عادی' }, flights: { risk: 20, note: 'ترافیک عادی' },
    items: n => [
      mk('سایت زرد','yellow','اگر جنگ شروع شد، این اتفاق در تهران می‌افتد! کلیک کنید','اگر جنگ شروع شود ممکن است حمله به تهران رخ دهد و انفجار در تهران محتمل است. کارشناسان هشدار می‌دهند.',10,n),
      mk('Tabloid','tabloid','What happens if the US strikes Tehran? Experts warn','If the US bombed Tehran, explosions could hit the city. Analysts warn this scenario is possible.',12,n),
      mk('رویترز','reuters','Iran holds air defence drill near Isfahan','Iran held an annual air defence exercise in Isfahan province on Tuesday. The drill was planned months ago.',30,n),
    ],
  },
  single: {
    label: 'خبر حمله از یک منبع',
    markets: () => mkt('ready'), crowd: () => crowd(0.6),
    internet: { risk: 15, note: 'اینترنت عادی' }, flights: { risk: 40, note: 'کمی کمتر از عادی' },
    items: n => [
      mk('رویترز','reuters','Explosions heard in Tehran, witnesses report air strikes','Witnesses told Reuters that explosions struck several districts of Tehran on Saturday. Air strikes hit sites in the capital, residents said.',4,n),
    ],
  },
  confirmed: {
    label: 'تأیید دو منبع (آلارم کامل)',
    markets: () => mkt('war'), crowd: () => crowd(0.88),
    internet: { risk: 70, note: 'هم سایت داخلی و هم خارجی باز نشد' }, flights: { risk: 92, note: 'آسمان تقریباً خالی است' },
    items: n => [
      mk('رویترز','reuters','Explosions heard in Tehran, witnesses report air strikes','Witnesses told Reuters that explosions struck several districts of Tehran on Saturday. Air strikes hit sites in the capital, residents said.',6,n),
      mk('BBC فارسی','bbc','انفجار در چند نقطه تهران؛ شاهدان از حمله هوایی خبر می‌دهند','ساعاتی پیش صدای انفجار در تهران شنیده شد. شاهدان می‌گویند حمله هوایی چند نقطه شهر را هدف قرار داد.',3,n),
    ],
  },
};
const api = { SCENARIOS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.DemoData = api;
})(typeof window !== 'undefined' ? window : globalThis);
