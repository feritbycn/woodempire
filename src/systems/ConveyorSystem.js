import * as THREE from 'three';
import { CONVEYORS, getZone } from '../config/zones.js';
import { CONVEYOR_UPGRADES, upgradeCost, XP } from '../config/balance.js';
import { P, merge, mesh } from '../world/Models.js';
import { makePad } from './Stations.js';
import { vcMatMetal } from '../world/Materials.js';
import { beltTexture } from '../world/Textures.js';

const BELT_Y = 0.85;

/**
 * Konveyör bantları: kaynak istasyonun çıkışından hedefin girişine GERÇEK ürünleri taşır.
 * Hedef doluysa ürünler bant üzerinde birikir (aralıklı kuyruk).
 */
export class ConveyorSystem {
  constructor(game) {
    this.game = game;
    this.belts = new Map();
    this.pads = new Map();   // kurulmamış bantlar için dünyadaki satın alma noktaları
    this.padT = 0;
  }

  /** Tüm bant tanımları: başlangıç hattı + sahip olunan tesislerin bantları */
  defs() {
    const out = [...CONVEYORS];
    for (const id of this.game.land.owned) { const z = getZone(id); if (z.conveyors) out.push(...z.conveyors); }
    return out;
  }

  init() {
    for (const def of this.defs()) {
      const saved = this.game.state.conveyors[def.id];
      if (saved) this.build(def, saved);
    }
    // eski sürümde bölgeler arası bant vardı (zımpara→paketleme, paketleme→rampa): kaldırıldı, parası iade edilir
    const REMOVED = { c_sander_packer: 5000, c_packer_dock: 9000, c_depot2_saw: 1500 };
    for (const [id, cost] of Object.entries(REMOVED)) {
      if (!this.game.state.conveyors[id]) continue;
      delete this.game.state.conveyors[id];
      this.game.state.money += cost;
      setTimeout(() => this.game.bus.emit('toast', { text: `Bölgeler arası bant kaldırıldı, ${cost} para iade edildi`, type: 'success' }), 1500);
    }
    this.syncPads();
  }

  /** Bant satın alma noktasının yeri: tanımlıysa o, değilse en uzun parçanın ortasının yanı */
  padPos(def) {
    if (def.buyPad) return def.buyPad;
    let best = null, bl = 0;
    for (let i = 0; i < def.path.length - 1; i++) {
      const [ax, az] = def.path[i], [bx, bz] = def.path[i + 1]; const l = Math.hypot(bx - ax, bz - az);
      if (l > bl) { bl = l; best = { ax, az, bx, bz, l }; }
    }
    const nx = -(best.bz - best.az) / best.l, nz = (best.bx - best.ax) / best.l;
    return { x: (best.ax + best.bx) / 2 + nx * 2.2, z: (best.az + best.bz) / 2 + nz * 2.2 };
  }
  /** Kurulabilir hale gelen bantlar için zemin satın alma alanı aç */
  syncPads() {
    const g = this.game;
    for (const def of this.defs()) {
      if (this.belts.has(def.id) || this.pads.has(def.id) || !this.available(def)) continue;
      // oyunla gelen bant (depo çıkış bandı): satın alınmaz, kendiliğinden kurulur
      if (def.auto) { const b = this.build(def, { up: { speed: 0, capacity: 0 }, items: [] }); g.state.conveyors[def.id] = { up: b.up, items: [] }; continue; }
      const p = this.padPos(def);
      const pad = makePad(g, { x: p.x, z: p.z, mode: 'build', type: 'build', r: 1.3,
        label: () => ({ title: def.name, price: def.cost, level: def.level || 0 }), data: { conveyor: def } });
      this.pads.set(def.id, pad);
    }
  }

  available(def) {
    const g = this.game;
    return g.land.owns(def.zone) && g.sites.has(def.from.site) && g.sites.has(def.to.site);
  }
  list() {
    return this.defs().map((def) => {
      const b = this.belts.get(def.id);
      let reason = null;
      if (!this.game.land.owns(def.zone)) reason = `${this.game.land.zoneDef(def.zone).name} gerekli`;
      else if (def.level && this.game.state.level < def.level) reason = `Seviye ${def.level}`;
      else if (!this.game.sites.has(def.from.site) || !this.game.sites.has(def.to.site)) reason = 'Bağlı makineler kurulmalı';
      return { def, built: !!b, belt: b, reason };
    });
  }

  buy(id) {
    const g = this.game;
    const def = this.defs().find((c) => c.id === id);
    if (!def || this.belts.has(id) || !this.available(def)) return false;
    if (def.level && g.state.level < def.level) { g.bus.emit('toast', { text: `${def.name} için Seviye ${def.level} gerekli`, type: 'error' }); return false; }
    if (!g.economy.spend(def.cost, 'conveyor')) return false;
    const pad = this.pads.get(id); if (pad) { g.removePad(pad); this.pads.delete(id); }
    const b = this.build(def, { up: { speed: 0, capacity: 0 }, items: [] });
    g.state.conveyors[id] = { up: b.up, items: [] };
    g.stat('conveyorsBought');
    g.levels.addXP(XP.buyMachine);
    g.audio.play('build');
    const mid = def.path[Math.floor(def.path.length / 2)];
    g.cameraRig.focus(mid[0], mid[1], 2);
    g.fx.confetti(mid[0], 2, mid[1], 40);
    g.bus.emit('built', { conveyor: def });
    g.save.requestSave(true);
    return true;
  }

  /** Kapasite seviyesi (sanal şerit): her 3 seviyede +1, en çok 5 */
  capLevel(b) { return Math.min(5, 1 + Math.floor((b.up.capacity || 0) / 3)); }
  /** Fiziksel şerit: bant en fazla 2 şerit genişler (çok büyümez); fazlası hız olarak eklenir — kapasite aynı kalır */
  lanes(b) { return Math.min(2, this.capLevel(b)); }
  laneW() { return 0.46; }
  beltWidth(b) { return 0.5 + this.laneW() * this.lanes(b); }

  build(def, saved) {
    const g = this.game;
    const pts = def.path.map(([x, z]) => new THREE.Vector2(x, z));
    const segs = []; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]; const len = a.distanceTo(b);
      segs.push({ a, b, len, start: total, yaw: Math.atan2(b.x - a.x, b.y - a.y) });
      total += len;
    }
    const b = {
      def, segs, total, group: null, texs: [],
      up: { speed: 0, capacity: 0, ...(saved.up || {}) },
      items: [],
    };
    const L = this.lanes(b);
    b.items = (saved.items || []).map(([kind, wood, d, dep, o, lane], i) => ({ kind, wood, d, dep, o, lane: lane != null && lane < L ? lane : i % L }));
    this.buildVisual(b);
    this.belts.set(def.id, b);
    return b;
  }

  /** Bandın görseli: genişlik şerit sayısıyla büyür; hız yükseldikçe motor kutuları eklenir */
  buildVisual(b) {
    const g = this.game;
    if (b.group) { b.group.removeFromParent(); b.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const W = this.beltWidth(b);
    const frame = []; const texs = [];
    const group = new THREE.Group();
    const motors = Math.min(4, Math.floor((b.up.speed || 0) / 4)); // hız seviyesi arttıkça daha çok/daha büyük motor
    const n = b.segs.length;
    b.segs.forEach((s, si) => {
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      // uçlarda yarım genişlik kadar uzat (dirseklerde köşe parçası birleştirir: bantlar ayrık görünmez)
      const ext0 = si === 0 ? 0.45 : W / 2, ext1 = si === n - 1 ? 0.45 : W / 2;
      const dx = Math.sin(s.yaw), dz = Math.cos(s.yaw);
      const L = s.len + ext0 + ext1;
      const mid = (s.len + ext1 - ext0) / 2;
      const cx = s.a.x + dx * mid, cz = s.a.y + dz * mid;
      frame.push(P(new THREE.BoxGeometry(W + 0.2, 0.22, L), 0x78909c, cx, BELT_Y - 0.16, cz, 0, s.yaw, 0));
      // yan korkuluklar: dirseğin iç tarafında kesilir, dış tarafında devam eder
      for (const side of [1, -1]) frame.push(P(new THREE.BoxGeometry(0.08, 0.16, L), 0xffc107, cx + c * (W / 2 + 0.04) * side, BELT_Y + 0.02, cz - sn * (W / 2 + 0.04) * side, 0, s.yaw, 0));
      const nLegs = Math.max(2, Math.floor(s.len / 2.5));
      for (let k = 0; k <= nLegs; k++) {
        const t = k / nLegs; const lx = s.a.x + (s.b.x - s.a.x) * t, lz = s.a.y + (s.b.y - s.a.y) * t;
        for (const side of W > 1.4 ? [1, -1] : [0]) frame.push(P(new THREE.BoxGeometry(0.12, BELT_Y - 0.2, 0.12), 0x455a64, lx + c * (W / 2 - 0.1) * side, (BELT_Y - 0.2) / 2, lz - sn * (W / 2 - 0.1) * side));
      }
      for (let m = 0; m < motors; m++) {
        const t = (m + 0.5) / Math.max(1, motors); const mx = s.a.x + (s.b.x - s.a.x) * t, mz = s.a.y + (s.b.y - s.a.y) * t;
        frame.push(P(new THREE.BoxGeometry(0.45, 0.4, 0.55), 0x37474f, mx + c * (W / 2 + 0.35), BELT_Y - 0.15, mz - sn * (W / 2 + 0.35)));
        frame.push(P(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 8), 0xff7043, mx + c * (W / 2 + 0.35), BELT_Y + 0.12, mz - sn * (W / 2 + 0.35)));
      }
      const tex = beltTexture();
      tex.repeat.set(Math.max(1, Math.round(W / 0.95)), L / 1.2);
      texs.push(tex);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      top.rotation.set(-Math.PI / 2, 0, s.yaw + Math.PI);
      top.position.set(cx, BELT_Y - 0.04 + si * 0.002, cz);
      top.receiveShadow = true;
      group.add(top);
      // dirsek: iki parçanın birleştiği köşede tek parça kare (makaralı dönüş tablası)
      if (si < n - 1) {
        frame.push(P(new THREE.CylinderGeometry(W * 0.5, W * 0.5, 0.06, 16), 0x546e7a, s.b.x, BELT_Y - 0.02, s.b.y));
        frame.push(P(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8), 0xffc107, s.b.x, BELT_Y + 0.02, s.b.y));
      }
    });
    group.add(mesh(merge(frame), vcMatMetal, true, true));
    g.scene.add(group);
    b.group = group; b.texs = texs; b.width = W;
  }

  speed(b) { const ops = this.game.workers?.operators(b) || 0; return 3.2 * (1 + b.up.speed * 0.15) * (1 + 0.3 * ops) * (this.capLevel(b) / this.lanes(b)); } // operatörler (en fazla 2) + 2 şeridi aşan kapasite hız olarak
  /** Aynı şeritte ardışık ürünler arası mesafe: ürünler asla iç içe girmez */
  gap() { return 1.3; }
  /** Dakikada taşınabilecek ürün (şerit × hız / aralık) */
  perMin(b) { return Math.round(60 * this.lanes(b) * this.speed(b) / this.gap(b)); }

  upgradeCost(b, key) { return upgradeCost(CONVEYOR_UPGRADES[key], b.up[key]); }
  upgrade(id, key) {
    const b = this.belts.get(id); const def = CONVEYOR_UPGRADES[key];
    if (!b || b.up[key] >= def.max) return false;
    if (!this.game.economy.spend(this.upgradeCost(b, key), 'upgrade')) return false;
    const lanes0 = this.lanes(b), cap0 = this.capLevel(b), motors0 = Math.floor((b.up.speed || 0) / 4);
    b.up[key]++;
    if (this.lanes(b) !== lanes0 || Math.floor((b.up.speed || 0) / 4) !== motors0) {
      this.buildVisual(b); // bant fiziksel olarak genişler / motor eklenir
      if (this.lanes(b) !== lanes0) this.game.bus.emit('toast', { text: `${b.def.name} genişledi: ${this.lanes(b)} şerit yan yana taşır`, type: 'success' });
    }
    if (this.capLevel(b) !== cap0 && this.lanes(b) === lanes0) this.game.bus.emit('toast', { text: `${b.def.name} kapasitesi ×${this.capLevel(b)}: ${this.perMin(b)} ürün/dk`, type: 'success' });
    this.game.stat('upgradesMachine');
    this.game.levels.addXP(XP.upgrade);
    this.game.audio.play('upgrade');
    this.game.bus.emit('upgrade', { target: id, key, level: b.up[key] });
    return true;
  }

  srcBuffer(def) { const st = this.game.sites.get(def.from.site); return st?.outBuf || st?.buffer || null; }
  dstBuffer(def) { const st = this.game.sites.get(def.to.site); return st?.inBuf || st?.staging || st?.buffer || null; }

  update(dt) {
    this.padT -= dt; if (this.padT <= 0) { this.padT = 1; this.syncPads(); }
    for (const b of this.belts.values()) {
      const src = this.srcBuffer(b.def), dst = this.dstBuffer(b.def);
      if (!src || !dst) continue;
      const sp = this.speed(b), gap = this.gap(b), L = this.lanes(b);
      for (const t of b.texs) t.offset.y -= dt * sp / 1.2;
      // şerit şerit ilerlet (öndeki ürünle arayı koru: iç içe girme / üst üste binme yok)
      b.items.sort((x, y) => y.d - x.d);
      const front = new Array(L).fill(Infinity);
      for (const it of b.items) {
        const limit = front[it.lane] === Infinity ? b.total : front[it.lane] - gap;
        it.d = Math.max(Math.min(it.d, limit), Math.min(limit, it.d + sp * dt));
        front[it.lane] = it.d;
      }
      // uca varan ürünleri hedefe teslim et (her şeritten)
      for (let i = 0; i < b.items.length; i++) {
        const it = b.items[i];
        if (it.d < b.total - 0.01) continue;
        if (!dst.acceptsKind(it.kind)) { b.items.splice(i--, 1); continue; } // eski kayıttan kalmış, hedefe ait olmayan ürün
        const item = { kind: it.kind, wood: it.wood, a: 1, dep: it.dep || 1 }; if (it.o != null) item.o = it.o;
        if (dst.canAccept(item)) { dst.push(item); b.items.splice(i--, 1); this.game.bus.emit('conveyorDeliver', { belt: b, item }); }
      }
      // kaynaktan yeni ürün al: başında yer olan her şeride bir ürün
      const last = new Array(L).fill(Infinity);
      for (const it of b.items) last[it.lane] = Math.min(last[it.lane], it.d);
      for (let l = 0; l < L; l++) {
        if (last[l] <= gap || src.count - (src.hold || 0) <= 0) continue;
        const item = src.pop(dst.accepts);
        if (!item) break;
        b.items.push({ kind: item.kind, wood: item.wood, d: 0, dep: item.dep, o: item.o, lane: l });
      }
    }
  }

  pointAt(b, d) {
    for (const s of b.segs) {
      if (d <= s.start + s.len || s === b.segs[b.segs.length - 1]) {
        const t = Math.min(1, Math.max(0, (d - s.start) / s.len));
        return { x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.y + (s.b.y - s.a.y) * t, yaw: s.yaw };
      }
    }
    return { x: 0, z: 0, yaw: 0 };
  }

  renderItems(R) {
    const lw = this.laneW();
    for (const b of this.belts.values()) {
      const L = this.lanes(b);
      for (const it of b.items) {
        const p = this.pointAt(b, it.d);
        const off = (it.lane - (L - 1) / 2) * lw;
        const h = it.kind === 'log' ? 0.18 : it.kind === 'package' ? 0.24 : it.kind === 'furniture' ? 0.3 : 0.07;
        // ürünler bant yönünde, kendi şeridinde: yan yana akarken birbirine değmez
        R.add(it.kind, it.wood, p.x + Math.cos(p.yaw) * off, BELT_Y + h, p.z - Math.sin(p.yaw) * off, L > 1 ? p.yaw : p.yaw + Math.PI / 2);
      }
    }
  }

  midPoint(b) { const p = this.pointAt(b, b.total * 0.5); return { x: p.x, z: p.z }; }
  cheapestUpgrade(b) { let m = Infinity; for (const [k, d] of Object.entries(CONVEYOR_UPGRADES)) if (b.up[k] < d.max) m = Math.min(m, this.upgradeCost(b, k)); return m; }

  serialize() {
    const out = {};
    for (const [id, b] of this.belts) out[id] = { up: b.up, items: b.items.map((i) => [i.kind, i.wood, +i.d.toFixed(2), i.dep || 0, i.o ?? null, i.lane || 0]) };
    this.game.state.conveyors = out;
  }
}
