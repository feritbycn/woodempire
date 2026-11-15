// =============================================================
// WOOD EMPIRE — Otomatik uçtan uca oynanış testi (Bölüm 30 senaryosu)
// Gerçek oyunu headless Chromium'da çalıştırır ve karakteri GERÇEK girdi yoluyla
// (joystick vektörü + dokunmatik olaylar + arayüz düğmeleri) oynatır. Işınlama yoktur.
//
// Kullanım: npm run build && npx vite preview --port 4173 &  sonra  node tests/playtest.mjs
// Çıktı: tests/report/playtest-report.json + docs/screenshots/*.png
// =============================================================
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(execSync('npm root -g').toString().trim() + '/playwright')); }

const URL = process.env.WE_URL || 'http://localhost:4173/';
const SHOTS = path.resolve('docs/screenshots');
const REPORT = path.resolve('tests/report');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(REPORT, { recursive: true });
const SCALE = Number(process.env.WE_SCALE || 2);   // ekran görüntüsü piksel yoğunluğu
const TS = Number(process.env.WE_TIMESCALE || 4);  // oyun hızlandırma (test süresini kısaltır)

const results = [];
const errors = [];
let stepNo = 0;
const t0 = Date.now();
function log(...a) { console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a); }
async function step(name, fn) {
  stepNo++;
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ n: stepNo, name, ok: true, ms: Date.now() - start, detail });
    log(`✅ ${stepNo}. ${name}`, detail ? JSON.stringify(detail) : '');
  } catch (e) {
    results.push({ n: stepNo, name, ok: false, ms: Date.now() - start, error: String(e.message || e) });
    log(`❌ ${stepNo}. ${name}: ${e.message}`);
    throw e;
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: SCALE, hasTouch: true, isMobile: true, locale: 'tr-TR' });
let page;

function attach(p) {
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console.error ' + m.text()); });
}
const W = (fn, arg) => page.evaluate(fn, arg);
const info = () => W(() => window.__WE.info());
const sleep = (ms) => page.waitForTimeout(ms);
async function shot(name) { const f = path.join(SHOTS, name + '.png'); await page.screenshot({ path: f }); return path.relative(process.cwd(), f); }

/** Oyun-içi süre bekle */
async function waitGame(sec) {
  const start = await W(() => window.__WE.game.time);
  while ((await W(() => window.__WE.game.time)) - start < sec) await sleep(60);
}
async function until(cond, timeoutGameSec, label) {
  const start = await W(() => window.__WE.game.time);
  for (;;) {
    if (await cond()) return true;
    const now = await W(() => window.__WE.game.time);
    if (now - start > timeoutGameSec) throw new Error('Zaman aşımı: ' + label);
    await sleep(60);
  }
}

/** Joystick vektörü ile hedefe yürü (engelde yan adım atar) */
async function walkTo(x, z, tol = 0.6, timeout = 60) {
  let last = null, stuckT = 0, side = 1, detour = 0;
  const start = await W(() => window.__WE.game.time);
  for (;;) {
    const r = await W(([x, z]) => { const d = window.__WE.dirTo(x, z); const p = window.__WE.game.player.pos; return { ...d, px: p.x, pz: p.z, t: window.__WE.game.time }; }, [x, z]);
    if (r.d < tol) { await W(() => window.__WE.setMove(0, 0)); return r; }
    if (r.t - start > timeout) { await W(() => window.__WE.setMove(0, 0)); throw new Error(`Hedefe ulaşılamadı (${x.toFixed(1)},${z.toFixed(1)}) konum (${r.px.toFixed(1)},${r.pz.toFixed(1)})`); }
    let mx = r.x, my = r.y;
    if (last) {
      const moved = Math.hypot(r.px - last.px, r.pz - last.pz);
      if (moved < 0.05 && r.t > last.t) stuckT += r.t - last.t; else stuckT = Math.max(0, stuckT - 0.1);
      if (stuckT > 0.6) { detour = 0.9; side = -side; stuckT = 0; }
    }
    if (detour > 0) { detour -= last ? r.t - last.t : 0.05; const px = -my * side, py = mx * side; mx = mx * 0.2 + px; my = my * 0.2 + py; }
    const slow = r.d < 1.5 ? 0.5 : 1;
    await W(([a, b]) => window.__WE.setMove(a, b), [mx * slow, my * slow]);
    last = r;
    await sleep(40);
  }
}
/** Açılan seviye atlama vb. pencereleri oyuncu gibi kapat */
async function dismiss() {
  // açık kalmış alt panel varsa oyuncu gibi kapat
  const sheetClose = await page.$('#sheet:not(.hidden) [data-act="close"]');
  if (sheetClose) { await sheetClose.tap().catch(() => {}); await sleep(300); }
  for (let i = 0; i < 3; i++) {
    const b = await page.$('.modal-wrap.lu-modal [data-act="modal:close"]');
    if (!b) return;
    await b.tap().catch(() => {}); await sleep(350);
  }
}
async function standStill() { await W(() => window.__WE.setMove(0, 0)); }

async function padOf(siteId, which) {
  return W(([id, w]) => { const st = window.__WE.game.sites.get(id); const p = w === 'in' ? (st.inPad || st.dropPad || st.pad) : (st.outPad || st.takePad); return { x: p.x, z: p.z }; }, [siteId, which]);
}

/** Ağacın yanındaki yürünebilir ve engelsiz bir yaklaşma noktası */
async function approach(t) {
  return W(([tx, tz]) => {
    const g = window.__WE.game; const p = g.player.pos;
    let best = null, bd = Infinity;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = tx + Math.cos(a) * 1.55, z = tz + Math.sin(a) * 1.55;
      if (!g.land.isWalkable(x, z)) continue;
      const q = { x, z }; g.resolveCollision(q, 0.45);
      if (Math.hypot(q.x - x, q.z - z) > 0.05) continue;
      const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = { x, z }; }
    }
    return best;
  }, [t.x, t.z]);
}
/** Yakındaki ağacı kes ve kütükleri topla */
const badTrees = new Set();
async function chopAndCollect() {
  const before = (await info()).stats.treesFelled || 0;
  let t, reached = false;
  for (let tries = 0; tries < 4 && !reached; tries++) {
    t = await W((bad) => { const g = window.__WE.game; const p = g.player.pos; let best = null, bd = 1e9;
      for (const t of g.trees.trees) { if (!g.trees.isChoppable(t) || bad.includes(t.key)) continue; const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < bd) { bd = d; best = t; } }
      return best ? { x: best.x, z: best.z, key: best.key } : null; }, [...badTrees]);
    assert(t, 'Kesilecek ağaç yok');
    const a = await approach(t);
    if (!a) { badTrees.add(t.key); continue; }
    try { await walkTo(a.x, a.z, 0.45, 25); reached = true; } catch (e) { badTrees.add(t.key); log('  (ağaca ulaşılamadı, başka ağaç deneniyor)'); }
  }
  assert(reached, 'Hiçbir ağaca ulaşılamadı');
  await standStill();
  await until(async () => ((await info()).stats.treesFelled || 0) > before, 25, 'ağaç devrilmedi');
  await waitGame(1.6); // kütükler yere düşsün
  await collectGround(6);
}
async function collectGround(radius = 8) {
  for (let k = 0; k < 8; k++) {
    const s = await info();
    if (s.carry >= s.cap) return;
    const l = await W(([r]) => { const g = window.__WE.game; const p = g.player.pos; const l = g.wood.nearest(p.x, p.z, r); return l ? { x: l.x, z: l.z } : null; }, [radius]);
    if (!l) return;
    await walkTo(l.x, l.z, 0.7, 20);
    await waitGame(0.4);
  }
}
async function unloadAt(pad, kindsLeft, timeout = 20) {
  await walkTo(pad.x, pad.z, 0.5);
  await standStill();
  await until(async () => { const s = await info(); return !s.carryKinds.some((k) => kindsLeft.includes(k)); }, timeout, 'boşaltma');
}
async function loadAt(pad, minCount, timeout = 15) {
  await walkTo(pad.x, pad.z, 0.5);
  await standStill();
  await until(async () => { const s = await info(); return s.carry >= Math.min(minCount, s.cap); }, timeout, 'yükleme');
}

/** Bir tam üretim döngüsü: kes → topla → testere → kereste → kamyon */
async function productionCycle() {
  await dismiss();
  const saw = await W(() => window.__WE.site('saw'));
  const carry = () => W(() => { const it = window.__WE.game.player.stack.items; return { plank: it.some((i) => i.kind === 'plank'), fresh: it.some((i) => i.kind === 'log' && !i.dep), dep: it.some((i) => i.kind === 'log' && i.dep) }; });
  let c = await carry();
  if (c.plank) { await unloadAt(await padOf('dock1', 'in'), ['plank']); return; }
  if (saw.out >= 2) { await loadAt(await padOf('saw', 'out'), 2); await unloadAt(await padOf('dock1', 'in'), ['plank']); return; }
  // kural: kesilen kütük önce depoya, depodan alınan kütük testereye
  if (!c.fresh && !c.dep && saw.in === 0) {
    const dep = await W(() => window.__WE.site('depot1'));
    if (dep.in < 2) { await chopAndCollect(); c = await carry(); }
  }
  if (c.fresh) { await unloadAt(await padOf('depot1', 'in'), ['log']); c = await carry(); }
  if (c.dep) await unloadAt(await padOf('saw', 'in'), ['log']);
  // depo çıkış bandı kütükleri testereye kendiliğinden verir; kesilen odun stok alanında birikir
  await until(async () => (await W(() => window.__WE.site('saw'))).out >= 2, 30, 'testere üretimi');
  await loadAt(await padOf('saw', 'out'), 2);
  await unloadAt(await padOf('dock1', 'in'), ['plank']);
}
async function sendTruckViaButton() {
  // rampaya yakın dur, bağlamsal "Gönder" düğmesine bas
  const dock = await padOf('dock1', 'in');
  await walkTo(dock.x, dock.z + 2.2, 0.6);
  await standStill();
  await until(() => page.evaluate(() => document.querySelector('#act-main .lbl').textContent === 'Gönder'), 25, 'Gönder düğmesi');
  await dismiss();
  // düğme "Gönder" iken nabız animasyonu yapar; beklemeden, oyuncunun gördüğü anda bas
  const shipped0 = (await info()).stats.trucksShipped || 0;
  const sending0 = await W(() => window.__WE.game.trucks.atDock(window.__WE.game.sites.get('dock1'))?.load.length || 0);
  await page.tap('#act-main', { force: true });
  await sleep(250);
  const stillLoaded = await W(() => { const g = window.__WE.game; const t = g.trucks.atDock(g.sites.get('dock1')); return t ? t.load.length : 0; });
  assert(sending0 > 0 && (stillLoaded === 0 || ((await info()).stats.trucksShipped || 0) > shipped0), 'Gönder düğmesi kamyonu göndermedi');
  assert(await page.evaluate(() => document.querySelector('#sheet').classList.contains('hidden')), 'Gönder sonrası istenmeyen panel açıldı');
}

try {
  page = await context.newPage(); attach(page);
  await step('Oyuna gir (yükleme + hoş geldin ekranı)', async () => {
    await page.goto(URL);
    await page.waitForFunction(() => window.__WE && window.__WE.game.ready, null, { timeout: 30000 });
    await page.waitForSelector('text=Başla!', { timeout: 15000 });
    const s = await shot('01_hosgeldin');
    await page.tap('text=Başla!');
    await sleep(600);
    await W((ts) => window.__WE.timeScale(ts), TS);
    return { screenshot: s };
  });

  await step('Karakteri dokunmatik joystick ile hareket ettir', async () => {
    const a = await info();
    // gerçek dokunma olayları: joystick alanında basılı tutup sürükle
    const cdp = await context.newCDPSession(page);
    const sx = 110, sy = 640;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx - i * 8, y: sy - i * 6, id: 1 }] }); await sleep(30); }
    await waitGame(1.2);
    const mid = await info();
    await shot('02_joystick');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const moved = Math.hypot(mid.x - a.x, mid.z - a.z);
    assert(moved > 1, 'Karakter joystick ile hareket etmedi: ' + moved);
    return { from: [a.x.toFixed(1), a.z.toFixed(1)], to: [mid.x.toFixed(1), mid.z.toFixed(1)], moved: moved.toFixed(2) };
  });

  await step('Bir ağacı kes (kesme + devrilme animasyonu)', async () => {
    const t = await W(() => window.__WE.nearestTree());
    const a = await approach(t);
    await walkTo(a.x, a.z, 0.45);
    await standStill();
    await W(() => window.__WE.timeScale(1));
    await sleep(900);
    const s1 = await shot('03_agac_kesme');
    await W((ts) => window.__WE.timeScale(ts), TS);
    await until(async () => (await W(() => window.__WE.game.trees.trees.some((t) => t.state === 'fall'))), 20, 'devrilme');
    await W(() => window.__WE.timeScale(0.6));
    await sleep(700);
    const s2 = await shot('04_agac_devriliyor');
    await W((ts) => window.__WE.timeScale(ts), TS);
    await until(async () => ((await info()).stats.treesFelled || 0) >= 1, 20, 'ağaç kesilmedi');
    await waitGame(1.5);
    const logs = await W(() => window.__WE.game.wood.logs.length);
    assert(logs > 0, 'Kütük oluşmadı');
    // kök görünür kalır ama yürümeyi engellemez
    const stump = await W(() => { const g = window.__WE.game; const t = g.trees.trees.find((t) => t.state === 'stump'); if (!t) return null; const q = { x: t.x + 0.05, z: t.z }; g.resolveCollision(q, 0.45); return { passable: Math.hypot(q.x - t.x - 0.05, q.z - t.z) < 1e-6, disabled: !!t.obstacle.disabled }; });
    assert(stump && stump.passable, 'Kök hâlâ engel: ' + JSON.stringify(stump));
    return { treeType: t.type, logsOnGround: logs, stumpPassable: stump.passable, screenshots: [s1, s2] };
  });

  await step('Odunları topla (sırtta görsel istif)', async () => {
    await collectGround(8);
    const s = await info();
    assert(s.carry > 0 && s.carryKinds.every((k) => k === 'log'), 'Kütük toplanmadı');
    const sc = await shot('05_odun_toplama');
    return { carrying: s.carry, capacity: s.cap, screenshot: sc };
  });

  await step('Depoya taşı ve bırak', async () => {
    const before = (await W(() => window.__WE.game.state.stats.logsDeposited || 0));
    const c = (await info()).carry;
    await unloadAt(await padOf('depot1', 'in'), ['log']);
    await waitGame(0.3);
    const after = (await W(() => window.__WE.game.state.stats.logsDeposited || 0));
    // yolda yerden kütük toplanmış olabilir: taşınan kütüklerin tamamı bırakılmış olmalı
    const left = await W(() => window.__WE.game.player.stack.items.filter((i) => i.kind === 'log').length);
    assert(after >= before + c && left === 0, `Depoya bırakılmadı ${before}→${after} (kalan ${left})`);
    const sc = await shot('06_depo');
    return { deposited: `${before} → ${after}`, screenshot: sc };
  });

  await step('Depo testereyi kendiliğinden besler (depo çıkış bandı → testere)', async () => {
    const r0 = await W(() => { const g = window.__WE.game; return { belt: g.conveyors.belts.has('c_depot_saw'), fed: g.state.stats.produced_plank || 0 }; });
    assert(r0.belt, 'Depo çıkış bandı yok');
    await until(async () => (await W(() => { const g = window.__WE.game; const b = g.conveyors.belts.get('c_depot_saw'); return g.sites.get('saw').inBuf.count + b.items.length + (g.sites.get('saw').working ? 1 : 0) + (g.state.stats.produced_plank || 0); })) > 0, 25, 'kütük testereye geçmedi');
    const s = await W(() => { const g = window.__WE.game; return { depot: g.sites.get('depot1').buffer.count, onBelt: g.conveyors.belts.get('c_depot_saw').items.length, sawIn: g.sites.get('saw').inBuf.count, working: g.sites.get('saw').working }; });
    return s;
  });

  await step('Ürün oluştur (kütük → kereste)', async () => {
    await until(async () => ((await info()).stats.produced_plank || 0) >= 2, 20, 'kereste üretilmedi');
    const s = await info();
    await W(() => window.__WE.timeScale(1)); await sleep(500);
    const sc = await shot('07_testere_uretim');
    await W((ts) => window.__WE.timeScale(ts), TS);
    return { planksProduced: s.stats.produced_plank, screenshot: sc };
  });

  await step('Kamyonu yükle', async () => {
    await loadAt(await padOf('saw', 'out'), 2);
    assert((await info()).carryKinds.includes('plank'), 'Kereste alınamadı');
    await unloadAt(await padOf('dock1', 'in'), ['plank']);
    await until(async () => (await W(() => { const g = window.__WE.game; const tr = g.trucks.atDock(g.sites.get('dock1')); return tr ? tr.load.length : 0; })) >= 2, 25, 'kamyona yükleme');
    const load = await W(() => { const g = window.__WE.game; return g.trucks.atDock(g.sites.get('dock1')).load.length; });
    const sc = await shot('08_kamyon_yukleme');
    return { truckLoad: load, screenshot: sc };
  });

  await step('Satışı gerçekleştir ("Gönder" düğmesi) ve para kazan', async () => {
    const m0 = (await info()).money;
    const sold0 = (await info()).stats.trucksShipped || 0;
    await sendTruckViaButton();
    await until(async () => ((await info()).stats.trucksShipped || 0) > sold0, 30, 'satış');
    const s = await info();
    assert(s.money > m0, 'Para artmadı');
    const sale = await W(() => window.__WE.game.state.sales[0]);
    const sc = await shot('09_satis_para');
    return { money: `${m0} → ${s.money}`, sale, screenshot: sc };
  });

  await step('Ekonomi döngüsü: taşıma kapasitesi yükseltmesi için para biriktir', async () => {
    let cycles = 0;
    while ((await info()).money < 25 && cycles < 12) { await productionCycle(); cycles++; }
    return { cycles, money: (await info()).money };
  });

  await step('Taşıma kapasitesini yükselt (Geliştirme menüsü)', async () => {
    await dismiss();
    const cap0 = (await info()).cap;
    await page.tap('#tab-upgrades');
    await sleep(400);
    const sc = await shot('10_gelistirme_menusu');
    await page.tap('[data-act="up:player:capacity"]');
    await sleep(300);
    const cap1 = (await info()).cap;
    assert(cap1 > cap0, `Kapasite artmadı ${cap0}→${cap1}`);
    await page.tap('[data-act="close"]');
    return { capacity: `${cap0} → ${cap1}`, screenshot: sc };
  });

  await step('Yeni alan satın almak için seviye + para biriktir (görevler dahil)', async () => {
    let cycles = 0;
    for (;;) {
      const s = await info();
      if (s.money >= 300 && s.level >= 2) break;
      if (cycles > 40) throw new Error('Ekonomi çok yavaş: ' + JSON.stringify({ money: s.money, level: s.level }));
      await productionCycle();
      // dolu kamyonu da gönder
      const tr = await W(() => { const g = window.__WE.game; const t = g.trucks.atDock(g.sites.get('dock1')); return t ? t.load.length : 0; });
      if (tr >= 12) { await sendTruckViaButton(); }
      cycles++;
    }
    const s = await info();
    return { cycles, money: s.money, level: s.level, missionsCompleted: s.stats.missionsCompleted };
  });

  await step('Yeni bir alan satın al (Küçük Kereste Fabrikası)', async () => {
    const pad = await W(() => { const z = window.__WE.game.land.zoneDef(1); return z.pad; });
    await dismiss();
    await walkTo(pad.x, pad.z, 0.6);
    await standStill();
    await dismiss();
    await page.waitForSelector('#prompt:not(.hidden) .btn.buy', { timeout: 20000 });
    await W(() => window.__WE.timeScale(1));
    const sc1 = await shot('11_arazi_satin_al');
    await page.tap('#prompt .btn.buy');
    await sleep(1500);
    const sc2 = await shot('12_arazi_acildi');
    await W((ts) => window.__WE.timeScale(ts), TS);
    const s = await info();
    assert(s.zones.includes(1), 'Arazi satın alınmadı');
    const walk = await W(() => window.__WE.game.land.isWalkable(4, -20));
    assert(walk, 'Yeni arazi yürünebilir değil');
    return { zones: s.zones, money: s.money, screenshots: [sc1, sc2] };
  });

  let snapshot;
  await step('Oyunu kaydet ve kapat', async () => {
    // hiçbir alanın üzerinde durma (aktarım sürerken kayıt anı ile karşılaştırma kayar)
    await walkTo(4, 12, 0.6);
    await standStill();
    // bant ve testere boşalsın ki kayıt anı ile yeniden açılış karşılaştırılabilsin
    await until(async () => W(() => { const g = window.__WE.game; const saw = g.sites.get('saw'); const belt = g.conveyors.belts.get('c_depot_saw'); return !saw.working && saw.inBuf.count === 0 && (!belt || (belt.items.length === 0 && g.sites.get('depot1').buffer.count === 0)); }), 60, 'üretim boşalmadı');
    // oyunu dondur: kayıt anı ile karşılaştırılan an aynı olsun (sayfa kapanırken yapılan kayıt da aynı durumu yazar)
    await W(() => window.__WE.timeScale(0));
    await sleep(200);
    const r = await W(() => window.__WE.saveNow());
    assert(r.ok, 'Kayıt başarısız');
    snapshot = await W(() => {
      const g = window.__WE.game, s = g.state;
      return { money: s.money, gold: s.gold, level: s.level, xp: s.xp, zones: [...s.zones].sort(), cap: g.player.stack.capacity, capLvl: s.player.up.capacity,
        depot: g.sites.get('depot1').buffer.count, sawIn: g.sites.get('saw').inBuf.count, sawOut: g.sites.get('saw').outBuf.count,
        carry: g.player.stack.count, mission: s.missions.main, trees: s.stats.treesFelled, sales: s.sales.length, x: +g.player.pos.x.toFixed(1), z: +g.player.pos.z.toFixed(1) };
    });
    await page.close();
    return { save: r, snapshot };
  });

  await step('Yeniden aç ve ilerlemenin korunduğunu doğrula', async () => {
    page = await context.newPage(); attach(page);
    await page.goto(URL);
    await page.waitForFunction(() => window.__WE && window.__WE.game.ready, null, { timeout: 30000 });
    // işe alınmış işçiler açılır açılmaz çalışmaya devam eder: karşılaştırma için oyunu hemen dondur
    await W(() => window.__WE.timeScale(0));
    const workers = await W(() => window.__WE.game.workers.list.map((w) => w.data.role));
    await sleep(1500);
    // varsa günlük ödül penceresini kapat
    const daily = await page.$('.daily-pop [data-d="1"]'); if (daily) await daily.tap();
    await sleep(500);
    const now = await W(() => {
      const g = window.__WE.game, s = g.state;
      return { money: s.money, gold: s.gold, level: s.level, xp: s.xp, zones: [...s.zones].sort(), cap: g.player.stack.capacity, capLvl: s.player.up.capacity,
        depot: g.sites.get('depot1').buffer.count, sawIn: g.sites.get('saw').inBuf.count, sawOut: g.sites.get('saw').outBuf.count,
        carry: g.player.stack.count, mission: s.missions.main, trees: s.stats.treesFelled, sales: s.sales.length, x: +g.player.pos.x.toFixed(1), z: +g.player.pos.z.toFixed(1) };
    });
    const diff = Object.keys(snapshot).filter((k) => JSON.stringify(snapshot[k]) !== JSON.stringify(now[k]) && !(k === 'money' && now.money >= snapshot.money) && !(k === 'gold' && now.gold >= snapshot.gold));
    await W(() => window.__WE.timeScale(1));
    const sc = await shot('13_yeniden_acildi');
    assert(diff.length === 0, 'Farklı alanlar: ' + diff.map((k) => `${k}: ${JSON.stringify(snapshot[k])} → ${JSON.stringify(now[k])}`).join(', '));
    return { restored: now, workersResumed: workers, screenshot: sc };
  });

  await step('Kayıt bozulmasına dayanıklılık (yuvalardan biri bozulunca)', async () => {
    const r = await W(async () => {
      await window.__WE.saveNow();
      const keys = ['we_save_a', 'we_save_b'];
      const newest = keys.map((k) => JSON.parse(localStorage.getItem(k))).sort((a, b) => b.n - a.n)[0];
      const k = keys.find((kk) => JSON.parse(localStorage.getItem(kk)).n === newest.n);
      localStorage.setItem(k, localStorage.getItem(k).slice(0, 500) + 'BOZUK');
      return { corrupted: k };
    });
    await page.reload();
    await page.waitForFunction(() => window.__WE && window.__WE.game.ready, null, { timeout: 30000 });
    await sleep(800);
    const s = await info();
    assert(s.zones.includes(1) && s.level >= 2, 'Bozuk yuva sonrası yedek yüklenemedi');
    return { corrupted: r.corrupted, loadedFromBackup: { level: s.level, zones: s.zones, money: s.money } };
  });
} catch (e) {
  log('TEST DURDU:', e.message);
  try { await shot('hata'); } catch {}
} finally {
  const perf = page && !page.isClosed() ? await info().catch(() => null) : null;
  const report = { date: new Date().toISOString(), url: URL, timeScale: TS, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, steps: results, pageErrors: errors, lastInfo: perf };
  fs.writeFileSync(path.join(REPORT, 'playtest-report.json'), JSON.stringify(report, null, 2));
  log(`SONUÇ: ${report.passed} başarılı, ${report.failed} başarısız, ${errors.length} sayfa hatası`);
  if (errors.length) log(errors.slice(0, 10).join('\n'));
  await browser.close();
  process.exit(report.failed || errors.length ? 1 : 0);
}
