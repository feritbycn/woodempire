import * as THREE from 'three';
import { Stack } from '../core/Buffer.js';

/**
 * İşçi ve forkliftlerin ortak hareket/taşıma davranışı.
 * Düz çizgide yürür, engellerden kayar, takılırsa yan adım atar.
 */
export class Agent {
  constructor(game, x, z) {
    this.game = game;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.stack = new Stack(3);
    this.visible = true;
    this.isPlayer = false;
    this.radius = 0.45;
    this.stuckT = 0; this.detourT = 0; this.detourDir = 1; this.lastPos = new THREE.Vector2(x, z);
    this.bubble = null; this.bubbleT = 0;
  }

  /** Hedefe ilerle; varınca true */
  moveTo(tx, tz, speed, dt, arrive = 0.4) {
    const g = this.game;
    let dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < arrive) { this.vel.set(0, 0, 0); return true; }
    dx /= d; dz /= d;
    if (this.detourT > 0) {
      this.detourT -= dt;
      const px = -dz * this.detourDir, pz = dx * this.detourDir;
      dx = dx * 0.3 + px; dz = dz * 0.3 + pz; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    }
    const step = Math.min(d, speed * dt);
    // engel kayması (oyuncuyla aynı mantık): düz gidemiyorsa hedefe en çok yaklaştıran yana kay,
    // seçilen yanda engel bitene kadar kal (duvarın önünde sağa sola gidip gelme olmaz)
    const sx = this.pos.x, sz = this.pos.z, r = this.radius;
    const probe = (ax, az) => {
      const p = { x: sx + ax * step, z: sz + az * step };
      if (!g.land.isWalkable(p.x, p.z)) return null;
      g.resolveCollision(p, r); g.resolveCollision(p, r);
      if (Math.hypot(p.x - sx, p.z - sz) < step * 0.25) return null;
      return p;
    };
    const fwd = (p) => (p.x - sx) * dx + (p.z - sz) * dz;
    const straight = probe(dx, dz);
    if (straight && fwd(straight) >= step * 0.6) { this.pos.x = straight.x; this.pos.z = straight.z; this.freeT = (this.freeT || 0) + dt; if (this.freeT > 0.4) this.slideSign = 0; }
    else {
      this.freeT = 0;
      let best = null, bs = -Infinity, bsign = 0;
      for (const a of [0.6, -0.6, 1.2, -1.2, 1.75, -1.75]) {
        const c = Math.cos(a), sn = Math.sin(a);
        const p = probe(dx * c - dz * sn, dx * sn + dz * c); if (!p) continue;
        const sc = fwd(p) + (this.slideSign && Math.sign(a) === this.slideSign ? step * 10 : 0);
        if (sc > bs) { bs = sc; best = p; bsign = Math.sign(a); }
      }
      if (best) { this.pos.x = best.x; this.pos.z = best.z; this.slideSign = bsign; }
      else { const nx = sx + dx * step, nz = sz + dz * step; if (g.land.isWalkable(nx, nz)) { this.pos.x = nx; this.pos.z = nz; } g.resolveCollision(this.pos, r); }
    }
    this.vel.set(dx * speed, 0, dz * speed);
    const ty = Math.atan2(dx, dz);
    let dy = ty - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 10);
    // takılma tespiti
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      const moved = this.lastPos.distanceTo(new THREE.Vector2(this.pos.x, this.pos.z));
      if (moved < speed * 0.8 * 0.25 && this.detourT <= 0) { this.detourT = 0.9; this.detourDir = Math.random() < 0.5 ? -1 : 1; }
      this.lastPos.set(this.pos.x, this.pos.z); this.stuckT = 0;
    }
    return false;
  }

  say(text, t = 2) { this.bubble = text; this.bubbleT = t; }
  tickBubble(dt) { if (this.bubbleT > 0) { this.bubbleT -= dt; if (this.bubbleT <= 0) this.bubble = null; } }
}

/** İstasyon pad'lerini bulma yardımcıları */
export function inPadOf(st) { return st.inPad || st.dropPad || st.pad || null; }
export function outPadOf(st) { return st.outPad || st.takePad || null; }
export function inBufOf(st) { return st.inBuf || st.buffer || st.staging || null; }
export function outBufOf(st) { return st.outBuf || (st.type === 'depot' ? st.buffer : null); }
