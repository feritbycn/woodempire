import * as THREE from 'three';
import { makeCharacter, animateCharacter, makeCabin, WORKER_LOOKS } from '../world/Models.js';
import { Agent, inPadOf, outPadOf, inBufOf, outBufOf } from './Agent.js';
import { ITEMS, CARETAKER_NAME, FEED, WORKER_ROLES, WORKER_HIRE, WORKER_UPGRADES, WORKER_BASE, MACHINES, XP, RAW_KINDS, upgradeCost } from '../config/balance.js';
import { makePad } from './Stations.js';
import { getZone, FACILITY_TYPES, parentOf } from '../config/zones.js';

/** Taşıyıcı işçiler için olası rotalar (kaynak çıkışı → hedef girişi) */
export const CARRIER_ROUTES = [
  { id: 'saw>sander', from: 'saw', to: 'sander', name: 'Kesilmiş Odun Stoku → Zımpara' },
];
// Taşıyıcı YALNIZCA depodan makineye hammadde (kütük) taşır; makineden makineye ürün aktarmaz
// (testere → zımpara için bant ya da oyuncu; makineden rampaya Yükleyici).
// Not: Paketleme, Palet/Mobilya, Panel ve Otomatik Hat artık kendi bölgelerinin ithalat deposundan beslenir
// (bölge işçileri: getZone(id).lines)

/** Dünyadaki işçi alma noktaları (ilk tesiste depo ile testere arasında). Üzerine gelince bir işçi alınır. */
/** Tek işçi alma noktası (İŞÇİ AL): alınan işçinin görevi İşçiler panelinden değiştirilir */
/** Ana alanda her görevin İŞÇİ AL noktası, o işin yapıldığı yerdedir; kilitliyse üzerinde gereken seviye yazar */
export const HIRE_POINTS = [
  { role: 'lumberjack', x: -1.2, z: 6.2, level: 2, base: 100 },  // depo önü / orman yolu
  { role: 'loader', x: 19.4, z: 12.4, level: 3, base: 100 },     // Yükleme Alanı yanında
  { role: 'carrier', x: 18.4, z: 3.4, level: 4, base: 100 },     // testere ile kesilmiş odun stoğu arasında
  { role: 'sawop', x: 14, z: 4.4, level: 5, base: 100 },         // testerenin önünde
  { role: 'beltop', x: 7.6, z: 2.8, level: 7, base: 100 },       // depo → testere bandı yanında
];
/** Görevlerin bekleme / çalışma yerleri (ana alan) */
const ROLE_SPOTS = { lumberjack: { x: -1.2, z: 6.2 }, carrier: { x: 19.6, z: 4.6 }, loader: { x: 19.6, z: 11.0 }, sawop: { x: 14, z: -4.2 }, beltop: { x: 7.5, z: 0.2 }, farmer: { x: 0, z: 8 } };

class Worker extends Agent {
  constructor(game, data, idx) {
    super(game, data.x, data.z);
    this.data = data;
    this.idx = idx;
    this.maxVisual = 6; this.pairStack = true; // işçinin sırtında en fazla 6 ürün, ikişerli düzgün sıra (fazlası sandıkta)
    const look = data.premium ? { shirt: 0xffb300, shirt2: 0xff8f00, pants: 0x3e2723, hat: 0xfff176 } : WORKER_LOOKS[idx % WORKER_LOOKS.length];
    this.char = makeCharacter(look, { beard: idx % 2 === 0, beardColor: [0x4e342e, 0x212121, 0xbcaaa4][idx % 3], skin: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524][idx % 4] });
    game.scene.add(this.char.root);
    // taşıma sandığı: kapasite 6'yı geçince sırtta görünür (ürünler sandıkta düzgün durur, yığın büyümez)
    const crate = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.95), wood); base.position.y = -0.04; crate.add(base);
    for (const [x, z, w, d] of [[0, -0.46, 1.15, 0.06], [0, 0.46, 1.15, 0.06], [-0.56, 0, 0.06, 0.95], [0.56, 0, 0.06, 0.95]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), wood); m.position.set(x, 0.12, z); crate.add(m); }
    crate.position.set(0, -0.05, -0.2); crate.visible = false;
    this.char.stackAnchor.add(crate); this.crate = crate;
    this.anim = { speed: 0, phase: Math.random() * 6, chop: -1, carrying: false, t: 0 };
    this.state = 'idle'; this.tree = null; this.log = null; this.route = null; this.waitT = 0;
    this.stack.load(data.stack);
  }
  get ws() { return this.game.workers; }
  anchor() { this.char.stackAnchor.getWorldPosition(this._v ||= this.pos.clone()); return { x: this._v.x, y: this._v.y, z: this._v.z }; }
  transferInterval() { return WORKER_BASE.transfer / (1 + this.game.state.workerUp.efficiency * 0.12) / (this.data.premium ? 1.5 : 1) / this.rush(); }
  speed() { return WORKER_BASE.speed * (1 + this.game.state.workerUp.speed * 0.08) * (this.data.premium ? 1.5 : 1) * this.rush(); }
  /** Stok alanı dolmak üzereyken dağıtımcılar hızlanır (stok boşaltılır, testere durmaz) */
  rush() {
    if ((this.data.fac ?? null) !== null || (this.data.role !== 'carrier' && this.data.role !== 'loader')) return 1;
    const saw = this.game.sites.get('saw');
    return saw?.stock && saw.outBuf.count >= saw.outBuf.capacity * 0.85 ? 1.5 : 1;
  }
  wantKinds(pad) {
    if (this.data.role === 'carrier' && this.route) { const dst = this.game.sites.get(this.route.to); return inBufOf(dst)?.accepts || []; }
    return null;
  }
}

/**
 * İşçi yönetimi: işe alma, roller (Oduncu / Taşıyıcı / Yükleyici), görev alanı atama,
 * yükseltmeler ve her işçinin bağımsız yapay zekası.
 */
export class WorkerSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.office = null;
    this.up = game.state.workerUp;
  }

  createOffice(site, saved) {
    const g = this.game;
    const st = { id: site.id, type: 'office', name: site.name, x: site.x, z: site.z };
    st.group = makeCabin(0xa1887f, 0x2e7d32, 5, 3.6);
    st.group.position.set(site.x, 0, site.z);
    g.scene.add(st.group);
    g.obstacles.push({ x0: site.x - 2.7, x1: site.x + 2.7, z0: site.z - 2, z1: site.z + 2 });
    st.labelPos = { x: site.x, y: 4.2, z: site.z };
    st.label = () => ({ title: st.name, value: `${this.countAll(null)} işçi`, icon: 'worker' });
    this.office = st;
    g.sites.set(st.id, st);
    return st;
  }

  makeUpgradePad(x, z) {
    const st = { type: 'workers', name: 'İşçi Geliştirme', id: 'workers_up' };
    return makePad(this.game, { x, z, mode: 'upgrade', type: 'upgrade', r: 1.05, station: st,
      label: () => { const c = this.cheapestUpgrade(); return { title: 'İşçi Geliştir', price: Number.isFinite(c) ? c : 0, level: 0, maxed: !Number.isFinite(c) }; } });
  }
  cheapestUpgrade() { let m = Infinity; for (const [k, d] of Object.entries(WORKER_UPGRADES)) if (k !== 'slots' && this.up[k] < d.max) m = Math.min(m, this.upgradeCost(k)); return m; }

  /** Tesise özel işçi alma noktaları (tesis satın alınınca açılır) */
  setupZone(def) {
    if (!def.hire?.length) return; // genişletmelerin kendi işçi noktası yok (işçiler ana tesisten alınır)
    this.facPads ||= new Map();
    if (this.facPads.has(def.id)) return;
    this.upPads ||= [];
    if (!def.noUpPad) this.upPads.push(def.upPad ? this.makeUpgradePad(def.upPad.x, def.upPad.z) : this.makeUpgradePad(0.7, def.hire[0].z + 3.2));
    const fac = def.parent ?? def.id; // genişletmenin işçileri ana tesise aittir (aynı depo, aynı rampa)
    // tek "İŞÇİ AL" noktası: işçi alanın varsayılan göreviyle gelir, görevi panelden değiştirilir
    const hp = def.hire[0];
    const data = { role: 'worker', x: hp.x, z: hp.z, base: hp.base, level: 0, fac };
    const role0 = this.defaultRole(fac);
    data.role = role0;
    const pads = [makePad(this.game, { x: hp.x, z: hp.z, mode: 'hire', type: 'hire', r: 1.25, data,
      label: () => ({ title: `${this.roleTitle(role0, fac)} Al`, price: this.hireCost(null, fac), level: 0, count: this.countRole(role0, fac) }) })];
    // rampası olan alanda Taşıyıcı noktası rampanın yanındadır (iş orada)
    if (role0 !== 'loader') for (const site of def.sites || []) {
      if (site.type !== 'dock') continue;
      const d2 = { role: 'loader', x: site.x - 4.6, z: site.z + 0.4, base: hp.base, level: 0, fac };
      pads.push(makePad(this.game, { x: d2.x, z: d2.z, mode: 'hire', type: 'hire', r: 1.25, data: d2,
        label: () => ({ title: 'Taşıyıcı Al', price: this.hireCost(null, fac), level: 0, count: this.countRole('loader', fac) }) }));
    }
    this.facPads.set(def.id, pads);
  }
  roleTitle(role, fac = null) { return role === 'farmer' && fac != null ? (CARETAKER_NAME[getZone(fac).farm?.type] || 'Bakıcı') : WORKER_ROLES[role].name; }

  init() {
    // eski kayıt: ayrı tesis olan bölgeler artık ana tesisin genişletmesi → işçi ana tesise geçer
    for (const d of this.game.state.workers) if (d.fac != null) { const p = parentOf(d.fac); if (p !== d.fac) { d.fac = p; if (d.role === 'lumberjack') d.target = String(p); } }
    this.game.state.workers.forEach((d, i) => this.spawn(d, i));
    for (const id of this.game.land.owned) this.setupZone(getZone(id));
    // işçi geliştirme noktası (mor): üzerine basınca işçi yükseltmeleri açılır
    this.upPads = [this.makeUpgradePad(2.6, 7.4)];
    // işçi alma noktaları
    this.hirePads = HIRE_POINTS.map((hp) => makePad(this.game, {
      x: hp.x, z: hp.z, mode: 'hire', type: 'hire', r: 1.25, data: hp,
      label: () => ({ title: `${WORKER_ROLES[hp.role].name} Al`, price: this.hireCost(null, null), level: hp.level, count: this.countRole(hp.role, null) }),
    }));
  }

  /** İşçi kapasitesi — her tesisin kendi kotası vardır:
   *  başlangıç tesisi: 4 + İşçi Sayısı yükseltmesi + İşçi Ofisi (+2); diğer tesisler: 3 + yükseltmenin yarısı */
  /** İşçi sayısında sınır yok (oyuncu isteği); her yeni işçinin fiyatı yükselir (rol başına ×1.75) */
  maxWorkers() { return Infinity; }
  countAll(fac = null) { return this.list.filter((w) => !w.data.temp && (w.data.fac ?? null) === fac).length; }
  countRole(role, fac = null) { return this.list.filter((w) => !w.data.premium && w.data.role === role && (w.data.fac ?? null) === fac).length; }
  /** İşe alım fiyatı: alandaki işçi sayısıyla artar (her yeni işçi ×1.4) — görevden bağımsız */
  hireCost(role = null, fac = null) {
    const base = fac !== null ? (getZone(fac).hire?.[0]?.base || WORKER_HIRE.base) : HIRE_POINTS[0].base;
    return Math.round(base * Math.pow(1.4, this.countAll(fac)));
  }
  hireLevel(role) { return (HIRE_POINTS.find((h) => h.role === role) || HIRE_POINTS[0]).level; }
  /** Alanın varsayılan görevi (işe alınınca) — sonra değiştirilebilir */
  defaultRole(fac) {
    if (fac === null) return 'lumberjack';
    const z = getZone(fac);
    if (z.farm) return 'farmer';
    if (z.forests?.length && !z.importZone) return 'lumberjack';
    return 'carrier';
  }
  /** Bu alanda seçilebilecek görevler */
  rolesFor(fac) {
    if (fac === null) return ['lumberjack', 'carrier', 'loader', 'sawop', 'beltop'];
    const z = getZone(fac);
    if (z.farm) return ['farmer', 'carrier', 'loader', 'sawop', 'beltop'];
    if (z.forests?.length && !z.importZone) return ['lumberjack', 'carrier', 'loader', 'sawop', 'beltop'];
    return ['carrier', 'loader', 'sawop', 'beltop'];
  }
  /** Görünen görev adı (bakıcı çiftliğe göre adlanır) */
  roleName(w) {
    if (w.data.role === 'farmer' && w.data.fac != null) { const t = getZone(w.data.fac).farm?.type; if (t) return CARETAKER_NAME[t]; }
    return WORKER_ROLES[w.data.role]?.name || w.data.role;
  }
  canHire(fac = null) { return this.countAll(fac) < this.maxWorkers(fac); }
  /** Oyuncu işçi noktasına girdiğinde: koşullar uygunsa bir işçi al */
  hireFromPad(pad) {
    const g = this.game; const hp = pad.data;
    if (g.state.level < (hp.level || 0)) { g.bus.emit('toast', { text: `${WORKER_ROLES[hp.role]?.name || 'İşçi'} almak için Seviye ${hp.level} gerekli`, type: 'error' }); return false; }
    const fac = hp.fac ?? null;
    if (!g.economy.canAfford(this.hireCost(null, fac))) { g.bus.emit('toast', { text: `İşçi için ${this.hireCost(null, fac)} para gerekli`, type: 'error' }); return false; }
    return this.hire(hp.role === 'worker' ? this.defaultRole(fac) : hp.role, false, { x: pad.x, z: pad.z + 1.6 }, fac);
  }

  /** fac: işçinin bağlı olduğu tesis (bölge kimliği). null → başlangıç tesisi / tüm harita */
  hire(role = 'lumberjack', premium = false, at = null, fac = null) {
    const g = this.game;
    if (!this.canHire(fac) && !premium) { g.bus.emit('toast', { text: `Bu tesisin işçi kapasitesi dolu (${this.countAll(fac)}/${this.maxWorkers(fac)}) — İşçi Sayısı yükselt`, type: 'error' }); return false; }
    if (!premium && fac === null && g.state.level < this.hireLevel(role)) { g.bus.emit('toast', { text: `${WORKER_ROLES[role].name} için Seviye ${this.hireLevel(role)} gerekli`, type: 'error' }); return false; }
    if (!premium && !g.economy.spend(this.hireCost(role, fac), 'hire')) return false;
    const spot = at || (this.office ? { x: this.office.x, z: this.office.z + 3 } : { x: 2, z: 5 });
    const d = { role, target: role === 'lumberjack' && fac !== null ? String(fac) : 'auto', stack: [], x: spot.x, z: spot.z, premium, fac };
    g.state.workers.push(d);
    const w = this.spawn(d, g.state.workers.length - 1);
    g.stat('workersHired'); g.stat('hired_' + role);
    g.levels.addXP(XP.hire);
    g.audio.play('hire');
    g.fx.confetti(w.pos.x, 2, w.pos.z, 30);
    g.bus.emit('hired', { worker: w });
    g.bus.emit('toast', { text: `İşçi alındı (${this.roleName(w)}) — görevini İşçiler menüsünden değiştirebilirsin`, type: 'success' });
    g.save.requestSave(true);
    return true;
  }

  spawn(d, i) {
    const w = new Worker(this.game, d, i);
    this.list.push(w);
    this.game.inventory.register(w);
    return w;
  }

  setRole(w, role) {
    if (!this.rolesFor(w.data.fac ?? null).includes(role)) return false;
    delete w.data.origRole; delete w.data.origTarget; w.restorePending = false; // oyuncunun elle seçtiği görev asıl görev olur
    w.data.role = role; w.data.target = role === 'lumberjack' && w.data.fac != null ? String(w.data.fac) : 'auto'; w.station = null; this.reset(w); this.game.save.requestSave();
    this.game.bus.emit('toast', { text: `Yeni görev: ${this.roleName(w)}`, type: 'success' });
    return true;
  }
  setTarget(w, target) { w.data.target = target; this.reset(w); this.game.save.requestSave(); }
  reset(w) { w.mode = null; w.src = null; if (w.tree) w.tree.claimedBy = null; if (w.log) w.log.claimedBy = null; w.tree = null; w.log = null; w.route = null; w.station = null; w.anim.chop = -1; w.state = 'idle'; }

  upgradeCost(key) { return upgradeCost(WORKER_UPGRADES[key], this.up[key]); }
  upgrade(key) {
    const def = WORKER_UPGRADES[key];
    if (this.up[key] >= def.max) return false;
    if (!this.game.economy.spend(this.upgradeCost(key), 'upgrade')) return false;
    this.up[key]++;
    for (const w of this.list) w.stack.capacity = this.capacity(w);
    this.game.stat('upgradesWorker');
    this.game.levels.addXP(XP.upgrade);
    this.game.audio.play('upgrade');
    this.game.bus.emit('upgrade', { target: 'workers', key, level: this.up[key] });
    return true;
  }
  capacity(w) { return WORKER_BASE.capacity + this.up.capacity * 1 + (w.data.premium ? 3 : 0); }

  /** Oduncu için bölge seçenekleri */
  forestZones() {
    const out = [];
    for (const id of this.game.land.owned) { if (this.game.land.zoneDef(id).forests.length) out.push({ id, name: this.game.land.zoneDef(id).name }); }
    return out;
  }
  availableRoutes(w = null) {
    const g = this.game;
    const fac = w?.data.fac ?? null;
    // Kendi alanındaki (ana tesis + genişletmeler) HER kaynak → makine bağlantısı: depo → makine ve makine → sıradaki makine.
    // Bant kurulu yolu bant taşır; ama kaynakta ürün birikmişse (bant yetişemiyorsa) işçi de yardım eder.
    const mine = (z) => fac === null ? z == null : z != null && parentOf(z) === fac;
    const sources = [...g.storage.depots.filter((d) => mine(d.zone)), ...g.production.machines.filter((m) => mine(m.zone))]
      .filter((s) => outPadOf(s) && outBufOf(s));
    const out = [];
    for (const t of g.production.machines) {
      if (!mine(t.zone)) continue;
      const tin = inBufOf(t); if (!tin) continue;
      for (const s of sources) {
        if (s === t) continue;
        const ok = s.type === 'depot' ? s.buffer.acceptsKind(t.def.input) : s.def.output === t.def.input;
        if (!ok) continue;
        if (this.beltCovers(s.id, t.id)) { const b = outBufOf(s); if (b.count < b.capacity * 0.6 || tin.isFull()) continue; }
        out.push({ id: `${s.id}>${t.id}`, from: s.id, to: t.id, name: `${s.name} → ${t.name}` });
      }
    }
    return out;
  }

  /** Reklam / altın karşılığı geçici yardımcı işçi: süre dolunca taşıdıklarını bırakıp ayrılır, kaydedilmez */
  updateHelper() {
    const g = this.game;
    const active = g.economy.boostActive('helper');
    const helper = this.list.find((w) => w.data.temp);
    if (active && !helper) {
      // en çok gereken iş: depo boşsa oduncu, depoda kütük varsa taşıyıcı, makine çıkışı doluysa yükleyici
      const dep = g.sites.get('depot1'), saw = g.sites.get('saw');
      const role = saw && saw.outBuf.count >= saw.outBuf.capacity * 0.6 ? 'loader' : dep && dep.buffer.count >= 4 && !g.conveyors.belts.has('c_depot_saw') ? 'carrier' : 'lumberjack';
      const p = g.player.pos;
      const d = { role, target: 'auto', stack: [], x: p.x + 1.5, z: p.z + 1.5, premium: true, temp: true, fac: null };
      const w = this.spawn(d, 900 + this.list.length);
      g.fx.confetti(w.pos.x, 2, w.pos.z, 30);
      g.audio.play('hire');
    } else if (!active && helper) {
      // taşıdıklarını yere bırak (kaybolmasın)
      for (const it of helper.stack.items) g.wood.spawn(it.wood, helper.pos.x + (Math.random() - 0.5), 1, helper.pos.z + (Math.random() - 0.5), 0, 2, 0, Math.random() * 6, it.kind);
      helper.stack.items.length = 0;
      if (helper.tree) helper.tree.claimedBy = null; if (helper.log) helper.log.claimedBy = null;
      helper.char.root.removeFromParent();
      g.inventory.unregister(helper);
      this.list.splice(this.list.indexOf(helper), 1);
      g.fx.burst(helper.pos.x, 1.5, helper.pos.z, [0xffd54f, 0xffffff], 20, { speed: 3, up: 3 });
      g.bus.emit('toast', { text: 'Yardımcı işçinin süresi doldu', type: 'info' });
    }
  }

  update(dt) {
    this.updateHelper();
    if (this.game.state.autoAssign) { this.assignT = (this.assignT || 0) - dt; if (this.assignT <= 0) { this.assignT = 1.5; this.autoAssign(); } }
    for (const w of this.list) {
      w.stack.capacity = this.capacity(w);
      if (w.crate) w.crate.visible = w.stack.capacity > 6 && w.stack.count > 0;
      w.anim.t += dt;
      w.tickBubble(dt);
      w.vel.set(0, 0, 0);
      try {
        if (w.helping) this.helpStep(w, dt);
        else if (w.data.role === 'lumberjack') this.lumberjack(w, dt);
        else if (w.data.role === 'farmer') this.farmer(w, dt);
        else if (w.data.role === 'sawop') this.operator(w, dt, 'machine');
        else if (w.data.role === 'beltop') this.operator(w, dt, 'belt');
        else this.transport(w, dt);
      } catch (e) { console.error('worker', e); w.state = 'idle'; }
      if (w.restorePending && !w.stack.count && !this.game.state.autoAssign) this.restoreOne(w);
      w.waitedT = this.isIdleNow(w) ? (w.waitedT || 0) + dt : 0;
      const sp = w.vel.length();
      if (sp > 0.1) w.anim.phase += dt * sp * 1.9;
      w.anim.speed += ((sp > 0.1 ? Math.min(1, sp / 4.5) : 0) - w.anim.speed) * Math.min(1, dt * 10);
      w.anim.carrying = w.stack.count > 0;
      w.char.root.position.copy(w.pos); w.char.root.rotation.y = w.yaw;
      animateCharacter(w.char, w.anim, dt);
      w.data.x = w.pos.x; w.data.z = w.pos.z;
    }
  }

  /** İşçi şu an iş bekliyor mu? (boşta, dolu makine/depo önünde ya da toplanacak ürün yok) */
  isIdleNow(w) {
    if (w.data.temp) return false;
    if (w.state === 'waitRoom') return true;
    if (w.state === 'idle' && w.stack.count === 0) return true;
    if (w.data.role === 'farmer' && w.state === 'find' && w.stack.count === 0) return true;
    if (w.data.role === 'lumberjack' && (w.state === 'find' || w.state === 'deliver')) {
      const d = this.nearestDepotWithRoom(w.pos.x, w.pos.z, 'log', w.data.fac ?? null);
      if (!d || (this.smart() && w.state === 'find' && !w.stack.count && d.buffer.count >= d.buffer.capacity * 0.85)) return true;
    }
    return false;
  }
  isWaiting(w) { return (w.waitedT || 0) > 3; }
  waitingList() { return this.list.filter((w) => this.isWaiting(w)); }

  /** OTOMATİK İŞ DAĞILIMI (açık/kapalı, İşçiler panelinden): bir süredir bekleyen işçi, KENDİ ALANINDA
   *  iş bekleyen bir göreve geçer. Elinde yük varken görev değiştirmez; geçişler arasında bekleme süresi vardır. */
  needFor(role, fac) {
    const g = this.game; const probe = { data: { fac, role, target: 'auto' }, pos: { x: 0, z: 0 } };
    switch (role) {
      case 'carrier': return !!this.pickRoute(probe, true);
      case 'loader': return !!this.pickLoaderSource(probe, true);
      case 'lumberjack': {
        const dep = this.nearestDepotWithRoom(0, 0, 'log', fac); if (!dep || dep.buffer.count > dep.buffer.capacity * 0.7) return false;
        return g.trees.trees.some((t) => g.trees.isChoppable(t) && (fac === null ? true : parentOf(t.zoneId) === fac));
      }
      case 'farmer': {
        if (fac === null || !getZone(fac).farm) return false;
        const kind = FACILITY_TYPES[getZone(fac).facility]?.raw;
        return !!g.animals.nearestReadyCow(0, 0, fac) || (kind && g.wood.logs.some((l) => l.kind === kind && !l.claimedBy));
      }
      default: return false;
    }
  }
  /** AKILLI DAĞILIM: her alanda görevlerin "eksik işçi" puanı (ne kadar iş var − o işte kaç işçi var).
   *  Turda bir kez hesaplanır (her karede değil). */
  needScores(fac) {
    const g = this.game; const cap = WORKER_BASE.capacity + this.up.capacity;
    const inRole = (r) => this.list.filter((o) => (o.data.fac ?? null) === fac && o.data.role === r && !this.isWaiting(o)).length;
    const probe = (role) => ({ data: { fac, role, target: 'auto' }, pos: { x: 0, z: 0 }, stack: { capacity: cap, count: 0 } });
    const out = {};
    // Dağıtım: makineye taşınmayı bekleyen ara ürün / depodaki hammadde (hedefi dolu olmayan rotalar)
    let carry = 0, starving = 0;
    for (const r of this.availableRoutes(probe('carrier'))) {
      const src = outBufOf(g.sites.get(r.from)), dst = inBufOf(g.sites.get(r.to)); if (!src || !dst || dst.count >= dst.capacity * 0.9) continue;
      carry += Math.min(src.items.filter((i) => dst.acceptsKind(i.kind)).length, dst.capacity - dst.count);
      if (dst.count === 0) starving++; // makine boş: hammadde taşıyana öncelik
    }
    out.carrier = carry / cap - inRole('carrier') + starving * 1.5;
    // Taşıyıcı: rampaya gidecek bitmiş ürün
    let fin = 0;
    for (const st of g.production.machines) {
      if (fac !== null ? (st.zone == null || parentOf(st.zone) !== fac) : st.zone != null) continue;
      if (g.production.nextMachineFor(st.def.output, st.zone ?? null) || (this.beltFrom(st.id) && st.outBuf.count < st.outBuf.capacity * 0.9)) continue;
      fin += st.outBuf.count;
    }
    out.loader = fin / cap - inRole('loader') + (fin >= cap * 3 ? 1 : 0);
    // Oduncu: depo boşaldıkça ihtiyaç artar; depo %85'ten doluysa kesim önceliği yok
    const dep = this.nearestDepotWithRoom(0, 0, 'log', fac);
    const depFill = dep ? dep.buffer.count / dep.buffer.capacity : 1;
    out.lumberjack = depFill < 0.85 && this.needFor('lumberjack', fac) ? (0.85 - depFill) * 6 - inRole('lumberjack') * 0.5 : -1;
    // Bakıcı: sağılmayı bekleyen hayvan / yerdeki ürün
    if (fac !== null && getZone(fac).farm) {
      const kind = FACILITY_TYPES[getZone(fac).facility]?.raw;
      const ready = g.animals.list.filter((a) => parentOf(a.zone) === fac && g.animals.isReady(a) && !a.claimedBy).length;
      const ground = kind ? g.wood.logs.filter((l) => l.kind === kind && !l.claimedBy).length : 0;
      out.farmer = ready + ground / cap - inRole('farmer');
    } else out.farmer = -1;
    return out;
  }
  autoAssignSmart() {
    const g = this.game; const moved = new Map();
    const free = (w) => !w.stack.count && !w.helping && !w.data.temp && (w.assignCD || 0) <= g.time;
    const facs = new Set(this.list.filter((w) => free(w)).map((w) => w.data.fac ?? null));
    for (const fac of facs) {
      const sc = this.needScores(fac);
      // aday: (1) boşta bekleyenler; (2) elinde yük olmayan ve görevinde FAZLA işçi olanlar (başka yerde acil ihtiyaç varken orada tutulmaz)
      const urgent = Math.max(0, ...Object.values(sc));
      const pool = this.list.filter((w) => (w.data.fac ?? null) === fac && free(w) && (
        (this.isWaiting(w) && !this.needFor(w.data.role, fac)) ||
        (urgent > 1.5 && (sc[w.data.role] ?? 0) < -0.5 && (w.state === 'idle' || w.state === 'find' || w.state === 'pick' && !w.stack.count && !(w.route || w.src)))
      ));
      if (!pool.length) continue;
      // en acil ihtiyaçtan başla; her ihtiyaca EN YAKIN uygun boş işçi gider (görev başına turda en fazla 2)
      const roles = Object.entries(sc).filter(([r, v]) => v > 0.3 && this.rolesFor(fac).includes(r)).sort((a, b) => b[1] - a[1]);
      for (const [role, v] of roles) {
        let left = Math.min(2, Math.ceil(v));
        while (left-- > 0 && pool.length) {
          const site = this.roleSite(role, fac);
          pool.sort((a, b) => (a.data.origRole === role ? -5 : 0) - (b.data.origRole === role ? -5 : 0) || Math.hypot(a.pos.x - site.x, a.pos.z - site.z) - Math.hypot(b.pos.x - site.x, b.pos.z - site.z));
          const i = pool.findIndex((w) => w.data.role !== role);
          if (i < 0) break;
          const w = pool.splice(i, 1)[0];
          this.switchRole(w, role);
          moved.set(role, 1);
        }
      }
    }
    if (moved.size) g.save.requestSave();
  }
  /** Görevin yapıldığı yer (en yakın işçiyi seçmek için) */
  roleSite(role, fac) {
    const hp = fac === null ? HIRE_POINTS.find((h) => h.role === role) : null;
    if (hp) return hp;
    const z = fac !== null ? getZone(fac).hire?.[0] : null;
    return z || { x: 0, z: 0 };
  }
  switchRole(w, role) {
    const fac = w.data.fac ?? null;
    if (!w.data.origRole) { w.data.origRole = w.data.role; w.data.origTarget = w.data.target; }
    w.data.role = role; w.data.target = role === 'lumberjack' && fac != null ? String(fac) : 'auto'; w.station = null; this.reset(w);
    if (role === w.data.origRole) { w.data.target = w.data.origTarget ?? w.data.target; delete w.data.origRole; delete w.data.origTarget; }
    w.assignCD = this.game.time + 15; w.waitedT = 0;
    w.say(`Otomatik: ${this.roleName(w)}`, 2.5);
  }
  autoAssign() {
    if (this.smart()) { this.cleanJobs(); return this.autoAssignSmart(); }
    const moved = new Map(); // alan+görev başına bu turda gönderilen işçi (aynı işe herkes birden koşmasın)
    for (const w of this.list) {
      if (!this.isWaiting(w) || w.stack.count || w.helping || w.data.temp) continue; // 3 sn'den uzun boşta bekleyen herkes
      if ((w.assignCD || 0) > this.game.time) continue;
      const fac = w.data.fac ?? null;
      if (this.needFor(w.data.role, fac)) continue; // şu anki görevinde iş geldi
      // asıl görevinde iş varsa önce oraya döner; yoksa iş bekleyen başka göreve geçer
      const orig = w.data.origRole;
      const order = ['loader', 'carrier', 'farmer', 'lumberjack'].filter((r) => r !== w.data.role && this.rolesFor(fac).includes(r));
      const quota = (r) => (moved.get(`${fac}|${r}`) || 0) < 2;
      const role = orig && orig !== w.data.role && quota(orig) && this.needFor(orig, fac) ? orig : order.find((r) => quota(r) && this.needFor(r, fac));
      if (!role) continue;
      moved.set(`${fac}|${role}`, (moved.get(`${fac}|${role}`) || 0) + 1);
      if (!orig) { w.data.origRole = w.data.role; w.data.origTarget = w.data.target; } // kapatınca dönülecek asıl görev
      w.data.role = role; w.data.target = role === 'lumberjack' && fac != null ? String(fac) : 'auto'; w.station = null; this.reset(w);
      if (role === w.data.origRole) { w.data.target = w.data.origTarget ?? w.data.target; delete w.data.origRole; delete w.data.origTarget; }
      w.assignCD = this.game.time + 15; w.waitedT = 0;
      w.say(`Otomatik: ${this.roleName(w)}`, 2.5);
    }
    if (moved.size) this.game.save.requestSave();
  }

  /** Otomatik dağılım kapanınca: görevi otomatik değişen herkes ASIL görevine döner
   *  (elinde yük olan, yükünü gitmesi gereken yere bıraktıktan sonra döner) */
  restoreRoles() {
    let n = 0;
    for (const w of this.list) {
      if (!w.data.origRole) continue;
      if (w.stack.count) { w.restorePending = true; continue; }
      this.restoreOne(w); n++;
    }
    if (n) this.game.save.requestSave();
    return n + this.list.filter((w) => w.restorePending).length;
  }
  restoreOne(w) {
    w.data.role = w.data.origRole; w.data.target = w.data.origTarget ?? 'auto';
    delete w.data.origRole; delete w.data.origTarget; w.restorePending = false; w.station = null; w.helping = false; this.reset(w);
    w.say(`Görevime döndüm: ${this.roleName(w)}`, 2.5);
  }

  /** Oduncu/bakıcı kendi işi tıkanınca (depo dolu, ağaç/ürün yok) boş durmaz: alanındaki taşıma işine yardım eder.
   *  Elindekini bıraktıktan sonra ara ara kendi işine döner; hâlâ tıkalıysa yine yardıma gelir. */
  startHelp(w, dt) {
    if (w.stack.count) return false;
    w.blockT = (w.blockT || 0) + dt;
    if (w.blockT < 1.5) return false;
    if (!this.pickLoaderSource(w, true) && !this.pickRoute(w, true)) return false; // yardım edilecek iş de yok
    w.blockT = 0; w.helping = true; w.helpT = 0; w.idleT = 0; w.mode = null; w.route = null; w.src = null; w.state = 'idle';
    w.say('Yardıma gidiyorum', 1.5);
    return true;
  }
  helpStep(w, dt) {
    this.transport(w, dt);
    w.helpT = (w.helpT || 0) + dt;
    const idle = w.stack.count === 0 && (w.state === 'idle' || w.state === 'pick' && !w.src && !w.route);
    if (idle && (w.helpT > 25 || w.idleT > 1)) { w.helping = false; w.mode = null; w.route = null; w.src = null; w.state = 'find'; w.blockT = 0; }
  }

  /** İşçinin KENDİ alanının deposu: ana alanda tek Kütük Deposu, tesiste tesisin deposu */
  nearestDepotWithRoom(x, z, kind = 'log', fac = null, allowFull = false) {
    let best = null, bd = Infinity;
    for (const st of this.game.storage.depots) {
      if (st.import || (st.zone ?? null) !== fac || (!allowFull && st.buffer.isFull()) || !st.buffer.acceptsKind(kind)) continue;
      const d = Math.hypot(st.dropPad.x - x, st.dropPad.z - z);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  lumberjack(w, dt) {
    const g = this.game;
    const zone = w.data.target === 'auto' ? null : Number(w.data.target);
    switch (w.state) {
      case 'idle': case 'find': {
        if (w.stack.isFull()) { w.state = 'deliver'; break; }
        const dep0 = this.nearestDepotWithRoom(w.pos.x, w.pos.z, 'log', w.data.fac ?? null);
        if (this.smart() && dep0 && dep0.buffer.count >= dep0.buffer.capacity * 0.85 && !w.stack.count) { // depoda yeterince kütük var: kesim önceliği düşer
          this.goIdle(w, dt, 'Depoda yeterince kütük var'); break;
        }
        if (!dep0) { // depo dolu: kesmeye devam etmek boşuna
          if (w.stack.count) { w.state = 'deliver'; break; }
          if (!this.startHelp(w, dt)) w.say('Depo dolu!', 1);
          break;
        }
        w.blockT = 0;
        const log = g.wood.nearest(w.pos.x, w.pos.z, 7, w, 'log');
        if (log && !w.stack.isFull()) { log.claimedBy = w; w.log = log; w.state = 'collect'; break; }
        if (w.stack.count > 0 && Math.random() < 0.02) { w.state = 'deliver'; break; }
        const t = g.trees.findForWorker(w.pos.x, w.pos.z, zone ?? undefined, w) || (zone !== null ? null : null);
        if (t) { t.claimedBy = w; w.tree = t; w.state = 'goTree'; }
        else { w.say('Ağaç yok…'); if (w.stack.count) w.state = 'deliver'; else this.startHelp(w, dt); }
        break;
      }
      case 'goTree': {
        const t = w.tree;
        if (!t || t.state !== 'stand') { w.state = 'find'; if (t) t.claimedBy = null; w.tree = null; break; }
        const dx = t.x - w.pos.x, dz = t.z - w.pos.z, d = Math.hypot(dx, dz);
        if (d > 1.5) { w.moveTo(t.x - (dx / d) * 1.2, t.z - (dz / d) * 1.2, w.speed(), dt, 0.3); w.anim.chop = -1; }
        else { w.state = 'chop'; w.anim.chop = 0; }
        break;
      }
      case 'chop': {
        const t = w.tree;
        if (!t || t.state !== 'stand') { if (t) t.claimedBy = null; w.tree = null; w.anim.chop = -1; w.state = 'find'; break; }
        w.yaw = Math.atan2(t.x - w.pos.x, t.z - w.pos.z);
        const before = w.anim.chop;
        w.anim.chop += dt / (WORKER_BASE.chopInterval / (1 + this.up.speed * 0.06 + this.up.efficiency * 0.06) / (w.data.premium ? 1.5 : 1));
        if (before < 0.65 && w.anim.chop >= 0.65) g.trees.hit(t, 1, w);
        if (w.anim.chop >= 1) w.anim.chop = 0;
        break;
      }
      case 'collect': {
        const l = w.log;
        if (!l || !g.wood.logs.includes(l)) { w.log = null; w.state = 'find'; break; }
        if (w.moveTo(l.x, l.z, w.speed(), dt, 0.9)) { g.wood.take(l, w); w.log = null; w.state = w.stack.isFull() ? 'deliver' : 'find'; }
        break;
      }
      case 'deliver': {
        const st = this.nearestDepotWithRoom(w.pos.x, w.pos.z, 'log', w.data.fac ?? null);
        if (!st) {
          // depo dolu: kütüğü yere atmaz, kesmeyi bırakır ve bekleme yerinde durur (depo boşalınca hemen bırakır)
          const sp = this.idleSpot(w); if (sp && Math.hypot(sp.x - w.pos.x, sp.z - w.pos.z) > 0.8) w.moveTo(sp.x, sp.z, w.speed(), dt, 0.5);
          this.sayOnce(w, 'Depo dolu — depoyu genişlet', 1);
          break;
        }
        const pad = st.dropPad;
        if (w.moveTo(pad.x, pad.z, w.speed(), dt, 0.6)) {
          g.inventory.transfer(w, pad, dt);
          if (w.stack.count === 0) w.state = 'find';
          else if (st.buffer.isFull()) w.state = 'deliver';
        }
        break;
      }
      default: w.state = 'find';
    }
  }

  /** Çiftçi: tesisindeki inekleri sağar / yumurtaları toplar, ürünleri tesisin deposuna taşır */
  farmer(w, dt) {
    const g = this.game;
    const fac = w.data.fac;
    if (fac === null || fac === undefined || !getZone(fac).facility) { w.say('Çiftlik yok', 1); return; }
    const def = getZone(fac); const T = FACILITY_TYPES[def.facility]; const kind = T.raw; const R = def.rect;
    const rects = [...g.land.owned].filter((id) => parentOf(id) === fac).map((id) => getZone(id).rect); // ana tesis + genişletmeler
    const inFac = (l) => rects.some((Q) => l.x > Q.x0 && l.x < Q.x1 && l.z > Q.z0 && l.z < Q.z1);
    switch (w.state) {
      case 'idle': case 'find': {
        if (w.stack.isFull()) { w.state = 'deliver'; break; }
        // yemlik azaldıysa önce yem ver (yem parayla alınır; aç hayvan üretmez)
        if (w.stack.count === 0) {
          for (const zid of g.land.owned) {
            if (parentOf(zid) !== fac || !g.animals.needsFeed(zid)) continue;
            const Z = g.animals.zones.get(zid); if (!Z?.feedPad) continue;
            if (g.animals.feed(zid) < g.animals.feedCap(zid) * FEED.refillAt && g.state.money >= g.animals.feedPrice(zid) * 3) { w.feedZone = zid; w.state = 'feed'; break; }
          }
          if (w.state === 'feed') break;
        }
        let item = g.wood.nearest(w.pos.x, w.pos.z, 34, w, kind);
        if (item && !inFac(item)) item = null;
        if (item) { item.claimedBy = w; w.log = item; w.state = 'collect'; break; }
        if (T.source !== 'hen') { const cow = g.animals.nearestReadyCow(w.pos.x, w.pos.z, fac, w); if (cow) { cow.claimedBy = w; w.cow = cow; w.state = 'milk'; break; } }
        if (w.stack.count) { w.state = 'deliver'; break; }
        if (this.startHelp(w, dt)) break;
        w.say({ cow: 'İnekler dinleniyor…', sheep: 'Yün uzuyor…', hive: 'Arılar çalışıyor…' }[T.source] || 'Yumurta bekleniyor…', 1);
        break;
      }
      case 'feed': {
        const Z = g.animals.zones.get(w.feedZone); if (!Z) { w.state = 'find'; break; }
        if (w.moveTo(Z.feedPad.x, Z.feedPad.z + 0.6, w.speed(), dt, 0.6)) {
          w.anim.chop = (w.anim.chop < 0 ? 0 : w.anim.chop + dt * 2) % 1; w.say('Yem veriyorum', 0.5);
          w.feedT = (w.feedT || 0) - dt;
          if (w.feedT <= 0) { w.feedT = 0.2; if (!g.animals.buyFeed(w.feedZone)) { w.anim.chop = -1; w.state = 'find'; } }
        }
        break;
      }
      case 'milk': {
        const a = w.cow;
        if (!a || !g.animals.isReady(a)) { if (a && a.claimedBy === w) a.claimedBy = null; w.cow = null; w.state = 'find'; break; }
        // ineğin yanına ulaşılabilen bir taraftan yaklaş (çit, yemlik, alan kenarı engel olabilir)
        if (!w.milkSpot || w.milkSpot.a !== a || Math.hypot(w.milkSpot.cx - a.x, w.milkSpot.cz - a.z) > 0.5) {
          const sides = [[-1.3, 0], [1.3, 0], [0, 1.3], [0, -1.3], [-1, 1], [1, 1], [-1, -1], [1, -1]];
          const ok = sides.map(([ox, oz]) => ({ x: a.x + ox, z: a.z + oz })).filter((q) => g.isFree(q.x, q.z, 0.45))
            .sort((q1, q2) => Math.hypot(q1.x - w.pos.x, q1.z - w.pos.z) - Math.hypot(q2.x - w.pos.x, q2.z - w.pos.z));
          w.milkSpot = { a, cx: a.x, cz: a.z, x: ok[0]?.x ?? a.x, z: ok[0]?.z ?? a.z }; w.milkT = 0;
        }
        const near = Math.hypot(a.x - w.pos.x, a.z - w.pos.z) < 1.9;
        if (near || w.moveTo(w.milkSpot.x, w.milkSpot.z, w.speed(), dt, 0.5)) {
          w.milkT = 0;
          w.yaw = Math.atan2(a.x - w.pos.x, a.z - w.pos.z); w.anim.chop = (w.anim.chop + dt * 2) % 1;
          if (g.animals.milk(a, dt * (1 + this.up.efficiency * 0.1), w)) { w.anim.chop = -1; w.cow = null; w.state = 'find'; }
        } else if ((w.milkT += dt) > 6) { // 6 sn'de yanına varamadı: hayvan sıkışmış → ortaya yürüt, sonra tekrar dene
          g.animals.unstick(a); w.cow = null; w.milkSpot = null; w.state = 'find';
        }
        break;
      }
      case 'collect': {
        const l = w.log;
        if (!l || !g.wood.logs.includes(l)) { w.log = null; w.state = 'find'; break; }
        if (w.moveTo(l.x, l.z, w.speed(), dt, 0.9)) { g.wood.take(l, w); w.log = null; w.state = w.stack.isFull() ? 'deliver' : 'find'; }
        break;
      }
      case 'deliver': {
        const st = g.sites.get(`f${fac}_depot`);
        if (!st || st.buffer.isFull()) { w.say('Depo dolu!', 1); break; }
        const pad = st.dropPad;
        if (w.moveTo(pad.x, pad.z, w.speed(), dt, 0.6)) { g.inventory.transfer(w, pad, dt); if (w.stack.count === 0) w.state = 'find'; }
        break;
      }
      default: w.state = 'find';
    }
  }

  /** Bu iki nokta arasında kurulu bir bant var mı? (varsa o işi bant yapar, işçi taşımaz) */
  beltCovers(from, to) { for (const b of this.game.conveyors.belts.values()) if (b.def.from.site === from && b.def.to.site === to) return true; return false; }
  /** Makinenin çıkışı bantla bir yere bağlı mı? (yükleyici o makineye gitmez) */
  beltFrom(siteId) { for (const b of this.game.conveyors.belts.values()) if (b.def.from.site === siteId) return true; return false; }
  /** İşi olmayan işçinin bekleme yeri: dağıtımcılar kesilmiş odun stokunun yanında, diğerleri kendi alma noktasının yanında (pad üstünde değil) */
  idleSpot(w) {
    const g = this.game; const fac = w.data.fac ?? null;
    if (fac === null) {
      const saw = g.sites.get('saw');
      if (w.data.role === 'carrier' && saw?.outPad) { // bekleme noktası: yan yana, iki sıra (üst üste yığılmaz)
        const k = w.idx % 8, c = { x: saw.outPad.x - 4.4 + (k % 4) * 1.1, z: saw.outPad.z + 3.2 + Math.floor(k / 4) * 1.1 };
        return this.game.isFree(c.x, c.z, 0.4) ? c : { x: saw.outPad.x - 3.4 + (w.idx % 3) * 1.1, z: saw.outPad.z + 3.2 };
      }
      const hp = w.data.role === 'lumberjack' ? { x: -6.5, z: 9.5 } : ROLE_SPOTS[w.data.role]; // oduncular: deponun yanında, yol ve noktalardan uzakta
      const k = w.idx % 12;
      const c = hp ? { x: hp.x + 2 + (k % 4) * 1.0, z: hp.z + 2.2 + Math.floor(k / 4) * 1.1 } : null;
      return c && this.game.isFree(c.x, c.z, 0.4) ? c : hp ? { x: hp.x + 2 + (w.idx % 3) * 0.9, z: hp.z + 2.2 } : null;
    }
    const hp = getZone(fac).hire?.find((h) => h.role === w.data.role);
    return hp ? { x: hp.x + 2 + (w.idx % 3) * 0.9, z: hp.z + 2.2 } : null;
  }
  /** Dolu makinenin önünde bekleme yeri: girişten ~4.5 m ötede, işçiler yan yana dizilir (yol tıkanmaz) */
  restSpot(w, pad) {
    const k = w.idx % 8, col = k % 4, row = Math.floor(k / 4);
    const cand = [{ x: pad.x - 1.8 + col * 1.2, z: pad.z + 4.6 + row * 1.2 }, { x: pad.x - 1.8 + col * 1.2, z: pad.z - 5.2 - row * 1.2 }, { x: pad.x - 5 - row * 1.2, z: pad.z + col * 1.2 }];
    for (const c of cand) if (this.game.isFree(c.x, c.z, 0.4)) return c;
    return this.idleSpot(w) || cand[0];
  }
  goIdle(w, dt, msg) {
    const s = this.idleSpot(w);
    if (s && Math.hypot(s.x - w.pos.x, s.z - w.pos.z) > 0.8) w.moveTo(s.x, s.z, w.speed(), dt, 0.5);
    this.sayOnce(w, msg, 1);
  }
  /** Akıllı lojistikte aynı uyarı yakındaki işçilerin her birinin başında tekrar etmez: yalnızca biri söyler */
  sayOnce(w, msg, t = 1) {
    if (this.smart() && msg) {
      for (const o of this.list) {
        if (o === w || o.bubble !== msg || !(o.bubbleT > 0) || o.idx > w.idx) continue;
        if (Math.hypot(o.pos.x - w.pos.x, o.pos.z - w.pos.z) < 14) { if (w.bubble === msg) { w.bubble = null; w.bubbleT = 0; } return; }
      }
    }
    w.say(msg, t);
  }

  /** Alanın makineleri / bantları (operatörler kendi alanında çalışır) */
  areaMachines(fac) { return this.game.production.machines.filter((m) => (m.zone ?? null) === fac); }
  areaBelts(fac) {
    const g = this.game;
    return [...g.conveyors.belts.values()].filter((b) => { const st = g.sites.get(b.def.from.site); return st && ((st.zone ?? null) === fac); });
  }
  /** Bir makinede / bantta çalışan operatör sayısı (etki en fazla 2 operatöre kadar) */
  operators(target) { let n = 0; for (const w of this.list) if (w.station === target && w.state === 'operate') n++; return Math.min(2, n); }
  /**
   * Operatör: makinenin (kesme) ya da bandın başında durur ve onu hızlandırır.
   * Gerçek etki: ProductionSystem.procTime ve ConveyorSystem.speed operatör sayısını kullanır.
   */
  operator(w, dt, kind) {
    const fac = w.data.fac ?? null;
    if (!w.station || (kind === 'machine' ? !this.game.production.machines.includes(w.station) : ![...this.game.conveyors.belts.values()].includes(w.station))) {
      const list = kind === 'machine' ? this.areaMachines(fac) : this.areaBelts(fac);
      // en az operatörü olan (2'den az) hedef seçilir; kesme makinesi (testere) önceliklidir
      let best = null, bs = Infinity;
      for (const t of list) {
        const n = this.list.filter((o) => o !== w && o.station === t).length; if (n >= 2) continue;
        const sc = n * 10 + (kind === 'machine' && t.machine !== 'saw' ? 1 : 0);
        if (sc < bs) { bs = sc; best = t; }
      }
      w.station = best;
      if (!best) { w.state = 'idle'; this.goIdle(w, dt, kind === 'machine' ? 'Makine yok — görevimi değiştir' : 'Bant yok — görevimi değiştir'); return; }
      const k = this.list.filter((o) => o !== w && o.station === best).length;
      if (kind === 'machine') w.post = { x: best.x + (k ? 1.6 : -1.6), z: best.z - 2.1 };
      else { const p = this.game.conveyors.pointAt(best, best.total * (k ? 0.65 : 0.35)); const W2 = this.game.conveyors.beltWidth(best) / 2 + 0.9; w.post = { x: p.x + Math.cos(p.yaw) * W2, z: p.z - Math.sin(p.yaw) * W2 }; }
      w.state = 'go';
    }
    if (w.state === 'go' || w.state === 'idle') { if (w.moveTo(w.post.x, w.post.z, w.speed(), dt, 0.4)) w.state = 'operate'; return; }
    if (w.state === 'operate') {
      // çalışma animasyonu (kol hareketi) + makineye dönük durur
      const tx = w.station.x ?? w.post.x, tz = w.station.z ?? w.post.z;
      if (kind === 'machine') w.yaw = Math.atan2(tx - w.pos.x, tz - w.pos.z);
      w.anim.chop = (w.anim.chop < 0 ? 0 : w.anim.chop + dt * 1.6) % 1;
      if (Math.hypot(w.post.x - w.pos.x, w.post.z - w.pos.z) > 1.2) w.state = 'go';
    }
  }

  /** Otomatik rota: hedef girdisi en boş olan, kaynağında ürün bulunan bağlantı */
  pickRoute(w, any = false) {
    const routes = this.availableRoutes(w);
    if (!any && w.data.target !== 'auto' && w.data.role === 'carrier') {
      const r = routes.find((x) => x.id === w.data.target);
      if (r) { // seçili rotada taşınacak ürün yoksa boş beklemez, başka işe bakar
        const src = outBufOf(this.game.sites.get(r.from)), dst = inBufOf(this.game.sites.get(r.to));
        if (src && dst && !dst.isFull() && src.items.some((i) => dst.acceptsKind(i.kind))) return r;
      }
      if (!this.game.sites.has(w.data.target.split('>')[0])) w.data.target = 'auto'; // artık olmayan rota (eski kayıt) → otomatik
      // seçili rota şu an yoksa (ör. bant taşıyor) boş durmaz: otomatik iş bulur
    }
    let best = null, bs = -Infinity;
    const smart = this.smart();
    for (const r of routes) {
      const src = outBufOf(this.game.sites.get(r.from)), dst = inBufOf(this.game.sites.get(r.to));
      if (!src || !dst) continue;
      const avail = src.items.filter((i) => dst.acceptsKind(i.kind)).length;
      if (avail === 0 || dst.isFull()) continue;
      const onRoute = this.list.filter((o) => o !== w && o.route?.id === r.id).length;
      let score = (1 - dst.count / dst.capacity) * 10 + Math.min(avail, 10) * 0.3 - onRoute * 3;
      if (smart) {
        // AKILLI LOJİSTİK: hedefe yoldaki yükler de sayılır; %80 öncelik düşer, %90 yalnızca kimse yoksa, %100 gönderilmez
        const incoming = this.incomingTo(r.to, w);
        const fill = (dst.count + incoming) / dst.capacity;
        if (fill >= 1) continue;
        if (fill >= 0.9 && onRoute > 0) continue;
        if (fill >= 0.8) score -= 6;
        // aynı malzeme için ikinci işçi gönderilmez: kaynaktaki ürün, o rotaya ayrılmış işçilerin taşıyabileceğinden fazla değilse
        if (avail - this.reservedFrom(r.from, w) <= 0) continue;
        // hedef makinenin çıkışı doluysa (üretemiyor) ona daha fazla hammadde götürme
        const tSite = this.game.sites.get(r.to);
        if (tSite?.outBuf && tSite.outBuf.count >= tSite.outBuf.capacity * 0.9) continue;
        // makine boşsa hammadde götürmek en önce
        if (dst.count === 0) score += 4;
      }
      if (score > bs) { bs = score; best = r; }
    }
    return best;
  }
  /** İŞ EMİRLERİ: her taşıma işinin benzersiz kimliği olur; iş bitince / iptal olunca kayıt silinir */
  openJob(w, kind, from, to) {
    this.jobs ||= new Map(); this.jobSeq = (this.jobSeq || 0) + 1;
    if (w.jobId) this.jobs.delete(w.jobId);
    const id = `${kind}#${this.jobSeq}`; w.jobId = id;
    this.jobs.set(id, { id, kind, from, to, worker: w, t: this.game.time });
    return id;
  }
  cleanJobs() {
    if (!this.jobs) return;
    for (const [id, j] of this.jobs) {
      const w = j.worker;
      const alive = this.list.includes(w) && w.jobId === id && (j.kind === 'carry' ? w.route?.from === j.from : w.src?.id === j.from);
      if (!alive) { this.jobs.delete(id); if (w.jobId === id && !alive) w.jobId = null; }
    }
  }
  /** Akıllı lojistik açık mı? (İşçiler panelindeki ikinci anahtar) */
  smart() { return !!this.game.state.smartLogistics; }
  /** Bu hedefe şu an taşınmakta olan ürün sayısı (yoldaki işçilerin sırtındaki) */
  incomingTo(siteId, except = null) {
    let n = 0;
    for (const o of this.list) if (o !== except && o.route?.to === siteId && (o.state === 'drop' || o.state === 'pick')) n += o.state === 'drop' ? o.stack.count : o.stack.capacity;
    return n;
  }
  /** Kaynaktan almaya giden işçilerin ayırdığı ürün sayısı (iş emri rezervasyonu) */
  reservedFrom(siteId, except = null) {
    let n = 0;
    for (const o of this.list) if (o !== except && o.state === 'pick' && (o.route?.from === siteId || o.src?.id === siteId)) n += Math.max(0, o.stack.capacity - o.stack.count);
    return n;
  }

  /** Dağıtım işçisi ve taşıyıcı: kendi işi yoksa boş durmaz, kendi alanındaki diğer taşıma işine yardım eder
   *  (Dağıtım İşçisi → makineden rampaya, Taşıyıcı → depodan/makineden makineye); kendi işi çıkınca geri döner. */
  transport(w, dt) {
    // her işçi YALNIZCA kendi işini yapar (oyuncu isteği): Taşıyıcı boşta kalınca dağıtıma, Dağıtım İşçisi taşımaya geçmez.
    // Oduncu/bakıcı yardıma geldiğinde (helping) Taşıyıcı işini yapar.
    const role = w.data.role === 'carrier' ? 'carrier' : 'loader';
    if (w.helping) {
      if (w.mode !== 'carrier' && w.mode !== 'loader') w.mode = this.pickLoaderSource(w, true) ? 'loader' : 'carrier';
    } else w.mode = role;
    if (w.mode === 'carrier') this.carrier(w, dt); else this.loader(w, dt);
    if (w.state === 'idle' && w.stack.count === 0) w.idleT = (w.idleT || 0) + dt; else w.idleT = 0;
  }

  carrier(w, dt) {
    const g = this.game;
    if (w.state === 'dump') { this.dumpStep(w, dt); return; }
    if (!w.route || w.state === 'idle') {
      if (this.smart() && (w.searchT || 0) > 0 && w.state === 'idle') { w.searchT -= dt; this.goIdle(w, dt, w.bubble || 'İş bekleniyor…'); return; } // her karede iş aranmaz
      w.route = this.pickRoute(w);
      if (w.route && this.smart()) this.openJob(w, 'carry', w.route.from, w.route.to);
      if (!w.route) w.searchT = 0.6;
      if (!w.route) {
        if (w.stack.count) { w.state = 'dump'; return; }
        // taşınacak ürün var ama hedef makine dolu → darboğaz makinede: işçi değil makine yetişmiyor
        const jam = this.availableRoutes(w).find((r) => { const sb = outBufOf(g.sites.get(r.from)), db = inBufOf(g.sites.get(r.to)); return sb?.count > 0 && db?.isFull(); });
        w.state = 'idle'; this.goIdle(w, dt, jam ? `${g.sites.get(jam.to).name.split(' · ').pop()} dolu — makineyi geliştir` : 'İş bekleniyor…'); return;
      }
      w.state = w.stack.count ? 'drop' : 'pick';
    }
    const src = g.sites.get(w.route.from), dst = g.sites.get(w.route.to);
    if (!src || !dst) { w.route = null; w.state = 'idle'; return; }
    const dstBuf = inBufOf(dst);
    if (w.state === 'pick') {
      const pad = outPadOf(src);
      if (w.moveTo(pad.x, pad.z, w.speed(), dt, 0.6)) {
        const got = g.inventory.transfer(w, pad, dt);
        w.waitT += dt; if (got) w.waitT = 0;
        const left = outBufOf(src).items.some((i) => dstBuf.acceptsKind(i.kind));
        if (w.stack.isFull() || (!left && w.stack.count > 0 && w.waitT > 0.6)) { w.state = 'drop'; w.waitT = 0; }
        else if (!left && w.stack.count === 0 && w.waitT > 2) { w.route = null; w.state = 'idle'; w.waitT = 0; }
      }
    } else if (w.state === 'drop') {
      const pad = inPadOf(dst);
      if (w.moveTo(pad.x, pad.z, w.speed(), dt, 0.6)) {
        const did = g.inventory.transfer(w, pad, dt);
        const remaining = w.stack.items.some((i) => dstBuf.acceptsKind(i.kind));
        if (!remaining) {
          if (w.stack.count > 0) { w.state = 'dump'; return; }
          if (w.data.target === 'auto') { w.route = null; w.state = 'idle'; } else w.state = 'pick';
        } else if (!did && dstBuf.isFull()) { w.state = 'waitRoom'; w.waitT = 0; }
      }
    } else if (w.state === 'waitRoom') {
      // makine dolu: girişin önünü kapatmadan yanında bekle, yer açılınca dön
      const pad = inPadOf(dst);
      const rs = this.restSpot(w, pad); // girişin önüne yığılmaz: biraz ötede sıra halinde bekler
      w.moveTo(rs.x, rs.z, w.speed(), dt, 0.4); this.sayOnce(w, 'Makine dolu — molada', 1);
      w.waitT += dt;
      if (!dstBuf.isFull()) { w.state = 'drop'; w.waitT = 0; }
      else if (this.beltCovers(w.route.from, w.route.to) && w.waitT > 3 && RAW_KINDS.includes(w.stack.items[0]?.kind)) { w.route = null; w.state = 'dump'; w.waitT = 0; } // bant kuruldu: bu iş artık bandın
    }
  }

  /**
   * Elde kalan ürünü "gitmesi gereken yere" götür (kimse sırtında yükle beklemez):
   * ham ürün → kendi deposu; ara ürün → sıradaki makine; son ürün → kendi rampası
   */
  dropTargetFor(w) {
    const g = this.game; const it = w.stack.items[0]; if (!it) return null;
    if (RAW_KINDS.includes(it.kind)) {
      const d = this.nearestDepotWithRoom(w.pos.x, w.pos.z, it.kind, w.data.fac ?? null);
      if (d) return d.dropPad;
      const full = this.nearestDepotWithRoom(w.pos.x, w.pos.z, it.kind, w.data.fac ?? null, true); // dolu: kapısında bekle (boşalınca bırakır)
      return full ? { wait: full.dropPad, at: true, msg: 'Depo dolu — genişlet' } : null;
    }
    const zone = it.o == null || it.o === 0 ? null : it.o;
    const next = g.production.nextMachineFor(it.kind, zone);
    if (next) return next.inBuf.isFull() ? { wait: next.inPad } : next.inPad;
    const dock = this.nearestDock(w.pos.x, w.pos.z, it);
    if (dock) return dock.pad;
    const full = this.nearestDock(w.pos.x, w.pos.z, it, true); // rampa dolu: rampada bekle, kamyon yükledikçe bırakır
    if (full) return { wait: full.pad, at: true, msg: 'Rampa dolu — kamyon bekleniyor' };
    // hiçbir kendi hedefi yoksa (eski kayıt vb.) herhangi bir rampaya bırak: kimse yükle sıkışıp kalmaz
    const any = g.trucks.docks.find((d) => !d.staging.isFull() && d.staging.acceptsKind(it.kind) && (!d.pad.filter || d.pad.filter(it)));
    return any ? any.pad : null;
  }
  dumpStep(w, dt) {
    const t = this.dropTargetFor(w);
    if (!t) { w.state = 'idle'; this.goIdle(w, dt, 'Bırakacak yer yok'); return; }
    if (t.wait && t.at) { // dolu hedefin üzerinde bekle: yer açılır açılmaz bırakır
      if (w.moveTo(t.wait.x, t.wait.z, w.speed(), dt, 0.6)) { this.game.inventory.transfer(w, t.wait, dt); w.say(t.msg, 1); }
      if (w.stack.count === 0) { w.route = null; w.src = null; w.state = 'idle'; w.waitT = 0; }
      return;
    }
    if (t.wait) { const rs = this.restSpot(w, t.wait); w.moveTo(rs.x, rs.z, w.speed(), dt, 0.4); this.sayOnce(w, 'Makine dolu — molada', 1); return; }
    if (w.moveTo(t.x, t.z, w.speed(), dt, 0.6)) {
      const did = this.game.inventory.transfer(w, t, dt);
      w.waitT = did ? 0 : (w.waitT || 0) + dt;
      if (w.stack.count === 0) { w.route = null; w.src = null; w.state = 'idle'; w.waitT = 0; }
      else if (w.waitT > 1.5) { w.waitT = 0; } // bir sonraki üründe hedef yeniden hesaplanır
    }
  }

  /** Yükleyici: en değerli bitmiş ürünleri kamyon rampasına taşır */
  pickLoaderSource(w, any = false) {
    const g = this.game;
    let best = null, bs = 0;
    const fac = w.data.fac ?? null;
    for (const st of g.production.machines) {
      if (!any && w.data.role === 'loader' && w.data.target !== 'auto' && st.id !== w.data.target) continue;
      if (fac !== null ? (st.zone == null || parentOf(st.zone) !== fac) : st.zone != null) continue; // her işçi yalnızca kendi bölgesinin (ana tesis + genişletmeleri) makinelerinden yükler
      if (this.game.production.nextMachineFor(st.def.output, st.zone ?? null)) continue; // ara ürün kamyona değil sıradaki makineye gider (taşıyıcı/bant işi)
      if (this.beltFrom(st.id) && st.outBuf.count < st.outBuf.capacity * 0.9) continue; // çıkışı bantla rampaya bağlı: bant taşır (bant yetişemezse yardım eder)
      const n = st.outBuf.count;
      if (!n) continue;
      if (this.smart() && n - this.reservedFrom(st.id, w) <= 0) continue; // bu ürünler zaten başka Taşıyıcıya ayrıldı
      const val = g.economy.itemValue(st.outBuf.items[0]);
      const score = n * val - (this.list.filter((o) => o.src === st).length * 20);
      if (score > bs) { bs = score; best = st; }
    }
    return best;
  }
  /** Taşıyıcı neden bekliyor? Ara ürün birikmişse (ör. kereste → zımpara) bunu Dağıtım İşçisi/bant taşır, Taşıyıcı değil */
  loaderWaitMsg(w) {
    const g = this.game; const fac = w.data.fac ?? null;
    for (const st of g.production.machines) {
      if (fac !== null ? (st.zone == null || parentOf(st.zone) !== fac) : st.zone != null) continue;
      if (!st.outBuf.count) continue;
      const next = g.production.nextMachineFor(st.def.output, st.zone ?? null);
      if (next) return `${ITEMS[st.def.output].name} önce ${next.name.split(' · ').pop()}'ne gider — Dağıtım İşçisi lazım`;
    }
    return 'Satılacak ürün bekleniyor…';
  }
  /** Bölge işçisi önce kendi bölgesinin rampasına yükler (fiyat çarpanı orada) */
  zoneDock(w) {
    const fac = w.data.fac ?? null; if (fac === null) return null;
    const def = getZone(fac); const id = def.importer?.dock || `f${fac}_dock`;
    const d = this.game.sites.get(id);
    return d && !d.staging.isFull() ? d : null;
  }
  nearestDock(x, z, item = null, allowFull = false) {
    let best = null, bd = Infinity;
    const zone = item?.o ?? 0;
    for (const d of this.game.trucks.docks) { if ((!allowFull && d.staging.isFull()) || (d.zone ?? 0) !== zone) continue; const dd = Math.hypot(d.pad.x - x, d.pad.z - z); if (dd < bd) { bd = dd; best = d; } }
    if (!best && zone === 0 && !allowFull) for (const wst of this.game.storage.warehouses) if (!wst.buffer.isFull()) best = wst;
    return best;
  }

  loader(w, dt) {
    const g = this.game;
    if (w.state === 'dump') { this.dumpStep(w, dt); return; }
    if (w.state === 'idle' || !w.state || (w.state === 'pick' && !w.src)) {
      if (w.stack.count) { w.state = 'drop'; }
      else {
        if (this.smart() && (w.searchT || 0) > 0) { w.searchT -= dt; w.state = 'idle'; this.goIdle(w, dt, w.bubble || 'Satılacak ürün bekleniyor…'); return; }
        w.src = this.pickLoaderSource(w) || this.pickLoaderSource(w, true); // seçili makinede ürün yoksa boş beklemez, diğerlerinden yükler
        if (w.src && this.smart()) this.openJob(w, 'load', w.src.id, 'dock');
        if (!w.src) w.searchT = 0.6;
        if (!w.src) { w.state = 'idle'; this.goIdle(w, dt, this.loaderWaitMsg(w)); return; }
        w.state = 'pick';
      }
    }
    if (w.state === 'pick') {
      const pad = w.src.outPad;
      if (w.moveTo(pad.x, pad.z, w.speed(), dt, 0.6)) {
        const got = g.inventory.transfer(w, pad, dt);
        w.waitT += dt; if (got) w.waitT = 0;
        if (w.stack.isFull() || (w.src.outBuf.count === 0 && w.stack.count > 0) || (w.waitT > 2 && w.stack.count > 0)) { w.state = 'drop'; w.waitT = 0; }
        else if (w.src.outBuf.count === 0 && w.waitT > 2) { w.src = null; w.state = 'idle'; w.waitT = 0; }
      }
    } else if (w.state === 'drop') {
      // rampa elindeki ürünü almıyorsa (ara ürün / başka tesisin ürünü) gitmesi gereken yere götür
      const first = w.stack.items[0];
      const zd = this.zoneDock(w) || this.nearestDock(w.pos.x, w.pos.z, first) || this.nearestDock(w.pos.x, w.pos.z, first, true);
      if (first && (!zd || !zd.pad.filter || !zd.pad.filter(first))) { w.state = 'dump'; return; }
      if (zd.staging?.isFull()) { // rampa dolu: rampada bekle, kamyon yükledikçe bırakır (oradan uzaklaşıp dolaşmaz)
        if (w.moveTo(zd.pad.x, zd.pad.z, w.speed(), dt, 0.6)) { g.inventory.transfer(w, zd.pad, dt); w.say('Rampa dolu — kamyon bekleniyor', 1); }
        if (w.stack.count === 0) { w.state = 'idle'; w.src = null; }
        return;
      }
      const dst = zd;
      if (!dst) { w.say('Rampa dolu!'); return; }
      const pad = dst.pad;
      if (w.moveTo(pad.x, pad.z, w.speed(), dt, 0.6)) {
        g.inventory.transfer(w, pad, dt);
        if (w.stack.count === 0) { w.state = 'idle'; w.src = null; }
      }
    }
  }

  serialize() { this.game.state.workers = this.list.filter((w) => !w.data.temp).map((w) => ({ ...w.data, stack: w.stack.serialize(), x: +w.pos.x.toFixed(2), z: +w.pos.z.toFixed(2) })); }
}

export { WORKER_ROLES };
