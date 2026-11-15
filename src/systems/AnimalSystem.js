import { parentOf, getZone } from '../config/zones.js';
import { makeCow, makeHen, makeSheep, makeHive, makePen, makeCabin } from '../world/Models.js';
import { makePad } from './Stations.js';
import { XP, ITEMS, FEED } from '../config/balance.js';
import * as THREE from 'three';

/**
 * Çiftlik tesislerinin kaynakları:
 *  - İnek: belli aralıklarla "hazır" olur; oyuncu veya çiftçi yanında durunca sağılır → yere süt kovası düşer.
 *  - Tavuk: kümeste dolaşır, kendiliğinden yumurta sepeti bırakır (yerde çok birikirse durur).
 * Ürünler yerden toplanır, önce tesisin deposuna, sonra makineye götürülür.
 */
const COW = { reach: 2.0 };
/** "Hazır olunca yanından geç → ürün düşer" kaynakları */
export const SOURCES = {
  cow:   { item: 'milk', cooldown: 18, time: 1.1, per: 2, speed: 0.9, name: 'İnek',  buy: 'buycow',   stat: 'cowsMilked',     verb: 'sağıldı',  make: makeCow,   pen: 0xfff8e1, house: [0xc62828, 0xeceff1, 5, 3.6], growth: 1.35 },
  sheep: { item: 'wool', cooldown: 22, time: 1.3, per: 2, speed: 0.8, name: 'Koyun', buy: 'buysheep', stat: 'sheepSheared',   verb: 'kırpıldı', make: makeSheep, pen: 0xeceff1, house: [0x5d4037, 0xffcc80, 5, 3.6], growth: 1.33 },
  hive:  { item: 'comb', cooldown: 20, time: 1.0, per: 2, speed: 0,   name: 'Kovan', buy: 'buyhive',  stat: 'combsHarvested', verb: 'toplandı', make: makeHive,  pen: 0xffe082, house: [0xffb300, 0x6d4c41, 3.6, 2.8], growth: 1.33 },
  hen:   { name: 'Tavuk', buy: 'buyhen', make: makeHen, pen: 0xffe0b2, house: [0xffb74d, 0x8d6e63, 3.6, 2.8], growth: 1.28 },
};
const HEN = { layMin: 9, layMax: 15, groundMax: 14 };

export class AnimalSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.zones = new Map(); // zoneId -> { def, rect }
  }

  setupZone(def) {
    if (!def.farm || this.zones.has(def.id)) return;
    const g = this.game;
    // GENİŞLETME: yeni ağıl kurulmaz — ana çiftliğin ağılı bu alana uzar, hayvan sınırı artar
    if (def.farm.extend != null) {
      const base = def.farm.extend;
      // eski kayıt: genişletmede ayrıca alınmış hayvanlar ana çiftliğe katılır
      const st = g.state.animals || (g.state.animals = {});
      if (st[def.id]) { st[base] = (st[base] || 0) + st[def.id] + (def.farm.start || 0); delete st[def.id]; }
      if (this.zones.has(base)) this.buildPen(base, true);
      return;
    }
    const R = def.farm.rect;
    const S = SOURCES[def.farm.type];
    const house = makeCabin(...S.house);
    house.position.set(R.x0 + 3.2, 0, R.z0 + 2.4); g.scene.add(house);
    const hw = S.house[2] / 2 + 0.2;
    g.obstacles.push({ x0: house.position.x - hw, x1: house.position.x + hw, z0: R.z0 + 0.6, z1: R.z0 + 4.2 });
    this.zones.set(def.id, { def, rect: null });
    this.buildPen(def.id, false);
    const n = this.count(def.id);
    for (let i = 0; i < n; i++) this.spawnAnimal(def, i);
    // hayvan satın alma noktası (ağılın önü)
    makePad(g, { x: (R.x0 + R.x1) / 2, z: R.z1 + 2.2, mode: 'animal', type: S.buy, r: 1.25, data: { zone: def.id },
      label: () => ({ title: `${S.name} Al`, price: this.price(def.id), level: 0, count: this.zoneCount(def.id), max: this.maxFor(def.id) }) });
    // YEMLİK: hayvanlar yemle üretir (arılar hariç). Yem parayla alınır; oyuncu "Yem Ver" noktasında durur ya da bakıcı doldurur
    if (this.needsFeed(def.id)) {
      g.state.feed ||= {};
      if (g.state.feed[def.id] == null) g.state.feed[def.id] = FEED.startUnits;
      const Z = this.zones.get(def.id);
      const tx = R.x1 - 2.4, tz = R.z1 - 1.4;
      const trough = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.9), wood); body.position.y = 0.25; trough.add(body);
      const grain = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: 0xf9a825, roughness: 1 }));
      grain.position.y = 0.36; trough.add(grain);
      trough.position.set(tx, 0, tz); g.scene.add(trough);
      g.obstacles.push({ x0: tx - 1.4, x1: tx + 1.4, z0: tz - 0.55, z1: tz + 0.55 });
      Z.trough = trough; Z.grain = grain;
      Z.feedPad = makePad(g, { x: R.x1 - 1.6, z: R.z1 + 2.2, mode: 'feed', type: 'upgrade', r: 1.15, data: { zone: def.id },
        label: () => ({ title: 'Yem Ver', price: this.feedPrice(def.id), level: 0, count: Math.floor(this.feed(def.id)), max: this.feedCap(def.id) }) });
    }
  }

  /** Dolaşma hedefi: ağıl içinde, engelden (yemlik, ev) uzak ve işçinin yanına gelebileceği bir nokta */
  pickTarget(a, R) {
    for (let k = 0; k < 8; k++) {
      const x = R.x0 + 0.8 + Math.random() * Math.max(0.1, R.x1 - R.x0 - 1.6), z = R.z0 + 0.6 + Math.random() * Math.max(0.1, R.z1 - R.z0 - 1.2);
      if (this.game.isFree(x, z, 1.6)) { a.tx = x; a.tz = z; return; }
    }
    a.tx = (R.x0 + R.x1) / 2; a.tz = (R.z0 + R.z1) / 2;
  }
  /** Hayvan ağılın kenarına / bir engelin dibine sıkıştıysa (işçi yanına gelemiyorsa) ortaya doğru yürür */
  unstick(a) {
    const Z = this.zones.get(a.zone); if (!Z) return;
    a.claimedBy = null; a.milkT = 0; a.wait = 0; a.pushT = 4; // 4 sn sağılmaya hazır olsa da yürür
    this.pickTarget(a, Z.rect);
  }

  /** Ağılın güncel sınırı: ana ağıl + sahip olunan genişletmelerin üst şeridi (tek parça, batıya uzar) */
  penRect(baseId) {
    const R = { ...this.zones.get(baseId).def.farm.rect };
    for (const e of this.expansionsOf(baseId)) R.x0 = Math.min(R.x0, e.farm.rect.x0 + 2);
    return R;
  }
  expansionsOf(baseId) { const out = []; for (const id of this.game.land.owned) { const z = getZone(id); if (z.farm?.extend === baseId) out.push(z); } return out; }
  /** Ağıla sığan en fazla hayvan: ana çiftlik + her genişletmenin eklediği */
  maxFor(zoneId) { const Z = this.zones.get(zoneId); if (!Z) return 0; let m = Z.def.farm.max; for (const e of this.expansionsOf(zoneId)) m += e.farm.addMax; return m; }
  buildPen(baseId, grew) {
    const g = this.game; const Z = this.zones.get(baseId); const def = Z.def; const S = SOURCES[def.farm.type];
    const R = this.penRect(baseId);
    const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, w = R.x1 - R.x0, d = R.z1 - R.z0;
    const gateX = (def.farm.rect.x0 + def.farm.rect.x1) / 2; // kapı ve satın alma noktası hep ana ağılın önünde
    if (Z.pen) { g.scene.remove(Z.pen); Z.pen.traverse((o) => o.geometry?.dispose?.()); }
    Z.pen = makePen(w, d, gateX - cx, S.pen); Z.pen.position.set(cx, 0, cz); g.scene.add(Z.pen);
    Z.rect = { x0: R.x0 + 1, x1: R.x1 - 1, z0: R.z0 + 4.8, z1: R.z1 - 1 };
    if (grew) {
      for (const a of this.list) if (a.zone === baseId && SOURCES[a.type].speed !== 0) { a.tx = Z.rect.x0 + Math.random() * (Z.rect.x1 - Z.rect.x0); a.wait = 0; } // hayvanlar yeni alana yayılır
      for (let i = this.zoneCount(baseId), n = this.count(baseId); i < n; i++) this.spawnAnimal(def, i); // eski kayıttan taşınan hayvanlar
      g.fx?.confetti?.(R.x0 + 6, 1.5, cz, 30);
      g.bus.emit('toast', { text: `${S.name === 'Kovan' ? 'Arılık' : 'Ağıl'} büyüdü! Artık en fazla ${this.maxFor(baseId)} ${S.name.toLowerCase()} alabilirsin`, type: 'success' });
    }
  }

  // ---- yem ----
  needsFeed(zoneId) { const t = (this.zones.get(zoneId)?.def || { farm: null }).farm?.type; return !!t && t !== 'hive'; }
  feed(zoneId) { return this.game.state.feed?.[zoneId] ?? 0; }
  /** Yemlik kapasitesi: hayvan sayısıyla büyür (daha çok hayvan → daha çok yem ihtiyacı) */
  feedCap(zoneId) { return FEED.capBase + FEED.capPerAnimal * this.zoneCount(zoneId); }
  feedPrice(zoneId) { return Math.max(1, Math.round(this.zones.get(zoneId).def.farm.price * FEED.priceMul)); }
  /** Yem satın al (oyuncu / bakıcı). Başarılıysa true */
  buyFeed(zoneId) {
    const g = this.game; const p = this.feedPrice(zoneId);
    if (this.feed(zoneId) >= this.feedCap(zoneId) || g.state.money < p) return false;
    g.state.money -= p; g.stat('moneySpent', p); g.stat('feedBought');
    g.bus.emit('money', { amount: -p, source: 'feed' });
    g.state.feed[zoneId] = this.feed(zoneId) + 1;
    return true;
  }
  /** Üretim için 1 yem harca (yoksa üretim olmaz) */
  eat(zoneId) { if (!this.needsFeed(zoneId)) return true; if (this.feed(zoneId) < 1) return false; this.game.state.feed[zoneId] -= 1; this.game.stat('feedEaten'); return true; }
  hungry(zoneId) { return this.needsFeed(zoneId) && this.feed(zoneId) < 1; }

  /** Bu çiftlikteki hayvan sayısı (başlangıç + satın alınan) */
  count(zoneId) { const def = this.zones.get(zoneId)?.def; return Math.min(this.maxFor(zoneId), def.farm.start + (this.game.state.animals[zoneId] || 0)); }
  zoneCount(zoneId) { return this.list.filter((a) => a.zone === zoneId).length; }
  /** Hayvan fiyatı: ağılın her bölümü (ana ağıl + her genişletme) kendi taban fiyatından başlar ve o bölüm dolarken artar.
   *  (Eskiden tek bir üstel artış vardı; ağıl genişleyince 100. tavuk milyarlara çıkıyordu.) */
  price(zoneId) {
    const Z = this.zones.get(zoneId); const f = Z.def.farm; const S = SOURCES[f.type];
    let n = this.game.state.animals[zoneId] || 0; // satın alınmış (başlangıç hayvanları hariç)
    const segs = [{ max: f.max - (f.start || 0), price: f.price }, ...this.expansionsOf(zoneId).sort((a, b) => a.id - b.id).map((e) => ({ max: e.farm.addMax, price: e.farm.price }))];
    for (const sg of segs) {
      if (n < sg.max) return Math.round(sg.price * Math.pow(S.growth, n * Math.min(1, 7 / Math.max(1, sg.max)))); // bölüm dolarken en fazla ~×5
      n -= sg.max;
    }
    const last = segs[segs.length - 1];
    return Math.round(last.price * Math.pow(S.growth, 7));
  }
  canBuy(zoneId) { return this.zoneCount(zoneId) < this.maxFor(zoneId); }
  /** Oyuncu satın alma noktasına girdi: parası yetiyorsa bir hayvan al */
  buyFromPad(pad) {
    const g = this.game; const id = pad.data.zone; const def = this.zones.get(id).def;
    const name = SOURCES[def.farm.type].name;
    if (!this.canBuy(id)) { g.bus.emit('toast', { text: `Ağıl dolu (${this.maxFor(id)} ${name.toLowerCase()}) — alanı genişletince daha çok alabilirsin`, type: 'info' }); return false; }
    if (!g.economy.spend(this.price(id), 'animal')) { g.bus.emit('toast', { text: `${name} için ${this.price(id)} para gerekli`, type: 'error' }); return false; }
    g.state.animals[id] = (g.state.animals[id] || 0) + 1;
    const a = this.spawnAnimal(def, this.zoneCount(id), true);
    g.stat(def.farm.type + 'Bought'); if (def.farm.type === 'cow') g.stat('cowsBought'); if (def.farm.type === 'hen') g.stat('hensBought');
    g.levels.addXP(10);
    g.fx.confetti(a.x, 1.5, a.z, 30);
    g.audio.play('hire');
    g.bus.emit('toast', { text: `Yeni ${name.toLowerCase()} ağıla katıldı!`, type: 'success' });
    g.save?.markDirty?.();
    return true;
  }

  spawnAnimal(def, i, fromGate = false) {
    const g = this.game; const inner = this.zones.get(def.id).rect;
    {
      const S = SOURCES[def.farm.type];
      const m = S.make(def.id * 31 + i * 7);
      const a = {
        type: def.farm.type, zone: def.id, model: m,
        x: inner.x0 + Math.random() * (inner.x1 - inner.x0), z: inner.z0 + Math.random() * (inner.z1 - inner.z0),
        yaw: Math.random() * 6.28, tx: 0, tz: 0, wait: Math.random() * 3, phase: Math.random() * 6,
        ready: S.item ? Math.random() * 6 : 0, milkT: 0, lay: HEN.layMin + Math.random() * (HEN.layMax - HEN.layMin), claimedBy: null,
      };
      if (S.speed === 0) { // kovanlar: doğudan batıya sütunlar halinde (ağıl büyüdükçe batıya yeni sütun)
        const rows = Math.max(1, Math.floor((inner.z1 - inner.z0 - 0.4) / 2.9)) || 1;
        a.x = inner.x1 - 1.4 - Math.floor(i / rows) * 2.7; a.z = inner.z0 + 1.2 + (i % rows) * 2.9; a.yaw = Math.PI / 2;
      }
      else if (fromGate) { a.x = (inner.x0 + inner.x1) / 2; a.z = inner.z1 - 0.5; }
      a.tx = a.x; a.tz = a.z;
      m.group.position.set(a.x, 0, a.z);
      g.scene.add(m.group);
      this.list.push(a);
      return a;
    }
  }

  isReady(a) { return !!SOURCES[a.type].item && a.ready <= 0; }
  /** Bir tesisteki en yakın hazır inek (çiftçi / rehber ok için) */
  nearestReadyCow(x, z, zone = null, by = null) {
    let best = null, bd = Infinity;
    for (const a of this.list) {
      if (!this.isReady(a) || (zone !== null && parentOf(a.zone) !== zone)) continue;
      if (a.claimedBy && a.claimedBy !== by) continue;
      const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** Sağma ilerlet (oyuncu veya çiftçi yanında dururken çağrılır). Bitince true döner. */
  milk(a, dt, by) {
    const g = this.game;
    if (!this.isReady(a)) return false;
    a.milkT += dt;
    a.claimedBy = by;
    const S = SOURCES[a.type];
    if (a.milkT < S.time) return false;
    if (!this.eat(a.zone)) { a.milkT = 0; return false; } // yem yok: üretim yok
    a.milkT = 0; a.ready = S.cooldown; a.claimedBy = null;
    for (let i = 0; i < S.per; i++) { const l = g.wood.spawnItem(S.item, a.type, a.x + (Math.random() - 0.5) * 0.8, a.z + 0.9, (Math.random() - 0.5) * 2.5, 1 + Math.random() * 1.5); if (l) l.o = parentOf(a.zone); }
    g.stat(S.stat);
    g.levels.addXP(XP.chopTree);
    g.fx.burst(a.x, 1.3, a.z, [0xffffff, 0xe3f2fd], 10, { speed: 2, up: 2.5, life: 0.5 });
    if (by?.isPlayer) { g.audio.play('produce', { vol: 0.6, pitch: 1.2 }); g.ui?.labels?.floater({ x: a.x, y: 2, z: a.z }, `+${S.per} ${ITEMS[S.item].name}`, 'xp'); g.haptic('light'); }
    return true;
  }

  update(dt) {
    const g = this.game; const p = g.player;
    this.feedT = (this.feedT || 0) - dt;
    for (const [id, Z] of this.zones) {
      if (!Z.feedPad) continue;
      const f = this.feed(id), cap = this.feedCap(id);
      Z.grain.scale.y = Math.max(0.05, Math.min(1, f / cap)); Z.grain.position.y = 0.21 + 0.15 * Z.grain.scale.y; Z.grain.visible = f >= 1;
      if (this.feedT <= 0 && Math.hypot(p.pos.x - Z.feedPad.x, p.pos.z - Z.feedPad.z) < 1.3) {
        if (this.buyFeed(id)) { g.audio.play('pickup', { vol: 0.35, pitch: 0.8 }); this.feedT = 0.12; }
        else if (f < cap && !this.feedMsgT) { g.bus.emit('toast', { text: 'Yem için para yetmiyor', type: 'error' }); this.feedMsgT = 3; }
      }
    }
    if (this.feedMsgT) this.feedMsgT = Math.max(0, this.feedMsgT - dt);
    for (const a of this.list) {
      const Z = this.zones.get(a.zone);
      if (!Z || !g.land.owns(a.zone)) continue;
      const R = Z.rect;
      if (SOURCES[a.type].item && !this.hungry(a.zone)) a.ready = Math.max(0, a.ready - dt); // aç hayvan üretmez
      // oyuncu sağması: yanında hareketsiz durursa
      let held = false;
      // oyuncu yanındayken kendiliğinden sağar (durmak gerekmez; diğer işlemler gibi otomatik)
      if (this.isReady(a) && Math.hypot(p.pos.x - a.x, p.pos.z - a.z) < COW.reach && (!a.claimedBy || a.claimedBy === p)) {
        held = true; this.milk(a, dt, p); // inek sağılırken yerinde durur
      } else if (a.claimedBy === p) { a.claimedBy = null; a.milkT = 0; }
      if (a.claimedBy && a.claimedBy !== p) held = true;
      if (a.pushT > 0) { a.pushT -= dt; if (a.claimedBy !== p) held = false; } // sıkıştığı yerden çıkıyor
      else if (this.isReady(a)) held = true; // sağılmaya hazır inek yerinde bekler
      // dolaşma
      let moving = false;
      if (!held && SOURCES[a.type].speed !== 0) {
        if (a.wait > 0) a.wait -= dt;
        else {
          const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
          if (d < 0.2) { a.wait = 1 + Math.random() * 4; this.pickTarget(a, R); }
          else {
            const sp = SOURCES[a.type].speed ?? 1.4;
            const nx = a.x + (dx / d) * sp * dt, nz = a.z + (dz / d) * sp * dt;
            // yemlik/ev gibi engellerin içine girmez (girerse işçi ulaşamaz, sağılamaz): yol kapalıysa yeni hedef seçer
            if (g.isFree(nx, nz, 0.7) || !g.isFree(a.x, a.z, 0.7)) { a.x = nx; a.z = nz; moving = true; } else this.pickTarget(a, R);
            const ty = Math.atan2(-dz, dx); // model +X yönüne bakar
            let dy = ty - a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
            a.yaw += dy * Math.min(1, dt * 4);
          }
        }
      }
      // tavuk yumurtlar
      if (a.type === 'hen') {
        a.lay -= dt;
        if (a.lay <= 0) {
          a.lay = HEN.layMin + Math.random() * (HEN.layMax - HEN.layMin);
          if (g.wood.countIn('egg', { x0: R.x0 - 2, x1: R.x1 + 2, z0: R.z0 - 6, z1: R.z1 + 2 }) < Math.max(HEN.groundMax, this.zoneCount(a.zone) * 1.5) && this.eat(a.zone)) {
            const egg = g.wood.spawnItem('egg', 'hen', a.x, a.z, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5); if (egg) egg.o = parentOf(a.zone);
            g.stat('eggsLaid');
          }
        }
      }
      // görsel
      a.phase += dt * (moving ? 7 : 0);
      const m = a.model;
      m.group.position.set(a.x, a.type === 'hen' && moving ? Math.abs(Math.sin(a.phase)) * 0.05 : 0, a.z);
      m.group.rotation.y = a.yaw;
      m.legs.forEach((l, i) => { l.rotation.z = moving ? Math.sin(a.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.45 : l.rotation.z * 0.8; });
      // hazır inek hafifçe kafa sallar
      if (a.type === 'cow' && this.isReady(a) && !moving) m.group.rotation.z = Math.sin(g.time * 3 + a.phase) * 0.03;
      // koyun: kırpılınca yün küçülür, hazır olunca tekrar kabarır
      if (m.wool) { const k = 1 - Math.min(1, a.ready / SOURCES.sheep.cooldown); m.wool.scale.setScalar(0.55 + 0.45 * k); m.wool.visible = k > 0.05; }
      // kovan: arılar döner (hazırken daha çok)
      if (m.bees) for (const b of m.bees.children) { const u = b.userData; u.a += dt * u.sp * (this.isReady(a) ? 1.6 : 0.7); b.position.set(Math.cos(u.a) * u.rad, u.h + Math.sin(u.a * 2) * 0.1, Math.sin(u.a) * u.rad); b.rotation.y = -u.a; }
    }
  }
}
