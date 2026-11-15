// =============================================================
// WOOD EMPIRE — Ekonomi / ilerleme hızı simülasyonu
// Oyunun gerçek denge dosyalarını (balance.js, zones.js) kullanarak "makul bir oyuncunun"
// ilerlemesini saniye saniye modeller ve her arazinin kaçıncı dakikada açıldığını raporlar.
// Bu bir MODELDİR (yaklaşık üretim hızları); gerçek cihaz oynanış verisinin yerini tutmaz.
// Kullanım: node tests/economy-sim.mjs
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import {
  WOODS, ITEMS, MACHINES, MACHINE_UPGRADES, PLAYER_UPGRADES, playerCapacity, TRUCK_TIERS, TRUCK_UPGRADES,
  WORKER_HIRE, WORKER_UPGRADES, WORKER_BASE, xpForLevel, levelReward, upgradeCost, XP, WOOD_SALE_MUL, OTHER_SALE_MUL, xpGainMul,
} from '../src/config/balance.js';
import { getZone, CONVEYORS } from '../src/config/zones.js';

// ithalatlı bölgelerin temel net kazancı (ürün/sn × fiyat − ithalat bedeli, rampa çarpanı hariç)
const IMPORT_NET = { 3: 5.34, 5: 4.23, 7: 17.2, 8: 10.25, 9: 26.9 };
const HOURS = Number(process.env.SIM_HOURS || 14);
const s = {
  t: 0, money: 0, xp: 0, level: 1, zones: new Set([0]), up: { speed: 0, capacity: 0, chop: 0, power: 0, collect: 0 },
  saw: { speed: 0, blades: 0, size: 0, quality: 0 }, built: new Set(['saw']), workers: 0, wup: { slots: 0, speed: 0, capacity: 0, efficiency: 0 },
  conveyors: 0, tier: 0, tup: { speed: 0, bonus: 0, load: 0 }, forklifts: 0, earned: 0, purchases: [],
};
const events = [];

function addXP(n) {
  s.xp += n * xpGainMul(s.level);
  while (s.xp >= xpForLevel(s.level)) { s.xp -= xpForLevel(s.level); s.level++; const r = levelReward(s.level); s.money += r.money; }
}
function forestMul() {
  // sahip olunan ormanların ortalama odun değeri
  let sum = 0, n = 0;
  for (const id of s.zones) for (const f of getZone(id).forests) for (const [w, wt] of Object.entries(f.mix)) { sum += WOODS[w].mul * wt; n += wt; }
  return n ? sum / n : 1;
}
function stageValue() {
  // ulaşılabilen en değerli ürün aşaması (log başına kazanç)
  const blades = 2 + s.saw.blades;
  let v = blades * ITEMS.plank.price;
  if (s.built.has('sander')) v = Math.max(v, blades * ITEMS.sanded.price * (s.conveyors >= 2 || s.workers >= 2 ? 1 : 0.85));
  // Paketleme / Palet-Mobilya / Panel / Otomatik Hat artık kendi bölgelerinin ithalatıyla çalışır (aşağıda importIncome)
  v *= 1 + [...s.built].filter((b) => b.startsWith('line_')).length * 0.1;
  return v * (1 + s.saw.quality * 0.06) * WOOD_SALE_MUL;
}
function saleMul() {
  let m = 1 + s.tup.bonus * 0.05;
  for (const id of s.zones) m += getZone(id).saleBonus || 0;
  return m;
}
function rates() {
  const cap = playerCapacity(s.up.capacity);
  const speed = 5 * (1 + s.up.speed * 0.07);
  const chopT = (WOODS.pine.hp / (1 + s.up.power * 0.5)) * (0.72 / (1 + s.up.chop * 0.09));
  const walk = 2 * 22 / speed;
  const transfer = cap * 4 * 0.16 / (1 + s.up.collect * 0.12);
  const treesPerTrip = cap / 2.5;
  const manualLogs = cap / (treesPerTrip * (chopT + 1.5) + walk + transfer) * (s.conveyors > 0 || s.workers > 2 ? 0.6 : 1); // otomasyon arttıkça oyuncu daha az odun taşır
  const wSpeed = 1 + s.wup.speed * 0.08 + s.wup.efficiency * 0.06;
  const lumberjacks = Math.ceil(s.workers * 0.5);
  const workerLogs = lumberjacks * (WORKER_BASE.capacity + s.wup.capacity) / (8 / wSpeed + 40 / (WORKER_BASE.speed * wSpeed));
  const sawRate = 1 / (MACHINES.saw.time * Math.pow(0.92, s.saw.speed) / Math.pow(1.4, s.saw.size));
  const lines = 1 + [...s.built].filter((b) => b.startsWith('line_')).length * 2;
  const logs = Math.min(manualLogs + workerLogs + s.forklifts * 0.15, sawRate * lines);
  const truckCap = TRUCK_TIERS[s.tier].cap;
  const truckLimit = truckCap / (7 / (1 + s.tup.speed * 0.12) + truckCap * 0.14) * 2; // satış hattı limiti (ürün/sn)
  const items = Math.min(logs * (2 + s.saw.blades), truckLimit);
  // tesisler (süt / tavuk / ikinci kereste): yaklaşık geri ödeme ~12 dk (işçi + bant ile otomatik çalıştığı varsayılır)
  // tesis geliri: temel makine hızı × rampa fiyat çarpanı (işçi + bantla tam otomatik varsayılır, %70 verim)
  // tesis + genişletmeleri: makine sayısı × temel hız × rampa çarpanı (genişletmeler rampa çarpanını yükseltir)
  let facIncome = 0;
  for (const id of s.zones) {
    const z = getZone(id); if (id < 10 || z.parent != null) continue;
    let n = 1, vm = z.valueMul, ups = (s.facUp || {})[id] || 0;
    for (const e of s.zones) { const ez = getZone(e); if (ez.parent !== id) continue; vm = Math.max(vm, ez.valueMul); ups += (s.facUp || {})[e] || 0; if (s.built.has(`f${e}_m`)) n++; }
    facIncome += n * ({ dairy: 8 * OTHER_SALE_MUL, poultry: 5 * OTHER_SALE_MUL, lumber: 8 * WOOD_SALE_MUL, sheep: 7 * OTHER_SALE_MUL, bee: 7 * OTHER_SALE_MUL }[z.facility]) * vm * 0.7 * Math.pow(1.08, ups);
  }
  // ithalatlı bölgeler: (satış − ithalat bedeli) temel hızı × rampa çarpanı; makineleri kuruluysa, işçi+bantla %70 verim
  for (const id of s.zones) { const z = getZone(id); if (!z.importZone || !z.machines.every((m) => s.built.has(m))) continue; facIncome += IMPORT_NET[id] * WOOD_SALE_MUL * z.valueMul * 0.7 * Math.pow(1.08, (s.facUp || {})[id] || 0); }
  const income = (items / (2 + s.saw.blades)) * stageValue() * forestMul() * saleMul() + facIncome * saleMul();
  return { income, logs, items, manualLogs, workerLogs, sawRate };
}

/** Satın alma adayları (açgözlü, en ucuz faydalı yatırım; arazi önceliklidir) */
function candidates() {
  const c = [];
  // tesis makinesi / bant yükseltmeleri (her biri tesis gelirini %8 artırır)
  s.facUp ||= {};
  for (const id of s.zones) if ((id >= 10 || getZone(id).importZone) && (s.facUp[id] || 0) < 25) c.push({ kind: 'facup', id, cost: Math.round(getZone(id).cost * 0.06 * Math.pow(1.45, s.facUp[id] || 0)), prio: 0.85 });
  // iki bağımsız genişleme hattı: kuzeydeki kereste bölgeleri (1-9) ve güneydeki tesisler (10+)
  for (const ids of [[1, 2, 3, 4, 5, 6, 7, 8, 9], Array.from({ length: 40 }, (_, i) => 10 + i)]) for (const id of ids) {
    if (s.zones.has(id)) continue;
    const z = getZone(id);
    const prev = { 1: 0, 2: 0, 3: 1, 4: 0, 5: 4, 6: 2, 7: 3, 8: 7, 9: 5, 10: 0 }[id] ?? (z.parent != null ? id - 5 : id - 1);
    if (!s.zones.has(prev) || s.level < z.level) break;
    c.push({ kind: 'zone', id, cost: z.cost, prio: 0.5 });
    break;
  }
  for (const id of s.zones) for (const site of getZone(id).sites) if (site.cost && !s.built.has(site.id)) c.push({ kind: 'site', id: site.id, cost: site.cost, prio: 0.7 });
  for (const k of Object.keys(PLAYER_UPGRADES)) if (s.up[k] < PLAYER_UPGRADES[k].max) c.push({ kind: 'player', id: k, cost: upgradeCost(PLAYER_UPGRADES[k], s.up[k]), prio: 1 });
  for (const k of ['speed', 'blades', 'quality']) { const d = MACHINE_UPGRADES[k]; if (s.saw[k] < d.max) c.push({ kind: 'saw', id: k, cost: upgradeCost(d, s.saw[k]), prio: 1 }); }
  if (s.saw.size < 3 && s.zones.has(MACHINE_UPGRADES.size.gates[s.saw.size])) c.push({ kind: 'saw', id: 'size', cost: upgradeCost(MACHINE_UPGRADES.size, s.saw.size), prio: 1 });
  // işçiler Seviye 2'den itibaren dünyadaki İŞÇİ noktalarından alınır (ofis +2 kapasite verir); rol başına 100/150/220 × 1.75^n
  if (s.level >= 2) c.push({ kind: 'hire', cost: Math.round([100, 150, 220][s.workers % 3] * Math.pow(1.75, Math.floor(s.workers / 3))), prio: 0.8 });
  if (s.built.has('office')) for (const k of Object.keys(WORKER_UPGRADES)) if (k !== 'slots' && s.wup[k] < WORKER_UPGRADES[k].max) c.push({ kind: 'wup', id: k, cost: upgradeCost(WORKER_UPGRADES[k], s.wup[k]), prio: 1.1 });
  if (s.conveyors < CONVEYORS.length && s.zones.has(CONVEYORS[s.conveyors].zone)) c.push({ kind: 'conv', cost: CONVEYORS[s.conveyors].cost, prio: 0.9 });
  const next = TRUCK_TIERS[s.tier + 1];
  if (next && s.zones.has(next.zone)) c.push({ kind: 'tier', cost: next.cost, prio: 0.9 });
  for (const k of Object.keys(TRUCK_UPGRADES)) if (s.tup[k] < TRUCK_UPGRADES[k].max) c.push({ kind: 'tup', id: k, cost: upgradeCost(TRUCK_UPGRADES[k], s.tup[k]), prio: 1.2 });
  if (s.built.has('garage') && s.forklifts < 4) c.push({ kind: 'fork', cost: 6000 * Math.pow(3, s.forklifts), prio: 1 });
  return c.sort((a, b) => a.cost * a.prio - b.cost * b.prio);
}
function buy(c) {
  s.money -= c.cost;
  switch (c.kind) {
    case 'facup': s.facUp[c.id] = (s.facUp[c.id] || 0) + 1; addXP(XP.upgrade); break;
    case 'zone': s.zones.add(c.id); addXP(XP.buyLand * (1 + c.id * 0.5)); events.push({ min: +(s.t / 60).toFixed(1), level: s.level, event: `Arazi ${c.id}: ${getZone(c.id).name}`, cost: c.cost }); break;
    case 'site': s.built.add(c.id); addXP(XP.buyMachine); events.push({ min: +(s.t / 60).toFixed(1), level: s.level, event: `Kuruldu: ${c.id}`, cost: c.cost }); break;
    case 'player': s.up[c.id]++; break;
    case 'saw': s.saw[c.id]++; break;
    case 'hire': s.workers++; if (s.workers === 1) events.push({ min: +(s.t / 60).toFixed(1), level: s.level, event: 'İlk işçi', cost: c.cost }); break;
    case 'wup': s.wup[c.id]++; break;
    case 'conv': s.conveyors++; break;
    case 'tier': s.tier++; events.push({ min: +(s.t / 60).toFixed(1), level: s.level, event: `Kamyon: ${TRUCK_TIERS[s.tier].name}`, cost: c.cost }); break;
    case 'tup': s.tup[c.id]++; break;
    case 'fork': s.forklifts++; break;
  }
  addXP(XP.upgrade);
  s.purchases.push(c.kind);
}

const samples = [];
const DT = 1;
let lastBuyCheck = 0;
const maxIdle = { start: 0, longest: 0 };
for (s.t = 0; s.t < HOURS * 3600; s.t += DT) {
  const r = rates();
  s.money += r.income * DT; s.earned += r.income * DT;
  addXP((r.logs * 0.6 + r.items * 0.6 + r.items / 40) * DT);
  if (s.t - lastBuyCheck >= 5) {
    lastBuyCheck = s.t;
    let bought = false;
    for (let k = 0; k < 6; k++) {
      const c = candidates()[0];
      // para biriktirme: araziye yakınsa küçük yükseltmeleri ertele
      if (!c || c.cost > s.money) break;
      buy(c); bought = true;
    }
    if (bought) { maxIdle.longest = Math.max(maxIdle.longest, s.t - maxIdle.start); maxIdle.start = s.t; }
  }
  if (s.t % 600 === 0) samples.push({ min: s.t / 60, level: s.level, money: Math.round(s.money), incomePerMin: Math.round(r.income * 60), workers: s.workers, zones: s.zones.size });
}
const report = { model: 'Yaklaşık ilerleme modeli — gerçek oynanış verisi değildir', simulatedHours: HOURS, events, samples, longestWaitBetweenPurchasesMin: +(maxIdle.longest / 60).toFixed(1), final: { level: s.level, zones: [...s.zones], earned: Math.round(s.earned), workers: s.workers, tier: TRUCK_TIERS[s.tier].name } };
fs.mkdirSync('tests/report', { recursive: true });
fs.writeFileSync(path.join('tests/report', 'economy-report.json'), JSON.stringify(report, null, 2));
console.log('Olay zaman çizelgesi (dakika):');
for (const e of events) console.log(`  ${String(e.min).padStart(7)} dk  Sv.${String(e.level).padStart(3)}  ${e.event}  (${e.cost.toLocaleString('tr-TR')})`);
console.log('En uzun satın almasız bekleme:', report.longestWaitBetweenPurchasesMin, 'dk');
console.log('Son durum:', report.final);
// sağlık kontrolleri
const fail = [];
if (!events.some((e) => e.event.startsWith('Arazi 1'))) fail.push('Arazi 1 açılmadı');
if (report.longestWaitBetweenPurchasesMin > 60) fail.push('Çok uzun bekleme (>60 dk)');
const z1 = events.find((e) => e.event.startsWith('Arazi 1'));
if (z1 && z1.min > 40) fail.push('İlk arazi çok geç (>40 dk)'); // kereste geliri %80 düşürüldü: bilerek daha yavaş
if (fail.length) { console.log('UYARI:', fail.join('; ')); process.exit(1); }
console.log('Ekonomi kontrolleri geçti.');
