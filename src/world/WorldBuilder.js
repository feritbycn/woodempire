import * as THREE from 'three';
import { ZONES, ROAD, MOUNTAINS, getZone, EXP_W } from '../config/zones.js';
/** genişletmelerin en batı sınırı (14 genişletme) */
const EXP_WEST = -20 - EXP_W * 14;
import { P, merge, mesh, rng, rockGeometry, bushGeometry, flowerGeometry, grassGeometry, mountainGeometry, treeLodGeometry } from './Models.js';
import { vcMat, leafMat, grassMat, mat } from './Materials.js';
import { roadTexture } from './Textures.js';

/** Statik dünya: zemin, yol, dağlar, göletler, dekor, çimen, sınır ormanı */
export class WorldBuilder {
  constructor(game) {
    this.game = game;
    this.waters = [];
    this.decorBuilt = new Set();
    this.grass = null;
  }

  build() {
    const s = this.game.scene;
    // --- Zemin (vertex renkli, dalgalı ton) ---
    // kuzeye ormanlar, güneye sonsuz tesisler uzanır
    // tesis şeritleri batıya doğru genişler (genişletmeler): zemin geniş tutulur
    const W = 1300, H = 1300, cz = 120;
    const g = new THREE.PlaneGeometry(W, H, 220, 320);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, cz);
    const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), a = new THREE.Color(0x6dbb4b), b = new THREE.Color(0x8fcf5a), d = new THREE.Color(0x5aa53f);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.5 + Math.sin(x * 0.031 + z * 0.047) * 0.5;
      c.copy(a).lerp(n > 0 ? b : d, Math.abs(n) * 0.8);
      // harita dışı biraz daha koyu
      const out = z <= 26 ? (x < -72 || x > 78) : z < 198 ? (x < EXP_WEST - 2 || x > 38) : true;
      if (out) c.multiplyScalar(0.86);
      // hafif tümsekler (yalnızca oynanabilir alan dışı)
      if (out) pos.setY(i, Math.max(0, Math.sin(x * 0.07) * Math.cos(z * 0.05)) * 2.5);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }));
    ground.receiveShadow = true;
    s.add(ground);
    this.ground = ground;

    // --- Yol ---
    const len = ROAD.zStart - ROAD.zEnd;
    const tex = roadTexture(); tex.repeat.set(1, len / 12);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD.width, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.position.set(ROAD.x, 0.03, (ROAD.zStart + ROAD.zEnd) / 2);
    road.receiveShadow = true; s.add(road);
    const curbs = [];
    for (const x of [ROAD.x - ROAD.width / 2 - 0.25, ROAD.x + ROAD.width / 2 + 0.25]) curbs.push(P(new THREE.BoxGeometry(0.5, 0.15, len), 0xd7ccc8, x, 0.07, (ROAD.zStart + ROAD.zEnd) / 2));
    // sokak lambaları
    for (let z = 20; z > ROAD.zEnd + 20; z -= 26) {
      const x = ROAD.x + ROAD.width / 2 + 0.9;
      curbs.push(P(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), 0x546e7a, x, 2, z));
      curbs.push(P(new THREE.BoxGeometry(1.0, 0.12, 0.25), 0x546e7a, x - 0.45, 4, z));
      curbs.push(P(new THREE.BoxGeometry(0.35, 0.12, 0.3), 0xfff9c4, x - 0.85, 3.92, z));
    }
    const curbMesh = mesh(merge(curbs), vcMat, true, true); s.add(curbMesh);

    // --- Toprak yollar (istasyonları bağlayan patikalar) ---
    const paths = [
      [[4, 14], [4, 2], [4, -60], [4, -125]],
      [[4, 2], [12, 2], [22, 10], [27, 12]],
      [[-6, 6], [4, 6]],
      [[4, -26], [12, -22]],
      [[4, -56], [12, -52]],
      [[4, -86], [15, -82]],
      [[-18, 4], [-30, 4], [-45, 0], [-60, -20]],
      [[-30, 4], [-35, -40], [-45, -60], [-50, -95]],
      [[36, -2], [47, -2], [52, 10]],
      [[47, -2], [52, -40], [42, -70], [56, -110]],
      [[-20, -116], [12, -112]],
    ];
    const pathParts = [];
    for (const pl of paths) {
      for (let i = 0; i < pl.length - 1; i++) {
        const [x0, z0] = pl[i], [x1, z1] = pl[i + 1];
        const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
        pathParts.push(P(new THREE.BoxGeometry(3.0, 0.04, L + 2.6), 0xc9a26b, (x0 + x1) / 2, 0.02, (z0 + z1) / 2, 0, ang, 0));
        pathParts.push(P(new THREE.CylinderGeometry(1.5, 1.5, 0.045, 10), 0xc9a26b, x1, 0.021, z1));
      }
    }
    const pathMesh = new THREE.Mesh(merge(pathParts), vcMat); pathMesh.receiveShadow = true; s.add(pathMesh);

    // --- Dağlar ---
    const mParts = [];
    MOUNTAINS.forEach(([x, z, r], i) => {
      const mg = mountainGeometry(i * 13 + 5);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, r * 0.48, z), new THREE.Quaternion(), new THREE.Vector3(r * 1.1, r * 1.1, r * 1.1));
      mg.applyMatrix4(m); mParts.push(mg);
    });
    s.add(new THREE.Mesh(merge(mParts), vcMat));

    // --- Sınır ormanı (tek InstancedMesh, LOD geometrisi) ---
    const border = [];
    const r = rng(77);
    for (let z = 24; z > -430; z -= 3.2) {
      for (const [x0, x1] of [[-90, -73], [79, 98]]) {
        for (let k = 0; k < 4; k++) border.push([x0 + r() * (x1 - x0), z + r() * 3, r()]);
      }
    }
    // güney sınırı: tesis şeridi (x -22..40) açık kalır; şeridin iki yanı ormanla çevrilir
    // tesis şeritleri (z 26..196) batıya genişleyebilir: doğu yakası, batı ucu ve güney ucu ormanla çevrilir
    for (let x = 41; x < 98; x += 3.2) for (let k = 0; k < 3; k++) border.push([x + r() * 3, 30 + r() * 12, r()]);
    for (let x = -90; x > EXP_WEST - 16; x -= 3.4) for (let k = 0; k < 2; k++) border.push([x + r() * 3, 18 + r() * 7, r()]);
    for (let z = 26; z < 200; z += 3.4) for (const [x0, x1] of [[EXP_WEST - 16, EXP_WEST - 2], [40, 66]]) for (let k = 0; k < 3; k++) border.push([x0 + r() * (x1 - x0), z + r() * 3, r()]);
    for (let x = EXP_WEST - 16; x < 66; x += 3.4) for (let k = 0; k < 3; k++) border.push([x + r() * 3, 200 + r() * 12, r()]);
    const types = ['pine', 'oak', 'cedar'];
    for (let t = 0; t < 3; t++) {
      const list = border.filter((b) => Math.floor(b[2] * 3) === t);
      const im = new THREE.InstancedMesh(treeLodGeometry(types[t]), leafMat, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      list.forEach(([x, z, rr], i) => {
        const sc = 1.1 + rr * 0.9;
        im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr * 6), new THREE.Vector3(sc, sc, sc)));
      });
      im.castShadow = false; im.receiveShadow = false;
      s.add(im);
    }

    // --- Çimen öbekleri ---
    this.buildGrass(this.game.quality.grass);
  }

  buildGrass(density) {
    if (this.grass) { this.grass.removeFromParent(); this.grass.geometry.dispose(); this.grass = null; }
    if (!density) return;
    const count = Math.floor(9000 * density);
    const im = new THREE.InstancedMesh(grassGeometry(), grassMat, count);
    const r = rng(1234); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    while (n < count) {
      const south = r() < 0.3;
      const x = south ? -20 + r() * 56 : -70 + r() * 146, z = south ? 26 + r() * 330 : 26 - r() * 160;
      if (x > ROAD.x - ROAD.width / 2 - 1 && x < ROAD.x + ROAD.width / 2 + 1) continue;
      const sc = 0.7 + r() * 0.8;
      im.setMatrixAt(n++, m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(up, r() * 6), new THREE.Vector3(sc, sc, sc)));
    }
    im.receiveShadow = true;
    this.game.scene.add(im);
    this.grass = im;
  }
  setGrassDensity(d) { this.buildGrass(d); }

  /** Bölgeye ait dekor: kaya, çalı, çiçek, gölet (bölge başına tek mesh) */
  buildZoneDecor(zone) {
    if (this.decorBuilt.has(zone.id)) return;
    this.decorBuilt.add(zone.id);
    const s = this.game.scene;
    const r = rng(zone.id * 977 + 3);
    const R = zone.rect;
    const avoid = (x, z) => {
      for (const site of zone.sites) { if (Math.hypot(site.x - x, site.z - z) < 7) return true; if (site.stock && Math.hypot(site.stock.x - x, site.stock.z - z) < 6) return true; }
      for (const f of zone.forests) if (x > f.x0 - 1 && x < f.x1 + 1 && z > f.z0 - 1 && z < f.z1 + 1) return r() < 0.75;
      if (x > ROAD.x - ROAD.width / 2 - 1.5 && x < ROAD.x + ROAD.width / 2 + 1.5) return true;
      if (zone.pad && Math.hypot(zone.pad.x - x, zone.pad.z - z) < 3) return true;
      for (const p of zone.decor.ponds) if (Math.hypot(p.x - x, p.z - z) < p.r + 1) return true;
      if (Math.abs(x - 4) < 2.5) return true; // ana patika
      return false;
    };
    const pick = () => {
      for (let k = 0; k < 20; k++) {
        const x = R.x0 + 1 + r() * (R.x1 - R.x0 - 2), z = R.z0 + 1 + r() * (R.z1 - R.z0 - 2);
        if (!avoid(x, z)) return [x, z];
      }
      return null;
    };
    const parts = [];
    const place = (geo, x, z, sc, rot) => {
      const gg = geo.clone();
      gg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(sc, sc, sc)));
      parts.push(gg);
    };
    const rocks = [];
    for (let i = 0; i < zone.decor.rocks; i++) {
      const p = pick(); if (!p) continue;
      const sc = 0.6 + r() * 0.9;
      place(rockGeometry(i + zone.id * 31), p[0], p[1], sc, r() * 6);
      if (sc > 1.1) rocks.push({ x: p[0], z: p[1], r: 0.55 * sc });
    }
    for (let i = 0; i < zone.decor.bushes; i++) { const p = pick(); if (p) place(bushGeometry(i * 7 + zone.id), p[0], p[1], 0.8 + r() * 0.6, r() * 6); }
    const fcols = [0xff5252, 0xffeb3b, 0xffffff, 0xe040fb, 0xff9800];
    for (let i = 0; i < zone.decor.flowers; i++) { const p = pick(); if (p) place(flowerGeometry(fcols[i % 5]), p[0], p[1], 1 + r() * 0.5, r() * 6); }
    if (parts.length) {
      const m = new THREE.Mesh(merge(parts), vcMat); m.castShadow = true; m.receiveShadow = true; s.add(m);
    }
    for (const o of rocks) this.game.obstacles.push(o);
    for (const p of zone.decor.ponds) this.buildPond(p);
  }

  buildPond(p) {
    const s = this.game.scene;
    const sand = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.9, 20), mat(0xd7c49e));
    sand.rotation.x = -Math.PI / 2; sand.position.set(p.x, 0.02, p.z); sand.receiveShadow = true; s.add(sand);
    const water = new THREE.Mesh(new THREE.CircleGeometry(p.r, 20), new THREE.MeshStandardMaterial({ color: 0x4fc3f7, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2; water.position.set(p.x, 0.05, p.z); s.add(water);
    const ring = new THREE.Mesh(new THREE.RingGeometry(p.r * 0.5, p.r * 0.55, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.07, p.z); s.add(ring);
    // nilüferler
    const lilies = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      lilies.push(P(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 8), 0x43a047, p.x + Math.cos(a) * p.r * 0.6, 0.08, p.z + Math.sin(a) * p.r * 0.6));
    }
    s.add(new THREE.Mesh(merge(lilies), vcMat));
    this.game.obstacles.push({ x: p.x, z: p.z, r: p.r - 0.2 });
    this.waters.push({ water, ring, base: p.r });
  }

  update(dt) {
    const t = this.game.time;
    for (const w of this.waters) {
      const k = (t * 0.4) % 1;
      w.ring.scale.setScalar(0.6 + k * 1.2);
      w.ring.material.opacity = 0.35 * (1 - k);
    }
  }
}
