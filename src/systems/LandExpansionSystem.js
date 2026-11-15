import * as THREE from 'three';
import { ZONES, getZone } from '../config/zones.js';
import { XP } from '../config/balance.js';
import { lockTexture } from '../world/Textures.js';
import { fencePostGeometry } from '../world/Models.js';
import { vcMat } from '../world/Materials.js';
import { makePad } from './Stations.js';

/**
 * Arazi genişletme: bölgeler, yürünebilir alan, kilit örtüsü ve çitler,
 * satın alma noktaları, açılış animasyonu ve sonsuz prosedürel bölgeler.
 */
export class LandExpansionSystem {
  constructor(game) {
    this.game = game;
    this.zones = new Map();  // id -> { def, overlay, fence, pad }
    this.owned = new Set(game.state.zones);
    this.animating = [];
  }

  zoneDef(id) { return getZone(id); }
  owns(id) { return this.owned.has(id); }
  maxKnown() { return Math.max(ZONES.length - 1, ...this.owned) + 3; }

  init() {
    const upto = this.maxKnown();
    for (let id = 0; id <= upto; id++) this.ensureZone(id);
    this.game.storage.refreshCapacity();
    this.game.trucks.refreshValueMul();
    this.game.wood.restore();
    this.refreshPads();
  }

  ensureZone(id) {
    if (this.zones.has(id)) return;
    const def = getZone(id);
    const g = this.game;
    const rec = { def };
    this.zones.set(id, rec);
    g.world.buildZoneDecor(def);
    g.trees.createZoneTrees(def);
    if (this.owned.has(id)) { g.construction.setupZoneSites(def); g.animals.setupZone(def); this.refundOldExpansion(def); }
    else this.buildLock(rec);
  }

  /** Eski sürümde genişletmeye kurulmuş makine ve bantlar artık yok (genişletme yeni fabrika açmaz):
   *  parası bir kez iade edilir; yerine ana makine genişletme başına +%50 hızlanır */
  refundOldExpansion(def) {
    if (def.parent == null) return;
    const g = this.game; const p = `f${def.id}`; let back = 0;
    if (g.state.sites[`${p}_m`]?.built) { back += Math.round(def.cost * 0.3); delete g.state.sites[`${p}_m`]; }
    if (g.state.conveyors[`c_${p}_in`]) { back += Math.round(def.cost * 0.15); delete g.state.conveyors[`c_${p}_in`]; }
    if (g.state.conveyors[`c_${p}_out`]) { back += Math.round(def.cost * 0.3); delete g.state.conveyors[`c_${p}_out`]; }
    if (!back) return;
    g.state.money += back;
    setTimeout(() => g.bus.emit('toast', { text: `${def.name}: alan artık yeni makine kurmuyor — ${back.toLocaleString('tr-TR')} para iade edildi, ana makine hızlandı`, type: 'success' }), 1500);
    g.save?.requestSave?.();
  }

  buildLock(rec) {
    const g = this.game; const R = rec.def.rect;
    const w = R.x1 - R.x0, d = R.z1 - R.z0;
    const tex = lockTexture().clone(); tex.needsUpdate = true; tex.repeat.set(w / 4, d / 4);
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    overlay.rotation.x = -Math.PI / 2; overlay.position.set((R.x0 + R.x1) / 2, 0.08, (R.z0 + R.z1) / 2);
    overlay.renderOrder = 1;
    g.scene.add(overlay);
    // çit direkleri (çevre)
    const pts = [];
    const step = 3;
    for (let x = R.x0; x <= R.x1; x += step) pts.push([x, R.z0], [x, R.z1]);
    for (let z = R.z0 + step; z < R.z1; z += step) pts.push([R.x0, z], [R.x1, z]);
    const fence = new THREE.InstancedMesh(fencePostGeometry(), vcMat, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => fence.setMatrixAt(i, m4.makeTranslation(x, 0, z)));
    fence.castShadow = true;
    g.scene.add(fence);
    rec.overlay = overlay; rec.fence = fence; rec.fencePts = pts;
  }

  /** Satın alma noktalarını güncelle (yalnızca sahip olunan komşudan erişilebilir) */
  refreshPads() {
    for (const [id, rec] of this.zones) {
      if (this.owned.has(id)) { if (rec.pad) { this.game.removePad(rec.pad); rec.pad = null; } continue; }
      const def = rec.def;
      if (!def.pad) continue;
      const reachable = this.isWalkable(def.pad.x, def.pad.z);
      if (reachable && !rec.pad) {
        rec.pad = makePad(this.game, {
          x: def.pad.x, z: def.pad.z, mode: 'buy', type: 'buy', r: 1.6,
          label: () => ({ title: def.name, price: def.cost, level: def.level }),
          data: { zoneId: id },
        });
      }
    }
  }

  /** Bu arazi şu anda satın alınabilir mi? (durum + neden) */
  status(id) {
    const def = getZone(id);
    if (this.owned.has(id)) return { ok: false, owned: true };
    if (!def.pad || !this.isWalkable(def.pad.x, def.pad.z)) return { ok: false, reason: 'Önce komşu araziyi aç' };
    if (this.game.state.level < def.level) return { ok: false, reason: `Seviye ${def.level} gerekli` };
    if (this.game.state.money < def.cost) return { ok: false, reason: 'Yetersiz para', money: true };
    return { ok: true };
  }

  buy(id) {
    const g = this.game;
    const st = this.status(id);
    if (!st.ok) { g.bus.emit('toast', { text: st.reason || 'Satın alınamaz', type: 'error' }); g.audio.play('error'); return false; }
    const def = getZone(id);
    if (!g.economy.spend(def.cost, 'land')) return false;
    this.owned.add(id);
    g.state.zones.push(id);
    this.recomputeWalk();
    const rec = this.zones.get(id);
    // açılış animasyonu: örtü kaybolur, çitler yere gömülür
    if (rec.overlay) this.animating.push({ rec, t: 0 });
    g.construction.setupZoneSites(def);
    g.animals.setupZone(def);
    g.workers.setupZone(def);
    if (def.parent != null) { g.production.refreshExpansionBoost?.(); setTimeout(() => g.bus.emit('toast', { text: 'Alan büyüdü — makine %50 hızlandı, girişi büyüdü', type: 'success' }), 900); }
    const cx = (def.rect.x0 + def.rect.x1) / 2, cz = (def.rect.z0 + def.rect.z1) / 2;
    g.cameraRig.focus(cx, cz, 2.8);
    g.fx.confetti(def.pad.x, 3, def.pad.z, 90);
    g.audio.play('unlock');
    g.haptic('heavy');
    g.stat('landsOwned');
    g.levels.addXP(XP.buyLand * (1 + id * 0.5));
    // sonsuz ilerleme için yeni bölgeleri hazırla
    for (let k = 0; k <= this.maxKnown(); k++) this.ensureZone(k);
    this.refreshPads();
    g.storage.refreshCapacity();
    g.trucks.refreshValueMul();
    g.bus.emit('zoneBought', { id, def });
    g.bus.emit('banner', { title: def.parent != null ? 'ALAN GENİŞLEDİ!' : 'YENİ ARAZİ AÇILDI!', text: def.name + (def.desc ? ' — ' + def.desc : '') });
    g.save.requestSave(true);
    return true;
  }

  /** Yürünebilir dikdörtgenleri önbelleğe al (sahiplik değişince) */
  recomputeWalk() {
    const m = 0.6;
    this.walkRects = [...this.owned].map((id) => {
      const R = getZone(id).rect;
      return {
        x0: R.x0 + (this.hasNeighbor(id, 'w') ? 0 : m), x1: R.x1 - (this.hasNeighbor(id, 'e') ? 0 : m),
        z0: R.z0 + (this.hasNeighbor(id, 'n') ? 0 : m), z1: R.z1 - (this.hasNeighbor(id, 's') ? 0 : m),
      };
    });
  }
  isWalkable(x, z) {
    if (!this.walkRects) this.recomputeWalk();
    for (const R of this.walkRects) if (x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1) return true;
    return false;
  }
  /** Sahip olunan bitişik bölge var mı (sınırda takılmayı önler) */
  hasNeighbor(id, dir) {
    const R = getZone(id).rect;
    for (const o of this.owned) {
      if (o === id) continue;
      const Q = getZone(o).rect;
      if (dir === 'w' && Math.abs(Q.x1 - R.x0) < 0.01 && Q.z0 < R.z1 && Q.z1 > R.z0) return true;
      if (dir === 'e' && Math.abs(Q.x0 - R.x1) < 0.01 && Q.z0 < R.z1 && Q.z1 > R.z0) return true;
      if (dir === 'n' && Math.abs(Q.z1 - R.z0) < 0.01 && Q.x0 < R.x1 && Q.x1 > R.x0) return true;
      if (dir === 's' && Math.abs(Q.z0 - R.z1) < 0.01 && Q.x0 < R.x1 && Q.x1 > R.x0) return true;
    }
    return false;
  }
  nearestWalkable(x, z) {
    let best = { x: 4, z: 8 }, bd = Infinity;
    for (const id of this.owned) {
      const R = getZone(id).rect;
      const cx = Math.max(R.x0 + 1, Math.min(x, R.x1 - 1)), cz = Math.max(R.z0 + 1, Math.min(z, R.z1 - 1));
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) { bd = d; best = { x: cx, z: cz }; }
    }
    return best;
  }
  zoneAt(x, z) {
    for (const [id, rec] of this.zones) { const R = rec.def.rect; if (x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1) return id; }
    return -1;
  }

  /** Arazi menüsü için liste */
  list() {
    const out = [];
    for (let id = 0; id <= this.maxKnown(); id++) {
      const def = getZone(id);
      out.push({ id, def, owned: this.owned.has(id), status: this.status(id) });
    }
    return out;
  }

  update(dt) {
    for (let i = this.animating.length - 1; i >= 0; i--) {
      const a = this.animating[i];
      a.t += dt;
      const k = Math.min(1, a.t / 1.6);
      a.rec.overlay.material.opacity = 1 - k;
      const m4 = new THREE.Matrix4();
      a.rec.fencePts.forEach(([x, z], j) => {
        const kk = Math.max(0, Math.min(1, (a.t - (j % 12) * 0.04) / 1.0));
        a.rec.fence.setMatrixAt(j, m4.makeTranslation(x, -kk * 1.4, z));
      });
      a.rec.fence.instanceMatrix.needsUpdate = true;
      if (Math.random() < 0.5) {
        const [x, z] = a.rec.fencePts[(Math.random() * a.rec.fencePts.length) | 0];
        if (Math.hypot(x - this.game.player.pos.x, z - this.game.player.pos.z) < 40) this.game.fx.dust(x, z);
      }
      if (k >= 1) {
        a.rec.overlay.removeFromParent(); a.rec.fence.removeFromParent();
        a.rec.overlay = null; a.rec.fence = null;
        this.animating.splice(i, 1);
      }
    }
  }
}
