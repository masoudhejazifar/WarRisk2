(function () {
'use strict';
const E = window.Engine, D = window.DemoData, Core = window.Core;
const $ = id => document.getElementById(id);
const HOUR = 3600e3, MIN = 60e3;
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const RN = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.RiskNative) || null;
const nativeMode = isNative && !!RN;

/* ---------- ذخیره‌سازی ---------- */
function load(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const lsStore = { get: (k, d) => load('wr_' + k, d), set: (k, v) => save('wr_' + k, v) };

let settings = Object.assign({ demo: !nativeMode && !isNative, interval: 1, wake: true, weights: {}, sources: {} }, load('wr_settings', {}));
let scenario = 'calm';
let S = { result: null, verified: [], rejected: [], ready: { level: 'none' }, alert: { level: 'none' }, health: {}, flights: null, lastCheck: 0, nextCheck: 0, newestTs: 0 };
const useNativePoll = () => nativeMode && !settings.demo;

function pushSettings() {
  if (!nativeMode) return;
  try { RN.setSettings({ json: JSON.stringify({ interval: settings.interval, wake: settings.wake, weights: settings.weights, sources: settings.sources }) }); } catch (e) {}
}

/* ---------- شبکه (فقط مرورگر/دمو؛ در اندروید سرویس خودش می‌خواند) ---------- */
async function httpText(url, timeout) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout || 12000);
  try { const r = await fetch(url, { signal: c.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
const webCore = Core.create({
  http: httpText, store: lsStore,
  getSettings: () => settings,
  demoScenario: () => (settings.demo ? scenario : null),
  emit: st => { S = st; render(); },
  alarm: (level, info) => { activeAlarm = { level, key: info.key }; showWebAlarm(level, info, false); },
});

/* ---------- صدای آلارم (نرم؛ فقط برای مرورگر و دمو) ---------- */
let actx = null, sirenTimer = null, vibTimer = null, wake = null, activeAlarm = null;
function ensureCtx() {
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {}
  $('soundState').textContent = nativeMode ? '' : (actx && actx.state === 'running' ? 'صدا: فعال' : 'صدا: با اولین لمس فعال می‌شود');
}
function bell(freq, t0, dur, vol) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
function chime(full) {
  if (!actx) return; const t = actx.currentTime;
  if (full) { bell(659, t, 1.3, 0.22); bell(523, t + 0.6, 1.6, 0.22); } else { bell(587, t, 1.5, 0.18); }
}
function startSound(full) {
  stopSound(); ensureCtx(); chime(full);
  sirenTimer = setInterval(() => chime(full), full ? 3200 : 4800);
  try { if (navigator.vibrate) { const v = () => navigator.vibrate(full ? [350, 250, 350] : [250]); v(); vibTimer = setInterval(v, 3200); } } catch (e) {}
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => wake = w).catch(() => {}); } catch (e) {}
}
function stopSound() {
  clearInterval(sirenTimer); clearInterval(vibTimer); sirenTimer = vibTimer = null;
  try { navigator.vibrate && navigator.vibrate(0); } catch (e) {}
  try { if (wake) wake.release(); } catch (e) {} wake = null;
}
const CITY_FA = { Tehran:'تهران', Isfahan:'اصفهان', Tabriz:'تبریز', Shiraz:'شیراز', Mashhad:'مشهد', Bushehr:'بوشهر', Natanz:'نطنز', Fordow:'فردو', Parchin:'پارچین', BandarAbbas:'بندرعباس', Kermanshah:'کرمانشاه', Ahvaz:'اهواز', Karaj:'کرج', Qom:'قم', Arak:'اراک', Urmia:'ارومیه', Zahedan:'زاهدان', Hamedan:'همدان', Kharg:'خارک', Chabahar:'چابهار', Semnan:'سمنان', Iran:'ایران' };
const cityFa = c => CITY_FA[c] || c;
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }

function showWebAlarm(level, info, isTest) {
  const el = $('alarm');
  el.className = 'on ' + (level === 'ready' ? 'standby' : level);
  $('alarmTitle').textContent = level === 'full' ? (isTest ? 'آلارم آزمایشی: جنگ آغاز شده' : 'جنگ آغاز شد') : level === 'ready' ? 'آماده‌باش خانواده' : (isTest ? 'آماده‌باش آزمایشی' : 'آماده‌باش');
  const cities = (info.cities && info.cities.length) ? ' در ' + info.cities.map(cityFa).join('، ') : '';
  $('alarmBody').textContent = isTest ? 'این فقط یک آزمایش است.' :
    level === 'ready' ? 'نشانه‌های هشدار دیده شد (' + info.why + '). هنوز حمله‌ای تأیید نشده. مدارک، شارژ گوشی‌ها، آب و غذا و محل قرار خانواده را آماده کنید.' :
    level === 'full' ? 'حمله' + cities + ' از چند منبع مستقل تأیید شد. در آماده‌باش کامل باشید.' :
    'یک منبع معتبر خبر حمله' + cities + ' را با متن کامل داده است. در حال تأیید از منبع دوم.';
  $('alarmSrc').innerHTML = (info.items || []).map(i => '<div>• ' + esc(i.source) + ': ' + esc(i.title) + '</div>').join('') || '—';
  startSound(level === 'full');
}
function hideWebAlarm() { $('alarm').className = ''; stopSound(); activeAlarm = null; }
$('btnAck').onclick = () => {
  if (activeAlarm && activeAlarm.key) { const a = lsStore.get('acks', []); a.push(activeAlarm.key); lsStore.set('acks', a.slice(-50)); }
  hideWebAlarm(); render();
};
$('btnMute').onclick = () => stopSound();
$('btnTest').onclick = () => {
  if (nativeMode && !settings.demo) {
    try { RN.testAlarm({ level: 'full', delay: 10 }); toast('آلارم آزمایشی ۱۰ ثانیه دیگر می‌خورد. همین حالا صفحه را قفل کن تا روی صفحه قفل را هم ببینی.'); } catch (e) { toast('آلارم آزمایشی شروع نشد: ' + e); }
    return;
  }
  ensureCtx(); activeAlarm = { level: 'full', key: null };
  showWebAlarm('full', { cities: ['Tehran'], items: [{ source: 'آزمایش', title: 'این یک آلارم آزمایشی است' }] }, true);
};
let toastT = null;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.className = 'toast on'; clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', 9000); }

/* ---------- نمایش ---------- */
function ago(ts) {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 5) return 'همین الان';
  if (sec < 60) return fa(sec) + ' ثانیه پیش';
  const m = Math.round(sec / 60); if (m < 60) return fa(m) + ' دقیقه پیش';
  const h = Math.round(m / 60); if (h < 48) return fa(h) + ' ساعت پیش'; return fa(Math.round(h / 24)) + ' روز پیش';
}
function inSec(ts) {
  const sec = Math.round((ts - Date.now()) / 1000);
  if (sec <= 0) return 'همین الان';
  if (sec < 60) return fa(sec) + ' ثانیه دیگر';
  return fa(Math.round(sec / 60)) + ' دقیقه دیگر';
}
const LVL_COLOR = { calm: '#00c853', caution: '#ffc400', warning: '#ff7a00', critical: '#ff2b2b' };
function gaugeSVG(id, W, H, cx, cy, r, sw, nl, big) {
  const x1 = cx - r, x2 = cx + r;
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="' + (big ? 'main-g' : '') + '" id="' + id + '" aria-hidden="true">' +
    '<defs><linearGradient id="' + id + '-g" gradientUnits="userSpaceOnUse" x1="' + x1 + '" y1="0" x2="' + x2 + '" y2="0">' +
    '<stop offset="0" stop-color="#00d65a"/><stop offset=".28" stop-color="#8bd62a"/><stop offset=".5" stop-color="#ffc400"/><stop offset=".74" stop-color="#ff6a00"/><stop offset="1" stop-color="#e0001a"/></linearGradient></defs>' +
    '<path d="M ' + x1 + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + x2 + ' ' + cy + '" fill="none" stroke="url(#' + id + '-g)" stroke-width="' + sw + '"/>' +
    '<g class="needle" style="transform-origin:' + cx + 'px ' + cy + 'px;transform:rotate(-90deg)"><line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - nl) + '" stroke="#fff" stroke-width="' + (big ? 5 : 3) + '" stroke-linecap="round"/></g>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + (big ? 10 : 6) + '" fill="#fff"/></svg>';
}
function setGauge(id, score) {
  const el = $(id); if (!el) return;
  el.classList.toggle('g-off', score == null);
  el.querySelector('.needle').style.transform = 'rotate(' + ((score == null ? 0 : score) * 1.8 - 90) + 'deg)';
}
const MINIS = [
  { id: 'news', label: 'اخبار و دیپلماسی', from: ['news'] },
  { id: 'air', label: 'آسمان و پرواز', from: ['airspace', 'flights'] },
  { id: 'mil', label: 'نیروی نظامی', from: ['military'] },
  { id: 'emb', label: 'سفارتخانه‌ها', from: ['embassy'] },
  { id: 'mkt', label: 'بازارها و پیش‌بینی', from: ['markets', 'crowd'] },
  { id: 'net', label: 'اینترنت', from: ['internet'] },
];
function buildGauges() {
  $('mainGauge').innerHTML = gaugeSVG('gMain', 240, 136, 120, 124, 104, 28, 92, true);
  $('minis').innerHTML = MINIS.map(m => '<div class="mini-g">' + gaugeSVG('g_' + m.id, 120, 70, 60, 62, 50, 13, 42, false) +
    '<div class="n" id="n_' + m.id + '">—</div><div class="l">' + m.label + '</div></div>').join('');
}

function tickTimes() {
  if (!S.lastCheck) { $('updated').textContent = nativeMode && !settings.demo ? 'سرویس در حال شروع است…' : 'هنوز بررسی نشده'; return; }
  let t = 'آخرین بررسی: ' + ago(S.lastCheck);
  if (S.nextCheck) t += ' • بعدی: ' + inSec(S.nextCheck);
  $('updated').textContent = t;
  $('newest').textContent = S.newestTs ? 'تازه‌ترین خبر دریافتی: ' + ago(S.newestTs) : '';
  const stale = !S.demo && Date.now() - S.lastCheck > 5 * MIN;
  $('staleBox').className = 'blind' + (stale ? ' on' : '');
}
setInterval(tickTimes, 1000);

function render() {
  $('modeChip').className = 'chip ' + (settings.demo ? 'demo' : 'live');
  $('modeChip').textContent = settings.demo ? 'حالت آزمایشی' : 'زنده';
  $('demoPanel').style.display = settings.demo ? '' : 'none';
  const r = S.result;
  if (r) {
    $('scoreNum').textContent = fa(r.final);
    $('lvlName').textContent = r.level.name;
    document.documentElement.style.setProperty('--lvl', LVL_COLOR[r.level.key]);
    setGauge('gMain', r.final);
    MINIS.forEach(m => {
      const vals = r.indicators.filter(i => m.from.includes(i.id) && i.available).map(i => i.risk);
      const v = vals.length ? Math.max.apply(null, vals) : null;
      setGauge('g_' + m.id, v);
      $('n_' + m.id).textContent = v == null ? '—' : fa(Math.round(v));
    });
    const d = S.trendRef != null ? r.final - S.trendRef : 0;
    $('trend').textContent = S.trendRef == null ? '' : d >= 3 ? '↑ رو به بدتر شدن' : d <= -3 ? '↓ رو به بهتر شدن' : '→ ثابت';
    $('trend').style.color = d >= 3 ? '#ff8a8a' : d <= -3 ? '#7dffb0' : '';
  }
  tickTimes();
  const act = E.SOURCES.filter(x => (settings.sources || {})[x.id] !== false);
  const blind = !settings.demo && S.lastCheck && act.length && act.every(x => S.health[x.id] && S.health[x.id].state === 'bad');
  $('blind').className = 'blind' + (blind ? ' on' : '');
  const rb = $('readyBox');
  if (S.ready && S.ready.level === 'ready') {
    rb.className = 'ready on';
    rb.innerHTML = '<b>آماده‌باش خانواده:</b> ' + esc(S.ready.why) + '.<br>هنوز حمله‌ای تأیید نشده، اما وقت آماده شدن است: مدارک، شارژ گوشی، آب و غذا، پول نقد، باک پر، محل قرار.';
  } else rb.className = 'ready';
  const a = S.alert || { level: 'none' }, st = $('alarmState');
  st.className = 'alarmstate ' + (a.level === 'none' ? '' : a.level);
  $('alarmText').textContent = a.level === 'full' ? 'آلارم کامل: حمله از دو منبع مستقل تأیید شده.' :
    a.level === 'standby' ? 'آماده‌باش: یک منبع معتبر با متن کامل خبر حمله داده، منتظر منبع دوم.' : 'آلارم آماده است. خبر حمله‌ای تأیید نشده.';

  const eff = r ? r.effective : [];
  const key = eff.filter(e => (e.tier === 'A' || e.tier === 'B' || e.tier === 'C') && e.pts > 0)
    .sort((x, y) => (x.tier === y.tier ? y.ts - x.ts : x.tier < y.tier ? -1 : 1)).slice(0, 15);
  const vlist = (S.verified || []).map(v => '<div class="item"><span class="tier X">حمله</span><div><b>' + esc(v.title) + '</b><span class="t">' + esc(v.source) + ' • ' + ago(v.ts) + ' • ' + (v.textLevel === 'full' ? 'متن کامل خوانده شد' : 'فقط خلاصه خبر') + '</span></div></div>').join('');
  $('keynews').innerHTML = vlist + (key.length ? key.map(e =>
    '<div class="item"><span class="tier ' + e.tier + '">' + e.tier + '</span><div><b>' + esc(e.label) + (e.hypo ? ' (تیتر شرطی، اثر کم)' : '') + (e.ir ? ' (منبع ایرانی، اثر نصف)' : '') + '</b><span class="t">' + esc(e.source) + ' • ' + ago(e.ts) + ' — ' + esc(e.title) + '</span></div></div>').join('')
    : (vlist ? '' : '<div class="empty">نشانه مهمی دیده نشده. این‌جا فقط خبرهایی می‌آیند که یکی از نشانه‌های پیش از حمله را دارند.</div>'));
  $('reasons').innerHTML = eff.length ? eff.slice(0, 25).map(e => {
    const p = Math.round(e.pts * 10) / 10;
    return '<div class="item"><span class="pts ' + (p > 0 ? 'pos' : 'neg') + '">' + (p > 0 ? '+' : '') + fa(p) + '</span><div><b>' + esc(e.label) + '</b><span class="t">' + esc(e.source) + ' • ' + ago(e.ts) + ' — ' + esc(e.title) + '</span></div></div>';
  }).join('') : '<div class="empty">هنوز دلیلی ثبت نشده.</div>';
  $('rejected').innerHTML = (S.rejected || []).length ? S.rejected.map(x => '<div class="item"><span class="pts rej">رد</span><div><b>' + esc(x.title) + '</b><span class="t">' + esc(x.source) + ' — ' + esc(x.reason) + '</span></div></div>').join('') : '<div class="empty">خبری رد نشده. تیترهای شرطی و زرد اینجا با دلیل نمایش داده می‌شوند.</div>';

  $('inds').innerHTML = (r ? r.indicators : E.INDICATORS.map(i => ({ name: i.name, weight: i.weight, risk: null, available: false, note: '' })))
    .map(i => '<div class="ind ' + (i.available ? '' : 'off') + '"><div class="top"><span>' + esc(i.name) + '</span><em>' + (i.available ? fa(Math.round(i.risk)) + ' از ۱۰۰' : 'بدون نمره') + ' • وزن ' + fa(i.weight) + '</em></div>' +
      '<div class="note">' + esc(i.note || '') + '</div>' +
      (i.available ? '<div class="mini"><i style="width:' + i.risk + '%;--bw:' + (100 / Math.max(i.risk, 1) * 100) + '%"></i></div>' : '') + '</div>').join('');

  // بازارها
  const mk = S.markets || {}, cr = S.crowd || {};
  let mh = '<div class="note" style="padding:10px 12px">' + esc(mk.note || 'هنوز اندازه‌گیری نشده') + (mk.risk != null ? ' • نمره ' + fa(Math.round(mk.risk)) : '') + '</div>';
  mh += (mk.items || []).map(i => i.err ? '<div class="src"><span>' + esc(i.name) + '</span><span class="bad">' + esc(i.err) + '</span></div>' :
    '<div class="src"><span>' + esc(i.name) + (i.stale ? ' <em class="idle">(بازار بسته)</em>' : '') + '</span><span class="' + (i.stale || i.ch24 == null ? 'idle' : E.marketContrib(i.key, i) > 0 ? 'bad' : 'idle') + '" style="direction:ltr;unicode-bidi:isolate">' + (i.ch24 == null ? '—' : (i.ch24 > 0 ? '+' : '') + (Math.round(i.ch24 * 10) / 10) + '% · 24h') + '</span></div>').join('');
  mh += '<div class="note" style="padding:10px 12px;border-top:1px solid var(--line)">بازار پیش‌بینی: ' + esc(cr.note || 'هنوز اندازه‌گیری نشده') + '</div>';
  mh += (cr.items || []).map(i => '<div class="src"><span style="direction:ltr;text-align:left;flex:1">' + esc(i.q) + '</span><span class="' + (i.p >= 0.5 ? 'bad' : 'idle') + '">' + fa(Math.round(i.p * 100)) + '٪</span></div>').join('');
  $('mkts').innerHTML = mh;

  $('srcs').innerHTML = settings.demo ? '<div class="empty">در حالت آزمایشی به منابع واقعی وصل نمی‌شویم.</div>' :
    E.SOURCES.map(s => { const h = (S.health || {})[s.id]; const off = (settings.sources || {})[s.id] === false;
      return '<div class="src"><span>' + esc(s.name) + '</span><span class="' + (off ? 'idle' : !h ? 'idle' : h.state === 'ok' ? 'ok' : 'bad') + '">' + (off ? 'خاموش' : !h ? 'بررسی نشده' : h.state === 'ok' ? 'سالم • ' + fa(h.count) + ' خبر • ' + ago(h.last) : 'ناموفق: ' + esc(h.err || '')) + '</span></div>'; }).join('');
}

/* ---------- حالت اندروید: خواندن وضعیت از سرویس ---------- */
async function pollNative() {
  try {
    const r = await RN.getState();
    if (r.state) { S = JSON.parse(r.state); render(); } else tickTimes();
    if (!r.running) RN.startService();
  } catch (e) {}
}
async function refresh(force) {
  if (useNativePoll()) {
    if (force) { try { RN.checkNow(); } catch (e) {} setTimeout(pollNative, 2500); }
    return pollNative();
  }
  return webCore.runCheck();
}
$('btnCheck').onclick = async () => {
  ensureCtx(); $('btnCheck').textContent = 'در حال بررسی…';
  await refresh(true); setTimeout(() => $('btnCheck').textContent = 'بررسی الان', 2500);
};
let loopT = null;
function loop() {
  clearTimeout(loopT);
  const ms = useNativePoll() ? 2000 : Math.max(1, +settings.interval || 1) * MIN;
  loopT = setTimeout(async () => { await refresh(false); loop(); }, ms);
}

/* ---------- تنظیمات لازم برای باز ماندن (اندروید) ---------- */
let permShown = false;
const BRAND_HINT = {
  xiaomi: 'شیائومی: تنظیمات ← برنامه‌ها ← مدیریت برنامه‌ها ← RiskWatch ← «شروع خودکار» را روشن و «صرفه‌جویی باتری» را روی «بدون محدودیت» بگذارید.',
  redmi: 'شیائومی: تنظیمات ← برنامه‌ها ← مدیریت برنامه‌ها ← RiskWatch ← «شروع خودکار» را روشن و «صرفه‌جویی باتری» را روی «بدون محدودیت» بگذارید.',
  poco: 'شیائومی: تنظیمات ← برنامه‌ها ← مدیریت برنامه‌ها ← RiskWatch ← «شروع خودکار» را روشن و «صرفه‌جویی باتری» را روی «بدون محدودیت» بگذارید.',
  samsung: 'سامسونگ: تنظیمات ← باتری ← «محدودیت‌های استفاده در پس‌زمینه» ← RiskWatch را از «برنامه‌های خواب» خارج کنید و «هرگز خواب نرود» را روشن کنید.',
  huawei: 'هوآوی: تنظیمات ← باتری ← راه‌اندازی برنامه‌ها ← RiskWatch ← مدیریت دستی ← هر سه گزینه (راه‌اندازی خودکار، راه‌اندازی ثانویه، اجرا در پس‌زمینه) روشن.',
  honor: 'هوآوی/آنر: تنظیمات ← باتری ← راه‌اندازی برنامه‌ها ← RiskWatch ← مدیریت دستی ← هر سه گزینه روشن.',
  oppo: 'اوپو: تنظیمات ← باتری ← RiskWatch ← «اجازه فعالیت در پس‌زمینه» و «شروع خودکار» را روشن کنید.',
  realme: 'ریلمی: تنظیمات ← باتری ← RiskWatch ← «اجازه فعالیت در پس‌زمینه» و «شروع خودکار» را روشن کنید.',
  vivo: 'ویوو: تنظیمات ← باتری ← مصرف انرژی پس‌زمینه ← RiskWatch ← «اجازه اجرا در پس‌زمینه» را روشن کنید.',
};
async function checkPerms(openIfMissing) {
  if (!nativeMode) return;
  let st; try { st = await RN.getStatus(); } catch (e) { return; }
  const manual = load('wr_manual', {});
  const items = [
    { id: 'notifications', ok: st.notifications, title: 'اعلان‌ها', why: 'بدون آن آلارم و پیام آماده‌باش نمایش داده نمی‌شود.', btn: 'فعال کن' },
    { id: 'battery', ok: st.battery, title: 'اجرا بدون محدودیت باتری', why: 'بدون آن اندروید رصد را می‌بندد.', btn: 'فعال کن' },
    { id: 'fullscreen', ok: st.fullScreen, title: 'نمایش آلارم روی صفحه قفل', why: 'تا آلارم حتی با گوشی قفل‌شده تمام‌صفحه باز شود.', btn: 'فعال کن' },
    { id: 'autostart', ok: !!manual.autostart, manual: true, title: 'شروع خودکار و تنظیم باتری برند گوشی', why: BRAND_HINT[st.brand] || 'در تنظیمات گوشی برای این اپ «شروع خودکار / اجرا در پس‌زمینه» را روشن و صرفه‌جویی باتری را «بدون محدودیت» کنید.', btn: 'باز کردن تنظیمات اپ' },
    { id: 'recents', ok: !!manual.recents, manual: true, title: 'قفل کردن اپ در لیست اخیر', why: 'دکمه برنامه‌های اخیر را بزنید، روی کارت اپ نگه دارید یا آیکونش را بزنید و «قفل» را انتخاب کنید.', btn: '' },
  ];
  $('permList').innerHTML = items.map(i => '<div class="perm ' + (i.ok ? 'done' : '') + '"><div class="ph"><span class="pk">' + (i.ok ? '✓' : '!') + '</span><b>' + esc(i.title) + '</b></div><div class="note">' + esc(i.why) + '</div>' +
    (i.manual ? '<div class="prow">' + (i.btn ? '<button class="btn" data-open="app">' + i.btn + '</button>' : '') + '<label class="chk"><input type="checkbox" data-manual="' + i.id + '" ' + (i.ok ? 'checked' : '') + '> انجام دادم</label></div>'
              : (i.ok ? '' : '<div class="prow"><button class="btn primary" data-open="' + i.id + '">' + i.btn + '</button></div>')) + '</div>').join('') +
    '<div class="perm"><div class="ph"><span class="pk">i</span><b>ویجت صفحه اصلی</b></div><div class="note">صفحه اصلی گوشی را نگه دارید ← ویجت‌ها ← «پایش خطر» را بکشید روی صفحه.</div></div>';
  $('permList').querySelectorAll('[data-open]').forEach(b => b.onclick = () => { try { RN.openSetting({ name: b.dataset.open }); } catch (e) {} });
  $('permList').querySelectorAll('[data-manual]').forEach(c => c.onchange = () => { const m = load('wr_manual', {}); m[c.dataset.manual] = c.checked; save('wr_manual', m); checkPerms(false); });
  const missing = items.filter(i => !i.ok).length;
  $('permBanner').className = 'blind perm-banner' + (missing ? ' on' : '');
  $('permBanner').textContent = missing ? 'برای کار کردن آلارم، ' + fa(missing) + ' تنظیم باقی مانده است. اینجا را بزنید.' : '';
  if (missing && openIfMissing && !permShown) { permShown = true; if (!$('dlgPerm').open) $('dlgPerm').showModal(); }
}
$('permBanner').onclick = () => { checkPerms(false); $('dlgPerm').showModal(); };
$('btnPermClose').onclick = () => $('dlgPerm').close();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkPerms(false); refresh(false); } });

/* ---------- تست اتصال ---------- */
async function testUrl(url) {
  if (nativeMode) { const r = await RN.httpGet({ url }); if (r.error) throw new Error(r.error); if (r.status >= 400) throw new Error('HTTP ' + r.status); return r.length; }
  return (await httpText(url, 10000)).length;
}
async function runDiag() {
  const out = $('diagOut');
  const tests = [
    ['OpenSky (پرواز)', 'https://opensky-network.org/api/states/all?lamin=35&lomin=51&lamax=36&lomax=52'],
    ['Cloudflare', 'https://www.cloudflare.com/cdn-cgi/trace'],
    ['آپارات (داخلی)', 'https://www.aparat.com/'],
    ['ایرنا RSS (داخلی)', 'https://www.irna.ir/rss'],
    ['BBC (از طریق گوگل)', E.SOURCES.find(s => s.id === 'bbcen').url],
    ['BBC فارسی (از طریق گوگل)', E.SOURCES.find(s => s.id === 'bbcfa').url],
    ['الجزیره RSS', 'https://www.aljazeera.com/xml/rss/all.xml'],
    ['بازار مالی (Yahoo)', E.marketUrl('BZ=F')],
    ['Polymarket', E.crowdUrl('US strikes Iran')],
  ];
  let html = '<div class="note">نسخه ۰٫۵ • اندروید: ' + (isNative ? 'بله' : 'خیر (مرورگر)') + ' • سرویس پس‌زمینه: ' + (nativeMode ? 'فعال' : 'ندارد') + '</div>';
  out.innerHTML = html;
  for (const [name, url] of tests) {
    out.innerHTML = html + '<div class="src"><span>' + name + '</span><span class="idle">در حال تست…</span></div>';
    let line;
    try { const n = await testUrl(url); line = '<span class="ok">موفق • ' + fa(n) + ' بایت</span>'; } catch (e) { line = '<span class="bad">' + esc(Core.shortErr(e)) + '</span>'; }
    html += '<div class="src"><span>' + name + '</span>' + line + '</div>';
  }
  out.innerHTML = html;
}
$('btnDiag').onclick = () => { $('dlgDiag').showModal(); runDiag(); };
$('btnDiagClose').onclick = () => $('dlgDiag').close();

/* ---------- دمو ---------- */
function buildDemo() {
  const g = $('demoGrid'); g.innerHTML = '';
  Object.keys(D.SCENARIOS).forEach(k => {
    const b = document.createElement('button'); b.textContent = D.SCENARIOS[k].label;
    if (k === scenario) b.className = 'on';
    b.onclick = () => { scenario = k; lsStore.set('acks', []); webCore.resetAlarmKey(); hideWebAlarm(); buildDemo(); webCore.runCheck(); };
    g.appendChild(b);
  });
}

/* ---------- تنظیمات ---------- */
function openSettings() {
  $('setDemo').checked = settings.demo; $('setInt').value = settings.interval; $('setWake').checked = settings.wake !== false;
  $('wakeRow').style.display = nativeMode ? '' : 'none';
  $('weights').innerHTML = E.INDICATORS.filter(i => i.available).map(i => {
    const w = settings.weights[i.id] != null ? settings.weights[i.id] : i.weight;
    return '<div class="field"><label><span>' + esc(i.name) + '</span><b id="wv_' + i.id + '">' + fa(w) + '</b></label><input type="range" min="0" max="40" value="' + w + '" data-w="' + i.id + '"></div>';
  }).join('');
  $('weights').querySelectorAll('input').forEach(r => r.oninput = () => $('wv_' + r.dataset.w).textContent = fa(r.value));
  $('srcToggles').innerHTML = E.SOURCES.map(s => '<div class="sw"><span>' + esc(s.name) + '</span><input type="checkbox" data-s="' + s.id + '" ' + (settings.sources[s.id] === false ? '' : 'checked') + '></div>').join('');
  $('dlg').showModal();
}
$('btnSettings').onclick = openSettings;
$('btnClose').onclick = () => $('dlg').close();
$('btnSave').onclick = () => {
  settings.demo = $('setDemo').checked; settings.interval = Math.max(1, +$('setInt').value || 1); settings.wake = $('setWake').checked;
  $('weights').querySelectorAll('input').forEach(r => settings.weights[r.dataset.w] = +r.value);
  $('srcToggles').querySelectorAll('input').forEach(c => settings.sources[c.dataset.s] = c.checked);
  save('wr_settings', settings); pushSettings(); $('dlg').close();
  S = { result: null, verified: [], rejected: [], ready: { level: 'none' }, alert: { level: 'none' }, health: {}, flights: null, lastCheck: 0, nextCheck: 0, newestTs: 0 };
  render(); refresh(true); loop();
};
$('btnReset').onclick = () => { settings = { demo: !nativeMode && !isNative, interval: 1, wake: true, weights: {}, sources: {} }; save('wr_settings', settings); pushSettings(); $('dlg').close(); refresh(true); loop(); };
document.addEventListener('pointerdown', ensureCtx);

buildGauges(); buildDemo(); render(); ensureCtx();
pushSettings();
if (nativeMode) { try { RN.startService(); } catch (e) {} checkPerms(true); }
refresh(false); loop();
})();
