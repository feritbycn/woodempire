import { XP } from '../config/balance.js';

/**
 * Yerdeki kütükler: basit fizik (yerçekimi, sekme, sürtünme, yuvarlanma),
 * oyuncu yaklaşınca otomatik toplama, mıknatıs yeteneği, işçi toplama API'si.
 */
export class WoodCollectionSystem {
  constructor(game) {
    this.game = game;
    this.logs = [];
    this.pickCD = 0;
    this.max = 400;
    game.every(1.0, () => this.persist());
  }

  spawn(wood, x, y, z, vx = 0, vy = 0, vz = 0, yaw = Math.random() * 6, kind = 'log') {
    if (this.logs.length >= this.max) this.logs.shift();
    const log = { kind, wood, x, y, z, vx, vy, vz, yaw, roll: 0, settled: false, age: 0, claimedBy: null };
    this.logs.push(log);
    return log;
  }

  /** Çiftlik ürünü yere bırak (süt kovası, yumurta sepeti) */
  spawnItem(kind, wood, x, z, vx = 0, vz = 0) { return this.spawn(wood, x, 0.6, z, vx, 2.5, vz, Math.random() * 6, kind); }
  countIn(kind, R) { let n = 0; for (const l of this.logs) if (l.kind === kind && l.x > R.x0 && l.x < R.x1 && l.z > R.z0 && l.z < R.z1) n++; return n; }

  restore() {
    for (const [wood, x, z, kind] of this.game.state.ground || []) {
      const l = this.spawn(wood, x, 0.18, z, 0, 0, 0, Math.random() * 6, kind || 'log'); l.settled = true;
    }
  }
  persist() { this.game.state.ground = this.logs.filter((l) => l.settled).slice(-200).map((l) => (l.kind === 'log' ? [l.wood, +l.x.toFixed(2), +l.z.toFixed(2)] : [l.wood, +l.x.toFixed(2), +l.z.toFixed(2), l.kind])); }

  nearest(x, z, maxD, carrier = null, kind = null) {
    let best = null, bd = maxD;
    for (const l of this.logs) {
      if (l.age < 0.35) continue;
      if (kind && l.kind !== kind) continue;
      if (l.claimedBy && l.claimedBy !== carrier) continue;
      const d = Math.hypot(l.x - x, l.z - z);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  /** Kütüğü bir taşıyıcıya ver */
  take(log, carrier) {
    const i = this.logs.indexOf(log);
    if (i < 0) return false;
    const it = { kind: log.kind, wood: log.wood }; if (log.o != null) it.o = log.o; // hayvan ürünü: hangi çiftlikte toplandığı
    if (!this.game.inventory.pickFromGround(carrier, it, { x: log.x, y: log.y, z: log.z })) return false;
    this.logs.splice(i, 1);
    if (log.kind === 'log') this.game.stat('logsCollected'); else this.game.stat('collected_' + log.kind);
    this.game.levels.addXP(XP.collectLog);
    if (carrier.isPlayer) { this.game.audio.play('pickup', { pitch: 1 + Math.random() * 0.3, vol: 0.55 }); this.game.haptic('light'); }
    return true;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    for (const l of this.logs) {
      l.age += dt;
      if (!l.settled) {
        l.vy -= 18 * dt;
        l.x += l.vx * dt; l.y += l.vy * dt; l.z += l.vz * dt;
        if (l.kind === 'log') l.roll += (Math.abs(l.vx) + Math.abs(l.vz)) * dt * 3;
        if (l.y < 0.18) {
          l.y = 0.18;
          if (Math.abs(l.vy) > 1.5) { l.vy *= -0.32; g.audio.play('woodDrop', { vol: 0.25, pitch: 0.8 + Math.random() * 0.4 }); }
          else l.vy = 0;
          l.vx *= 0.6; l.vz *= 0.6;
          if (Math.abs(l.vx) + Math.abs(l.vz) < 0.15 && l.vy === 0) {
            l.settled = true;
            if (!g.land.isWalkable(l.x, l.z)) { const q = g.land.nearestWalkable(l.x, l.z); l.x = q.x; l.z = q.z; }
            // Ağaç gövdesi / kaya / bina içine düşen kütüğü engelin dışına it — her kütük erişilebilir olmalı
            for (let k = 0; k < 3; k++) g.resolveCollision(l, 0.6);
            if (!g.land.isWalkable(l.x, l.z)) { const q = g.land.nearestWalkable(l.x, l.z); l.x = q.x; l.z = q.z; }
          }
        }
      }
    }
    // Oyuncu otomatik toplama
    this.pickCD -= dt;
    const radius = p.collectRadius();
    if (p.magnetT > 0) {
      for (const l of this.logs) {
        if (l.claimedBy) continue;
        const dx = p.pos.x - l.x, dz = p.pos.z - l.z, d = Math.hypot(dx, dz);
        if (d < radius && d > 0.5 && !p.stack.isFull()) { l.x += (dx / d) * dt * 9; l.z += (dz / d) * dt * 9; l.settled = true; }
      }
    }
    if (this.pickCD <= 0 && !p.stack.isFull()) {
      const pickR = p.magnetT > 0 ? 1.2 : radius;
      const l = this.nearest(p.pos.x, p.pos.z, pickR, p);
      if (l) { this.take(l, p); this.pickCD = Math.max(0.05, p.transferInterval() * 0.6); }
    }
  }

  renderItems(R) {
    for (const l of this.logs) { if (l.kind === 'log') R.add('log', l.wood, l.x, l.y, l.z, l.yaw, l.roll, 0); else R.add(l.kind, l.wood, l.x, l.y + 0.1, l.z, l.yaw, 0, 0); }
  }
}
