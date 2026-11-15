import { getZone } from '../config/zones.js';
import { sameOrigin } from '../core/Buffer.js';
import * as THREE from 'three';
import { Buffer } from '../core/Buffer.js';
import { DEPOT_BASE_CAP, DEPOT_UPGRADE, DEPOT_STEP, DEPOT_SECTION, PRODUCT_KINDS, upgradeCost, XP, ITEMS } from '../config/balance.js';
import { makeDepot, makeShed } from '../world/Models.js';
import { pileLayout } from '../world/ItemRenderer.js';
import { makePad } from './Stations.js';

/**
 * Depolar: Kütük deposu (bırak/al alanları, büyüyen odun yığını) ve
 * Ürün Deposu (bitmiş ürünleri saklar ve yükleme alanını otomatik besler).
 */
export class StorageSystem {
  constructor(game) {
    this.game = game;
    this.depots = [];
    this.warehouses = [];
  }

  /** Depo kapasitesi: alan genişledikçe büyür (ana alanda ormanlar, tesiste genişletmeler) */
  depotCapacity(st) { return DEPOT_BASE_CAP + this.areaBonus(st) + st.up.capacity * DEPOT_STEP; }
  areaBonus(st) {
    const g = this.game; let b = 0;
    for (const id of g.land.owned) {
      const z = getZone(id);
      if (st.id === 'depot1' && id > 0 && id < 10 && !z.importZone && (z.depotBonus || z.forests?.length)) b += z.depotBonus || 50;
      else if (st.zone != null && !st.import && z.parent === st.zone) b += 50;
    }
    if (st.import) b += (g.state.importCap?.[st.zone] || 0) * 24; // ithalat kamyonu kapasitesi büyüdükçe depo da büyür
    return b;
  }
  /** Arazi alındıktan sonra bütün depoların kapasitesini yenile */
  refreshCapacity() { for (const st of this.depots) { st.buffer.capacity = this.depotCapacity(st); this.ensureSections(st); } }
  /** Depo büyüdükçe yanına yeni bölmeler (çitli yığın alanı) kurulur: kütükler görseldeki gibi yan yana yığılır */
  ensureSections(st) {
    if (!st.sections) return;
    const need = Math.min(st.maxSections, Math.max(1, Math.ceil(st.buffer.capacity / DEPOT_SECTION)));
    while (st.sections.length < need) {
      const k = st.sections.length; const z = st.z - st.secDz * k;
      const grp = st.closed ? makeShed(7.4, 5.4, 0x8d6e63, 0x4e342e, 3.2) : makeDepot(); grp.position.set(st.x, 0, z); this.game.scene.add(grp);
      const hw = st.closed ? 3.8 : 2.8, hd = st.closed ? 2.8 : 2.2;
      this.game.obstacles.push({ x0: st.x - hw, x1: st.x + hw, z0: z - hd, z1: z + hd });
      st.sections.push(grp);
    }
  }
  warehouseCapacity(st) { return 400 + st.up.capacity * 200; }

  createDepot(site, saved) {
    const g = this.game;
    const kinds = Array.isArray(site.accepts) ? site.accepts : [site.accepts || 'log'];
    const kind = kinds[0];
    const st = { id: site.id, type: 'depot', name: site.name, x: site.x, z: site.z, kind, kinds, up: { capacity: 0, ...(saved?.up || {}) } };
    // ithalat deposu: içindeki ürünler yalnızca KENDİ bölgesinin makinelerine girer (etiket 1000 + bölge)
    st.import = !!site.import; st.tag = site.import ? 1000 + site.zone : 1;
    st.buffer = new Buffer(this.depotCapacity(st), kinds);
    st.buffer.load(saved?.in);
    // eski kayıt: ayrı Orman Deposu kaldırıldı → kütükleri tek Kütük Deposu'na taşınır, kurulum parası iade
    const old2 = site.id === 'depot1' && g.state.sites.depot2;
    if (old2) {
      for (const r of old2.in || []) if (r[0] === 'log' && st.buffer.items.length < st.buffer.capacity + 200) st.buffer.items.push({ kind: 'log', wood: r[1] });
      if (old2.built) { g.state.money += 2200; setTimeout(() => g.bus.emit('toast', { text: 'Orman Deposu, Kütük Deposu ile birleşti — 2.200 para iade edildi', type: 'success' }), 1800); }
      delete g.state.sites.depot2;
    }
    for (const it of st.buffer.items) it.dep = st.tag;
    // depoya hangi yoldan girerse girsin (oyuncu, işçi, forklift, ithalat kamyonu) ürün "bu depodan geçti" olarak işaretlenir
    const rawPush = st.buffer.push.bind(st.buffer);
    st.buffer.push = (it) => { if (it) { it.dep = st.tag; it.o = site.zone ?? 0; } return rawPush(it); };
    // kapalı depo (ahşap bina, önü açık kapı): içindeki kütük yığını kapıdan görünür
    st.closed = !!site.closed; st.secDz = st.closed ? 5.8 : 4.6;
    st.group = st.closed ? makeShed(7.4, 5.4, 0x8d6e63, 0x4e342e, 3.2) : makeDepot();
    st.group.position.set(site.x, 0, site.z);
    g.scene.add(st.group);
    // bölmeli yığın: her bölme DEPOT_SECTION ürün alır, sonra kuzeydeki yeni bölmeye geçilir (son bölme yükselir)
    st.sections = [st.group]; st.maxSections = site.id === 'depot1' ? 4 : 1;
    const pile = (i) => {
      const sec = Math.min(Math.floor(i / DEPOT_SECTION), st.sections.length - 1); const j = i - sec * DEPOT_SECTION;
      const p = kind === 'log' ? pileLayout(j, 'log', 4, 10) : pileLayout(j, kind, 7, 6);
      return { x: st.x + p.x, y: (st.closed ? 0.22 : 0.12) + p.y, z: st.z - 0.1 - st.secDz * sec + p.z, yaw: p.yaw };
    };
    st.pile = pile;
    const padZ = site.z + (st.closed ? 3.7 : 3.0); // kapalı depoda noktalar kapının önünde
    st.dropPad = makePad(g, {
      x: site.x - 1.5, z: padZ, mode: 'in', type: 'drop', buffer: st.buffer, station: st,
      // ithalat deposuna yalnızca kendi ithal malı geri bırakılabilir (lojistikte bölgenin kendi ormanından taze kütük de olur)
      // oyuncu kendi elindeki aynı türden ürünü (başka alanda üretilmiş olsa da) ithalat deposuna bırakabilir: bu bölgenin malı olur
      filter: st.import ? (it, c) => it.dep === st.tag || (site.acceptFresh && !it.dep) || !!c?.isPlayer : (it) => sameOrigin(it, site.zone),
      filterMsg: null,
      dropPoint: (i) => pile(i), onReceive: (item, c) => {
        item.dep = st.tag; item.o = site.zone ?? 0; // depodan geçen ürün artık (kendi bölgesinin) makinesine girebilir
        if (kind === 'log') g.stat('logsDeposited'); else g.stat('deposited_' + kind);
        if (st.buffer.isFull() && !st.wasFull) { st.wasFull = true; g.stat('depotFilled'); }
      },
    });
    // uyarı: sırttaki ürünün nereye götürüleceğini söyler
    Object.defineProperty(st.dropPad, 'filterMsg', { get: () => {
      const bad = g.player.stack.items.find((it) => st.buffer.acceptsKind(it.kind) && !st.dropPad.filter(it)) || g.player.stack.items[0];
      if (!bad) return null;
      const to = g.production.whereTo(bad);
      return st.import ? `Bu depoya yalnızca ithalat kamyonu mal getirir. Sırtındaki ${ITEMS[bad.kind].name} → ${to}` : `Bu ürün başka bir alanın. ${ITEMS[bad.kind].name} → ${to}`;
    } });
    // testereyi kendiliğinden besleyen depodan (çıkış bandı) elle kütük alınmaz: büyük odun yalnızca testereye gider
    st.feeds = site.feeds || null;
    st.takePad = st.feeds ? null : makePad(g, { x: site.x + 1.5, z: padZ, mode: 'out', type: 'take', buffer: st.buffer, station: st, dropPoint: (i) => pile(i) });
    if (!st.import) {
      // depo dolunca yanındaki noktadan genişletilir (1 sn dur → kart → Genişlet)
      st.expandPad = makePad(g, { x: site.x - (st.closed ? 5.4 : 4.6), z: site.z + (st.closed ? 2.6 : 1.0), mode: 'build', type: 'build', r: 1.15,
        label: () => ({ title: 'Depoyu Genişlet', price: this.upgradeCost(st), level: 0, maxed: st.up.capacity >= DEPOT_UPGRADE.max }),
        data: { expand: () => ({ name: st.name, count: st.buffer.count, cap: st.buffer.capacity, step: DEPOT_STEP, cost: this.upgradeCost(st),
          maxed: st.up.capacity >= DEPOT_UPGRADE.max, what: `${ITEMS[kind].name} yığılan alan`, run: () => this.upgrade(st) }) } });
    }
    if (st.closed) g.obstacles.push({ x0: site.x - 3.8, x1: site.x + 3.8, z0: site.z - 2.8, z1: site.z + 2.8 });
    else g.obstacles.push({ x0: site.x - 2.8, x1: site.x + 2.8, z0: site.z - 2.2, z1: site.z + 2.2 });
    st.labelPos = { x: site.x, y: st.closed ? 4.6 : 2.6, z: site.z - 2.2 };
    st.label = () => ({ title: st.name, value: `${st.buffer.count}/${st.buffer.capacity}${st.import ? ' · ' + g.imports.status(site.zone) : st.buffer.isFull() ? ' · Genişlet!' : ''}`, full: st.buffer.isFull(), icon: kinds.length > 1 ? 'box' : kind });
    this.depots.push(st);
    this.ensureSections(st);
    g.sites.set(st.id, st);
    return st;
  }

  createWarehouse(site, saved) {
    const g = this.game;
    const st = { id: site.id, type: 'warehouse', name: site.name, x: site.x, z: site.z, up: { capacity: 0, ...(saved?.up || {}) } };
    st.buffer = new Buffer(this.warehouseCapacity(st), PRODUCT_KINDS);
    st.buffer.load(saved?.in);
    st.group = makeShed(11, 7, 0xb0bec5, 0x455a64, 4.2);
    st.group.position.set(site.x, 0, site.z);
    g.scene.add(st.group);
    // karışık ürünler için sabit raf ızgarası (8x4, katman yüksekliği 0.55)
    const pile = (i) => {
      const layer = Math.floor(i / 32), r = i % 32;
      return { x: st.x + ((r % 8) - 3.5) * 1.25, y: 0.45 + layer * 0.55, z: st.z - 0.8 + (Math.floor(r / 8) - 1.5) * 1.05, yaw: 0 };
    };
    st.pile = pile;
    st.pad = makePad(g, { x: site.x, z: site.z + 5, mode: 'in', type: 'drop', buffer: st.buffer, station: st, dropPoint: (i) => pile(i), r: 1.6,
      filter: (it) => sameOrigin(it, 0) && !g.production.nextMachineFor(it.kind, null), filterMsg: 'Ambar yalnızca ana fabrikanın satılacak SON ürünlerini saklar' });
    g.obstacles.push({ x0: site.x - 5.6, x1: site.x + 5.6, z0: site.z - 3.6, z1: site.z + 3.6 });
    st.labelPos = { x: site.x, y: 5.5, z: site.z };
    st.label = () => ({ title: st.name, value: `${st.buffer.count}/${st.buffer.capacity}`, full: st.buffer.isFull(), icon: 'box' });
    st.feedT = 0;
    this.warehouses.push(st);
    g.sites.set(st.id, st);
    return st;
  }

  upgradeCost(st) { return upgradeCost(DEPOT_UPGRADE, st.up.capacity) * (st.type === 'warehouse' ? 4 : 1); }
  upgrade(st) {
    if (st.up.capacity >= DEPOT_UPGRADE.max) return false;
    if (!this.game.economy.spend(this.upgradeCost(st), 'upgrade')) return false;
    st.up.capacity++;
    st.buffer.capacity = st.type === 'warehouse' ? this.warehouseCapacity(st) : this.depotCapacity(st);
    if (st.type === 'depot') { this.ensureSections(st); this.game.bus.emit('toast', { text: `${st.name} genişledi: ${st.buffer.capacity} yer`, type: 'success' }); this.game.save.requestSave(); }
    this.game.stat('upgradesMachine'); this.game.stat('upgradesStorage');
    this.game.levels.addXP(XP.upgrade);
    this.game.audio.play('upgrade');
    this.game.fx.burst(st.x, 2, st.z, [0xffd54f, 0xffffff], 30, { speed: 4, up: 6 });
    this.game.bus.emit('upgrade', { target: st.id, key: 'capacity', level: st.up.capacity });
    return true;
  }

  update(dt) {
    for (const st of this.depots) if (st.wasFull && st.buffer.count < st.buffer.capacity * 0.8) st.wasFull = false;
    // Ürün deposu: yükleme alanlarını otomatik besler
    for (const w of this.warehouses) {
      w.feedT -= dt;
      if (w.feedT > 0 || w.buffer.count === 0) continue;
      const dock = this.game.trucks.bestDockForFeed();
      if (!dock) continue;
      const item = w.buffer.popMatching ? w.buffer.popMatching((it) => !this.game.production.nextMachineFor(it.kind, null)) : w.buffer.pop();
      if (!item) continue;
      item.a = 1;
      dock.staging.push(item); dock.staging.hold++;
      const from = w.pile(w.buffer.count);
      this.game.fx.fly(item, from, dock.pilePoint(dock.staging.count - 1), 0.9, () => { dock.staging.hold = Math.max(0, dock.staging.hold - 1); }, 4);
      w.feedT = 0.35;
    }
  }

  renderItems(R) {
    for (const st of this.depots) {
      const n = Math.min(st.buffer.count - st.buffer.hold, 200);
      for (let i = 0; i < n; i++) { const p = st.pile(i); const it = st.buffer.items[i]; R.add(it.kind, it.wood, p.x, p.y, p.z, p.yaw); }
    }
    for (const w of this.warehouses) {
      const n = Math.min(w.buffer.count - w.buffer.hold, 200);
      for (let i = 0; i < n; i++) { const p = w.pile(i); const it = w.buffer.items[i]; R.add(it.kind, it.wood, p.x, p.y, p.z, p.yaw); }
    }
  }

  serialize(out) {
    for (const st of [...this.depots, ...this.warehouses]) out[st.id] = { built: true, up: st.up, in: st.buffer.serialize() };
  }
}
