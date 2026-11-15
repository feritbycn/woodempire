import * as THREE from 'three';
import { makeCharacter, animateCharacter, SKINS } from '../world/Models.js';
import { Stack } from '../core/Buffer.js';
import { PLAYER_UPGRADES, playerCapacity, SPRINT, MAGNET, upgradeCost, XP } from '../config/balance.js';

const _v = new THREE.Vector3();

/** Oyuncu karakteri: hareket, kesme, toplama, taşıma, alan etkileşimleri */
/** Satın alma/geliştirme alanlarında seçenek kartı açılmadan önceki bekleme (sn) */
export const DWELL_T = 1;
const DWELL_MODES = new Set(['buy', 'build', 'hire', 'animal', 'upgrade']);

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.s = game.state.player;
    this.pos = new THREE.Vector3(this.s.x, 0, this.s.z);
    this.vel = new THREE.Vector3();
    this.yaw = this.s.yaw || 0;
    this.stack = new Stack(2);
    this.anim = { speed: 0, phase: 0, chop: -1, carrying: false, t: 0 };
    this.chopTarget = null;
    this.chopHeld = false;
    this.sprintT = 0; this.sprintCD = 0;
    this.magnetT = 0; this.magnetCD = 0;
    this.currentPad = null;
    this.promptPad = null;
    this.isPlayer = true;
    this.visible = true;
    this.radius = 0.45;
    this.maxVisual = 50;
    this.dustT = 0;
  }

  init() {
    this.buildModel();
    this.stack.load(this.s.stack);
    this.updateCapacity();
    this.game.inventory.register(this);
  }

  buildModel() {
    if (this.char) this.char.root.removeFromParent();
    const look = SKINS[this.s.skin] || SKINS.classic;
    this.char = makeCharacter(look, { axeColor: this.s.skin === 'golden' || this.s.skin === 'royal' ? 0xffd54f : 0xb0bec5 });
    this.char.root.position.copy(this.pos);
    this.game.scene.add(this.char.root);
    // seçim halkası
    if (!this.ring) {
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
      this.ring.rotation.x = -Math.PI / 2;
      this.game.scene.add(this.ring);
    }
  }
  setSkin(id) { this.s.skin = id; this.buildModel(); }

  // --- Yükseltme değerleri ---
  get up() { return this.s.up; }
  /**
   * Takılmaz hareket: önce istenen yön, olmazsa ±35°/±70°/±100° kayma denenir.
   * Engel itmesi karakteri yürünemez alana veya başka engelin içine sokarsa son geçerli konuma dönülür.
   * İtildiği halde ~0.6 sn ilerleyemezse en yakın boş noktaya çıkarılır.
   */
  moveWithSlide(dx, dz, spd, dt) {
    const g = this.game; const r = this.radius;
    const sx = this.pos.x, sz = this.pos.z;
    // başlangıçta zaten geçersiz bir yerdeyse (sınır dışı / engel içi) hemen kurtar
    if (!g.isFree(sx, sz, r * 0.9)) { const q = g.nearestFree(sx, sz, r); this.pos.x = q.x; this.pos.z = q.z; this.lastGood = { x: q.x, z: q.z }; return; }
    const step = spd * dt;
    // bir yönde denemeyi hesapla (uygulamadan): geçerliyse yeni konum döner
    const probe = (ax, az) => {
      const nx = this.pos.x + ax * step, nz = this.pos.z + az * step;
      if (!g.land.isWalkable(nx, nz)) return null;
      const p = { x: nx, z: nz };
      g.resolveCollision(p, r); g.resolveCollision(p, r);
      if (!g.isFree(p.x, p.z, r * 0.9)) return null;
      if (Math.hypot(p.x - sx, p.z - sz) < step * 0.25) return null;
      return p;
    };
    const fwd = (p) => (p.x - sx) * dx + (p.z - sz) * dz; // istenen yöne ilerleme
    let moved = false;
    const straight = probe(dx, dz);
    // düz yürüyüş ancak gerçekten istenen yöne ilerliyorsa sayılır (duvara sürtünme sayılmaz)
    if (straight && fwd(straight) >= step * 0.6) { this.pos.x = straight.x; this.pos.z = straight.z; moved = true; this.freeT = (this.freeT || 0) + dt; if (this.freeT > 0.4) this.slideSign = 0; }
    else {
      // duvar boyunca kayma: hedefe en çok yaklaştıran yan seçilir; iki yan eşitse son seçilen yönde devam (titreme olmaz)
      this.freeT = 0;
      let best = null, bs = -Infinity, bsign = 0;
      // bir yan seçildiyse engel bitene kadar o yanda kalınır (köşeyi dönerken hedeften uzaklaşmak gerekebilir)
      for (const a of [0.6, -0.6, 1.2, -1.2, 1.75, -1.75]) {
        const c = Math.cos(a), s = Math.sin(a);
        const p = probe(dx * c - dz * s, dx * s + dz * c); if (!p) continue;
        const sc = fwd(p) + (this.slideSign && Math.sign(a) === this.slideSign ? step * 10 : 0);
        if (sc > bs) { bs = sc; best = p; bsign = Math.sign(a); }
      }
      if (best) { this.pos.x = best.x; this.pos.z = best.z; moved = true; this.slideSign = bsign; }
    }
    if (moved) { this.lastGood = { x: this.pos.x, z: this.pos.z }; this.stuckT = 0; return; }
    this.stuckT = (this.stuckT || 0) + dt;
    if (this.stuckT > 0.6) {
      this.stuckT = 0;
      // duvara yürümek normaldir; yalnızca HİÇBİR yöne gidilemiyorsa (cebe sıkışma) en yakın açık alana çık
      let open = false;
      for (let i = 0; i < 12 && !open; i++) {
        const a = (i / 12) * Math.PI * 2, px = sx + Math.cos(a) * 0.5, pz = sz + Math.sin(a) * 0.5;
        if (g.isFree(px, pz, r * 0.9)) open = true;
      }
      if (!open) {
        for (let rad = 1; rad <= 6; rad += 0.5) {
          let found = null;
          for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, px = sx + Math.cos(a) * rad, pz = sz + Math.sin(a) * rad; if (g.isFree(px, pz, r)) { found = { x: px, z: pz }; break; } }
          if (found) { this.pos.x = found.x; this.pos.z = found.z; break; }
        }
      }
    }
  }

  moveSpeed() { return 5.0 * (1 + this.up.speed * 0.07) * (this.sprintT > 0 ? SPRINT.mul : 1) * (this.game.economy.boostActive('speed') ? 2 : 1); }
  chopInterval() { return 0.72 / (1 + this.up.chop * 0.09); }
  chopDamage() { return 1 + this.up.power * 0.5; }
  transferInterval() { return 0.16 / (1 + this.up.collect * 0.12); }
  collectRadius() { return (this.magnetT > 0 ? MAGNET.radius : 1.7 + this.up.collect * 0.08); }
  updateCapacity() {
    let cap = playerCapacity(this.up.capacity);
    if (this.game.economy.boostActive('carry')) cap += 10;
    if (this.game.state.purchases.premiumWorkerPack) cap += 2;
    this.stack.capacity = cap;
  }
  upgradeCost(key) { return upgradeCost(PLAYER_UPGRADES[key], this.up[key]); }
  upgrade(key) {
    const def = PLAYER_UPGRADES[key];
    if (this.up[key] >= def.max) return false;
    if (!this.game.economy.spend(this.upgradeCost(key), 'upgrade')) return false;
    this.up[key]++;
    this.updateCapacity();
    this.game.stat('upgradesPlayer'); this.game.stat('upgrades_player_' + key);
    this.game.levels.addXP(XP.upgrade);
    this.game.audio.play('upgrade');
    this.game.fx.burst(this.pos.x, 1.5, this.pos.z, [0xffd54f, 0xffffff, 0x69f0ae], 24, { speed: 3, up: 5 });
    this.game.bus.emit('upgrade', { target: 'player', key, level: this.up[key] });
    return true;
  }

  anchor() {
    this.char.stackAnchor.getWorldPosition(_v);
    return { x: _v.x, y: _v.y, z: _v.z };
  }

  sprint() {
    if (this.sprintCD > 0) return false;
    this.sprintT = SPRINT.dur; this.sprintCD = SPRINT.cooldown;
    this.game.audio.play('whoosh');
    return true;
  }
  magnet() {
    if (this.magnetCD > 0) return false;
    this.magnetT = MAGNET.dur; this.magnetCD = MAGNET.cooldown;
    this.game.audio.play('magnet');
    this.game.fx.burst(this.pos.x, 0.5, this.pos.z, [0x80d8ff, 0xffffff], 30, { speed: 7, up: 1, grav: 0, life: 0.5 });
    return true;
  }

  update(dt) {
    const g = this.game;
    this.anim.t += dt;
    this.sprintT = Math.max(0, this.sprintT - dt); this.sprintCD = Math.max(0, this.sprintCD - dt);
    this.magnetT = Math.max(0, this.magnetT - dt); this.magnetCD = Math.max(0, this.magnetCD - dt);
    if (g.economy.boostActive('magnet')) this.magnetT = Math.max(this.magnetT, 0.25); // Otomatik Toplama
    // Otomatik Kesim: yürürken bile yakındaki ağaçlara vurur
    if (g.economy.boostActive('autochop')) {
      this.autoChopT = (this.autoChopT || 0) - dt;
      if (this.autoChopT <= 0) {
        const t = g.trees.nearestStanding(this.pos.x, this.pos.z, 3.4);
        if (t) { g.trees.hit(t, this.chopDamage() * 1.5, this); this.autoChopT = this.chopInterval() * 0.6; g.fx.burst(t.x, 1.2, t.z, [0xffe082, 0xffffff], 6, { speed: 2, up: 2, life: 0.35 }); }
        else this.autoChopT = 0.15;
      }
    }
    if (Math.floor(g.time * 2) !== Math.floor((g.time - dt) * 2)) this.updateCapacity();

    // --- Hareket (kameraya göre) ---
    const mv = g.input.move;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const f = g.cameraRig.forward(), r = g.cameraRig.right();
    let dx = r.x * mv.x + f.x * mv.y, dz = r.z * mv.x + f.z * mv.y;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.001) { dx /= dl; dz /= dl; }
    const spd = this.moveSpeed() * (mag < 0.15 ? 0 : mag < 0.6 ? 0.55 : 1);
    this.vel.set(dx * spd, 0, dz * spd);
    if (spd > 0) {
      this.chopTarget = null;
      this.anim.chop = -1;
      this.moveWithSlide(dx, dz, spd, dt);
      const ty = Math.atan2(dx, dz);
      let dy = ty - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 14);
      this.anim.phase += dt * spd * 1.9;
      // koşarken toz
      this.dustT -= dt;
      if (spd > 6 && this.dustT <= 0) { this.dustT = 0.12; g.fx.burst(this.pos.x, 0.1, this.pos.z, 0xd7ccc8, 2, { speed: 0.6, up: 0.8, size: 0.18, life: 0.45, grav: 0 }); }
      if (Math.floor(this.anim.phase / Math.PI) !== Math.floor((this.anim.phase - dt * spd * 1.9) / Math.PI)) g.audio.play('step', { vol: 0.12, pitch: 0.9 + Math.random() * 0.2 });
    }
    this.anim.speed += ((spd > 0 ? Math.min(1.25, spd / 5) : 0) - this.anim.speed) * Math.min(1, dt * 10);

    // --- Ağaç kesme ---
    if (spd === 0) {
      const tree = g.trees.nearestStanding(this.pos.x, this.pos.z, 2.3);
      const wantChop = !!tree; // kesme her zaman otomatik (ağacın yanında dur)
      if (wantChop) {
        if (this.chopTarget !== tree) { this.chopTarget = tree; this.anim.chop = 0; }
        const ty = Math.atan2(tree.x - this.pos.x, tree.z - this.pos.z);
        let dy = ty - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * Math.min(1, dt * 12);
        const before = this.anim.chop;
        this.anim.chop += dt / this.chopInterval();
        if (before < 0.65 && this.anim.chop >= 0.65) g.trees.hit(tree, this.chopDamage(), this);
        if (this.anim.chop >= 1) this.anim.chop = 0;
      } else { this.chopTarget = null; this.anim.chop = -1; }
    }

    // --- Alanlar (bırak / al / satın al / inşa et) ---
    const pad = g.padAt(this.pos.x, this.pos.z);
    if (pad !== this.currentPad) { this.currentPad = pad; this.rawHinted = false; if (pad) pad.enterT = g.time; }
    // alma noktaları (mode 'out'): oyuncu ürünü almak için noktada 1 sn bekler (işçiler beklemez)
    const takeOk = pad && pad.mode === 'out' && this.dwellPad === pad && this.dwellDone;
    if (pad && (pad.mode === 'in' || takeOk)) {
      // bırakma hareket ederken de yapılır (akıcı oynanış)
      g.inventory.transfer(this, pad, dt);
      // ham ürünle kamyon rampasına gelindiyse yol göster (bir kez, rampaya her girişte)
      if (pad.type === 'sell' && !this.rawHinted && this.stack.items.some((i) => !pad.buffer.acceptsKind(i.kind))) {
        this.rawHinted = true;
        g.bus.emit('toast', { text: 'Ham ürün kamyona gitmez! Önce depoya, sonra makineye götür.', type: 'error' });
      }
    }
    // Satın alma / işçi / hayvan / geliştirme alanları: hemen para çekilmez.
    // Alanın üzerinde DWELL_T saniye kalınca (dolum halkası) seçenek kartı açılır; para yalnızca düğmeye basınca harcanır.
    const dPad = pad && (DWELL_MODES.has(pad.mode) || pad.mode === 'out') ? pad : null;
    if (dPad !== this.dwellPad) {
      if (this.dwellPad && this.dwellDone && this.dwellPad.mode !== 'out') { if (this.dwellPad.mode === 'upgrade') g.bus.emit('upgradePad', null); else g.bus.emit('prompt', null); }
      this.dwellPad = dPad; this.dwellT = 0; this.dwellDone = false;
    }
    // alma noktasında alınacak bir şey yoksa (boş / sırt dolu) sayaç ilerlemez
    // ...ve oyuncu noktanın üzerinde DURMALI: koşarak geçerken alınmaz (sayaç sıfırlanır)
    const moving = this.vel && Math.hypot(this.vel.x, this.vel.z) > 1.2;
    if (dPad && dPad.mode === 'out' && moving && !this.dwellDone) this.dwellT = 0;
    const idleTake = dPad && dPad.mode === 'out' && (this.stack.isFull() || dPad.buffer.count === 0 || moving);
    if (dPad && !this.dwellDone && !idleTake) {
      this.dwellT += dt;
      if (this.dwellT >= DWELL_T) {
        this.dwellDone = true;
        g.audio.play('click', { vol: 0.5, pitch: 1.3 });
        if (dPad.mode === 'out') { /* artık alınabilir */ }
        else if (dPad.mode === 'upgrade') g.bus.emit('upgradePad', dPad.station); else g.bus.emit('prompt', dPad);
      }
    }

    // --- Model ---
    this.anim.carrying = this.stack.count > 0;
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;
    animateCharacter(this.char, this.anim, dt);
    this.ring.position.set(this.pos.x, 0.04, this.pos.z);
    this.ring.material.opacity = 0.35 + Math.sin(g.time * 4) * 0.15;

    this.s.x = this.pos.x; this.s.z = this.pos.z; this.s.yaw = this.yaw;
  }

  serialize() { this.s.stack = this.stack.serialize(); }
}
