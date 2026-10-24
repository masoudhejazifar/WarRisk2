/* موتور امتیازدهی و تأیید خبر — منطق خالص، بدون وابستگی به صفحه */
(function (root) {
'use strict';

const BASE_RISK = 30;      // نمره پایه: جنگ هنوز تمام نشده و آتش‌بس شکننده است
const PT = 4;              // هر امتیاز خبری چند واحد ریسک است
const HALF_LIFE_H = 12;    // نیمه‌عمر اثر هر خبر (ساعت)
const HOUR = 3600e3, MIN = 60e3;

const GN = q => 'https://news.google.com/rss/search?q=' + q + '&hl=en-US&gl=US&ceid=US:en';
const GNFA = q => 'https://news.google.com/rss/search?q=' + q + '&hl=fa&gl=IR&ceid=IR:fa';
const SOURCES = [
  // every = هر چند دقیقه یک بار خوانده شود (جستجوهای گوگل کمتر، تا مسدود نشوند)
  { id:'reuters', name:'رویترز', group:'reuters', every:2, strip:true, url:GN('Iran+when:1d+site:reuters.com') },
  { id:'ap',      name:'AP',     group:'ap',      every:2, strip:true, url:GN('Iran+when:1d+site:apnews.com') },
  { id:'bbcen',   name:'BBC (انگلیسی)', group:'bbc', every:2, strip:true, url:GN('Iran+when:1d+site:bbc.com') },
  { id:'bbcfa',   name:'BBC فارسی', group:'bbc',   every:2, strip:true, url:GNFA('site:bbc.com/persian+when:1d') },
  { id:'aljaz',   name:'الجزیره', group:'aljazeera', every:1, url:'https://www.aljazeera.com/xml/rss/all.xml' },
  { id:'irna',    name:'ایرنا',   group:'irna',    every:1, url:'https://www.irna.ir/rss' },
  { id:'isna',    name:'ایسنا',   group:'isna',    every:1, url:'https://www.isna.ir/rss' },
  { id:'mehr',    name:'مهر',     group:'mehr',    every:1, url:'https://www.mehrnews.com/rss' },
  { id:'tasnim',  name:'تسنیم',   group:'tasnim',  every:2, strip:true, url:GNFA('site:tasnimnews.com+when:1d') },
  { id:'fars',    name:'فارس',    group:'fars',    every:2, strip:true, url:GNFA('site:farsnews.ir+when:1d') },
  // جستجوهای موضوعی (از میان رسانه‌های معتبر فهرست‌شده)
  { id:'gn_emb',  name:'جستجو: سفارتخانه‌ها', gnews:true, every:3, url:GN('Iran+(embassy+OR+%22ordered+departure%22+OR+%22travel+advisory%22+OR+evacuation)+when:2d') },
  { id:'gn_air',  name:'جستجو: آسمان و پرواز', gnews:true, every:3, url:GN('Iran+(airspace+OR+NOTAM+OR+%22flights+suspended%22)+when:2d') },
  { id:'gn_str',  name:'جستجو: حمله و انفجار', gnews:true, every:3, url:GN('Iran+(strike+OR+explosion+OR+attack)+when:1d') },
  { id:'gn_rus',  name:'جستجو: تخلیه روسیه و بوشهر', gnews:true, every:3, url:GN('Bushehr+OR+Rosatom+evacuate+when:3d') },
  { id:'gn_fa',   name:'جستجو: فارسی', gnews:true, every:3, url:GNFA('%D8%A7%DB%8C%D8%B1%D8%A7%D9%86+%D8%AD%D9%85%D9%84%D9%87+OR+%D8%A7%D9%86%D9%81%D8%AC%D8%A7%D8%B1+when:1d') },
];
const PUB_GROUPS = [ [/reuters|رویترز/, 'reuters'], [/associated press|^ap$|\bap news/, 'ap'], [/bbc|بی.?بی.?سی/, 'bbc'], [/al jazeera|aljazeera|الجزیره/, 'aljazeera'],
  [/afp/, 'afp'], [/cnn/, 'cnn'], [/axios/, 'axios'], [/jerusalem post/, 'jpost'], [/times of israel/, 'toi'], [/bloomberg/, 'bloomberg'],
  [/irna|ایرنا/, 'irna'], [/isna|ایسنا/, 'isna'], [/mehr|مهر/, 'mehr'], [/tasnim|تسنیم/, 'tasnim'], [/fars|فارس/, 'fars'] ];
function pubGroup(pub) {
  const n = String(pub || '').toLowerCase();
  for (const [re, g] of PUB_GROUPS) if (re.test(n)) return g;
  return n.replace(/[^a-z0-9\u0600-\u06ff]/g, '');
}
// منابع ایرانی: خبر جنگ را بیشتر و پررنگ‌تر پوشش می‌دهند، پس اثرشان کمتر حساب می‌شود
const IR_SOURCE = /irna|isna|mehr|tasnim|fars|ایرنا|ایسنا|مهر|تسنیم|فارس|press ?tv|tehran times|kayhan|کیهان|مشرق|mashregh|young journalists|باشگاه خبرنگاران/i;

// فقط این ناشرها از جستجوهای موضوعی پذیرفته می‌شوند (ایران اینترنشنال و سایت‌های زرد عمداً نیستند)
const TRUSTED_PUB = /reuters|associated press|^ap$|\bap news|bbc|al jazeera|aljazeera|afp|france 24|dw\b|deutsche welle|cnn|new york times|washington post|guardian|bloomberg|axios|wall street journal|times of israel|jerusalem post|irna|isna|mehr|tasnim|fars|ایرنا|ایسنا|مهر|تسنیم|فارس|بی.?بی.?سی|الجزیره|رویترز/i;


const INDICATORS = [
  { id:'news',     name:'اخبار و دیپلماسی',          weight:18, available:true },
  { id:'airspace', name:'آسمان (خبرها و اعلان رسمی)', weight:16, available:true },
  { id:'flights',  name:'ترافیک هوایی زنده',         weight:14, available:true },
  { id:'embassy',  name:'سفارتخانه‌ها و هشدار سفر',  weight:20, available:true },
  { id:'military', name:'نیروی نظامی و دفاع غیرنظامی', weight:14, available:true },
  { id:'markets',  name:'بازارهای مالی و انرژی',     weight:10, available:true },
  { id:'crowd',    name:'بازار پیش‌بینی (Polymarket)', weight:8, available:true },
  { id:'internet', name:'اینترنت',                   weight:8,  available:true },
];

/* ---------- متن ---------- */
function norm(s) {
  return String(s || '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .toLowerCase();
}
function unent(s) {
  return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ')
    .replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/&amp;/g,'&');
}
function stripHtml(s) {
  s = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = unent(s).replace(/<[^>]+>/g, ' ');
  return unent(s).replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const m = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i'));
  return m ? m[1] : '';
}
function parseFeed(xml, src) {
  const out = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = stripHtml(tag(b, 'title'));
    if (!title) continue;
    let link = stripHtml(tag(b, 'link'));
    if (!link) { const m = b.match(/<link[^>]*href=["']([^"']+)["']/i); link = m ? unent(m[1]) : ''; }
    const body = stripHtml(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'));
    const d = new Date(stripHtml(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')));
    let source = src.name, group = src.group, t = title;
    const pub = stripHtml(tag(b, 'source'));
    if (src.gnews) {
      if (!pub || !TRUSTED_PUB.test(pub)) continue;
      source = pub; group = pubGroup(pub);
    }
    if ((src.gnews || src.strip) && pub && t.endsWith(' - ' + pub)) t = t.slice(0, -(pub.length + 3));
    else if (src.strip) t = t.replace(/\s+-\s+[^-]{2,40}$/, '');
    out.push({
      title: t, link, body, ts: isNaN(d) ? null : d.getTime(),
      source, group, fullText: false,
    });
  }
  return out;
}
function extractArticleText(html) {
  let h = String(html || '').replace(/<(script|style|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  const ps = (h.match(/<p[\s>][\s\S]*?<\/p>/gi) || []).map(stripHtml).filter(t => t.length > 40);
  let text = ps.join('\n');
  if (text.length < 200) {
    const m = h.match(/<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)["']/i);
    if (m) text = stripHtml(m[1]) + '\n' + text;
  }
  return text.slice(0, 6000);
}

/* ---------- شهرها و الگوها ---------- */
const CITIES = [
  ['Tehran', /tehran|تهران/], ['Isfahan', /isfahan|esfahan|اصفهان/], ['Tabriz', /tabriz|تبریز/],
  ['Shiraz', /shiraz|شیراز/], ['Mashhad', /mashhad|مشهد/], ['Bushehr', /bushehr|بوشهر/],
  ['Natanz', /natanz|نطنز/], ['Fordow', /fordow|fordo|فردو/], ['Parchin', /parchin|پارچین/],
  ['BandarAbbas', /bandar abbas|بندر عباس/], ['Kermanshah', /kermanshah|کرمانشاه/],
  ['Ahvaz', /ahvaz|اهواز/], ['Karaj', /karaj|کرج/], ['Qom', /\bqom\b|قم/], ['Arak', /\barak\b|اراک/],
  ['Urmia', /urmia|ارومیه/], ['Zahedan', /zahedan|زاهدان/], ['Hamedan', /hamedan|همدان/],
  ['Kharg', /kharg|خارک/], ['Chabahar', /chabahar|چابهار/], ['Semnan', /semnan|سمنان/],
];
const GENERIC_IRAN = /(strikes?|attacks?|attacked|bombing|bombed|missiles?|explosions?)\s+(on|against|in|inside|across)\s+iran|inside iran|across iran|حمله\s+(به|علیه)\s+ایران|در\s+(سراسر|داخل)\s+ایران/;

const ATTACK = new RegExp([
  'air ?strikes?', 'strikes? (?:on|against|hit|hits|rocked)', '\\bstruck\\b', 'bombed', 'bombing', 'explosions?', 'blasts?',
  'missiles? (?:hit|struck|landed|slammed)', 'rockets? (?:hit|struck)', 'shelling', 'attacked', 'attack on',
  'حمله هوایی', 'حمله', 'بمباران', 'انفجار', 'اصابت', 'موشک.{0,15}(?:اصابت|فرود|شلیک شد)', 'پدافند.{0,15}فعال'
].join('|'));

const HYPO = new RegExp([
  '\\bif\\b', '\\bcould\\b', '\\bwould\\b', '\\bmay\\b', '\\bmight\\b', 'warns?\\b', 'warned', 'threat', 'scenario',
  'fears?\\b', 'risk of', 'hypothetical', 'drills?\\b', 'exercises?\\b', 'simulat', 'what happens', 'what if', 'prepare for',
  'اگر', 'در صورت', 'چنانچه', 'احتمال', 'ممکن است', 'می‌تواند', 'میتواند', 'تهدید', 'سناریو', 'هشدار داد', 'رزمایش', 'مانور',
  'شبیه.?سازی', 'چه می.?شود', 'چه اتفاقی', 'اگه'
].join('|'));

const HIST = new RegExp([
  'anniversary', 'last (?:year|month|week)', 'years? ago', 'in (?:19|20)\\d\\d', 'history', 'remember', 'commemorat',
  'سالگرد', 'سال گذشته', 'پارسال', 'ماه گذشته', 'هفته گذشته', 'سال‌ها پیش', 'تاریخ', 'یادبود'
].join('|'));

const UNCERTAIN = new RegExp([
  'denied', 'denies', 'rumou?rs?', 'fake', 'false', 'no reports of', 'hoax', 'unfounded', 'debunk',
  'تکذیب', 'شایعه', 'جعلی', 'کذب', 'خبری از .{0,20} نیست', 'ساختگی'
].join('|'));

const FRESH = /(today|just now|hours? ago|minutes? ago|breaking|moments ago|امروز|ساعاتی پیش|همین الان|لحظاتی پیش|دقایقی پیش|فوری)/;

function sentences(text) {
  return String(text || '').split(/(?<=[.!?؟۔\n])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}
function citiesIn(n) {
  const out = [];
  for (const [k, re] of CITIES) if (re.test(n)) out.push(k);
  if (GENERIC_IRAN.test(n)) out.push('Iran');
  return out;
}
function isHypothetical(raw) { const n = norm(raw); return HYPO.test(n); }
// برای نشانگرها فقط جمله‌های واقعاً شرطی کم‌اثر می‌شوند («هشدار داد» و «تهدید» خبر واقعی‌اند)
const COND = /\bif\b|\bcould\b|\bwould\b|\bmight\b|what happens|what if|scenario|hypothetical|simulat|\bdrills?\b|\bexercises?\b|اگر|در صورت|چنانچه|سناریو|مانور|رزمایش|چه می.?شود|شبیه.?سازی/;
function isConditional(raw) { return COND.test(norm(raw)); }
function qualifies(raw) {
  const n = norm(raw);
  if (!ATTACK.test(n)) return null;
  if (HYPO.test(n) || HIST.test(n) || UNCERTAIN.test(n)) return null;
  const c = citiesIn(n);
  return c.length ? c : null;
}
function looksLikeAttack(item) {
  const n = norm(item.title + ' ' + (item.body || '').slice(0, 400));
  return ATTACK.test(n) && citiesIn(n).length > 0;
}

/* تأیید یک خبر: آیا واقعاً خبر رخداد حمله در ایران است؟ */
function verifyAttack(item, now) {
  now = now || Date.now();
  if (isHypothetical(item.title)) return { ok: false, reason: 'تیتر شرطی یا تهدیدی است (اگر / ممکن است / هشدار)' };
  if (UNCERTAIN.test(norm(item.title))) return { ok: false, reason: 'تیتر تکذیب یا شایعه است' };
  if (HIST.test(norm(item.title))) return { ok: false, reason: 'درباره رویداد گذشته است' };
  const age = item.ts ? now - item.ts : 0;
  if (age > 6 * HOUR) return { ok: false, reason: 'خبر قدیمی است' };

  const titleHit = qualifies(item.title);
  const text = item.body || '';
  const bodyHits = [];
  for (const s of sentences(text)) { const c = qualifies(s); if (c) bodyHits.push(...c); }

  if (item.fullText) {
    if (!bodyHits.length) return { ok: false, reason: 'متن کامل رخداد حمله در شهر ایران را تأیید نکرد' };
    if (!(titleHit || FRESH.test(norm(item.title + ' ' + text)) || (item.ts && age <= 3 * HOUR)))
      return { ok: false, reason: 'نشانه تازه بودن خبر دیده نشد' };
    return { ok: true, textLevel: 'full', cities: uniq(bodyHits.concat(titleHit || [])) };
  }
  if (titleHit && (!text || !HYPO.test(norm(text)))) {
    return { ok: true, textLevel: 'summary', cities: uniq(titleHit) };
  }
  return { ok: false, reason: 'متن کافی برای تأیید در دسترس نیست' };
}
function uniq(a) { return Array.from(new Set(a)); }
function overlap(a, b) {
  if (a.includes('Iran') || b.includes('Iran')) return true;
  return a.some(x => b.includes(x));
}

/* وضعیت آلارم از روی خبرهای تأییدشده */
function alertState(verified, now) {
  now = now || Date.now();
  const recent = verified.filter(v => now - (v.ts || now) <= 120 * MIN);
  if (!recent.length) return { level: 'none' };
  // آلارم کامل: دو گروه خبری مستقل، همان محل، فاصله کمتر از ۹۰ دقیقه، و دست‌کم یکی با متن کامل
  for (const a of recent) for (const b of recent) {
    if (a === b || a.group === b.group) continue;
    if (!overlap(a.cities, b.cities)) continue;
    if (Math.abs((a.ts || now) - (b.ts || now)) > 90 * MIN) continue;
    if (a.textLevel !== 'full' && b.textLevel !== 'full') continue;
    const cities = uniq(a.cities.concat(b.cities)).filter(c => c !== 'Iran');
    const key = 'full:' + (cities[0] || 'Iran') + ':' + Math.floor(Math.min(a.ts || now, b.ts || now) / HOUR);
    return { level: 'full', key, cities, items: [a, b] };
  }
  const solo = recent.filter(v => v.textLevel === 'full');
  if (solo.length) {
    const a = solo[0];
    const cities = a.cities.filter(c => c !== 'Iran');
    return { level: 'standby', key: 'standby:' + (cities[0] || 'Iran') + ':' + Math.floor((a.ts || now) / HOUR), cities, items: [a] };
  }
  return { level: 'none' };
}

/* ---------- قانون‌های نشانگرها (بر اساس تحلیل جنگ‌های ژوئن ۲۰۲۵، ژانویه و فوریه ۲۰۲۶) ----------
   tier: A = بسیار قوی (ساعت‌ها تا یک روز زودتر)، B = قوی (چند روز)، C = زمینه‌ای (هفته‌ها)
   ease = نشانه کاهش تنش | N = خبر عمومی تنش */
const RULES = [
  // ---- رده A ----
  { ind:'embassy',  tier:'A', pts:+12, label:'دستور خروج کارکنان سفارت (یا «همین امروز خارج شوید»)',
    all:[/embass|consulate|state department|سفارت|کنسولگری|وزارت خارجه/, /ordered departure|non-emergency|leave[^.]{0,30}today|should do so today|authorized departure|همین امروز|خروج کارکنان غیرضروری|دستور خروج/] },
  { ind:'airspace', tier:'A', pts:+10, label:'اعلان رسمی (NOTAM) بسته شدن آسمان خود ایران',
    all:[/(iran(ian)?|tehran)'?s? (airspace|fir)|airspace (of|over|in) (iran|tehran)|iran(ian)? (authorities |civil aviation )?(clos|shut)\w* (its |the )?(national |entire )?airspace|notam[^.]{0,40}(iran|tehran)|(iran|tehran)[^.]{0,40}notam|حریم هوایی ایران|آسمان ایران|نوتم/, /clos|shut|bann|بسته|مسدود|ممنوع/], none:[/reopen|re-open|resum|باز شد|بازگش|از سر گرفت/] },
  // ---- رده B ----
  { ind:'embassy',  tier:'B', pts:+8,  label:'کاهش کارکنان سفارت‌ها یا تسریع تخلیه دیپلمات‌ها',
    all:[/embass|diplomat|سفارت|دیپلمات/, /draw ?down|reduc[^.]{0,20}(staff|personnel)|accelerat[^.]{0,25}(evacuat|departure)|کاهش (کارکنان|نیرو)|تسریع.{0,15}تخلیه/] },
  { ind:'embassy',  tier:'B', pts:+10, label:'تعطیلی یا تخلیه سفارت',
    all:[/embass|consulate|سفارت|کنسولگری/, /clos|evacuat|withdraw|suspend|تعطیل|تخلیه|بسته/], none:[/reopen|re-open|باز شد|بازگشایی/] },
  { ind:'embassy',  tier:'B', pts:+8,  label:'هشدار «ایران را ترک کنید» یا هشدار سفر سطح ۴',
    all:[/do not travel|leave (iran|the country)|level 4|urges citizens|ترک ایران|هشدار سفر|فراخوان.{0,10}اتباع/, /iran|ایران|iraq|عراق|israel|اسرائیل|region|منطقه/] },
  { ind:'airspace', tier:'B', pts:+7,  label:'بسته شدن یا محدود شدن آسمان منطقه',
    all:[/airspace|حریم هوایی|آسمان/, /clos|shut|restrict|بسته|مسدود|محدود/], none:[/reopen|re-open|resum|باز شد|بازگش|از سر گرفت/] },
  { ind:'airspace', tier:'B', pts:+6,  label:'لغو یا تعلیق پروازها',
    all:[/flights?|airlines?|پرواز|ایرلاین/, /cancel|suspend|halt|divert|لغو|تعلیق|متوقف|تغییر مسیر/], none:[/resum|از سر گرفت/] },
  { ind:'military', tier:'B', pts:+8,  label:'تخلیه اتباع یا کارشناسان روسیه یا چین از ایران',
    all:[/russia|rosatom|chinese|china|روس|چین/, /evacuat|withdraw|pull(ed)? out|تخلیه|خارج کرد|خروج/, /iran|bushehr|ایران|بوشهر/] },
  { ind:'military', tier:'B', pts:+6,  label:'تغییر وضعیت نیروهای آمریکایی در پایگاه‌های منطقه',
    all:[/al.?udeid|العدید|us (bases|forces|troops)|پایگاه/, /leave|relocat|move out|posture|evacuat|خروج|جابجایی|تخلیه/] },
  { ind:'news',     tier:'B', pts:+6,  label:'ضرب‌الاجل رسمی یا شکست مذاکرات',
    all:[/deadline|ultimatum|talks (collapse|fail|break)|negotiations (collapse|fail)|ضرب.?الاجل|مهلت|شکست مذاکرات/, /iran|ایران/] },
  // ---- رده C ----
  { ind:'military', tier:'C', pts:+6,  label:'اعزام ناو یا بمب‌افکن',
    all:[/aircraft carrier|carrier strike|warships?|bombers?|ناو|ناوگروه|بمب.?افکن/, /deploy|sent|moves?|dispatch|اعزام|مستقر|حرکت/] },
  { ind:'military', tier:'C', pts:+5,  label:'جلسه امنیتی یا شورای امنیت درباره ایران',
    all:[/security council|security cabinet|شورای امنیت|کابینه امنیتی/, /emergency|urgent|iran|اضطراری|فوری|ایران/] },
  { ind:'military', tier:'C', pts:+6,  label:'آماده‌باش نظامی یا رزمایش تهاجمی نزدیک ایران',
    all:[/high alert|on alert|mobiliz|simulated (attack|strike)|آماده.?باش|بسیج نیرو/] },
  { ind:'news',     tier:'C', pts:+4,  label:'گزارش آژانس اتمی یا تصمیم علیه برنامه هسته‌ای',
    all:[/iaea|آژانس (بین.?المللی )?انرژی اتمی|آژانس اتمی/, /report|resolution|board|گزارش|قطعنامه/] },
  // ---- نشانه‌های تازه ----
  { ind:'military', tier:'B', pts:+7, label:'هشدار مقام‌ها: حمله «قریب‌الوقوع» یا طرح حمله آماده',
    all:[/imminent|within (hours|days)|preparing (for )?(a )?(strike|attack)|planning (a )?(strike|attack)|approved (a )?strike|strike plans?|قریب.?الوقوع|طرح حمله/, /iran|ایران/] },
  { ind:'military', tier:'B', pts:+7, label:'تغییر دستورالعمل دفاع غیرنظامی اسرائیل (Home Front Command)',
    all:[/home front command|فرماندهی جبهه داخلی/, /restrict|guideline|shelter|gathering|school|cancel|پناهگاه|محدودیت|تجمع|مدارس/] },
  { ind:'airspace', tier:'B', pts:+8, label:'بسته شدن آسمان اسرائیل یا فرودگاه بن‌گوریون',
    all:[/israel(i)?|ben gurion|اسرائیل|بن گوریون/, /airspace|airport|حریم هوایی|فرودگاه/, /clos|shut|بسته|مسدود/], none:[/reopen|re-open|resum|باز شد|بازگش|از سر گرفت/] },
  { ind:'airspace', tier:'B', pts:+7, label:'بسته شدن آسمان کشورهای خلیج فارس',
    all:[/qatar|uae|emirates|bahrain|kuwait|saudi|oman|iraq|jordan|قطر|امارات|بحرین|کویت|عربستان|عمان|عراق|اردن/, /airspace|حریم هوایی/, /clos|shut|bann|بسته|مسدود/], none:[/reopen|re-open|resum|باز شد|بازگش|از سر گرفت/] },
  { ind:'military', tier:'B', pts:+6, label:'استقرار سوخت‌رسان، بمب‌افکن یا پدافند آمریکا نزدیک ایران',
    all:[/tanker aircraft|kc-135|kc-46|b-2|b-52|f-22|f-35|thaad|patriot|air defen[cs]e|سوخت.?رسان|پدافند/, /deploy|sent|moves?|dispatch|arriv|اعزام|مستقر|رسید/] },
  { ind:'markets',  tier:'B', pts:+6, label:'تنگه هرمز: حمله به کشتی، مین‌گذاری یا هشدار دریایی (UKMTO/JMIC)',
    all:[/hormuz|هرمز|ukmto|jmic|tanker|کشتی|نفتکش/, /attack|mine|seiz|clos|advisory|threat|حمله|مین|توقیف|بسته|هشدار/] },
  { ind:'markets',  tier:'C', pts:+4, label:'افزایش حق‌بیمه جنگ برای کشتی‌های خلیج فارس',
    all:[/war.?risk|insurers?|insurance|حق.?بیمه|بیمه/, /gulf|hormuz|iran|خلیج|هرمز|ایران/, /rise|raise|hike|surge|jump|suspend|cancel|افزایش|لغو/] },
  { ind:'markets',  tier:'C', pts:+4, label:'جهش ناگهانی صادرات یا بارگیری نفت ایران',
    all:[/iran(ian)?|kharg|ایران|خارک/, /oil exports?|crude exports?|tanker loading|loading|صادرات نفت|بارگیری/, /surge|jump|rise|accelerat|record|افزایش|جهش|شتاب/] },
  // ---- کاهش تنش ----
  { ind:'airspace', tier:'ease', pts:-9, label:'بازگشایی آسمان یا از سرگیری پرواز',
    all:[/airspace|حریم هوایی|flights?|پرواز/, /reopen|re-open|resum|باز شد|بازگشایی|از سر گرفت|ازسرگیری/] },
  { ind:'embassy',  tier:'ease', pts:-8, label:'بازگشایی سفارت یا کاهش هشدار سفر',
    all:[/embass|consulate|travel advisory|سفارت|هشدار سفر/, /\breopen(s|ed|ing)?\b|re-open|\blowers?\b|\blowered\b|\beased\b|\blifted\b|باز شد|بازگشایی|لغو شد/] },
  { ind:'news',     tier:'ease', pts:-4, label:'خبر کاهش تنش (آتش‌بس، مذاکره)',
    all:[/ceasefire|truce|de-escalat|negotiat|talks|آتش.?بس|مذاکره|کاهش تنش|توافق/] },
];

const IRAN_REL = /iran|ایران|tehran|تهران|bushehr|بوشهر|hormuz|هرمز|persian gulf|خلیج فارس/;
function isIranianSource(item) { return IR_SOURCE.test(String(item.source || '') + ' ' + String(item.group || '')); }

function classify(item, now) {
  now = now || Date.now();
  const ts = item.ts || now;
  const n = norm(item.title + ' . ' + (item.body || '').slice(0, 300));
  if (!IRAN_REL.test(n)) return [];            // خبر باید خودش درباره ایران باشد
  const cond = isConditional(item.title);
  const ir = isIranianSource(item);
  const out = [];
  const used = new Set();
  for (const r of RULES) {
    if (!r.all.every(re => re.test(n))) continue;
    if (r.none && r.none.some(re => re.test(n))) continue;
    if (ir && r.pts < 0) continue;             // «کاهش تنش» از منابع ایرانی حساب نمی‌شود
    const k = r.ind + (r.pts > 0 ? '+' : '-');
    if (used.has(k)) continue;
    used.add(k);
    let pts = r.pts;
    if (pts > 0 && cond) pts *= 0.4;
    if (pts > 0 && ir) pts *= 0.5;
    out.push({
      id: (item.link || item.title) + '|' + r.label,
      ind: r.ind, tier: r.tier, label: r.label, hypo: cond, ir, pts,
      title: item.title, source: item.source, group: item.group, ts, link: item.link,
    });
  }
  return out;
}

/* آماده‌باش خانواده: یک نشانه رده A، یا دو نشانه متفاوت رده B از دو منبع مستقل در ۲۴ ساعت */
function readinessState(events, now) {
  now = now || Date.now();
  const recent = events.filter(e => e.pts > 0 && !e.hypo && !e.ir && now - e.ts <= 24 * HOUR && (e.tier === 'A' || e.tier === 'B'));
  const a = recent.filter(e => e.tier === 'A');
  const key = 'ready:' + Math.floor(now / (12 * HOUR));
  if (a.length) return { level: 'ready', key, why: 'نشانه رده A: ' + a[0].label, items: a.slice(0, 4) };
  const b = recent.filter(e => e.tier === 'B');
  const labels = uniq(b.map(e => e.label));
  const groups = uniq(b.map(e => e.group));
  if (labels.length >= 2 && groups.length >= 2) return { level: 'ready', key, why: 'دو نشانه رده B از منابع مستقل', items: b.slice(0, 5) };
  return { level: 'none' };
}

/* ترافیک هوایی: دو مقایسه، ۱) با ۳ ساعت اخیر (افت ناگهانی)  ۲) با همین ساعت روزهای قبل
   cur = { n: تعداد کل منطقه, i: تعداد بالای ایران } */
function median(a) { const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function flightRisk(samples, cur, now) {
  now = now || Date.now();
  if (!cur || cur.n == null) return { risk: null, note: 'داده پرواز در دسترس نیست' };
  const prev = samples.filter(s => s.t < now - 5 * MIN);
  const shortS = prev.filter(s => now - s.t <= 3 * HOUR).map(s => s.n);
  const dayS = [];
  for (let k = 1; k <= 3; k++) prev.forEach(s => { if (Math.abs(now - k * 24 * HOUR - s.t) <= 75 * MIN) dayS.push(s.n); });
  const bases = [];
  if (shortS.length >= 4) bases.push({ n: median(shortS), why: '۳ ساعت اخیر' });
  if (dayS.length >= 3) bases.push({ n: median(dayS), why: 'همین ساعت روزهای قبل' });
  const show = 'اکنون ' + cur.n + ' هواپیما در منطقه، ' + (cur.i || 0) + ' بالای ایران';
  if (!bases.length) return { risk: null, note: show + ' • در حال یادگیری (' + prev.length + ' نمونه)' };
  const ok = bases.filter(b => b.n >= 8);
  if (!ok.length) return { risk: null, note: show + ' • پوشش رادار ضعیف است' };
  const worst = ok.reduce((m, b) => (cur.n / b.n < cur.n / m.n ? b : m), ok[0]);
  const ratio = cur.n / worst.n;
  const risk = ratio >= 0.8 ? 20 : ratio >= 0.5 ? 40 : ratio >= 0.25 ? 70 : 92;
  return { risk, note: show + ' • حالت عادی (' + worst.why + ') حدود ' + Math.round(worst.n) };
}


/* ---------- بازارهای مالی (Yahoo Finance) ---------- */
const MARKET_SYMBOLS = [
  { key: 'brent', sym: 'BZ=F', name: 'نفت برنت' },
  { key: 'gold', sym: 'GC=F', name: 'طلا' },
  { key: 'vix', sym: '^VIX', name: 'شاخص ترس (VIX)' },
  { key: 'ta125', sym: '^TA125.TA', name: 'بورس تل‌آویو' },
  { key: 'es', sym: 'ES=F', name: 'آتی S&P 500' },
  { key: 'ils', sym: 'ILS=X', name: 'دلار به شکل اسرائیل' },
  { key: 'btc', sym: 'BTC-USD', name: 'بیت‌کوین (۲۴ ساعته)' },
];
function marketUrl(sym) { return 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=2d&interval=15m'; }
function yahooParse(text, now) {
  const j = JSON.parse(text);
  const r = j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error('پاسخ بازار خالی است');
  const ts = r.timestamp || [], cl = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const pts = [];
  for (let i = 0; i < ts.length; i++) if (cl[i] != null) pts.push({ t: ts[i] * 1000, c: cl[i] });
  if (!pts.length) throw new Error('بدون داده');
  const last = pts[pts.length - 1];
  const before = ms => { for (let i = pts.length - 1; i >= 0; i--) if (pts[i].t <= last.t - ms) return pts[i].c; return null; };
  const b3 = before(3 * HOUR), b24 = before(24 * HOUR);
  return { price: last.c, t: last.t, ch3: b3 ? (last.c / b3 - 1) * 100 : null, ch24: b24 ? (last.c / b24 - 1) * 100 : null, stale: now - last.t > 90 * MIN };
}
// هر تغییر در جهتی که با تشدید جنگ می‌خواند، امتیاز می‌گیرد
function marketContrib(key, it) {
  const c3 = it.ch3 == null ? 0 : it.ch3, c24 = it.ch24 == null ? 0 : it.ch24;
  switch (key) {
    case 'brent': return (c24 >= 6 ? 30 : c24 >= 3 ? 15 : c24 >= 1.5 ? 6 : 0) + (c3 >= 2 ? 10 : 0);
    case 'gold':  return c24 >= 3 ? 20 : c24 >= 1.5 ? 10 : c24 >= 0.8 ? 4 : 0;
    case 'vix':   return it.price >= 30 ? 20 : it.price >= 25 ? 12 : (it.price >= 20 && c24 >= 15) ? 8 : 0;
    case 'ta125': return c24 <= -3 ? 20 : c24 <= -1.5 ? 8 : 0;
    case 'es':    return c24 <= -2 ? 12 : c24 <= -1 ? 5 : 0;
    case 'ils':   return c24 >= 1.5 ? 8 : 0;
    case 'btc':   return (c3 <= -3 ? 8 : 0) + (c24 <= -6 ? 10 : 0);
    default: return 0;
  }
}
function marketRisk(items) {
  const live = items.filter(i => !i.stale);
  if (!live.length) return { risk: null, note: 'بازارهای سنتی بسته‌اند (آخر هفته یا شب). با باز شدن بازار به‌روز می‌شود.' };
  const sum = live.reduce((s, i) => s + marketContrib(i.key, i), 0);
  const risk = clamp(20 + sum, 0, 100);
  const top = live.map(i => ({ n: i.name, c: marketContrib(i.key, i) })).filter(x => x.c > 0).sort((a, b) => b.c - a.c).slice(0, 2).map(x => x.n);
  return { risk, note: top.length ? 'حرکت غیرعادی: ' + top.join('، ') : 'بدون حرکت غیرعادی' };
}

/* ---------- بازار پیش‌بینی (Polymarket) ---------- */
const CROWD_QUERIES = ['US strikes Iran', 'Israel strikes Iran'];
function crowdUrl(q) { return 'https://gamma-api.polymarket.com/public-search?q=' + encodeURIComponent(q); }
function crowdParse(texts, now) {
  const out = [], seen = new Set();
  for (const t of texts) {
    let j; try { j = JSON.parse(t); } catch (e) { continue; }
    const events = Array.isArray(j) ? j : (j.events || []);
    for (const ev of events) for (const m of (ev.markets || [])) {
      const q = String(m.question || ev.title || '');
      if (!q || seen.has(q) || m.closed || m.active === false) continue;
      if (!/iran/i.test(q) || !/strike|attack|bomb|military|war\b|invade|hit\b/i.test(q) || /ceasefire|deal|agreement|talks|nuclear test/i.test(q)) continue;
      const end = Date.parse(m.endDate || m.end_date_iso || ev.endDate || '');
      if (!isNaN(end) && (end - now > 60 * 24 * HOUR || end < now)) continue;   // فقط پرسش‌های کوتاه‌مدت
      let p = null;
      try { const pr = JSON.parse(m.outcomePrices), oc = JSON.parse(m.outcomes); const yi = oc.findIndex(x => /^yes$/i.test(x)); p = parseFloat(pr[yi >= 0 ? yi : 0]); } catch (e) { }
      if (p == null || isNaN(p)) continue;
      seen.add(q);
      out.push({ q, p, end: isNaN(end) ? null : end, vol: +m.volume || 0 });
    }
  }
  return out.sort((a, b) => b.p - a.p).slice(0, 4);
}
function crowdRisk(items, prev, now) {
  if (!items.length) return { risk: null, note: 'پرسش فعالی درباره حمله به ایران پیدا نشد' };
  const top = items[0];
  let risk = top.p >= 0.7 ? 80 : top.p >= 0.5 ? 60 : top.p >= 0.35 ? 45 : top.p >= 0.2 ? 32 : 20;
  let jump = 0;
  const old = (prev && prev[top.q] || []).filter(x => now - x.t >= 20 * HOUR).pop();
  if (old) jump = top.p - old.p;
  if (jump >= 0.15) risk = clamp(risk + 15, 0, 100);
  return { risk, note: 'احتمال حمله (کوتاه‌مدت): ' + Math.round(top.p * 100) + '٪' + (jump >= 0.15 ? ' • جهش ' + Math.round(jump * 100) + ' واحدی در ۲۴ ساعت' : ''), jump };
}

/* ---------- نمره‌دهی ---------- */
function levelOf(score) {
  if (score <= 25) return { key: 'calm', name: 'آرام' };
  if (score <= 50) return { key: 'caution', name: 'محتاط' };
  if (score <= 75) return { key: 'warning', name: 'هشدار' };
  return { key: 'critical', name: 'بحرانی' };
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function computeScore(events, weights, ext, now) {
  now = now || Date.now();
  ext = ext || {};
  weights = weights || {};
  // اثر کم‌شونده: هر خبرِ تکراری از یک موضوع کمتر اثر می‌گذارد
  const byLabel = {};
  for (const e of events) (byLabel[e.ind + '|' + e.label] = byLabel[e.ind + '|' + e.label] || []).push(e);
  const eff = [];
  for (const k in byLabel) {
    byLabel[k].sort((a, b) => b.ts - a.ts).forEach((e, i) => {
      const f = i === 0 ? 1 : (i < 3 ? 0.5 : 0);
      const ageH = Math.max(0, (now - e.ts) / HOUR);
      const decay = Math.pow(0.5, ageH / HALF_LIFE_H);
      eff.push(Object.assign({}, e, { effect: e.pts * PT * f * decay }));
    });
  }
  const indicators = INDICATORS.map(def => {
    const w = weights[def.id] != null ? weights[def.id] : def.weight;
    let risk = null, note = def.note || '';
    if (def.available) {
      if (def.id === 'internet' || def.id === 'flights' || def.id === 'crowd') {
        const x = ext[def.id];
        if (x && x.risk != null) { risk = x.risk; note = x.note || ''; }
        else note = (x && x.note) || 'هنوز اندازه‌گیری نشده';
      } else {
        const evs = eff.filter(e => e.ind === def.id);
        risk = clamp(BASE_RISK + evs.reduce((s, e) => s + e.effect, 0), 0, 100);
        if (def.id === 'markets') {
          const m = ext.markets;
          if (m && m.risk != null) { risk = Math.max(risk, m.risk); note = m.note || ''; }
          else if (!evs.length) { risk = null; note = (m && m.note) || 'بدون داده'; }
        }
      }
    }
    return { id: def.id, name: def.name, weight: w, risk, available: def.available && risk !== null, note };
  });
  const live = indicators.filter(i => i.available && i.weight > 0);
  const wsum = live.reduce((s, i) => s + i.weight, 0) || 1;
  const avg = live.reduce((s, i) => s + i.risk * i.weight, 0) / wsum;
  const max = live.reduce((m, i) => Math.max(m, i.risk), 0);
  const many = live.filter(i => i.risk >= 40).length >= 3 ? 8 : 0;
  let final = Math.round(clamp(0.6 * avg + 0.4 * max + many, 0, 100));
  // خبر حمله تأییدشده، نمره را مستقیم بالا می‌برد
  if (ext.alert && ext.alert.level === 'full') final = Math.max(final, 95);
  else if (ext.alert && ext.alert.level === 'standby') final = Math.max(final, 80);
  return { final, level: levelOf(final), indicators, effective: eff };
}

const api = { MARKET_SYMBOLS, marketUrl, yahooParse, marketContrib, marketRisk, CROWD_QUERIES, crowdUrl, crowdParse, crowdRisk, pubGroup, isIranianSource, isConditional, TRUSTED_PUB, readinessState, flightRisk, SOURCES, INDICATORS, BASE_RISK, PT, norm, stripHtml, parseFeed, extractArticleText, sentences,
  isHypothetical, looksLikeAttack, verifyAttack, alertState, classify, computeScore, levelOf, citiesIn };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
