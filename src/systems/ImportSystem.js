import { makeTruck } from '../world/Models.js';
import { ITEMS, WOOD_SALE_MUL, WOOD_KINDS } from '../config/balance.js';
import { ROAD, getZone } from '../config/zones.js';
import { makePad } from './Stations.js';
import { XP } from '../config/balance.js';

/** İthal malın fiyatı: ürünün temel fiyatı × bölge rampa çarpanı × bu oran (satıştan çok daha ucuz) */
export const IMPORT_PRICE = 0.35;
const BATCH = 24;           // bir ithalat kamyonunun getirdiği en fazla ürün (12 → 24); 'Kamyon Kapasitesi' ile +12/seviye
const CAP_MAX = 10;          // kapasite yükseltmesi en fazla 10 seviye (24 → 144)
const UNLOAD_EVERY = 0.12;  // sn / ürün (0.22 → 0.12)
const GAP = 1.2;            // kamyonlar arası bekleme (sn) — önceki kamyon giderken sıradaki yola çıkar
const SPAWN_DIST = 40;      // kamyon 40 m öteden gelir (75 m idi)
const IMPORT_WOOD = { 5: 'oak', 9: 'cedar' };

/**
 * İthalat: sonradan açılan üretim bölgeleri (Paketleme, Lojistik, Palet/Mobilya, Panel, Otomatik Hat)
 * hammaddesini önceki bölgelerden değil, kendi İthalat Deposu'na gelen ithalat kamyonundan alır.
 * Kamyon B şeridinden kuzeyden gelir, depo yanında durur, ürünleri tek tek depoya indirir;
 * her ürün inerken ucuz ithalat bedeli ödenir. Para yetmezse kamyon bekler. Depo doluysa kamyon gelmez.
 */
export class ImportSystem {
  constructor(game) {
    this.game = game;
    this.lines = new Map(); // bölge id → durum
  }

  /** İTHALAT KAMYONU KAPASİTESİ (yükseltilebilir): seviye başına +12 ürün, depo da +24 büyür */
  capLevel(zoneId) { return this.game.state.importCap?.[zoneId] || 0; }
  batch(zoneId) { return BATCH + this.capLevel(zoneId) * 12; }
  capCost(zoneId) {
    const z = getZone(zoneId);
    const unit = Math.max(...z.importer.kinds.map((k) => this.unitPrice(zoneId, k)));
    return Math.round(Math.max(400, unit * 60) * Math.pow(1.6, this.capLevel(zoneId)));
  }
  upgradeCap(zoneId) {
    const g = this.game; const lv = this.capLevel(zoneId);
    if (lv >= CAP_MAX) return false;
    if (!g.economy.spend(this.capCost(zoneId), 'upgrade')) return false;
    (g.state.importCap ||= {})[zoneId] = lv + 1;
    const dep = g.sites.get(getZone(zoneId).importer.depot);
    if (dep) { dep.buffer.capacity = g.storage.depotCapacity(dep); g.fx.confetti(dep.x, 1.5, dep.z, 25); }
    g.audio.play('upgrade'); g.levels.addXP(XP.upgrade);
    g.bus.emit('toast', { text: `İthalat kamyonu artık ${this.batch(zoneId)} ürün getiriyor`, type: 'success' });
    g.save.requestSave();
    return true;
  }
  makeCapPad(L) {
    const g = this.game; const dep = g.sites.get(L.def.importer.depot); if (!dep) return;
    const id = L.id;
    if (dep.buffer) dep.buffer.capacity = g.storage.depotCapacity(dep);
    const c = [[3.4, 3.2], [-4.4, 3.2], [3.4, -3.6], [-4.4, -3.6]].map(([dx, dz]) => ({ x: dep.x + dx, z: dep.z + dz })).find((q) => g.isFree(q.x, q.z, 1.3) && !g.pads.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < 2.6)) || { x: dep.x + 3.4, z: dep.z + 3.2 };
    L.capPad = makePad(g, { x: c.x, z: c.z, mode: 'build', type: 'build', r: 1.1,
      label: () => ({ title: 'Kamyon Kapasitesi', price: this.capCost(id), level: 0, maxed: this.capLevel(id) >= CAP_MAX }),
      data: { expand: () => ({ name: 'İthalat Kamyonu', count: this.batch(id), cap: BATCH + CAP_MAX * 12, step: 12, cost: this.capCost(id), maxed: this.capLevel(id) >= CAP_MAX,
        desc: `Kamyon bir seferde <b>${this.batch(id)}</b> ürün getiriyor (en fazla ${BATCH + CAP_MAX * 12}). Yükseltince +12 ürün getirir, İthalat Deposu da +24 büyür.`, title: 'Kapasiteyi Artır',
        run: () => this.upgradeCap(id) }) } });
  }

  unitPrice(zoneId, kind) {
    const z = getZone(zoneId);
    return Math.max(1, Math.round(ITEMS[kind].price * (z.valueMul || 1) * IMPORT_PRICE * (WOOD_KINDS.includes(kind) ? WOOD_SALE_MUL : 1)));
  }

  /** Depoda en az bulunan tür önce gelir (iki makineli bölgede ikisi de beslensin) */
  nextKind(dep, kinds) {
    let best = kinds[0], bc = Infinity;
    for (const k of kinds) { const c = dep.buffer.countKind(k); if (c < bc) { bc = c; best = k; } }
    return best;
  }

  update(dt) {
    const g = this.game;
    for (const id of g.land.owned) {
      const def = getZone(id);
      if (!def.importer) continue;
      let L = this.lines.get(id);
      if (!L) { L = { id, def, t: 1.5, truck: null, unT: 0, waiting: false, delivered: 0 }; this.lines.set(id, L); this.makeCapPad(L); }
      this.tick(L, dt);
      this.tickLeaving(L, dt);
    }
  }

  tick(L, dt) {
    const g = this.game;
    const dep = g.sites.get(L.def.importer.depot);
    if (!dep) return;
    const tr = L.truck;
    if (!tr) {
      L.t -= dt;
      if (L.t <= 0 && dep.buffer.free >= 4) this.spawn(L);
      return;
    }
    const stopZ = L.def.importer.stopZ;
    if (tr.state === 'arrive') {
      const dz = stopZ - tr.z;
      const want = Math.min(22, Math.abs(dz) * 2.4 + 0.8);
      tr.speed += (want - tr.speed) * Math.min(1, dt * 3);
      tr.z += tr.speed * dt;
      if (tr.z >= stopZ) { tr.z = stopZ; tr.speed = 0; tr.state = 'unload'; g.bus.emit('importArrived', { zone: L.id }); }
    } else if (tr.state === 'unload') {
      L.unT -= dt;
      if (L.unT <= 0 && tr.load.length && !dep.buffer.isFull()) {
        const it = tr.load[tr.load.length - 1];
        const price = this.unitPrice(L.id, it.kind);
        if (g.state.money < price) { L.waiting = true; L.unT = 0.5; }
        else {
          L.waiting = false;
          g.state.money -= price; g.stat('moneySpent', price); g.stat('importSpent', price);
          g.bus.emit('money', { amount: -price, source: 'import' });
          tr.load.pop();
          const item = { kind: it.kind, wood: it.wood };
          dep.buffer.push(item);
          dep.buffer.hold++;
          const from = this.bedPoint(tr, tr.load.length);
          const to = dep.pile(dep.buffer.count - 1);
          g.fx.fly(item, from, to, 0.45, () => { dep.buffer.hold = Math.max(0, dep.buffer.hold - 1); }, 2.2);
          g.stat('imported'); g.stat('imported_' + it.kind); L.delivered++;
          L.unT = UNLOAD_EVERY;
          if (Math.hypot(dep.x - g.player.pos.x, dep.z - g.player.pos.z) < 16) g.audio.play('load', { vol: 0.35, pitch: 0.8 + Math.random() * 0.2 });
        }
      }
      // boşaldı ya da depo doldu → yola devam
      if (!tr.load.length || (dep.buffer.isFull() && !L.waiting)) { tr.state = 'leave'; L.waiting = false; }
    }
    if (tr.state === 'leave') { // giden kamyon ayrı listede yoluna devam eder; sıradaki kamyon hemen yola çıkabilir
      (L.leaving ||= []).push(tr); L.truck = null; L.t = GAP;
    } else this.place(tr, dt);
  }
  tickLeaving(L, dt) {
    if (!L.leaving?.length) return;
    const stopZ = L.def.importer.stopZ;
    for (const tr of L.leaving) {
      tr.speed = Math.min(tr.speed + dt * 12, 26);
      tr.z += tr.speed * dt;
      if (tr.z > stopZ + 60) { tr.model.group.removeFromParent(); tr.gone = true; } else this.place(tr, dt);
    }
    L.leaving = L.leaving.filter((t) => !t.gone);
  }

  spawn(L) {
    const g = this.game;
    const dep = g.sites.get(L.def.importer.depot);
    const tier = { id: 'import', cap: BATCH, color: 0x00897b, len: 1.0 + Math.min(0.5, this.capLevel(L.id) * 0.05), speed: 1 };
    const model = makeTruck(tier);
    model.group.rotation.y = Math.PI; // kabin +Z yönüne (güneye) bakar: ithalat kamyonu kuzeyden gelir
    const z = L.def.importer.stopZ - SPAWN_DIST;
    model.group.position.set(ROAD.laneB, 0, z);
    g.scene.add(model.group);
    const n = Math.min(this.batch(L.id), dep.buffer.free);
    const load = [];
    for (let i = 0; i < n; i++) {
      const kind = this.nextKind({ buffer: { countKind: (k) => dep.buffer.countKind(k) + load.filter((x) => x.kind === k).length } }, L.def.importer.kinds);
      load.push({ kind, wood: IMPORT_WOOD[L.id] || 'pine' });
    }
    L.truck = { model, load, z, speed: 0, state: 'arrive' };
    L.unT = 0.3;
  }

  place(tr, dt) {
    tr.model.group.position.set(ROAD.laneB, 0, tr.z);
    for (const w of tr.model.wheels) w.rotation.x -= (tr.speed * dt) / 0.48;
  }

  /** Kamyon 180° döndüğü için kasa noktaları ayna simetriği */
  bedPoint(tr, i) {
    const p = this.game.trucks.bedPoint({ model: tr.model, load: tr.load }, i);
    const gp = tr.model.group.position;
    return { x: 2 * gp.x - p.x, y: p.y, z: 2 * gp.z - p.z, yaw: p.yaw };
  }

  renderItems(R) {
    for (const L of this.lines.values()) {
      const tr = L.truck; if (!tr) continue;
      for (let i = 0; i < Math.min(tr.load.length, BATCH); i++) { const p = this.bedPoint(tr, i); const it = tr.load[i]; R.add(it.kind, it.wood, p.x, p.y, p.z, p.yaw); }
    }
  }

  /** Depo etiketi / rehber için durum */
  status(zoneId) {
    const L = this.lines.get(zoneId);
    if (!L || !L.truck) return L && L.t > 0 ? 'Kamyon yolda' : 'Bekleniyor';
    if (L.waiting) return 'Para yetersiz!';
    return L.truck.state === 'unload' ? 'Boşaltılıyor' : 'Kamyon yolda';
  }
}
