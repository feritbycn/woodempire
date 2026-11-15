import * as THREE from 'three';

/**
 * Görsel efektler: uçan ürünler (yay şeklinde), parçacıklar (talaş, yaprak, toz, konfeti, parıltı),
 * zemin halkaları. Parçacıklar tek InstancedMesh ile çizilir.
 */
const MAXP = 700;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class FX {
  constructor(game) {
    this.game = game;
    this.flying = [];
    this.parts = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.pMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }), MAXP);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.pMesh.setColorAt(0, _c.setHex(0xffffff));
    this.pMesh.count = 0;
    game.scene.add(this.pMesh);
    this.rings = [];
  }

  /** Ürünü A noktasından B noktasına yay çizerek uçur. onLand: varınca çağrılır */
  fly(item, from, to, dur = 0.28, onLand = null, arc = 1.4) {
    this.flying.push({ item, from: { ...from }, to: typeof to === 'function' ? to : { ...to }, t: 0, dur, onLand, arc, spin: Math.random() * 6 });
  }

  burst(x, y, z, color, n = 10, opts = {}) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAXP) this.parts.shift();
      const a = Math.random() * Math.PI * 2, sp = (opts.speed ?? 3) * (0.5 + Math.random());
      this.parts.push({
        x, y, z,
        vx: Math.cos(a) * sp, vy: (opts.up ?? 4) * (0.6 + Math.random() * 0.8), vz: Math.sin(a) * sp,
        life: (opts.life ?? 0.8) * (0.7 + Math.random() * 0.6), age: 0,
        size: (opts.size ?? 0.12) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color,
        rx: Math.random() * 6, ry: Math.random() * 6, grav: opts.grav ?? 14, float: opts.float ?? false,
      });
    }
  }
  chips(x, y, z, woodColor) { this.burst(x, y, z, [woodColor, 0xf7e3c0, 0xe0c090], 8, { speed: 2.5, up: 3.5, size: 0.1, life: 0.6 }); }
  leaves(x, y, z, leafColor) { this.burst(x, y, z, [leafColor, 0x66bb6a], 14, { speed: 2, up: 1.5, size: 0.16, life: 1.6, grav: 2 }); }
  dust(x, z) { this.burst(x, 0.2, z, [0xd7ccc8, 0xbcaaa4], 12, { speed: 3.5, up: 1.2, size: 0.25, life: 0.7, grav: 1 }); }
  confetti(x, y, z, n = 60) { this.burst(x, y, z, [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb], n, { speed: 6, up: 9, size: 0.18, life: 2.2, grav: 7 }); }
  sparkle(x, y, z) { this.burst(x, y, z, [0xfff59d, 0xffffff], 3, { speed: 0.4, up: 1.2, size: 0.08, life: 1.0, grav: 0 }); }

  update(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / f.dur;
      if (f.t >= 1) { this.flying.splice(i, 1); if (f.onLand) f.onLand(); }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      p.rx += dt * 5; p.ry += dt * 4;
    }
    let n = 0;
    for (const p of this.parts) {
      const s = p.size * (1 - Math.pow(p.age / p.life, 3));
      _m.compose(_v.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.rx, p.ry, 0)), _s.set(s, s, s));
      this.pMesh.setMatrixAt(n, _m);
      this.pMesh.setColorAt(n, _c.setHex(p.color));
      n++;
    }
    this.pMesh.count = n;
    this.pMesh.visible = n > 0;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
  }

  renderItems(R) {
    for (const f of this.flying) {
      const to = typeof f.to === 'function' ? f.to() : f.to;
      const t = Math.min(1, f.t);
      const e = t * t * (3 - 2 * t);
      const x = f.from.x + (to.x - f.from.x) * e;
      const z = f.from.z + (to.z - f.from.z) * e;
      const y = f.from.y + (to.y - f.from.y) * e + Math.sin(t * Math.PI) * f.arc;
      R.add(f.item.kind, f.item.wood, x, y, z, f.spin + t * 3, 0, 0, 1);
    }
  }
}
