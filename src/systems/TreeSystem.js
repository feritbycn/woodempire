import * as THREE from 'three';
import { WOODS, XP } from '../config/balance.js';
import { treeGeometry, treeLodGeometry, stumpGeometry, rng } from '../world/Models.js';
import { leafMat, vcMat } from '../world/Materials.js';
import { ROAD, parentOf } from '../config/zones.js';

const VARIANTS = 2;
const LOD_DIST = 58;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Ağaçlar: tür başına InstancedMesh (yakın: detaylı, uzak: LOD).
 * Kesme → sallanma + talaş → devrilme (hızlanan dönüş) → kütüklere ayrılma → kök → yeniden büyüme.
 */
export class TreeSystem {
  constructor(game) {
    this.game = game;
    this.trees = [];
    this.byKey = new Map();
    this.meshes = {};   // "zone_type_variant" -> InstancedMesh (bölge bazlı: görünmeyen ormanlar çizilmez)
    this.lods = {};     // "zone_type" -> InstancedMesh (uzak LOD)
    this.stumpMeshes = {}; // zone -> InstancedMesh
    this.lodTimer = 0;
    this.sparkleT = 0;
    game.every(1.0, () => this.persist());
  }

  /** Bir bölgenin ağaçlarını oluştur (kilitli bölgelerde de görünür, ancak kesilemez) */
  createZoneTrees(zone) {
    const saved = this.game.state.trees;
    const specs = [];
    let idx = 0;
    for (const f of zone.forests) {
      const r = rng(zone.id * 1000 + 17);
      const types = Object.entries(f.mix);
      const total = types.reduce((a, [, w]) => a + w, 0);
      for (let x = f.x0; x <= f.x1; x += f.spacing) {
        for (let z = f.z0; z <= f.z1; z += f.spacing) {
          const jx = x + (r() - 0.5) * f.spacing * 0.7, jz = z + (r() - 0.5) * f.spacing * 0.7;
          let pick = r() * total, type = types[0][0];
          for (const [t, w] of types) { if ((pick -= w) <= 0) { type = t; break; } }
          const variant = Math.floor(r() * VARIANTS);
          const scale = 0.85 + r() * 0.35;
          const rot = r() * Math.PI * 2;
          const skip = r() < 0.08;
          if (skip || this.blocked(zone, jx, jz)) continue;
          specs.push({ key: `${zone.id}_${idx++}`, type, variant, x: jx, z: jz, scale, rot, zoneId: zone.id });
        }
      }
    }
    if (!specs.length) return;
    // bölge için tam boyutlu instanced mesh'ler
    const count = {};
    for (const t of specs) { const k = `${zone.id}_${t.type}_${t.variant}`; count[k] = (count[k] || 0) + 1; const l = `${zone.id}_${t.type}`; count[l] = (count[l] || 0) + 1; }
    const scene = this.game.scene;
    for (const [k, n] of Object.entries(count)) {
      const parts = k.split('_');
      const isLod = parts.length === 2;
      const im = new THREE.InstancedMesh(isLod ? treeLodGeometry(parts[1]) : treeGeometry(parts[1], +parts[2]), leafMat, n);
      im.count = 0; im.castShadow = !isLod; im.receiveShadow = !isLod;
      scene.add(im);
      (isLod ? this.lods : this.meshes)[k] = im;
    }
    const st = new THREE.InstancedMesh(stumpGeometry(), vcMat, specs.length);
    st.count = 0; st.castShadow = true; st.receiveShadow = true; scene.add(st);
    this.stumpMeshes[zone.id] = st;
    for (const t of specs) this.addTree(t, saved[t.key]);
    // sınır küresi (bölge dikdörtgeni): kamera görüş alanı dışındaki ormanlar hiç çizilmez
    const R = zone.rect;
    const sphere = new THREE.Sphere(new THREE.Vector3((R.x0 + R.x1) / 2, 3, (R.z0 + R.z1) / 2), Math.hypot(R.x1 - R.x0, R.z1 - R.z0) / 2 + 6);
    const all = [...Object.entries(this.meshes), ...Object.entries(this.lods)].filter(([k]) => k.startsWith(zone.id + '_')).map(([, m]) => m);
    for (const m of [...all, st]) { m.boundingSphere = sphere.clone(); m.frustumCulled = true; }
    // gerçek durumları yaz
    for (const t of specs) this.writeMatrix(this.byKey.get(t.key));
  }
  blocked(zone, x, z) {
    for (const site of zone.sites) { if (Math.hypot(site.x - x, site.z - z) < 7.5) return true; if (site.stock && Math.hypot(site.stock.x - x, site.stock.z - z) < 6) return true; }
    if (zone.pad && Math.hypot(zone.pad.x - x, zone.pad.z - z) < 3.5) return true;
    for (const p of zone.decor.ponds) if (Math.hypot(p.x - x, p.z - z) < p.r + 1.5) return true;
    if (x > ROAD.x - ROAD.width / 2 - 2 && x < ROAD.x + ROAD.width / 2 + 2) return true;
    if (Math.abs(x - 4) < 2.2) return true;
    return false;
  }

  addTree(t, savedRegrow) {
    const W = WOODS[t.type];
    t.hp = t.maxHp = W.hp;
    t.state = 'stand'; t.t = 0; t.shake = 0;
    t.vkey = t.type;
    const im = this.meshes[`${t.zoneId}_${t.type}_${t.variant}`];
    t.im = im; t.slot = im.count++;
    const lod = this.lods[`${t.zoneId}_${t.type}`];
    t.lod = lod; t.lodSlot = lod.count++;
    t.stumps = this.stumpMeshes[t.zoneId];
    t.stumpSlot = t.stumps.count++;
    t.far = false;
    t.obstacle = { x: t.x, z: t.z, r: 0.42 * t.scale };
    this.game.obstacles.push(t.obstacle);
    if (savedRegrow !== undefined && savedRegrow > 0) {
      t.state = 'stump'; t.t = savedRegrow;
      t.obstacle.r = 0.3; t.obstacle.disabled = true; // kökün içinden geçilebilir
    }
    this.trees.push(t); this.byKey.set(t.key, t);
  }

  writeMatrix(t, fallQ = null, sink = 0, growScale = 1) {
    const im = t.im, lod = t.lod;
    const visible = t.state === 'stand' || t.state === 'fall' || t.state === 'grow';
    if (visible) {
      _q.setFromAxisAngle(_up, t.rot);
      if (fallQ) _q.premultiply(fallQ);
      // sallanma
      if (t.shake > 0) { _q2.setFromAxisAngle(_ax.set(1, 0, 0.5).normalize(), Math.sin(t.shake * 40) * 0.05 * t.shake); _q.premultiply(_q2); }
      const sc = t.scale * growScale;
      _m.compose(_p.set(t.x, -sink, t.z), _q, _s.set(sc, sc, sc));
      if (t.far && t.state === 'stand') { lod.setMatrixAt(t.lodSlot, _m); im.setMatrixAt(t.slot, ZERO); }
      else { im.setMatrixAt(t.slot, _m); lod.setMatrixAt(t.lodSlot, ZERO); }
    } else { im.setMatrixAt(t.slot, ZERO); lod.setMatrixAt(t.lodSlot, ZERO); }
    const stumpVisible = t.state === 'stump' || (t.state === 'fall' && t.t > 0.2);
    if (stumpVisible) t.stumps.setMatrixAt(t.stumpSlot, _m.compose(_p.set(t.x, 0, t.z), _q.setFromAxisAngle(_up, t.rot), _s.set(t.scale, t.scale, t.scale)));
    else t.stumps.setMatrixAt(t.stumpSlot, ZERO);
    im.instanceMatrix.needsUpdate = true; lod.instanceMatrix.needsUpdate = true; t.stumps.instanceMatrix.needsUpdate = true;
  }

  isChoppable(t) { return t.state === 'stand' && this.game.land.owns(t.zoneId); }

  nearestStanding(x, z, maxD, exclude = null) {
    let best = null, bd = Infinity;
    for (const t of this.trees) {
      if (!this.isChoppable(t) || t === exclude) continue;
      const d = Math.hypot(t.x - x, t.z - z) - t.obstacle.r;
      if (d < maxD && d < bd) { bd = d; best = t; }
    }
    return best;
  }
  /** İşçiler için: bölgedeki, başkası tarafından hedeflenmemiş en yakın ağaç */
  findForWorker(x, z, zoneId, worker) {
    let best = null, bd = Infinity;
    // başka oduncuların çalıştığı yerlere yığılmasın: dolu bölgeler cezalı, boş bölgeler tercih edilir
    const busy = this.trees.filter((t) => t.claimedBy && t.claimedBy !== worker);
    for (const t of this.trees) {
      if (!this.isChoppable(t)) continue;
      if (zoneId !== undefined && zoneId !== null) { if (parentOf(t.zoneId) !== zoneId) continue; } // tesis oduncusu: ana tesis + genişletmeleri
      else if (t.zoneId >= 10) continue; // ana alan oduncusu tesis ormanlarına gitmez
      if (t.claimedBy && t.claimedBy !== worker) continue;
      let d = Math.hypot(t.x - x, t.z - z);
      for (const b of busy) { const bdist = Math.hypot(b.x - t.x, b.z - t.z); if (bdist < 7) d += (7 - bdist) * 2.2; }
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  hit(t, dmg, by) {
    if (t.state !== 'stand') return;
    const g = this.game;
    t.hp -= dmg;
    t.shake = 1;
    const W = WOODS[t.type];
    g.fx.chips(t.x, 0.9, t.z, W.color);
    if (by?.isPlayer || Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z) < 18) g.audio.play('chop', { pitch: 0.85 + Math.random() * 0.3, vol: by?.isPlayer ? 0.8 : 0.3 });
    if (by?.isPlayer) g.haptic('light');
    g.bus.emit('treeHit', { tree: t, by });
    if (t.hp <= 0) this.fell(t, by);
  }

  fell(t, by) {
    const g = this.game;
    t.state = 'fall'; t.t = 0;
    let dx = t.x - (by?.pos?.x ?? t.x - 1), dz = t.z - (by?.pos?.z ?? t.z);
    const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    // devrilme yönüne küçük rastgelelik
    const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.6;
    t.fallDir = { x: Math.sin(a), z: Math.cos(a) };
    t.obstacle.r = 0.3; t.obstacle.disabled = true; // devrilen ağacın kökü engel olmaz
    t.claimedBy = null;
    g.audio.play('creak', { vol: by?.isPlayer ? 0.7 : 0.25 });
    g.stat('treesFelled'); g.stat('treesFelled_' + t.type);
    if (by?.isPlayer) g.stat('treesFelledByPlayer');
    g.levels.addXP(XP.chopTree * WOODS[t.type].xp / 2, { x: t.x, y: 3, z: t.z });
    g.economy.addMoney(Math.max(1, Math.round(WOODS[t.type].mul)), 'chop', { x: t.x, y: 2.5, z: t.z });
    g.bus.emit('treeFelled', { tree: t, by });
  }

  update(dt) {
    const g = this.game;
    this.lodTimer -= dt;
    const doLod = this.lodTimer <= 0;
    if (doLod) this.lodTimer = 0.5;
    const ct = g.cameraRig.target;
    this.sparkleT -= dt;
    const sparkle = this.sparkleT <= 0; if (sparkle) this.sparkleT = 0.25;
    for (const t of this.trees) {
      if (doLod && t.state === 'stand') {
        const far = Math.hypot(t.x - ct.x, t.z - ct.z) > LOD_DIST * (g.cameraRig.dist / 33) * (g.state.settings.quality === 'low' ? 0.65 : g.state.settings.quality === 'high' ? 1.3 : 1);
        if (far !== t.far) { t.far = far; this.writeMatrix(t); }
      }
      if (t.shake > 0 && t.state === 'stand') { t.shake = Math.max(0, t.shake - dt * 3); this.writeMatrix(t); }
      if (sparkle && t.type === 'rare' && t.state === 'stand' && !t.far && Math.random() < 0.3) g.fx.sparkle(t.x + (Math.random() - 0.5) * 2, 2.5 + Math.random() * 1.5, t.z + (Math.random() - 0.5) * 2);
      if (t.state === 'fall') {
        t.t += dt;
        const T = 0.95;
        let ang;
        if (t.t < T) ang = Math.pow(t.t / T, 2.2) * (Math.PI / 2 - 0.05);
        else ang = Math.PI / 2 - 0.05 + Math.sin(Math.min(1, (t.t - T) / 0.3) * Math.PI) * -0.08;
        _ax.set(t.fallDir.z, 0, -t.fallDir.x).normalize();
        const fq = new THREE.Quaternion().setFromAxisAngle(_ax, ang);
        const sink = t.t > T + 0.45 ? (t.t - T - 0.45) * 2.2 : 0;
        if (t.t >= T && !t.landed) {
          t.landed = true;
          const W = WOODS[t.type];
          g.audio.play('thud', { vol: Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z) < 15 ? 0.9 : 0.3 });
          if (Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z) < 12) g.cameraRig.shake = 0.18;
          const tipX = t.x + t.fallDir.x * 3 * t.scale, tipZ = t.z + t.fallDir.z * 3 * t.scale;
          g.fx.leaves(tipX, 1, tipZ, W.leaf);
          g.fx.dust(t.x + t.fallDir.x * 2, t.z + t.fallDir.z * 2);
          // ağaç taşınabilir kütüklere ayrılır
          for (let i = 0; i < W.logs; i++) {
            const k = 0.9 + i * (2.8 * t.scale / W.logs);
            g.wood.spawn(t.type, t.x + t.fallDir.x * k, 0.6, t.z + t.fallDir.z * k,
              (Math.random() - 0.5) * 2.4 + t.fallDir.x * 0.8, 3 + Math.random() * 2, (Math.random() - 0.5) * 2.4 + t.fallDir.z * 0.8,
              Math.atan2(t.fallDir.x, t.fallDir.z) + Math.PI / 2 + (Math.random() - 0.5) * 0.5);
          }
        }
        if (t.t > T + 1.1) {
          t.state = 'stump'; t.t = WOODS[t.type].regrow; t.landed = false; t.hp = t.maxHp;
          this.writeMatrix(t);
        } else this.writeMatrix(t, fq, sink);
      } else if (t.state === 'stump') {
        // yeniden büyüme yalnızca sahip olunan bölgelerde ilerler
        t.t -= dt;
        if (t.t <= 0) {
          // oyuncu üzerindeyse bekle
          const pd = Math.hypot(t.x - g.player.pos.x, t.z - g.player.pos.z);
          if (pd > 1.5) { t.state = 'grow'; t.t = 0; }
        }
      } else if (t.state === 'grow') {
        t.t += dt;
        const k = Math.min(1, t.t / 2.2);
        const e = 1 - Math.pow(1 - k, 3);
        this.writeMatrix(t, null, 0, 0.12 + e * 0.88 + Math.sin(k * Math.PI) * 0.06);
        if (k >= 1) { t.state = 'stand'; t.obstacle.r = 0.42 * t.scale; t.obstacle.disabled = false; t.hp = t.maxHp; this.writeMatrix(t); }
      }
    }
  }

  /** Kesilmiş ağaçların kalan büyüme süresini kayda yaz */
  persist() {
    const out = {};
    for (const t of this.trees) {
      if (t.state === 'stump') out[t.key] = Math.max(1, Math.round(t.t));
      else if (t.state === 'fall') out[t.key] = WOODS[t.type].regrow;
    }
    this.game.state.trees = out;
  }

  countStanding(zoneId) { return this.trees.filter((t) => t.zoneId === zoneId && t.state === 'stand').length; }
}
