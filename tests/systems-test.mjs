// =============================================================
// WOOD EMPIRE — Sistem entegrasyon testi
// Oyunun geç aşama sistemlerini (işçiler, konveyörler, forklift, tüm makineler, kamyon
// kademeleri, sonsuz arazi, görevler, günlük ödül, başarılar, mağaza, reklam, IAP, kayıt)
// gerçek oyun içinde doğrular. Süreyi kısaltmak için test başında hesaba para/seviye
// EKLENİR (test kurulumu — normal oyunda yoktur). Sistemlerin kendisi değiştirilmez.
// Kullanım: node tests/systems-test.mjs   (vite preview açık olmalı)
// =============================================================
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(execSync('npm root -g').toString().trim() + '/playwright')); }

const URL = (process.env.WE_URL || 'http://localhost:4173/') + '?devads';
const SHOTS = path.resolve('docs/screenshots');
const REPORT = path.resolve('tests/report');
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(REPORT, { recursive: true });
const SCALE = Number(process.env.WE_SCALE || 2);

const results = []; const errors = []; const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
async function step(name, fn) {
  const start = Date.now();
  try { const d = await fn(); results.push({ name, ok: true, ms: Date.now() - start, detail: d }); log('✅', name, d ? JSON.stringify(d).slice(0, 300) : ''); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - start, error: String(e.message || e) }); log('❌', name, e.message); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: SCALE, hasTouch: true, isMobile: true, locale: 'tr-TR' });
let page = await context.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error ' + m.text()); });
const W = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => page.waitForTimeout(ms);
async function shot(name) { const f = path.join(SHOTS, name + '.png'); await page.screenshot({ path: f }); return path.relative(process.cwd(), f); }
async function waitGame(sec) { const s = await W(() => window.__WE.game.time); while ((await W(() => window.__WE.game.time)) - s < sec) await sleep(80); }
async function until(cond, sec, label) { const end = Date.now() + sec * 1000; while (Date.now() < end) { if (await cond()) return true; await sleep(150); } throw new Error('Zaman aşımı: ' + label); }
async function closeModals() { for (let i = 0; i < 10; i++) { const b = await page.$('.modal-wrap [data-act="modal:close"], .modal-wrap [data-d="1"]'); if (!b) break; await b.tap().catch(() => {}); await sleep(300); } }
/** Kamerayı bir noktaya odakla (oyuncuyu taşımadan) */
async function look(x, z, dist = 30, sec = 1.2) { await W(([x, z, d]) => { const r = window.__WE.game.cameraRig; r.focus(x, z, 999); r.distTarget = d; r.dist = d; r.target.set(x, 0, z); }, [x, z, dist]); await sleep(sec * 1000); }
async function unlook() { await W(() => { const r = window.__WE.game.cameraRig; r.override = null; r.distTarget = 33; }); }

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__WE && window.__WE.game.ready, null, { timeout: 30000 });
await sleep(800);
await closeModals();

await step('Depo kuralı, işçi noktaları, bant satın alma noktası ve reklam teklifi', async () => {
  const r = await W(async () => {
    const g = window.__WE.game; const p = g.player; const saw = g.sites.get('saw');
    // 1) taze kütük testereye girmez
    p.stack.items.length = 0; p.stack.push({ kind: 'log', wood: 'pine' });
    const before = saw.inBuf.count;
    p.tcd = 0; g.inventory.transfer(p, saw.inPad, 1);
    const freshRejected = saw.inBuf.count === before && p.stack.count === 1;
    // 2) depoya bırakılınca işaretlenir, depodan alınan testereye girer
    const dep = g.sites.get('depot1');
    p.tcd = 0; g.inventory.transfer(p, dep.dropPad, 1);
    const marked = dep.buffer.items[dep.buffer.count - 1]?.dep === 1;
    // depo kütüğü testereye girer (oyuncu getirirse de); normalde depo çıkış bandı kendisi taşır
    p.stack.push({ kind: 'log', wood: 'pine', dep: 1, o: 0 });
    p.tcd = 0; g.inventory.transfer(p, saw.inPad, 1);
    const depotLogAccepted = saw.inBuf.count + (saw.working ? 1 : 0) > before;
    const noTakeFromFeedingDepot = !dep.takePad && g.conveyors.belts.has('c_depot_saw');
    // 3) işçi alma noktası (seviye kilidi ve para)
    g.state.money = 1000; g.levels.addXP(2000); g.state.level = Math.max(g.state.level, 4); // XP 5. seviyeden sonra yavaş: test seviyeyi doğrudan ayarlar
    const n0 = g.workers.list.length;
    const hp = g.workers.hirePads[0]; // tek İŞÇİ AL noktası
    const okHire = g.workers.hireFromPad(hp);
    // 4) bant satın alma noktası dünyada var
    const beltPad = g.conveyors.pads.has('c_saw_sander') || g.conveyors.belts.has('c_depot_saw');
    // 5) reklam teklifi belirir
    g.adOffers.next = 0; g.adOffers.update(0.1);
    const offer = g.adOffers.cur ? { boost: g.adOffers.cur.boost, side: g.adOffers.cur.side } : null;
    // bu adımın etkilerini temizle (sonraki adım 'girdisiz üretim yok' kontrol eder)
    for (const m of g.production.machines) { m.inBuf.items.length = 0; m.outBuf.items.length = 0; m.working = false; m.t = 0; }
    p.stack.items.length = 0; dep.buffer.items.length = 0;
    for (const w of [...g.workers.list]) { w.char.root.removeFromParent(); }
    g.workers.list.length = 0; g.state.workers.length = 0;
    for (const b of g.conveyors.belts.values()) b.items.length = 0;
    return { freshRejected, marked, depotLogAccepted, noTakeFromFeedingDepot, okHire, workers: [n0, n0 + 1], beltPad, offer };
  });
  assert(r.freshRejected && r.marked && r.depotLogAccepted && r.noTakeFromFeedingDepot, 'Depo kuralı çalışmadı ' + JSON.stringify(r));
  assert(r.okHire && r.workers[1] === r.workers[0] + 1, 'İşçi noktasından işçi alınamadı');
  assert(r.beltPad, 'Bant satın alma noktası yok');
  assert(r.offer, 'Reklam teklifi çıkmadı');
  await closeModals();
  try { await page.waitForSelector('#ad-offer:not(.hidden)', { timeout: 6000, state: 'visible' }); }
  catch { throw new Error('Teklif görünmedi: ' + JSON.stringify(await W(() => ({ cur: window.__WE.game.adOffers.cur && { ...window.__WE.game.adOffers.cur, def: 0 }, cls: document.querySelector('#ad-offer').className, modals: document.querySelectorAll('.modal-wrap').length })))); }
  const g0 = await W(() => window.__WE.game.economy.boostActive(window.__WE.game.adOffers.cur.boost));
  await closeModals();
  const sc = await shot('34_reklam_teklifi');
  await page.tap('#ad-offer', { force: true });
  await page.waitForSelector('.devad', { timeout: 5000 });
  await until(async () => W(() => !window.__WE.game.adOffers.busy), 30, 'reklam bitmedi');
  const active = await W((b) => window.__WE.game.economy.boostActive(b), r.offer.boost);
  assert(!g0 && active, 'Reklam izlenince süreli ödül başlamadı');
  return { ...r, boostStarted: r.offer.boost, screenshot: sc };
});

await step('Reklamla geçici yardımcı işçi + parası yetmeyen satın alma görevi', async () => {
  const r = await W(() => {
    const g = window.__WE.game;
    g.economy.activateBoost('helper', 60); g.workers.update(0.05);
    const came = g.workers.list.filter((w) => w.data.temp).map((w) => w.data.role);
    g.workers.serialize(); const savedTemp = g.state.workers.some((d) => d.temp);
    g.state.boosts.helper = Date.now() - 1; g.workers.update(0.05);
    const left = g.workers.list.filter((w) => w.data.temp).length;
    // satın alma görevi: para yetmeden tamamlanmaz, kart para ilerlemesi gösterir
    const m = g.missions; let guard = 0; while (!m.view().title.startsWith('İlk işçini') && guard++ < 40) m.complete();
    g.state.money = 50; m.loadCurrent(); const v = m.view(); g.state.money = 10000; m.check(); const still = m.view().title;
    g.state.money = 0;
    return { came, savedTemp, left, mission: { title: v.title, value: v.value, target: v.target, money: v.money }, stillAfterMoney: still };
  });
  assert(r.came.length === 1 && !r.savedTemp && r.left === 0, 'Yardımcı işçi gelmedi/gitmedi ' + JSON.stringify(r));
  assert(r.mission.money && r.stillAfterMoney.startsWith('İlk işçini'), 'Satın alma görevi parayla tamamlandı ' + JSON.stringify(r));
  await closeModals();
  return r;
});

await step('Test kurulumu: hesaba para ve seviye ekle', async () => {
  await W(() => { const g = window.__WE.game; g.state.money = 5e7; g.state.gold = 2000; g.levels.addXP(250000); g.state.level = Math.max(g.state.level, 60); });
  await closeModals();
  return W(() => ({ money: window.__WE.game.state.money, level: window.__WE.game.state.level }));
});

await step('Arazi genişletme: 1-9 arası tüm bölgeleri sırayla satın al', async () => {
  const r = await W(() => { const g = window.__WE.game; const bought = []; for (let id = 1; id <= 9; id++) { if (g.land.buy(id)) bought.push(id); } return { bought, zones: g.state.zones, walk: [g.land.isWalkable(-45, -70), g.land.isWalkable(56, -116)] }; });
  assert(r.bought.length === 9, 'Bazı araziler alınamadı: ' + r.bought);
  assert(r.walk.every(Boolean), 'Yeni araziler yürünebilir değil');
  await closeModals();
  return r;
});

await step('Sonsuz genişleme: 10. bölgeden itibaren tesisler (Süt, Tavuk, Kereste…) oluşur ve satın alınır', async () => {
  const r = await W(() => { const g = window.__WE.game; const z10 = g.land.zoneDef(10), z11 = g.land.zoneDef(11); const ok10 = g.land.buy(10); return { z10: z10.name, cost10: z10.cost, ok10, z11: z11.name, known: g.land.maxKnown(), bonus: g.economy.saleMultiplier() }; });
  assert(r.ok10, '10. bölge alınamadı');
  await closeModals();
  return r;
});

await step('Tüm inşaat alanlarını kur (makineler, depo, ofis, garaj, rampa)', async () => {
  const r = await W(() => { const g = window.__WE.game; const ids = [...g.construction.pending.keys()]; const built = ids.filter((id) => g.construction.build(id)); return { built, sites: [...g.sites.keys()] }; });
  for (const id of ['sander', 'packer', 'palletizer', 'panelpress', 'furniture', 'autoline', 'office', 'garage', 'warehouse', 'dock2']) assert(r.sites.includes(id), id + ' kurulmadı');
  return { built: r.built.length, sites: r.sites };
});

await step('Üretim zinciri: her makine girdiyle gerçek ürün üretir, girdisiz üretmez', async () => {
  const before = await W(() => { const g = window.__WE.game; const o = {}; for (const m of g.production.machines) o[m.id] = { out: m.outBuf.count, working: m.working }; return o; });
  assert(Object.values(before).every((v) => v.out === 0 && !v.working), 'Girdi olmadan üretim başladı');
  await W(() => {
    const g = window.__WE.game;
    // her makineyi kendi tarifinin girdisiyle besle (sonsuz bölgelerin prosedürel hatları dahil)
    const woods = ['oak', 'pine', 'birch', 'cedar', 'rare'];
    g.production.machines.forEach((m, i) => { for (let k = 0; k < 8; k++) m.inBuf.push({ kind: m.def.input, wood: woods[i % woods.length] }); });
    window.__WE.timeScale(6);
  });
  await waitGame(14);
  const after = await W(() => { const g = window.__WE.game; const o = {}; for (const m of g.production.machines) o[m.id] = { out: m.outBuf.count, kind: m.outBuf.items[0]?.kind, wood: m.outBuf.items[0]?.wood }; return o; });
  for (const id of Object.keys(after)) assert(after[id].out > 0, id + ' üretmedi');
  return after;
});

await step('Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik', async () => {
  const r = await W(() => {
    const g = window.__WE.game;
    g.state.money = Math.max(g.state.money, 5e7);
    const owned = [10, 11, 12, 13, 14].map((id) => g.land.owns(id) || g.land.buy(id));
    for (const m of g.production.machines) { m.inBuf.items.length = 0; m.outBuf.items.length = 0; m.working = false; }
    g.workers.up.slots = Math.max(g.workers.up.slots, 10);
    const hired = [];
    // tek İŞÇİ AL noktası: 3 işçi al, görevlerini panelden ayarla (bakıcı + dağıtım + taşıyıcı)
    for (const id of [10, 11, 13, 14]) { const pad = g.workers.facPads.get(id)[0]; for (const role of ['farmer', 'carrier', 'loader']) { if (g.workers.hireFromPad(pad)) { const w = g.workers.list[g.workers.list.length - 1]; if (role !== 'farmer') g.workers.setRole(w, role); hired.push(id + ':' + w.data.role); } } }
    g.conveyors.syncPads();
    const belts = ['c_f10_in', 'c_f10_out', 'c_f11_in', 'c_f11_out', 'c_f13_in', 'c_f13_out', 'c_f14_in', 'c_f14_out'].map((id) => g.conveyors.buy(id));
    // çiftlik az hayvanla açılır, satın alarak çoğalır
    const start = { cows: g.animals.zoneCount(10), hens: g.animals.zoneCount(11) };
    const cowPad = g.pads.find((p) => p.mode === 'animal' && p.data.zone === 10), henPad = g.pads.find((p) => p.mode === 'animal' && p.data.zone === 11);
    const p0 = g.animals.price(10);
    const bought = [g.animals.buyFromPad(cowPad), g.animals.buyFromPad(cowPad), g.animals.buyFromPad(henPad)];
    const animals = { start, after: { cows: g.animals.zoneCount(10), hens: g.animals.zoneCount(11) }, saved: { ...g.state.animals }, priceUp: g.animals.price(10) > p0 };
    window.__WE.timeScale(6);
    return { animals, bought, names: [10, 11, 12, 13, 14].map((id) => g.land.zoneDef(id).name), sheep: g.animals.list.filter((a) => a.type === 'sheep').length, hives: g.animals.list.filter((a) => a.type === 'hive').length, owned, hired, belts, cows: g.animals.list.filter((a) => a.type === 'cow').length, hens: g.animals.list.filter((a) => a.type === 'hen').length, sites12: [...g.sites.keys()].filter((k) => k.startsWith('f12_')), trees12: g.trees.trees.filter((t) => t.zoneId === 12).length };
  });
  assert(r.owned.every(Boolean), 'Tesisler açılamadı ' + JSON.stringify(r));
  assert(r.belts.every(Boolean), 'Tesis bantları kurulamadı ' + JSON.stringify(r));
  assert(r.hired.length === 12, 'Tesis işçileri alınamadı ' + JSON.stringify(r.hired));
  assert(r.animals.start.cows === 2 && r.animals.start.hens === 3 && r.bought.every(Boolean) && r.animals.after.cows === 4 && r.animals.after.hens === 4 && r.animals.saved[10] === 2 && r.animals.priceUp, 'Hayvan satın alma çalışmadı ' + JSON.stringify(r.animals));
  const s0 = await W(() => ({ ...window.__WE.game.state.stats }));
  await waitGame(70);
  const out = await W(() => { const g = window.__WE.game; const st = g.state.stats; return { milked: st.cowsMilked || 0, milkDeposited: st.deposited_milk || 0, bottles: st.produced_bottle || 0, eggsDeposited: st.deposited_egg || 0, cartons: st.produced_carton || 0, sheared: st.sheepSheared || 0, yarn: st.produced_yarn || 0, combs: st.combsHarvested || 0, honey: st.produced_honey || 0, dock10: g.sites.get('f10_dock').staging.count + (g.trucks.atDock(g.sites.get('f10_dock'))?.load.length || 0), dock11: g.sites.get('f11_dock').staging.count + (g.trucks.atDock(g.sites.get('f11_dock'))?.load.length || 0), farmers: g.workers.list.filter((w) => w.data.role === 'farmer').map((w) => w.state) }; });
  assert(out.milked > (s0.cowsMilked || 0), 'Çiftçi inek sağmadı ' + JSON.stringify(out));
  assert(out.bottles > (s0.produced_bottle || 0), 'Süt kasası üretilmedi ' + JSON.stringify(out));
  assert(out.cartons > (s0.produced_carton || 0), 'Yumurta kolisi üretilmedi ' + JSON.stringify(out));
  assert(out.sheared > 0 && out.yarn > 0, 'Koyun Çiftliği üretmedi ' + JSON.stringify(out));
  assert(out.combs > 0 && out.honey > 0, 'Arı Çiftliği üretmedi ' + JSON.stringify(out));
  assert(out.dock10 + out.dock11 > 0 || (await W(() => window.__WE.game.state.sales.some((x) => x.counts && (x.counts.bottle || x.counts.carton)))), 'Tesis ürünü kamyona ulaşmadı ' + JSON.stringify(out));
  await W(() => window.__WE.timeScale(1));
  const zc = await W(() => { const z = window.__WE.game.land.zoneDef(10).rect; return [(z.x0 + z.x1) / 2 - 15, (z.z0 + z.z1) / 2 + 3]; });
  await closeModals();
  await look(zc[0], zc[1], 34, 1.5);
  await closeModals();
  const sc1 = await shot('35_sut_ciftligi');
  const zc2 = await W(() => { const z = window.__WE.game.land.zoneDef(11).rect; return [(z.x0 + z.x1) / 2 - 15, (z.z0 + z.z1) / 2 + 3]; });
  await look(zc2[0], zc2[1], 34, 1.5);
  await closeModals();
  const sc2 = await shot('36_tavuk_ciftligi');
  const zc3 = await W(() => { const z = window.__WE.game.land.zoneDef(13).rect; return [(z.x0 + z.x1) / 2 - 15, (z.z0 + z.z1) / 2 + 3]; });
  await look(zc3[0], zc3[1], 30, 1.5); await closeModals();
  const sc3 = await shot('37_koyun_ciftligi');
  const zc4 = await W(() => { const z = window.__WE.game.land.zoneDef(14).rect; return [(z.x0 + z.x1) / 2 - 15, (z.z0 + z.z1) / 2 + 1]; });
  await look(zc4[0], zc4[1], 30, 1.5); await closeModals();
  const sc4 = await shot('38_ari_ciftligi');
  await unlook();
  return { ...r, ...out, screenshots: [sc1, sc2, sc3, sc4] };
});

await step('Makine yükseltmeleri: hız, kapasite, kalite, bıçak (görsel), boyut', async () => {
  const r = await W(() => {
    const g = window.__WE.game; const saw = g.sites.get('saw'); const P = g.production;
    const t0 = P.procTime(saw), c0 = saw.outBuf.capacity, o0 = P.outCount(saw), b0 = saw.model.group.children.find((c) => c.userData.bladeGeo)?.children.length, v0 = g.economy.itemValue({ kind: 'plank', wood: 'pine' });
    for (const k of ['speed', 'speed', 'capacity', 'quality', 'blades', 'blades', 'size']) g.factory.upgrade(saw, k);
    const b1 = saw.model.group.children.find((c) => c.userData.bladeGeo)?.children.length;
    return { time: [t0.toFixed(2), P.procTime(saw).toFixed(2)], outCap: [c0, saw.outBuf.capacity], planksPerLog: [o0, P.outCount(saw)], blades: [b0, b1], plankValue: [v0, g.economy.itemValue({ kind: 'plank', wood: 'pine' }).toFixed(2)], scale: saw.model.group.scale.x.toFixed(2) };
  });
  assert(r.planksPerLog[1] === r.planksPerLog[0] + 2 && r.blades[1] === r.blades[0] + 2, 'Bıçak yükseltmesi uygulanmadı');
  assert(+r.time[1] < +r.time[0], 'Hız yükseltmesi uygulanmadı');
  await look(12, 6, 18, 1.5);
  r.screenshot = await shot('20_testere_yukseltilmis');
  await unlook();
  return r;
});

await step('İşçiler: oduncu ağaç keser ve depoya taşır', async () => {
  await W(() => { const g = window.__WE.game; window.__WE.timeScale(6); for (const m of g.production.machines) { m.inBuf.items.length = 0; m.outBuf.items.length = 0; } g.sites.get('depot1').buffer.items.length = 0; g.workers.up.slots = 6; g.workers.hire('lumberjack'); g.workers.hire('lumberjack'); });
  const s0 = await W(() => ({ felled: window.__WE.game.state.stats.treesFelled || 0, playerFelled: window.__WE.game.state.stats.treesFelledByPlayer || 0, dep: window.__WE.game.state.stats.logsDeposited || 0 }));
  await waitGame(40);
  const r = await W(() => { const g = window.__WE.game; return { felled: g.state.stats.treesFelled || 0, playerFelled: g.state.stats.treesFelledByPlayer || 0, deposited: g.state.stats.logsDeposited || 0, depot: g.sites.get('depot1').buffer.count, states: g.workers.list.map((w) => w.state) }; });
  assert(r.felled - r.playerFelled > s0.felled - s0.playerFelled, 'İşçi ağaç kesmedi');
  assert(r.deposited > s0.dep, 'İşçi depoya kütük getirmedi'); // depo testereyi beslediği için sayı düşebilir: bırakılan kütük sayılır
  const w = await W(() => { const w = window.__WE.game.workers.list[0]; return { x: w.pos.x, z: w.pos.z }; });
  await look(w.x, w.z, 22, 1.2);
  r.screenshot = await shot('21_isci_oduncu');
  await unlook();
  return r;
});

await step('Odun sistemi: depo → (çıkış bandı) testere → stok, yükleyici stoktan kamyona', async () => {
  // önceki adımda oduncuların getirdiği kütüklerle stok dolmuş olabilir (dolu stok testereyi durdurur): boşalt
  await W(() => { const g = window.__WE.game; const saw = g.sites.get('saw'); saw.outBuf.items.length = 0; const d = g.sites.get('depot1'); for (let i = 0; i < 30; i++) d.buffer.push({ kind: 'log', wood: 'pine' }); g.workers.hire('carrier'); g.workers.hire('loader'); });
  const s0 = await W(() => ({ planks: window.__WE.game.state.stats.produced_plank || 0, loaded: window.__WE.game.state.stats.itemsLoaded || 0, sanded: window.__WE.game.state.stats.produced_sanded || 0 }));
  await waitGame(45);
  const r = await W(() => { const g = window.__WE.game; return { planks: g.state.stats.produced_plank || 0, loaded: g.state.stats.itemsLoaded || 0, sanded: g.state.stats.produced_sanded || 0, sanderIn: g.sites.get('sander')?.inBuf.count || 0, dockStaging: g.sites.get('dock1').staging.count + g.sites.get('dock2').staging.count, workers: g.workers.list.map((w) => `${w.data.role}:${w.state}`) }; });
  assert(r.planks > s0.planks, 'Depo testereyi beslemedi');
  // zımpara varsa kereste kamyona değil zımparaya gider (taşıyıcı dağıtır); zımparalı tahtayı yükleyici yükler
  assert(r.loaded > s0.loaded || r.sanded > s0.sanded || r.sanderIn > 0, 'Dağıtım çalışmadı (ne yükleme ne zımpara beslemesi)');
  return r;
});

await step('Konveyör bantları: 4 bant satın alınır, gerçek ürün taşır (paketleme kendi ithalatıyla)', async () => {
  const r = await W(() => { const g = window.__WE.game; const ids = ['c_depot_saw', 'c_saw_sander', 'c_z3_in', 'c_z3_out']; const ok = ids.map((id) => g.conveyors.belts.has(id) || g.conveyors.buy(id)); const d = g.sites.get('depot1'); for (let i = 0; i < 40; i++) d.buffer.push({ kind: 'log', wood: 'birch' }); for (const id of ids) g.conveyors.upgrade(id, 'speed'); return ok; });
  assert(r.every(Boolean), 'Konveyör kurulamadı');
  await closeModals();
  const s0 = await W(() => ({ sanded: window.__WE.game.state.stats.produced_sanded || 0, pk: window.__WE.game.state.stats.produced_package || 0 }));
  await waitGame(90);
  const out = await W(() => { const g = window.__WE.game; const b = {}; for (const [id, belt] of g.conveyors.belts) b[id] = belt.items.length; return { onBelts: b, sanded: g.state.stats.produced_sanded || 0, packages: g.state.stats.produced_package || 0, delivered: g.state.stats.itemsLoaded }; });
  assert(Object.values(out.onBelts).some((n) => n > 0), 'Bantlarda ürün yok');
  assert(out.sanded > s0.sanded && out.packages > s0.pk, 'Bant zinciri üretimi beslemedi');
  await W(() => window.__WE.timeScale(1));
  await look(14, -20, 40, 1.5);
  out.screenshot = await shot('22_konveyor_hatti');
  await unlook();
  return out;
});

await step('İthalatlı bölgeler: her bölge kendi malını ithal eder, önceki bölgelerden mal almaz', async () => {
  const r = await W(() => {
    const g = window.__WE.game;
    const ids = ['imp3', 'imp5', 'imp7', 'imp8', 'imp9', 'dock3', 'dock2', 'dock7', 'dock8', 'dock9', 'saw5'];
    const missing = ids.filter((id) => !g.sites.has(id));
    const crossRoutes = g.workers.availableRoutes().filter((x) => /packer|palletizer|furniture|panelpress|autoline|saw5|imp/.test(x.id)).map((x) => x.id);
    const zoneRoutes = [3, 5, 7, 8, 9].map((z) => g.workers.availableRoutes({ data: { fac: z } }).map((x) => x.id));
    const prices = { sanded3: g.imports.unitPrice(3, 'sanded'), log5: g.imports.unitPrice(5, 'log'), sellPkg3: Math.round(g.economy.itemValue({ kind: 'package', wood: 'pine' }) * g.sites.get('dock3').valueMul) };
    return { missing, crossRoutes, zoneRoutes, prices, imported0: g.state.stats.imported || 0, spent0: g.state.stats.importSpent || 0 };
  });
  assert(!r.missing.length, 'Eksik ithalat yapısı: ' + r.missing.join(','));
  assert(!r.crossRoutes.length, 'Başlangıç işçileri ithalatlı bölgelere taşıyor: ' + r.crossRoutes.join(','));
  assert(r.zoneRoutes.every((z) => z.every((id) => id.startsWith('imp'))), 'Bölge işçisi rotası yanlış'); // bantla bağlı hatlar işçiye verilmez (boş olabilir)
  assert(r.prices.sanded3 < r.prices.sellPkg3, 'İthalat pahalı');
  await W(() => window.__WE.timeScale(6));
  await waitGame(40);
  const r2 = await W(async () => {
    const g = window.__WE.game; window.__WE.timeScale(1);
    const stock = {}; for (const id of ['imp3', 'imp5', 'imp7', 'imp8', 'imp9']) stock[id] = g.sites.get(id).buffer.count;
    // filtre: önceki bölgenin ürünü (etiketsiz / normal depo etiketi) Paketleme'ye girmez, ithal olan girer
    const pk = g.sites.get('packer'); const st = g.player.stack; st.items.length = 0; pk.inBuf.items.length = 0;
    g.conveyors.belts.get('c_z3_in')?.items.splice(0); g.sites.get('imp3').buffer.items.length = 0; // bant makineyi anında doldurmasın
    st.items.push({ kind: 'sanded', wood: 'pine' }, { kind: 'sanded', wood: 'pine', dep: 1 }, { kind: 'sanded', wood: 'pine', dep: 1003 });
    g.player.pos.x = pk.inPad.x; g.player.pos.z = pk.inPad.z;
    await new Promise((res) => setTimeout(res, 2500));
    const left = st.items.map((i) => i.dep || 0); st.items.length = 0;
    // başka bölgenin ithal kütüğü ana testereye girmez
    const saw = g.sites.get('saw'); st.items.push({ kind: 'log', wood: 'oak', dep: 1005 });
    g.player.pos.x = saw.inPad.x; g.player.pos.z = saw.inPad.z;
    await new Promise((res) => setTimeout(res, 2000));
    const logLeft = st.items.length; st.items.length = 0; g.player.pos.x = 20; g.player.pos.z = 14;
    return { stock, imported: g.state.stats.imported || 0, spent: g.state.stats.importSpent || 0, left, logLeft };
  });
  assert(r2.imported > r.imported0, 'İthalat kamyonu mal getirmedi');
  assert(Object.values(r2.stock).every((n) => n > 0), 'Bazı ithalat depoları boş: ' + JSON.stringify(r2.stock));
  assert(r2.spent > r.spent0, 'İthalat bedeli ödenmedi');
  assert(r2.left.length === 2 && !r2.left.includes(1003), 'Paketleme filtresi hatalı ' + JSON.stringify(r2.left));
  assert(r2.logLeft === 1, 'Başka bölgenin ithal kütüğü ana testereye girdi');
  await look(14, -60, 34, 2.5);
  r2.screenshot = await shot('39_ithalat_paketleme');
  await unlook();
  return { ...r, ...r2 };
});

await step('Forklift: garaj + forklift satın al, ürünleri gerçekten taşır, yakıt molası', async () => {
  const ok = await W(() => { const g = window.__WE.game; window.__WE.timeScale(6); for (const id of ['sander', 'packer']) { const m = g.sites.get(id); for (let i = 0; i < 20; i++) m.outBuf.push({ kind: m.def.output, wood: 'oak' }); } return g.vehicles.buy(); });
  assert(ok, 'Forklift alınamadı');
  await waitGame(40);
  const r = await W(() => { const f = window.__WE.game.vehicles.list[0]; return { state: f.state, trips: f.trips, carrying: f.stack.count, pos: [f.pos.x.toFixed(1), f.pos.z.toFixed(1)] }; });
  assert(r.trips > 0 || r.carrying > 0, 'Forklift çalışmadı');
  const f = await W(() => { const f = window.__WE.game.vehicles.list[0]; return { x: f.pos.x, z: f.pos.z }; });
  await W(() => window.__WE.timeScale(1));
  await look(f.x, f.z, 20, 1.2);
  r.screenshot = await shot('23_forklift');
  await unlook();
  return r;
});

await step('Kamyon kademeleri, kuyruk ve satış', async () => {
  const r = await W(() => { const g = window.__WE.game; const ok = [1, 2, 3].map((i) => g.trucks.buyTier(i)); g.trucks.upgrade('speed'); g.trucks.upgrade('bonus'); g.trucks.upgrade('load'); return { ok, tier: g.state.trucks.tier, queue: g.trucks.docks.map((d) => d.queue.length) }; });
  assert(r.ok.every(Boolean), 'Kamyon alınamadı');
  await W(() => { const g = window.__WE.game; window.__WE.timeScale(8); for (const d of g.trucks.docks) { const tr = g.trucks.atDock(d); if (tr) g.trucks.depart(d, tr); } });
  await waitGame(20);
  const r2 = await W(() => { const g = window.__WE.game; return { caps: g.trucks.docks.map((d) => d.queue.map((t) => t.cap)), queue: g.trucks.docks.map((d) => d.queue.length), shipped: g.state.stats.trucksShipped, lastSale: g.state.sales[0] }; });
  assert(r2.caps.flat().includes(200), 'Endüstriyel kamyon gelmedi');
  await W(() => window.__WE.timeScale(1));
  await look(31, 20, 30, 2.5);
  r2.screenshot = await shot('24_kamyon_kuyrugu');
  await unlook();
  return { ...r, ...r2 };
});

await step('Görevler: ana zincir ilerler, sonra sonsuz prosedürel görevler', async () => {
  const r = await W(() => {
    const g = window.__WE.game; const m = g.missions; const seen = [];
    for (let i = 0; i < 80; i++) { seen.push(m.view().title); m.complete(); }
    return { main: g.state.missions.main, generated: g.state.missions.generated, sample: seen.slice(60, 70), current: m.view().title };
  });
  await closeModals();
  assert(r.generated > 5, 'Prosedürel görev üretilmedi');
  return r;
});

await step('Seviye sistemi sonsuz: büyük XP ile çok seviye atlanır', async () => {
  const r = await W(() => { const g = window.__WE.game; const l0 = g.state.level; g.levels.addXP(5e6); return { from: l0, to: g.state.level, nextNeed: g.levels.need }; });
  await closeModals();
  assert(r.to > r.from + 10, 'Seviye atlanmadı');
  return r;
});

await step('Günlük ödül, günlük görevler ve başarılar', async () => {
  const r = await W(() => {
    const g = window.__WE.game; const gold0 = g.state.gold;
    // açılışta çıkan Günlük Ödül penceresi önceden alınmış olabilir; mantığı kesin test etmek için bugünkü alımı sıfırla
    const preClaimed = !g.daily.canClaimLogin(); if (preClaimed) g.daily.s.claimedDay = null;
    const claim = g.daily.claimLogin(false); const again = g.daily.claimLogin(false);
    const quests = g.daily.questView().map((q) => q.title);
    const ach = g.missions.achievementView().filter((a) => a.done).map((a) => a.def.id);
    const claimed = ach.map((id) => g.missions.claimAchievement(id));
    return { preClaimed, claim, again, quests, achievementsClaimed: ach, gold: [gold0, g.state.gold] };
  });
  assert(r.claim && !r.again, 'Günlük ödül mantığı hatalı');
  return r;
});

await step('Mağaza: altınla hızlandırma (üretim x2 gerçekten hızlandırır), görünüm, altın kamyon', async () => {
  const r = await W(async () => {
    const g = window.__WE.game; const saw = g.sites.get('saw'); const t0 = g.production.procTime(saw);
    await g.shop.buyBoost('production', 'gold');
    const t1 = g.production.procTime(saw);
    const skin = g.shop.buySkin('forest'); const golden = g.shop.buyGoldItem('golden_truck');
    return { procTime: [t0.toFixed(2), t1.toFixed(2)], skin, golden, skinNow: g.state.player.skin, saleMul: g.economy.saleMultiplier().toFixed(2) };
  });
  assert(+r.procTime[1] < +r.procTime[0], 'Hızlandırma çalışmadı');
  return r;
});

await step('Reklam: ödüllü reklam akışı (web dev simülasyonu) — ödül yalnızca izlenince', async () => {
  const gold0 = await W(() => window.__WE.game.state.gold);
  const p = page.evaluate(() => window.__WE.game.shop.adReward('gold'));
  await page.waitForSelector('.devad', { timeout: 5000 });
  const sc = await shot('25_reklam_simulasyonu');
  const ok = await p;
  const gold1 = await W(() => window.__WE.game.state.gold);
  assert(ok && gold1 >= gold0 + 5, 'Reklam ödülü verilmedi ' + JSON.stringify({ ok, gold0, gold1, ads: await W(() => ({ today: window.__WE.game.state.daily.adsToday, noAds: !!window.__WE.game.state.purchases.noAds, modals: [...document.querySelectorAll('.modal-wrap')].map((m) => m.className) })) }));
  // iptal edilirse ödül yok
  const p2 = page.evaluate(() => window.__WE.game.shop.adReward('gold'));
  await page.waitForSelector('#devad-skip'); await page.tap('#devad-skip');
  const ok2 = await p2; const gold2 = await W(() => window.__WE.game.state.gold);
  assert(!ok2 && gold2 === gold1, 'İptal edilen reklam ödül verdi');
  return { rewarded: ok, cancelledNoReward: !ok2, screenshot: sc };
});

await step('Uygulama içi satın alma: web sürümünde güvenli şekilde kapalı (sahte satın alma yok)', async () => {
  await page.tap('#tab-shop'); await sleep(300); await page.tap('[data-act="open:shop:packs"]'); await sleep(400);
  const r = await W(() => ({ status: window.__WE.game.billing.status, text: window.__WE.game.billing.statusText(), enabledButtons: document.querySelectorAll('[data-act^="shop:iap:"]').length }));
  const sc = await shot('26_magaza_paketler');
  await page.tap('[data-act="close"]');
  assert(r.enabledButtons === 0, 'Doğrulanmamış satın alma düğmesi aktif');
  return { ...r, screenshot: sc };
});

await step('Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar)', async () => {
  await W(() => window.__WE.timeScale(1));
  const shots = [];
  for (const [tab, name] of [['missions', '27_menu_gorevler'], ['land', '28_menu_arazi'], ['workers', '29_menu_isciler'], ['factory', '30_menu_fabrika'], ['vehicles', '31_menu_araclar']]) {
    await page.tap('#tab-' + tab); await sleep(500); shots.push(await shot(name));
  }
  await page.tap('[data-act="close"]');
  return { shots };
});

await step('Değerli Ağaç Ormanı ve sonsuz bölge görüntüsü', async () => {
  await look(-45, -72, 34, 2.5);
  const a = await shot('32_degerli_agac_ormani');
  const zc = await W(() => { const z = window.__WE.game.land.zoneDef(12).rect; return [(z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2]; });
  await closeModals();
  await look(zc[0] - 14, zc[1], 40, 2.5);
  await closeModals();
  const b = await shot('33_sonsuz_bolge');
  await unlook();
  return { shots: [a, b] };
});

await step('İşçi görevleri, operatörler, çiftlik yemi ve XP yavaşlaması', async () => {
  const r = await W(async () => {
    const g = window.__WE.game; const W = g.workers; window.__WE.timeScale(1);
    // 1) tek noktadan alınan işçinin görevi değiştirilebilir
    g.state.money = Math.max(g.state.money, 1e8);
    W.hireFromPad(W.hirePads[0]); const w = W.list[W.list.length - 1]; const role0 = w.data.role;
    const ok = W.setRole(w, 'sawop'); const bad = W.setRole(w, 'farmer'); // başlangıç alanında bakıcı yok
    // 2) kesme operatörü testereyi gerçekten hızlandırır
    const saw = g.sites.get('saw'); const t0 = g.production.procTime(saw);
    w.pos.x = saw.x - 1.6; w.pos.z = saw.z - 2.1;
    for (let k = 0; k < 40 && w.state !== 'operate'; k++) await new Promise((res) => setTimeout(res, 300));
    const t1 = g.production.procTime(saw);
    // 3) bant operatörü bandı hızlandırır
    W.setRole(w, 'beltop');
    for (let k = 0; k < 40 && w.state !== 'operate'; k++) await new Promise((res) => setTimeout(res, 300));
    const b = w.station; // operatörün başında durduğu bant
    const v0 = b ? 3.2 * (1 + b.up.speed * 0.15) : 0; const v1 = b ? g.conveyors.speed(b) : 0;
    // 4) yem: yemi bitmiş inek üretmez; yem alınınca üretir
    const cows = g.animals.list.filter((a) => a.zone === 10);
    const keep = g.state.money; g.state.money = 0; // bakıcılar yem alamasın: aç kalma kuralını ölç
    g.state.feed[10] = 0; for (const a of cows) a.ready = 0.2;
    const m0 = g.state.stats.cowsMilked || 0;
    await new Promise((res) => setTimeout(res, 1500));
    const hungryReady = cows.filter((a) => g.animals.isReady(a)).length;
    g.state.money = keep; const money0 = g.state.money; const bought = g.animals.buyFeed(10) && g.animals.buyFeed(10);
    const paid = money0 - g.state.money;
    // 5) XP: 5. seviyeden sonra %30
    const lv = g.state.level; const x0 = g.state.xp; g.levels.frac = 0; g.levels.addXP(100); const gained = g.state.xp - x0 + (g.state.level > lv ? 999 : 0);
    return { role0, ok, bad, t: [t0.toFixed(3), t1.toFixed(3)], v: [v0.toFixed(2), v1.toFixed(2)], hungryReady, milkedWhileHungry: (g.state.stats.cowsMilked || 0) - m0, bought, paid, feedNow: g.state.feed[10], level: lv, xpGain: gained, roleName: W.roleName({ data: { role: 'farmer', fac: 11 } }) };
  });
  assert(r.ok && !r.bad, 'Görev değiştirme çalışmadı ' + JSON.stringify(r));
  assert(+r.t[1] < +r.t[0], 'Kesme operatörü testereyi hızlandırmadı ' + JSON.stringify(r.t));
  assert(+r.v[1] > +r.v[0], 'Bant operatörü bandı hızlandırmadı ' + JSON.stringify(r.v));
  assert(r.hungryReady === 0, 'Aç inek hazır oldu (yem kuralı çalışmadı)');
  assert(r.bought && r.paid > 0 && r.feedNow >= 2, 'Yem satın alınamadı ' + JSON.stringify(r));
  assert(r.level < 5 || r.xpGain === 30, 'XP %70 azaltılmadı ' + JSON.stringify(r));
  assert(r.roleName === 'Tavuk Bakıcısı', 'Bakıcı adı yanlış');
  return r;
});

await step('Alan genişletme: yeni arazi/fabrika açılmaz, Süt Çiftliği genişler (tek depo + tek rampa + tek makine hızlanır)', async () => {
  const r = await W(() => {
    const g = window.__WE.game; g.state.money = Math.max(g.state.money, 1e9); g.state.level = Math.max(g.state.level, 40);
    const dep = g.sites.get('f10_depot'), dock = g.sites.get('f10_dock');
    const cap0 = dep.buffer.capacity, mul0 = dock.valueMul, docks0 = g.trucks.docks.length, depots0 = g.storage.depots.length;
    const m = g.sites.get('f10_m'); const t0 = g.production.procTime(m), c0 = m.inBuf.capacity, machines0 = g.production.machines.length, pen0 = g.animals.maxFor(10);
    const bought = g.land.buy(15);
    const def = g.land.zoneDef(15);
    g.production.refreshExpansionBoost();
    const built = !g.sites.has('f15_m') && g.production.machines.length === machines0 && g.production.procTime(m) < t0 * 0.75 && m.inBuf.capacity > c0 && g.animals.maxFor(10) > pen0;
    const routes = g.workers.availableRoutes({ data: { fac: 10 } }).map((x) => x.id);
    const hire = (g.workers.facPads.get(15) || []).map((p) => p.data.fac);
    return { bought, name: def.name, parent: def.parent, walk: g.land.isWalkable((def.rect.x0 + def.rect.x1) / 2, (def.rect.z0 + def.rect.z1) / 2),
      cap: [cap0, dep.buffer.capacity], mul: [mul0, dock.valueMul], newDocks: g.trucks.docks.length - docks0, newDepots: g.storage.depots.length - depots0, built, routes, hire, d1cap: g.sites.get('depot1').buffer.capacity };
  });
  assert(r.bought && r.parent === 10, 'Genişletme alınamadı');
  assert(r.walk, 'Genişletme alanı yürünemiyor');
  assert(r.newDocks === 0 && r.newDepots === 0, 'Genişletme yeni depo/rampa açtı');
  assert(r.cap[1] > r.cap[0], 'Depo kapasitesi büyümedi');
  assert(r.mul[1] >= r.mul[0], 'Rampa çarpanı düştü');
  assert(r.built, 'Genişletme yeni makine kurdu ya da ana makine hızlanmadı / ağıl büyümedi');
  assert(r.hire.every((f) => f === 10), 'Genişletmedeki işçiler ana tesise bağlı değil');
  await closeModals();
  const zc = await W(() => { const z = window.__WE.game.land.zoneDef(15).rect; return [(z.x0 + z.x1) / 2 + 10, (z.z0 + z.z1) / 2]; });
  await look(zc[0], zc[1], 46, 2.5);
  await closeModals();
  r.screenshot = await shot('40_alan_genisletme');
  await unlook();
  return r;
});

await step('Geç oyun kaydı: işçiler, forklift, bantlar, kamyon yükü yeniden açılınca korunur', async () => {
  const before = await W(async () => { const g = window.__WE.game; await window.__WE.saveNow(); return { workers: g.workers.list.map((w) => w.data.role), forklifts: g.vehicles.list.length, belts: [...g.conveyors.belts.keys()].sort(), beltItems: [...g.conveyors.belts.values()].reduce((a, b) => a + b.items.length, 0), zones: g.state.zones.length, sites: [...g.sites.keys()].sort(), tier: g.state.trucks.tier, sawUp: g.sites.get('saw').up, level: g.state.level, skin: g.state.player.skin }; });
  await page.reload();
  await page.waitForFunction(() => window.__WE && window.__WE.game.ready, null, { timeout: 30000 });
  await sleep(1000); await closeModals();
  const after = await W(() => { const g = window.__WE.game; return { workers: g.workers.list.map((w) => w.data.role), forklifts: g.vehicles.list.length, belts: [...g.conveyors.belts.keys()].sort(), beltItems: [...g.conveyors.belts.values()].reduce((a, b) => a + b.items.length, 0), zones: g.state.zones.length, sites: [...g.sites.keys()].sort(), tier: g.state.trucks.tier, sawUp: g.sites.get('saw').up, level: g.state.level, skin: g.state.player.skin }; });
  for (const k of Object.keys(before)) if (k !== 'beltItems') assert(JSON.stringify(before[k]) === JSON.stringify(after[k]), `${k} korunmadı: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`);
  return { before, after };
});

await step('Performans örneği (headless SwiftShader — gerçek cihaz değildir)', async () => {
  await sleep(3000);
  return W(() => { const g = window.__WE.game; return { fpsSwiftShader: g.fps, drawCalls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles, geometries: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures, workers: g.workers.list.length, trees: g.trees.trees.length }; });
});

const report = { date: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, steps: results, pageErrors: errors };
fs.writeFileSync(path.join(REPORT, 'systems-report.json'), JSON.stringify(report, null, 2));
log(`SONUÇ: ${report.passed} başarılı, ${report.failed} başarısız, ${errors.length} sayfa hatası`);
if (errors.length) log(errors.slice(0, 15).join('\n'));
await browser.close();
process.exit(report.failed || errors.length ? 1 : 0);
