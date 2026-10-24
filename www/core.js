/* هسته رصد: هم داخل صفحه (مرورگر/دمو) و هم داخل سرویس پس‌زمینه اندروید اجرا می‌شود.
   env = { http(url, timeoutMs) -> Promise<string>, store:{get(k,def), set(k,v)}, getSettings(), demoScenario() یا null,
           emit(state), alarm(level, info) } */
(function (root) {
'use strict';
const E = root.Engine, D = root.DemoData;
const HOUR = 3600e3, MIN = 60e3;
const REGION = { lamin: 22, lamax: 40, lomin: 38, lomax: 63.5 };      // یک درخواست برای کل منطقه (۴ اعتبار OpenSky)
const IRAN = { lamin: 25, lamax: 40, lomin: 44, lomax: 63.5 };

function shortErr(e) { return String((e && e.message) || e || 'خطا').replace(/\s+/g, ' ').slice(0, 60); }

function create(env) {
  const store = env.store;
  const textCache = {};      // لینک -> متن خبر
  const srcCache = {};       // منبع -> { t, items }
  const health = {};
  let checking = false, netFails = 0, lastFlightT = store.get('lastFlightT', 0);
  let flightSamples = store.get('flights', []);
  let history = store.get('hist', []);
  let flightInfo = { risk: null, note: 'هنوز اندازه‌گیری نشده' };
  let marketInfo = { risk: null, note: 'هنوز اندازه‌گیری نشده', items: [], t: 0 };
  let crowdInfo = { risk: null, note: 'هنوز اندازه‌گیری نشده', items: [], t: 0 };
  let state = { result: null, verified: [], rejected: [], ready: { level: 'none' }, alert: { level: 'none' }, health: {}, flights: flightInfo, lastCheck: 0, nextCheck: 0, newestTs: 0, demo: false };

  async function reach(url) { try { await env.http(url, 7000); return true; } catch (e) { return /^HTTP/.test(shortErr(e)); } }
  async function probeInternet() {
    const [foreign, domestic] = await Promise.all([reach('https://www.cloudflare.com/cdn-cgi/trace'), reach('https://www.aparat.com/')]);
    if (!foreign && !domestic) {
      netFails++;
      return netFails >= 2 ? { risk: 70, note: 'سایت داخلی و خارجی هر دو باز نشد' } : { risk: 25, note: 'اختلال احتمالی، در انتظار بررسی دوباره' };
    }
    netFails = 0;
    return { risk: 15, note: foreign ? 'اینترنت عادی' : 'سایت خارجی بسته است (ممکن است فیلتر عادی باشد)' };
  }

  async function fetchFlights(now) {
    const cached = () => flightSamples.length ? flightSamples[flightSamples.length - 1] : null;
    if (now - lastFlightT < 20 * MIN) {
      const c = cached(); if (!c) return flightInfo;
      const r0 = E.flightRisk(flightSamples.slice(0, -1), { n: c.n, i: c.i }, c.t);
      r0.n = c.n; r0.i = c.i; r0.samples = flightSamples.length; r0.t = c.t; return r0;
    }
    try {
      const t = await env.http('https://opensky-network.org/api/states/all?lamin=' + REGION.lamin + '&lomin=' + REGION.lomin + '&lamax=' + REGION.lamax + '&lomax=' + REGION.lomax, 20000);
      const st = (JSON.parse(t).states || []).filter(x => x[8] === false);
      const n = st.length;
      const i = st.filter(x => x[6] >= IRAN.lamin && x[6] <= IRAN.lamax && x[5] >= IRAN.lomin && x[5] <= IRAN.lomax).length;
      const res = E.flightRisk(flightSamples, { n, i }, now);
      flightSamples.push({ t: now, n, i }); lastFlightT = now;
      flightSamples = flightSamples.filter(x => now - x.t < 80 * HOUR).slice(-300);
      store.set('flights', flightSamples); store.set('lastFlightT', lastFlightT);
      res.n = n; res.i = i; res.samples = flightSamples.length; res.t = now;
      return res;
    } catch (e) { return { risk: null, note: 'OpenSky جواب نداد: ' + shortErr(e), t: now }; }
  }

  async function fetchMarkets(now) {
    if (marketInfo.t && now - marketInfo.t < 5 * MIN - 8000) return marketInfo;
    const res = await Promise.all(E.MARKET_SYMBOLS.map(async m => {
      try { return Object.assign({ key: m.key, name: m.name }, E.yahooParse(await env.http(E.marketUrl(m.sym), 15000), now)); }
      catch (e) { return { key: m.key, name: m.name, err: shortErr(e) }; }
    }));
    const ok = res.filter(r => !r.err);
    if (!ok.length) return Object.assign(marketInfo, { risk: null, note: 'بازارها در دسترس نیست: ' + (res[0] && res[0].err || ''), items: res, t: now });
    const r = E.marketRisk(ok);
    marketInfo = { risk: r.risk, note: r.note, items: res, t: now };
    return marketInfo;
  }

  async function fetchCrowd(now) {
    if (crowdInfo.t && now - crowdInfo.t < 10 * MIN - 8000) return crowdInfo;
    try {
      const texts = [];
      for (const q of E.CROWD_QUERIES) { try { texts.push(await env.http(E.crowdUrl(q), 15000)); } catch (e) { if (!texts.length && q === E.CROWD_QUERIES[E.CROWD_QUERIES.length - 1]) throw e; } }
      const items = E.crowdParse(texts, now);
      const hist = store.get('crowd', {});
      items.forEach(i => { (hist[i.q] = hist[i.q] || []).push({ t: now, p: i.p }); hist[i.q] = hist[i.q].filter(x => now - x.t < 48 * HOUR).slice(-200); });
      Object.keys(hist).forEach(k => { if (!hist[k].length || now - hist[k][hist[k].length - 1].t > 72 * HOUR) delete hist[k]; });
      store.set('crowd', hist);
      const r = E.crowdRisk(items, hist, now);
      crowdInfo = { risk: r.risk, note: r.note, items: items.map(i => ({ q: i.q, p: i.p })), t: now, jump: r.jump || 0 };
    } catch (e) { crowdInfo = { risk: null, note: 'Polymarket جواب نداد: ' + shortErr(e), items: [], t: now }; }
    return crowdInfo;
  }

  async function collectLive(now, settings) {
    const all = [];
    const feeds = E.SOURCES.filter(s => (settings.sources || {})[s.id] !== false);
    await Promise.all(feeds.map(async s => {
      const h = health[s.id] = health[s.id] || { ok: 0, fail: 0 };
      const c = srcCache[s.id];
      if (c && now - c.t < (s.every || 1) * MIN - 8000) { all.push(...c.items); return; }
      try {
        const xml = await env.http(s.url, 15000);
        const items = E.parseFeed(xml, s);
        srcCache[s.id] = { t: now, items };
        h.ok++; h.last = now; h.count = items.length; h.state = 'ok'; h.err = '';
        all.push(...items);
      } catch (e) {
        h.fail++; h.state = 'bad'; h.err = shortErr(e);
        if (c) all.push(...c.items);        // آخرین داده سالم را نگه می‌داریم
      }
    }));
    return all;
  }

  async function processItems(items, now, allowFetch) {
    const events = [], rejected = [], verified = [], seen = new Set();
    let fetches = 0, newest = 0;
    for (const it of items) {
      const key = it.link || it.title;
      if (seen.has(key)) continue; seen.add(key);
      const ts = it.ts || now;
      if (now - ts > 48 * HOUR) continue;
      if (ts > newest) newest = ts;
      events.push(...E.classify(Object.assign({}, it, { ts }), now));
      if (!E.looksLikeAttack(it) || now - ts > 6 * HOUR) continue;
      let item = Object.assign({}, it, { ts });
      if (!item.fullText && allowFetch && item.link) {
        let text = textCache[item.link];
        if (text === undefined && fetches < 8) {
          fetches++;
          try { text = E.extractArticleText(await env.http(item.link, 12000)); } catch (e) { text = ''; }
          textCache[item.link] = text;
        }
        if (text && text.length >= 200) item = Object.assign(item, { body: text, fullText: true });
      }
      const v = E.verifyAttack(item, now);
      if (v.ok) verified.push(Object.assign({}, item, v));
      else rejected.push({ title: item.title, source: item.source, reason: v.reason, ts });
    }
    return { events, rejected, verified, newest };
  }

  function decideAlarm(a, ready, now) {
    let pick = a.level !== 'none' ? a : (ready.level === 'ready' ? ready : null);
    if (!pick) return;
    const acks = store.get('acks', []);
    if (acks.includes(pick.key)) return;
    if (store.get('lastAlarmKey', '') === pick.key) return;
    store.set('lastAlarmKey', pick.key);
    env.alarm(pick.level, {
      key: pick.key, why: pick.why || '', cities: pick.cities || [],
      items: (pick.items || []).map(i => ({ source: i.source, title: i.title })),
    });
  }

  async function runCheck() {
    if (checking) return; checking = true;
    const now = Date.now();
    const settings = env.getSettings();
    try {
      const scen = env.demoScenario && env.demoScenario();
      let items, internet, flights, markets, crowd;
      if (scen) {
        const sc = D.SCENARIOS[scen];
        items = sc.items(now); internet = sc.internet; flights = sc.flights; markets = sc.markets(); crowd = sc.crowd();
      } else {
        items = await collectLive(now, settings);
        [internet, flights, markets, crowd] = await Promise.all([probeInternet(), fetchFlights(now), fetchMarkets(now), fetchCrowd(now)]);
      }
      marketInfo = markets; crowdInfo = crowd;
      flightInfo = flights;
      const r = await processItems(items, now, !scen);
      const alert = E.alertState(r.verified, now);
      // تکان شدید بازار یا بازار پیش‌بینی، مثل یک «منبع مستقل» برای آماده‌باش حساب می‌شود
      const pseudo = [];
      if (markets && markets.risk != null && markets.risk >= 60) pseudo.push({ ind: 'markets', tier: 'B', label: 'تکان شدید بازارهای مالی', pts: 6, group: 'market', source: 'بازارها', title: markets.note, ts: now, hypo: false, ir: false });
      if (crowd && crowd.risk != null && crowd.risk >= 60) pseudo.push({ ind: 'crowd', tier: 'B', label: 'بازار پیش‌بینی: احتمال حمله بالا', pts: 6, group: 'crowd', source: 'Polymarket', title: crowd.note, ts: now, hypo: false, ir: false });
      const ready = E.readinessState(r.events.concat(pseudo), now);
      const result = E.computeScore(r.events, settings.weights, { internet, flights, markets, crowd, alert }, now);
      history.push({ t: now, s: result.final }); history = history.filter(h => now - h.t < 48 * HOUR).slice(-1500);
      store.set('hist', history);
      state = {
        result: { final: result.final, level: result.level, indicators: result.indicators, effective: result.effective.filter(e => e.effect !== 0).sort((x, y) => y.ts - x.ts).slice(0, 40) },
        verified: r.verified.map(v => ({ title: v.title, source: v.source, ts: v.ts, textLevel: v.textLevel, cities: v.cities, group: v.group })).slice(0, 10),
        rejected: r.rejected.slice(0, 12), ready: { level: ready.level, why: ready.why, key: ready.key }, alert: { level: alert.level, key: alert.key, cities: alert.cities },
        health: JSON.parse(JSON.stringify(health)), flights: flightInfo, markets: marketInfo, crowd: crowdInfo, lastCheck: now, newestTs: r.newest,
        nextCheck: now + Math.max(1, +settings.interval || 1) * MIN, demo: !!scen,
        trendRef: (history.find(h => now - h.t <= 3 * HOUR && now - h.t >= 20 * MIN) || {}).s,
      };
      env.emit(state);
      decideAlarm(Object.assign({}, alert, { items: alert.items }), Object.assign({}, ready), now);
    } catch (e) { try { console.error(e); } catch (x) {} }
    checking = false;
  }

  return { runCheck, tick: runCheck, getState: () => state, resetAlarmKey: () => store.set('lastAlarmKey', '') };
}
root.Core = { create, shortErr };
})(typeof window !== 'undefined' ? window : globalThis);
