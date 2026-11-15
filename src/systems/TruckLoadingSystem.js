import { sameOrigin } from '../core/Buffer.js';
import * as THREE from 'three';
import { Buffer } from '../core/Buffer.js';
import { TRUCK_TIERS, TRUCK_UPGRADES, TRUCK_BASE_TURNAROUND, TRUCK_IDLE_DEPART, ITEMS, PRODUCT_KINDS, XP, upgradeCost } from '../config/balance.js';
import { ROAD, getZone } from '../config/zones.js';
import { makeTruck, makeDock } from '../world/Models.js';
import { pileLayout } from '../world/ItemRenderer.js';
import { makePad } from './Stations.js';

// Kamyona yalnızca makinede İŞLENMİŞ ürünler gider: kütük/süt/yumurta/yün/petek doğrudan satılamaz
const SELLABLE = PRODUCT_KINDS;

/**
 * Kamyon sistemi: yükleme alanı (hazırlık yığını) → kamyon yanaşır → ürünler kasaya
 * tek tek yerleşir → dolunca (veya oyuncu gönderince) sevkiyat → satış → para.
 * Her rampanın görünür bir kamyon kuyruğu vardır.
 */
export class TruckLoadingSystem {
  constructor(game) {
    this.game = game;
    this.docks = [];
    this.s = game.state.trucks;
  }

  get tier() { return TRUCK_TIERS[this.s.tier]; }
  speedMul() { return 1 + this.s.up.speed * 0.12; }
  loadInterval() { return 0.14 / (1 + this.s.up.load * 0.15); }
  stagingCap(d) { return 100 + (d.up?.cap || 0) * 50; }
  stagingCost(d) { return Math.round(150 * Math.pow(1.55, d.up.cap || 0) * Math.max(1, Math.sqrt(d.valueMul || 1))); }
  expandStaging(d) {
    const g = this.game;
    if (d.up.cap >= 15) return false;
    if (!g.economy.spend(this.stagingCost(d), 'upgrade')) return false;
    d.up.cap++; d.staging.capacity = this.stagingCap(d);
    g.audio.play('upgrade'); g.levels.addXP(XP.upgrade); g.fx.confetti(d.x, 1.5, d.z, 25);
    g.bus.emit('toast', { text: `${d.name} genişledi: ${d.staging.capacity} yer`, type: 'success' });
    g.save.requestSave();
    return true;
  }
  /** Aynı anda yüklenen ürün sayısı (yükleme yükseltmesiyle 1 → 6) */
  loadBatch() { return Math.min(6, 1 + Math.floor((this.s.up.load || 0) / 3)); }
  /** Rampa başına dakikada sevk edilebilen yaklaşık ürün (kamyon gidiş-dönüşü + yükleme) */
  perMin() { const cap = this.tier.cap; const t = this.turnaround() + cap * this.loadInterval() / this.loadBatch(); return Math.round(60 * cap / Math.max(1, t)); }
  turnaround() { return TRUCK_BASE_TURNAROUND / this.speedMul(); }

  createDock(site, saved) {
    const g = this.game;
    const laneX = site.lane === 'B' ? ROAD.laneB : ROAD.laneA;
    const side = site.x < laneX ? 1 : -1; // rampa yolun hangi tarafında
    const st = {
      id: site.id, type: 'dock', name: site.name, x: site.x, z: site.z, laneX, side,
      stopZ: site.z, queue: [], spawnT: 0.5, idleT: 0, loadT: 0, sentManual: false, valueMul: site.valueMul || 1,
    };
    // yükleme alanı kapasitesi genişletilebilir (+50 / seviye): işçiler rampada yük bekletmez
    st.up = { cap: 0, ...(saved?.up || {}) };
    st.staging = new Buffer(this.stagingCap(st), SELLABLE);
    st.staging.load((saved?.staging || []).filter((r) => SELLABLE.includes(r[0])));
    st.savedLoad = saved?.load || [];
    st.group = makeDock();
    st.group.position.set(site.x + side * 2.0, 0, site.z);
    if (side < 0) st.group.rotation.y = Math.PI;
    g.scene.add(st.group);
    // hazırlık yığını: platform üzerinde 2 sütun x 5 sıra, katmanlar halinde
    st.pilePoint = (i) => {
      const layer = Math.floor(i / 10), r = i % 10;
      return { x: site.x + side * 2.0 + ((r % 2) - 0.5) * 1.0, y: 0.5 + layer * 0.5, z: site.z - 1.6 + Math.floor(r / 2) * 1.2, yaw: Math.PI / 2 };
    };
    st.pad = makePad(g, {
      x: site.x - side * 0.6, z: site.z, mode: 'in', type: 'sell', buffer: st.staging, station: st, r: 1.6,
      dropPoint: (i) => st.pilePoint(i),
      // her rampa yalnızca KENDİ bölgesinde üretilen ürünü alır (yün ipliği süt rampasına, lojistik keresteleri ana rampaya karışmaz)
      // ...ve yalnızca zincirin SON ürününü: bölgede bu ürünü işleyen bir sonraki makine varsa önce oraya gitmeli (her şey sırasıyla)
      // oyuncu ise SON ürünü (kendi zincirini bitirmiş) her rampaya bırakabilir; başka bölgenin malı bu rampanın fiyat çarpanını almaz
      filter: (it, c) => c?.isPlayer && !sameOrigin(it, site.zone) ? !g.production.nextMachineFor(it.kind, it.o ? it.o : null) : sameOrigin(it, site.zone) && !g.production.nextMachineFor(it.kind, site.zone ?? null),
      onReceive: (item, c) => { if (!c.isPlayer) item.a = 1; st.idleT = 0; },
    });
    Object.defineProperty(st.pad, 'filterMsg', { get: () => {
      const bad = g.player.stack.items.find((it) => !st.pad.filter(it, g.player));
      if (!bad) return null;
      const next = g.production.nextMachineFor(bad.kind, sameOrigin(bad, site.zone) ? site.zone ?? null : bad.o || null);
      return next ? `${ITEMS[bad.kind].name} kamyona gitmez: önce ${next.name}'ne götür (her şey sırasıyla)` : `Bu ürün başka bir tesiste üretildi → ${g.production.whereTo(bad)}`;
    } });
    // "Alanı Genişlet" noktası (rampanın yanında): 1 sn dur → kart → Genişlet
    st.expandPad = makePad(g, { x: site.x - side * 0.6, z: site.z + 3.4, mode: 'build', type: 'build', r: 1.1,
      label: () => ({ title: 'Yükleme Alanını Genişlet', price: this.stagingCost(st), level: 0, maxed: st.up.cap >= 15 }),
      data: { expand: () => ({ name: st.name, count: st.staging.count, cap: st.staging.capacity, step: 50, cost: this.stagingCost(st), maxed: st.up.cap >= 15, what: 'kamyona yüklenecek ürünlerin bekleme alanı', run: () => this.expandStaging(st) }) } });
    g.obstacles.push({ x0: site.x + side * 2 - 1.8, x1: site.x + side * 2 + 1.8, z0: site.z - 4.4, z1: site.z - 2.7 });
    st.labelPos = { x: site.x + side * 2, y: 3.6, z: site.z - 3.6 };
    st.label = () => {
      const tr = this.atDock(st);
      return { title: st.valueMul > 1 ? `${st.name} · Fiyat ×${st.valueMul}` : st.name, value: tr ? `${tr.load.length}/${tr.cap}` : 'Kamyon bekleniyor', progress: tr ? tr.load.length / tr.cap : 0, icon: 'truck', queue: st.queue.length };
    };
    this.docks.push(st);
    g.sites.set(st.id, st);
    return st;
  }

  init() {
    // kayıtlı kamyon yükünü geri yükle
    for (const d of this.docks) {
      if (d.savedLoad.length) {
        const tr = this.spawnTruck(d, true);
        tr.load = d.savedLoad.map(([kind, wood]) => ({ kind, wood }));
      }
    }
  }

  spawnTruck(dock, atStop = false) {
    const g = this.game;
    const tier = this.tier;
    const model = makeTruck(this.s.golden ? { ...tier, color: 0xffc107 } : tier);
    // model kabini -Z yönündedir; kamyonlar kuzeye (-Z) gider → döndürme gerekmez (kabin önde)
    model.group.rotation.y = 0;
    const idx = dock.queue.length;
    // kamyon rampanın biraz gerisinden gelir (uzak tesislerde de kısa bekleme)
    const z = atStop ? dock.stopZ : dock.stopZ + 70 + idx * 4;
    model.group.position.set(dock.laneX, 0, z);
    g.scene.add(model.group);
    const tr = { model, tier: this.s.tier, cap: tier.cap * (this.s.golden ? 1 : 1), load: [], z, speed: 0, state: 'queue', waitT: 0, sold: false, autoCount: 0 };
    dock.queue.push(tr);
    return tr;
  }
  atDock(dock) { const t = dock.queue[0]; return t && t.state === 'load' ? t : null; }

  /** Ürün deposu için: yer olan rampa */
  /** Tesis rampasının fiyat çarpanı: alan genişledikçe (genişletmenin çarpanı) yükselir */
  refreshValueMul() {
    const g = this.game;
    for (const d of this.docks) {
      if (d.zone == null) continue;
      let m = d.baseValueMul ??= d.valueMul;
      for (const id of g.land.owned) { const z = getZone(id); if (z.parent === d.zone && z.valueMul > m) m = z.valueMul; }
      d.valueMul = m;
    }
  }
  /** Ambar yalnızca ana bölge rampalarını besler (ürünleri ana fabrikanın) */
  bestDockForFeed() {
    let best = null;
    for (const d of this.docks) if (!d.staging.isFull() && d.zone == null && (!best || d.staging.count < best.staging.count)) best = d;
    return best;
  }

  send(dock) {
    const tr = this.atDock(dock);
    if (!tr || tr.load.length === 0) return false;
    this.depart(dock, tr);
    return true;
  }
  depart(dock, tr) {
    tr.state = 'leave';
    tr.startZ = tr.z; tr.dockId = dock.id;
    dock.queue.shift();
    (this._all ||= new Set()).add(tr);
    this.game.audio.play('horn', { vol: 0.6 });
    this.game.bus.emit('truckDeparted', { dock, truck: tr });
  }
  rushTrucks() {
    for (const d of this.docks) { while (d.queue.length < 3) this.spawnTruck(d); for (const t of d.queue) t.rush = true; }
    this.game.audio.play('horn');
  }

  update(dt) {
    const g = this.game;
    const sm = this.speedMul() * (this.tier.speed || 1);
    for (const d of this.docks) {
      // kuyrukta en fazla 3 kamyon (1 rampada + 2 bekleyen)
      if (d.queue.length < 3) {
        d.spawnT -= dt;
        if (d.spawnT <= 0) { this.spawnTruck(d); d.spawnT = this.turnaround(); }
      }
      // kuyruk konumları
      d.queue.forEach((tr, i) => {
        const L = tr.model.length;
        const target = d.stopZ + i * (L + 2.2);
        const dz = target - tr.z;
        const maxSp = (tr.rush ? 34 : 20) * sm;
        if (Math.abs(dz) > 0.05) {
          const want = Math.sign(dz) * Math.min(maxSp, Math.abs(dz) * 2.2 + 0.5);
          tr.speed += (want - tr.speed) * Math.min(1, dt * 3);
          tr.z += tr.speed * dt;
          if ((dz > 0 && tr.z > target) || (dz < 0 && tr.z < target)) { tr.z = target; tr.speed = 0; }
        } else tr.speed = 0;
        if (i === 0 && Math.abs(tr.z - d.stopZ) < 0.1 && tr.state === 'queue') {
          tr.state = 'load'; tr.rush = false; d.idleT = 0;
          g.audio.play('brake', { vol: 0.4 });
          g.bus.emit('truckArrived', { dock: d, truck: tr });
        }
        this.placeTruck(tr, d.laneX, dt);
      });
      // yükleme
      const tr = this.atDock(d);
      if (tr) {
        d.loadT -= dt;
        if (d.loadT <= 0 && d.staging.count - d.staging.hold > 0 && tr.load.length < tr.cap) {
          // birden çok ürün aynı anda yüklenir (yükleme seviyesine göre)
          for (let k = 0; k < this.loadBatch() && d.staging.count - d.staging.hold > 0 && tr.load.length < tr.cap; k++) {
            const item = d.staging.items.shift();
            tr.load.push(item); tr.loadHold = (tr.loadHold || 0) + 1;
            if (item.a) tr.autoCount++;
            const from = d.pilePoint(d.staging.count);
            const slot = tr.load.length - 1;
            g.fx.fly(item, from, () => this.bedPoint(tr, slot), 0.28, () => { tr.loadHold = Math.max(0, tr.loadHold - 1); }, 1.8);
          }
          d.loadT = this.loadInterval();
          d.idleT = 0;
          if (Math.hypot(d.x - g.player.pos.x, d.z - g.player.pos.z) < 16) g.audio.play('load', { vol: 0.4, pitch: 0.9 + Math.random() * 0.2 });
        } else if (tr.load.length > 0) d.idleT += dt;
        if (tr.load.length >= tr.cap && !tr.loadHold) this.depart(d, tr);
        else if (tr.load.length >= tr.cap * 0.5 && d.idleT > TRUCK_IDLE_DEPART && d.staging.count === 0) this.depart(d, tr);
        else if (tr.load.length > 0 && d.idleT > TRUCK_IDLE_DEPART * 3 && d.staging.count === 0) this.depart(d, tr);
      }
    }
    // ayrılan kamyonlar
    this.updateLeaving(dt, sm);
  }

  updateLeaving(dt, sm) {
    const g = this.game;
    // sahnedeki tüm kamyonları kontrol et
    if (!this._all) this._all = new Set();
    for (const d of this.docks) for (const t of d.queue) this._all.add(t);
    for (const tr of [...this._all]) {
      if (tr.state !== 'leave') continue;
      tr.speed = Math.max(tr.speed, 0); tr.speed = Math.min(tr.speed + dt * 14 * sm, 34 * sm);
      tr.z -= tr.speed * dt;
      this.placeTruck(tr, tr.model.group.position.x, dt);
      if (!tr.sold && tr.z < tr.startZ - 30) { tr.sold = true; this.sell(tr); }
      if (tr.z < ROAD.zEnd + 5 || tr.z < g.player.pos.z - 160) {
        tr.model.group.removeFromParent();
        this._all.delete(tr);
      }
    }
  }

  placeTruck(tr, x, dt) {
    tr.model.group.position.set(x, 0, tr.z);
    for (const w of tr.model.wheels) w.rotation.x -= (tr.speed * dt) / 0.48;
    tr.model.body.position.y = Math.abs(tr.speed) > 0.5 ? Math.sin(this.game.time * 20) * 0.02 : 0;
  }

  bedPoint(tr, i) {
    const m = tr.model;
    const it = tr.load[i] || tr.load[tr.load.length - 1];
    const kind = it?.kind || 'log';
    // kasa: uzun eksen kamyon boyunca
    const cols = Math.max(1, Math.floor(m.bedLen / 1.25)), rows = Math.max(1, Math.floor(m.bedWidth / (kind === 'log' ? 0.4 : kind === 'package' ? 0.56 : 0.38)));
    const per = cols * rows;
    const layer = Math.floor(i / per), r = i % per;
    const along = ((r % cols) - (cols - 1) / 2) * 1.22;
    const across = (Math.floor(r / cols) - (rows - 1) / 2) * (m.bedWidth / rows);
    const ax = m.bedAnchor.position;
    const gp = m.group.position;
    return { x: gp.x + across, y: ax.y + layer * 0.42 + 0.22, z: gp.z + ax.z + along, yaw: Math.PI / 2 };
  }

  sell(tr) {
    const g = this.game;
    let value = 0;
    const dock = g.sites.get(tr.dockId);
    // tesis rampalarında ölçeğe göre artan fiyat — yalnızca o bölgenin kendi ürününe (oyuncunun getirdiği başka bölge malı normal fiyat)
    for (const it of tr.load) value += g.economy.itemValue(it) * (sameOrigin(it, dock?.zone) ? (dock?.valueMul || 1) : 1);
    value *= g.economy.saleMultiplier();
    const amount = Math.round(value);
    const p = tr.model.group.position;
    g.economy.addMoney(amount, 'sale', { x: p.x, y: 3, z: p.z + 3 });
    if (tr.load.length) g.economy.noteAutomatedIncome(amount * (tr.autoCount / tr.load.length));
    g.economy.recordSale(amount, tr.load, tr.dockId);
    g.stat('trucksShipped'); g.stat('itemsSold', tr.load.length);
    for (const it of tr.load) g.stat('sold_' + it.kind);
    g.levels.addXP(XP.shipTruckBase + tr.load.length / 2, null, true);
    g.audio.play('cash');
    g.bus.emit('sale', { amount, items: tr.load.length });
    g.save.requestSave();
  }

  // --- Satın alma / yükseltme ---
  buyTier(i) {
    const t = TRUCK_TIERS[i];
    if (!t || this.s.owned.includes(i)) { this.s.tier = i; return true; }
    if (!this.game.land.owns(t.zone)) { this.game.bus.emit('toast', { text: `${this.game.land.zoneDef(t.zone).name} gerekli`, type: 'error' }); return false; }
    if (!this.game.economy.spend(t.cost, 'truck')) return false;
    this.s.owned.push(i); this.s.tier = i;
    this.game.stat('trucksBought');
    this.game.levels.addXP(XP.buyMachine);
    this.game.audio.play('upgrade');
    this.game.bus.emit('upgrade', { target: 'truck', key: 'tier', level: i });
    return true;
  }
  upgradeCost(key) { return upgradeCost(TRUCK_UPGRADES[key], this.s.up[key]); }
  upgrade(key) {
    const def = TRUCK_UPGRADES[key];
    if (this.s.up[key] >= def.max) return false;
    if (!this.game.economy.spend(this.upgradeCost(key), 'upgrade')) return false;
    this.s.up[key]++;
    this.game.stat('upgradesVehicle');
    this.game.levels.addXP(XP.upgrade);
    this.game.audio.play('upgrade');
    this.game.bus.emit('upgrade', { target: 'truck', key, level: this.s.up[key] });
    return true;
  }

  renderItems(R) {
    for (const d of this.docks) {
      const n = Math.min(d.staging.count - d.staging.hold, 40);
      for (let i = 0; i < n; i++) { const p = d.pilePoint(i); const it = d.staging.items[i]; R.add(it.kind, it.wood, p.x, p.y, p.z, p.yaw); }
    }
    const all = this._all || new Set();
    for (const d of this.docks) for (const t of d.queue) all.add(t);
    for (const tr of all) {
      const n = tr.load.length - (tr.loadHold || 0);
      for (let i = 0; i < n && i < 220; i++) { const p = this.bedPoint(tr, i); const it = tr.load[i]; R.add(it.kind, it.wood, p.x, p.y, p.z, p.yaw); }
    }
  }

  serialize(out) {
    for (const d of this.docks) {
      const tr = this.atDock(d);
      out[d.id] = { built: true, up: d.up, staging: d.staging.serialize(), load: tr ? tr.load.map((i) => [i.kind, i.wood]) : [] };
    }
  }
}
