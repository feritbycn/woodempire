import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat, vcMat, vcMatMetal, leafMat, colorGeometry, gradientGeometry } from './Materials.js';
import { WOODS } from '../config/balance.js';

// ---------------------------------------------------------------
// Yardımcılar: renkli parçaları tek geometride birleştirme
// ---------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export function P(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, grad = null) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (grad) gradientGeometry(g, grad[0], grad[1]); else colorGeometry(g, color);
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
export function merge(parts) {
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const dodec = (r) => new THREE.DodecahedronGeometry(r, 0);

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function mesh(geo, material = vcMat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

// ---------------------------------------------------------------
// AĞAÇLAR (her tür için 3 varyasyon, tek mesh)
// ---------------------------------------------------------------
const treeCache = {};
export function treeGeometry(type, variant = 0) {
  const key = type + variant;
  if (treeCache[key]) return treeCache[key];
  const r = rng(91 + variant * 17 + type.length * 7);
  const parts = [];
  const W = WOODS[type];
  if (type === 'pine') {
    parts.push(P(cyl(0.16, 0.26, 1.6, 6), 0x7a5232, 0, 0.8, 0));
    const lc = [0x2f7d3a, 0x3a9446, 0x4caf50];
    const h0 = 1.3 + r() * 0.3;
    for (let i = 0; i < 3; i++) {
      const rad = 1.45 - i * 0.36 + r() * 0.1, hh = 1.5 - i * 0.12;
      parts.push(P(cone(rad, hh, 7), 0, 0, h0 + i * 0.85 + hh / 2, 0, 0, r() * 3, 0, 1, 1, 1, [lc[i], lc[Math.min(i + 1, 2)]]));
    }
  } else if (type === 'birch') {
    parts.push(P(cyl(0.13, 0.19, 3.0, 6), 0xf1ede2, 0, 1.5, 0));
    for (let i = 0; i < 5; i++) parts.push(P(box(0.08, 0.05, 0.03), 0x2b2b2b, (r() - 0.5) * 0.1, 0.5 + i * 0.5, 0.15, 0, r() * 6, 0));
    const lc = [0x7cb342, 0x9ccc65, 0xaed581];
    for (let i = 0; i < 4; i++) {
      parts.push(P(ico(0.75 + r() * 0.35, 0), lc[i % 3], (r() - 0.5) * 0.9, 2.9 + r() * 1.0 + i * 0.25, (r() - 0.5) * 0.9, r(), r(), r()));
    }
  } else if (type === 'oak') {
    parts.push(P(cyl(0.26, 0.42, 1.8, 7), 0x6b4423, 0, 0.9, 0));
    parts.push(P(cyl(0.1, 0.16, 1.1, 5), 0x6b4423, 0.45, 1.9, 0, 0, 0, -0.8));
    parts.push(P(cyl(0.1, 0.16, 1.1, 5), 0x6b4423, -0.4, 1.95, 0.1, 0.2, 0, 0.8));
    const lc = [0x2e7d32, 0x388e3c, 0x43a047, 0x1b5e20];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      parts.push(P(dodec(1.05 + r() * 0.3), lc[i % 4], Math.cos(a) * 0.95, 2.7 + r() * 0.6, Math.sin(a) * 0.85, r(), r(), r()));
    }
    parts.push(P(dodec(1.35), 0x388e3c, 0, 3.45, 0));
  } else if (type === 'cedar') {
    parts.push(P(cyl(0.18, 0.32, 4.4, 6), 0x8d3f22, 0, 2.2, 0));
    const lc = [0x1b5e4a, 0x22735a, 0x2a8a6b, 0x34a07c];
    for (let i = 0; i < 4; i++) {
      const rad = 1.7 - i * 0.33;
      parts.push(P(cyl(rad * 0.55, rad, 0.5, 8), 0, 0, 1.7 + i * 0.85, 0, 0, r() * 3, 0, 1, 1, 1, [lc[i], lc[Math.min(i + 1, 3)]]));
    }
    parts.push(P(cone(0.5, 0.9, 6), 0x34a07c, 0, 5.0, 0));
  } else if (type === 'rare') {
    parts.push(P(cyl(0.2, 0.34, 2.0, 7), 0x4e342e, 0, 1.0, 0));
    const lc = [0xffb300, 0xffca28, 0xffa000, 0xffd54f];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r();
      parts.push(P(ico(0.8 + r() * 0.3, 0), lc[i % 4], Math.cos(a) * 0.75, 2.6 + r() * 0.8, Math.sin(a) * 0.75, r(), r(), r()));
    }
    parts.push(P(ico(1.1, 0), 0xffc107, 0, 3.4, 0));
  }
  const g = merge(parts);
  treeCache[key] = g;
  return g;
}

/** Uzak mesafe için basit LOD geometrisi */
const lodCache = {};
export function treeLodGeometry(type) {
  if (lodCache[type]) return lodCache[type];
  const W = WOODS[type];
  const tall = type === 'cedar' ? 5 : type === 'pine' ? 4 : 3.6;
  const parts = [P(cyl(0.2, 0.3, 1.6, 4), 0x6d4c33, 0, 0.8, 0)];
  if (type === 'pine' || type === 'cedar') parts.push(P(cone(1.4, tall - 1.2, 5), W.leaf, 0, 1.2 + (tall - 1.2) / 2, 0));
  else parts.push(P(ico(1.5, 0), W.leaf, 0, 2.8, 0));
  return (lodCache[type] = merge(parts));
}

let stumpGeo;
export function stumpGeometry() {
  if (stumpGeo) return stumpGeo;
  const top = new THREE.CylinderGeometry(0.29, 0.29, 0.02, 7, 1, false); // kapaklı üst halka
  stumpGeo = merge([
    P(new THREE.CylinderGeometry(0.3, 0.38, 0.4, 7, 1, true), 0x7a5232, 0, 0.2, 0),
    P(top, 0xe8c48a, 0, 0.41, 0),
  ]);
  return stumpGeo;
}

// ---------------------------------------------------------------
// ÜRÜN GEOMETRİLERİ (InstancedMesh ile çizilir)
// ---------------------------------------------------------------
export function itemGeometry(kind) {
  switch (kind) {
    case 'log': return merge([
      P(cyl(0.18, 0.18, 1.1, 7), 0xffffff, 0, 0, 0, 0, 0, Math.PI / 2),
      P(cyl(0.165, 0.165, 1.12, 7), 0xf7e3c0, 0, 0, 0, 0, 0, Math.PI / 2),
    ]);
    case 'plank': return merge([P(box(1.15, 0.11, 0.32), 0xffffff)]);
    case 'sanded': return merge([
      P(box(1.15, 0.11, 0.32), 0xffffff),
      P(box(1.16, 0.02, 0.2), 0xfff3dc, 0, 0.05, 0),
    ]);
    case 'package': return merge([
      P(box(1.0, 0.44, 0.52), 0xffffff),
      P(box(1.02, 0.45, 0.06), 0x5d4037, 0.25, 0, 0),
      P(box(0.06, 0.45, 0.54), 0x5d4037, -0.25, 0, 0),
      P(box(0.3, 0.02, 0.2), 0xfafafa, 0.0, 0.23, 0),
    ]);
    case 'pallet': {
      const ps = [];
      for (let i = 0; i < 5; i++) ps.push(P(box(1.1, 0.06, 0.16), 0xffffff, 0, 0.1, -0.4 + i * 0.2));
      for (let i = 0; i < 3; i++) ps.push(P(box(0.14, 0.14, 0.96), 0xd8c0a0, -0.45 + i * 0.45, 0, 0));
      return merge(ps);
    }
    case 'panel': return merge([
      P(box(1.2, 0.12, 0.8), 0xffffff),
      P(box(1.21, 0.02, 0.05), 0x8d6e63, 0, 0.0, 0.2),
      P(box(1.21, 0.02, 0.05), 0x8d6e63, 0, 0.0, -0.2),
    ]);
    case 'milk': return merge([   // metal süt güğümü
      P(cyl(0.2, 0.22, 0.4, 10), 0xcfd8dc, 0, -0.04, 0),
      P(cyl(0.12, 0.2, 0.08, 10), 0xb0bec5, 0, 0.2, 0),
      P(cyl(0.13, 0.13, 0.06, 10), 0x90a4ae, 0, 0.25, 0),
      P(cyl(0.205, 0.205, 0.05, 10), 0x4dabf7, 0, 0.02, 0),
      P(cyl(0.21, 0.23, 0.03, 10), 0x78909c, 0, -0.24, 0),
    ]);
    case 'bottle': { // plastik kasa içinde süt şişeleri
      const ps = [P(box(0.62, 0.22, 0.42), 0x1e88e5, 0, -0.11, 0), P(box(0.56, 0.02, 0.36), 0x1565c0, 0, 0.0, 0)];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const x = -0.19 + i * 0.19, z = -0.1 + j * 0.2;
        ps.push(P(cyl(0.065, 0.075, 0.28, 8), 0xffffff, x, 0.06, z), P(cyl(0.04, 0.04, 0.05, 8), 0x43a047, x, 0.22, z));
      }
      return merge(ps);
    }
    case 'egg': { // hasır sepet içinde yumurtalar
      const ps = [P(cyl(0.26, 0.2, 0.18, 10), 0xc8a165, 0, -0.06, 0), P(cyl(0.27, 0.27, 0.03, 10), 0xa1783f, 0, 0.03, 0)];
      const pts = [[0, 0], [0.12, 0.06], [-0.12, 0.05], [0.05, -0.12], [-0.07, -0.1], [0.09, 0.13]];
      for (const [x, z] of pts) ps.push(P(new THREE.SphereGeometry(0.075, 7, 5), 0xfff3e0, x, 0.07, z, 0, 0, 0, 1, 1.25, 1));
      return merge(ps);
    }
    case 'carton': return merge([   // yumurta kolisi
      P(box(0.62, 0.34, 0.44), 0xe0c08a),
      P(box(0.63, 0.06, 0.45), 0xc9a36a, 0, 0.12, 0),
      P(box(0.3, 0.16, 0.02), 0xfff3e0, 0, -0.02, 0.225),
      P(new THREE.SphereGeometry(0.05, 6, 4), 0xff9800, 0, -0.02, 0.24, 0, 0, 0, 1, 1.3, 0.4),
    ]);
    case 'wool': { // yün yığını
      const ps = [];
      for (const [x, y, z, r] of [[0, 0, 0, 0.2], [0.15, 0.02, 0.06, 0.15], [-0.14, 0.01, -0.05, 0.16], [0.03, 0.1, -0.1, 0.14], [-0.05, 0.09, 0.12, 0.13]]) ps.push(P(new THREE.IcosahedronGeometry(r, 0), 0xfafafa, x, y - 0.05, z));
      return merge(ps);
    }
    case 'yarn': return merge([    // yün yumağı + iplik bantları
      P(new THREE.SphereGeometry(0.2, 10, 8), 0xba68c8, 0, 0, 0),
      P(new THREE.TorusGeometry(0.2, 0.025, 4, 14), 0x8e24aa, 0, 0, 0, Math.PI / 2, 0, 0),
      P(new THREE.TorusGeometry(0.2, 0.025, 4, 14), 0x8e24aa, 0, 0, 0, 0, 0.6, 0),
      P(new THREE.TorusGeometry(0.2, 0.025, 4, 14), 0xce93d8, 0, 0, 0, 0.8, 0, 0.4),
    ]);
    case 'comb': { // altıgen bal peteği
      const ps = [P(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 6), 0xffb300, 0, 0, 0)];
      for (const [x, z] of [[0, 0], [0.12, 0.07], [-0.12, 0.07], [0, -0.14], [0.12, -0.07], [-0.12, -0.07], [0, 0.14]]) ps.push(P(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 6), 0xe65100, x, 0.065, z));
      return merge(ps);
    }
    case 'honey': return merge([   // bal kavanozu
      P(cyl(0.17, 0.17, 0.3, 10), 0xffa000, 0, -0.04, 0),
      P(cyl(0.12, 0.17, 0.05, 10), 0xffb300, 0, 0.13, 0),
      P(cyl(0.13, 0.13, 0.07, 10), 0xd84315, 0, 0.18, 0),
      P(box(0.2, 0.12, 0.02), 0xfff8e1, 0, -0.04, 0.17),
    ]);
    case 'furniture': return merge([
      P(box(0.8, 0.56, 0.5), 0xffffff, 0, 0, 0),
      P(box(0.36, 0.22, 0.02), 0xe0c8a8, -0.19, 0.1, 0.26),
      P(box(0.36, 0.22, 0.02), 0xe0c8a8, 0.19, 0.1, 0.26),
      P(box(0.74, 0.18, 0.02), 0xe0c8a8, 0, -0.15, 0.26),
      P(box(0.08, 0.03, 0.03), 0xffd54f, -0.05, 0.1, 0.28),
      P(box(0.08, 0.03, 0.03), 0xffd54f, 0.05, 0.1, 0.28),
    ]);
  }
  return box(0.5, 0.5, 0.5);
}

// ---------------------------------------------------------------
// KARAKTER (oyuncu ve işçiler) - eklemli hiyerarşi, prosedürel animasyon
// ---------------------------------------------------------------
export const SKINS = {
  classic:  { name: 'Klasik Oduncu', shirt: 0xc62828, shirt2: 0x8e1b1b, pants: 0x1e3a8a, hat: 0xffc107, price: 0 },
  forest:   { name: 'Orman Bekçisi', shirt: 0x2e7d32, shirt2: 0x1b5e20, pants: 0x5d4037, hat: 0xff8f00, price: 120 },
  night:    { name: 'Gece Mavisi',   shirt: 0x283593, shirt2: 0x1a237e, pants: 0x263238, hat: 0x90caf9, price: 120 },
  golden:   { name: 'Altın Usta',    shirt: 0xffb300, shirt2: 0xff8f00, pants: 0x3e2723, hat: 0xfff176, price: 400, premium: true },
  royal:    { name: 'Kereste Kralı', shirt: 0x6a1b9a, shirt2: 0x4a148c, pants: 0x212121, hat: 0xffd700, price: 0, iap: true },
};
export const WORKER_LOOKS = [
  { shirt: 0xff7043, shirt2: 0xf4511e, pants: 0x37474f, hat: 0xffeb3b },
  { shirt: 0x26a69a, shirt2: 0x00897b, pants: 0x3e2723, hat: 0xff9800 },
  { shirt: 0x5c6bc0, shirt2: 0x3949ab, pants: 0x263238, hat: 0xfafafa },
  { shirt: 0x8d6e63, shirt2: 0x6d4c41, pants: 0x1a237e, hat: 0x4caf50 },
  { shirt: 0xec407a, shirt2: 0xd81b60, pants: 0x37474f, hat: 0xffc107 },
];

export function makeCharacter(look = SKINS.classic, opts = {}) {
  // Eklem başına tek birleştirilmiş mesh (vertex renkli): karakter başına ~11 çizim çağrısı
  const skin = opts.skin ?? 0xf1c27d;
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  hips.add(mesh(merge([P(box(0.5, 0.24, 0.3), look.pants)])));
  const torso = new THREE.Group(); torso.position.y = 0.1; hips.add(torso);
  torso.add(mesh(merge([
    P(box(0.56, 0.62, 0.34), look.shirt, 0, 0.33, 0),
    P(box(0.57, 0.08, 0.35), look.shirt2, 0, 0.2, 0),
    P(box(0.57, 0.08, 0.35), look.shirt2, 0, 0.45, 0),
    P(box(0.52, 0.07, 0.32), 0x3e2723, 0, 0.02, 0),
    P(box(0.1, 0.06, 0.02), 0xffd54f, 0, 0.02, 0.17),
    P(box(0.46, 0.5, 0.06), 0x5d4037, 0, 0.32, -0.2),
  ])));
  const stackAnchor = new THREE.Object3D(); stackAnchor.position.set(0, 0.0, -0.52); torso.add(stackAnchor);
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  const headParts = [
    P(box(0.38, 0.38, 0.36), skin, 0, 0.2, 0),
    P(box(0.06, 0.07, 0.02), 0x212121, -0.09, 0.24, 0.185),
    P(box(0.06, 0.07, 0.02), 0x212121, 0.09, 0.24, 0.185),
    P(box(0.07, 0.08, 0.06), 0xe0a96d, 0, 0.16, 0.2),
    P(cyl(0.22, 0.24, 0.16, 10), look.hat, 0, 0.44, 0),
    P(cyl(0.3, 0.3, 0.03, 12), look.hat, 0, 0.37, 0.03),
  ];
  if (opts.beard !== false) headParts.push(P(box(0.36, 0.13, 0.08), opts.beardColor ?? 0x6d4c41, 0, 0.06, 0.17));
  head.add(mesh(merge(headParts)));

  function limb(parent, x, y, upperColor, lowerColor, ul, ll, w, isLeg) {
    const j = new THREE.Group(); j.position.set(x, y, 0); parent.add(j);
    j.add(mesh(merge([P(box(w, ul, w), upperColor, 0, -ul / 2, 0)])));
    const k = new THREE.Group(); k.position.y = -ul; j.add(k);
    k.add(mesh(merge([
      P(box(w * 0.9, ll, w * 0.9), lowerColor, 0, -ll / 2, 0),
      P(box(isLeg ? w * 1.05 : w * 0.85, isLeg ? 0.12 : 0.13, isLeg ? w * 1.6 : w * 0.85), isLeg ? 0x3e2723 : skin, 0, -ll - (isLeg ? 0 : 0.05), isLeg ? 0.06 : 0),
    ])));
    const end = new THREE.Object3D(); end.position.set(0, -ll - (isLeg ? 0 : 0.05), 0); k.add(end);
    return { j, k, end };
  }
  const armL = limb(torso, -0.36, 0.58, look.shirt, skin, 0.32, 0.3, 0.15, false);
  const armR = limb(torso, 0.36, 0.58, look.shirt, skin, 0.32, 0.3, 0.15, false);
  const legL = limb(hips, -0.13, -0.08, look.pants, look.pants, 0.42, 0.4, 0.2, true);
  const legR = limb(hips, 0.13, -0.08, look.pants, look.pants, 0.42, 0.4, 0.2, true);

  // balta (sap + metal baş tek mesh)
  const axe = mesh(merge([
    P(cyl(0.03, 0.035, 0.85, 6), 0x8d6e63, 0, -0.3, 0),
    P(box(0.05, 0.2, 0.26), opts.axeColor ?? 0xb0bec5, 0, -0.66, 0.12),
  ]), vcMatMetal);
  axe.position.set(0, -0.05, 0); axe.rotation.x = Math.PI / 2; armR.end.add(axe);
  axe.visible = opts.axe !== false;

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return { root, hips, torso, head, armL, armR, legL, legR, axe, stackAnchor };
}

/**
 * Prosedürel animasyon. state: { speed(0..1), phase, chop (0..1 veya -1), carrying(bool), t }
 */
export function animateCharacter(c, s, dt) {
  const k = Math.min(1, dt * 12);
  const sp = s.speed;
  const sw = Math.sin(s.phase);
  const lerp = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
  // bacaklar
  lerp(c.legL.j.rotation, 'x', sw * 0.75 * sp);
  lerp(c.legR.j.rotation, 'x', -sw * 0.75 * sp);
  lerp(c.legL.k.rotation, 'x', Math.max(0, -Math.cos(s.phase)) * 0.9 * sp);
  lerp(c.legR.k.rotation, 'x', Math.max(0, Math.cos(s.phase)) * 0.9 * sp);
  c.hips.position.y = 0.92 + Math.abs(Math.cos(s.phase)) * 0.07 * sp + (sp < 0.05 ? Math.sin(s.t * 2) * 0.008 : 0);
  lerp(c.torso.rotation, 'x', sp * 0.18 + (s.carrying ? 0.12 : 0));
  // kollar
  if (s.chop >= 0) {
    // balta sallama: kaldır (0-0.55), indir (0.55-0.72), toparla
    const t = s.chop;
    let a;
    if (t < 0.55) a = -0.4 - (t / 0.55) * 2.3;
    else if (t < 0.72) a = -2.7 + ((t - 0.55) / 0.17) * 3.1;
    else a = 0.4 - ((t - 0.72) / 0.28) * 0.8;
    c.armR.j.rotation.x = a; c.armL.j.rotation.x = a * 0.9;
    c.armR.j.rotation.z = -0.15; c.armL.j.rotation.z = 0.35;
    c.armR.k.rotation.x = -0.3; c.armL.k.rotation.x = -0.4;
    c.torso.rotation.y = Math.sin(t * Math.PI * 2) * 0.12;
    c.axe.visible = true;
  } else {
    c.torso.rotation.y *= 0.8;
    if (s.carrying) {
      lerp(c.armL.j.rotation, 'x', -0.5 + sw * 0.15 * sp); lerp(c.armR.j.rotation, 'x', -0.5 - sw * 0.15 * sp);
      lerp(c.armL.k.rotation, 'x', -1.4); lerp(c.armR.k.rotation, 'x', -1.4);
      lerp(c.armL.j.rotation, 'z', 0.25); lerp(c.armR.j.rotation, 'z', -0.25);
    } else {
      lerp(c.armL.j.rotation, 'x', -sw * 0.7 * sp); lerp(c.armR.j.rotation, 'x', sw * 0.7 * sp);
      lerp(c.armL.k.rotation, 'x', -0.25 - sp * 0.4); lerp(c.armR.k.rotation, 'x', -0.25 - sp * 0.4);
      lerp(c.armL.j.rotation, 'z', 0.08 + (sp < 0.05 ? Math.sin(s.t * 2) * 0.03 : 0)); lerp(c.armR.j.rotation, 'z', -0.08);
    }
    c.axe.visible = !s.carrying && s.showAxe !== false;
  }
}

// ---------------------------------------------------------------
// KAMYON
// ---------------------------------------------------------------
export function makeTruck(tier) {
  const g = new THREE.Group();
  const L = 6.4 * tier.len, W = 2.3;
  const body = new THREE.Group(); g.add(body);
  const parts = [];
  parts.push(P(box(W * 0.9, 0.35, L), 0x37474f, 0, 0.75, 0));               // şasi
  parts.push(P(box(W, 1.55, 1.9), tier.color, 0, 1.65, -L / 2 + 0.95));      // kabin
  parts.push(P(box(W * 0.98, 0.25, 1.9), 0xffffff, 0, 2.5, -L / 2 + 0.95));  // kabin üstü
  parts.push(P(box(W * 0.86, 0.6, 0.05), 0x81d4fa, 0, 1.95, -L / 2 - 0.01)); // ön cam
  parts.push(P(box(0.05, 0.5, 0.9), 0x81d4fa, W / 2 + 0.01, 1.95, -L / 2 + 0.9));
  parts.push(P(box(0.05, 0.5, 0.9), 0x81d4fa, -W / 2 - 0.01, 1.95, -L / 2 + 0.9));
  parts.push(P(box(W * 1.02, 0.28, 0.2), 0x9e9e9e, 0, 0.85, -L / 2 - 0.05)); // tampon
  parts.push(P(box(0.32, 0.18, 0.05), 0xfff59d, 0.75, 1.15, -L / 2 - 0.02));
  parts.push(P(box(0.32, 0.18, 0.05), 0xfff59d, -0.75, 1.15, -L / 2 - 0.02));
  parts.push(P(box(0.6, 0.35, 0.05), 0x212121, 0, 1.15, -L / 2 - 0.02));
  const bedLen = L - 2.2;
  parts.push(P(box(W, 0.18, bedLen), 0x8d6e63, 0, 1.0, L / 2 - bedLen / 2 - 0.1)); // kasa tabanı
  for (let i = 0; i <= 4; i++) {
    const zz = L / 2 - 0.1 - (bedLen * i) / 4;
    parts.push(P(box(0.12, 0.8, 0.12), 0x5d4037, W / 2 - 0.06, 1.45, zz));
    parts.push(P(box(0.12, 0.8, 0.12), 0x5d4037, -W / 2 + 0.06, 1.45, zz));
  }
  parts.push(P(box(W, 0.6, 0.12), tier.color, 0, 1.4, -L / 2 + 1.95));
  parts.push(P(box(0.06, 0.3, 0.06), 0x424242, W / 2 - 0.1, 2.85, -L / 2 + 1.5)); // egzoz
  body.add(mesh(merge(parts), vcMat));
  const wheels = [];
  const wg = merge([P(cyl(0.48, 0.48, 0.38, 12), 0x212121, 0, 0, 0, 0, 0, Math.PI / 2), P(cyl(0.24, 0.24, 0.4, 8), 0xbdbdbd, 0, 0, 0, 0, 0, Math.PI / 2)]);
  const wz = [-L / 2 + 1.0, L / 2 - 1.0];
  if (tier.len > 1.3) wz.push(L / 2 - 2.1);
  for (const z of wz) for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) {
    const w = mesh(wg, vcMat); w.position.set(x, 0.48, z); g.add(w); wheels.push(w);
  }
  const bedAnchor = new THREE.Object3D(); bedAnchor.position.set(0, 1.1, L / 2 - bedLen / 2 - 0.1); g.add(bedAnchor);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, body, wheels, bedAnchor, bedLen, bedWidth: W - 0.3, length: L };
}

// ---------------------------------------------------------------
// FORKLİFT
// ---------------------------------------------------------------
export function makeForklift() {
  const g = new THREE.Group();
  const parts = [
    P(box(1.4, 0.7, 2.2), 0xffa000, 0, 0.75, 0),
    P(box(1.42, 0.55, 0.6), 0x424242, 0, 0.9, -1.05),       // karşı ağırlık
    P(box(0.6, 0.15, 0.6), 0x212121, 0, 1.2, -0.25),        // koltuk
    P(box(0.6, 0.6, 0.12), 0x212121, 0, 1.5, -0.55),
    P(box(0.08, 1.6, 0.08), 0x424242, 0.62, 1.9, -0.7), P(box(0.08, 1.6, 0.08), 0x424242, -0.62, 1.9, -0.7),
    P(box(0.08, 1.6, 0.08), 0x424242, 0.62, 1.9, 0.6), P(box(0.08, 1.6, 0.08), 0x424242, -0.62, 1.9, 0.6),
    P(box(1.4, 0.08, 1.45), 0xffa000, 0, 2.72, -0.05),     // tavan
    P(box(0.12, 2.6, 0.12), 0x616161, 0.45, 1.5, 1.2), P(box(0.12, 2.6, 0.12), 0x616161, -0.45, 1.5, 1.2), // direk
    P(box(0.3, 0.3, 0.2), 0x212121, 0, 1.25, 0.65),        // direksiyon
  ];
  g.add(mesh(merge(parts), vcMat));
  const forks = new THREE.Group(); forks.position.set(0, 0.25, 1.35); g.add(forks);
  forks.add(mesh(merge([
    P(box(1.1, 0.5, 0.08), 0x424242, 0, 0.25, -0.05),
    P(box(0.14, 0.06, 1.3), 0x9e9e9e, 0.32, 0, 0.6), P(box(0.14, 0.06, 1.3), 0x9e9e9e, -0.32, 0, 0.6),
  ]), vcMat));
  const loadAnchor = new THREE.Object3D(); loadAnchor.position.set(0, 0.06, 0.65); forks.add(loadAnchor);
  const wg = merge([P(cyl(0.38, 0.38, 0.3, 10), 0x212121, 0, 0, 0, 0, 0, Math.PI / 2)]);
  const wheels = [];
  for (const [x, z] of [[0.7, 0.75], [-0.7, 0.75], [0.7, -0.75], [-0.7, -0.75]]) {
    const w = mesh(wg, vcMat); w.position.set(x, 0.38, z); g.add(w); wheels.push(w);
  }
  // Uyarı lambası
  const beacon = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8), mat(0xff6f00, { emissive: 0xff6f00, emissiveIntensity: 0.8 }), false);
  beacon.position.set(0, 2.83, -0.3); g.add(beacon);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, forks, loadAnchor, wheels, beacon };
}

// ---------------------------------------------------------------
// MAKİNELER - giriş -X tarafında, çıkış +X tarafında
// ---------------------------------------------------------------
export function makeMachine(kind, color) {
  const g = new THREE.Group();
  const anim = []; // her karede çağrılacak fonksiyonlar (t, working, dt)
  const base = [];
  // ortak gövde: ayaklar + tabla + giriş/çıkış masaları
  for (const x of [-2.2, 2.2]) for (const z of [-0.7, 0.7]) base.push(P(box(0.18, 0.8, 0.18), 0x37474f, x, 0.4, z));
  base.push(P(box(5.0, 0.18, 1.7), 0x546e7a, 0, 0.85, 0));
  base.push(P(box(1.6, 0.12, 1.5), 0xbcaaa4, -3.2, 0.62, 0)); // giriş masası
  base.push(P(box(1.6, 0.12, 1.5), 0xbcaaa4, 3.2, 0.62, 0));  // çıkış masası
  for (const x of [-3.9, -2.5, 2.5, 3.9]) for (const z of [-0.6, 0.6]) base.push(P(box(0.12, 0.56, 0.12), 0x455a64, x, 0.28, z));
  // silindirler
  for (let i = -4; i <= 4; i++) base.push(P(cyl(0.09, 0.09, 1.5, 6), 0x90a4ae, i * 0.5, 0.98, 0, Math.PI / 2, 0, 0));
  // uyarı şeritleri
  for (let i = 0; i < 6; i++) base.push(P(box(0.3, 0.02, 0.12), i % 2 ? 0x212121 : 0xffd600, -1.25 + i * 0.5, 0.95, 0.8));

  let blades = null;
  if (kind === 'saw' || kind === 'autoline') {
    base.push(P(box(1.8, 1.2, 1.9), color, 0, 1.75, 0));
    base.push(P(box(1.9, 0.12, 2.0), 0xeceff1, 0, 2.4, 0));
    base.push(P(box(0.8, 0.7, 0.6), 0x37474f, 0, 1.6, -1.25));  // motor
    base.push(P(cyl(0.2, 0.2, 0.3, 8), 0x263238, 0, 1.6, -1.6, Math.PI / 2, 0, 0));
    blades = new THREE.Group(); blades.position.set(0, 1.25, 0); g.add(blades);
    const bladeGeo = merge([P(cyl(0.55, 0.55, 0.04, 16), 0xcfd8dc, 0, 0, 0, 0, 0, Math.PI / 2), P(cyl(0.12, 0.12, 0.08, 8), 0x37474f, 0, 0, 0, 0, 0, Math.PI / 2)]);
    const toothGeo = merge(Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return P(box(0.04, 0.1, 0.1), 0x90a4ae, 0, Math.cos(a) * 0.58, Math.sin(a) * 0.58, a, 0, 0);
    }));
    blades.userData.bladeGeo = bladeGeo; blades.userData.toothGeo = toothGeo;
  } else if (kind === 'sander') {
    base.push(P(box(1.6, 1.0, 1.9), color, 0, 1.55, 0));
    base.push(P(box(1.7, 0.1, 2.0), 0x424242, 0, 2.1, 0));
    const drum = mesh(merge([P(cyl(0.32, 0.32, 1.5, 10), 0x8d6e63, 0, 0, 0, Math.PI / 2, 0, 0), P(box(0.05, 0.66, 1.52), 0x5d4037)]), vcMat);
    drum.position.set(0, 1.15, 0); g.add(drum);
    anim.push((t, w, dt) => { if (w) drum.rotation.z -= dt * 14; });
  } else if (kind === 'packer' || kind === 'panelpress') {
    for (const x of [-1, 1]) for (const z of [-0.85, 0.85]) base.push(P(box(0.2, 2.2, 0.2), color, x, 1.95, z));
    base.push(P(box(2.4, 0.35, 2.0), color, 0, 3.1, 0));
    base.push(P(box(0.5, 0.6, 0.5), 0x37474f, 0, 3.55, 0));
    const press = mesh(merge([P(box(1.8, 0.25, 1.5), kind === 'packer' ? 0xeceff1 : 0x5d4037), P(cyl(0.12, 0.12, 1.0, 8), 0x9e9e9e, 0, 0.6, 0)]), vcMat);
    press.position.set(0, 2.3, 0); g.add(press);
    anim.push((t, w) => { press.position.y = 2.3 - (w ? Math.max(0, Math.sin(t * 6)) * 0.9 : 0); });
    if (kind === 'packer') base.push(P(box(0.9, 0.5, 0.5), 0xc8a165, 2.9, 0.95, -0.8), P(box(0.9, 0.5, 0.5), 0xc8a165, 2.9, 1.45, -0.8));
  } else if (kind === 'palletizer') {
    for (const x of [-1.6, 1.6]) base.push(P(box(0.25, 2.6, 0.25), color, x, 2.1, -0.9));
    base.push(P(box(3.6, 0.3, 0.3), color, 0, 3.4, -0.9));
    const arm = mesh(merge([P(box(0.4, 0.4, 1.4), 0x37474f, 0, 0, 0.5), P(box(0.12, 0.7, 0.12), 0xff7043, 0, -0.5, 1.1)]), vcMat);
    arm.position.set(0, 3.1, -0.9); g.add(arm);
    anim.push((t, w) => { arm.position.x = w ? Math.sin(t * 3) * 1.4 : 0; arm.position.y = 3.1 - (w ? Math.abs(Math.sin(t * 9)) * 0.3 : 0); });
  } else if (kind === 'furniture') {
    base.push(P(box(4.4, 0.15, 3.0), 0x6d4c41, 0, 3.4, 0));
    base.push(P(box(4.4, 2.6, 0.15), color, 0, 2.1, -1.5));
    base.push(P(box(0.15, 2.6, 3.0), color, -2.2, 2.1, 0));
    base.push(P(box(0.15, 2.6, 3.0), color, 2.2, 2.1, 0));
    const lathe = mesh(merge([P(cyl(0.22, 0.22, 1.2, 8), 0xd7ccc8, 0, 0, 0, 0, 0, Math.PI / 2)]), vcMat);
    lathe.position.set(0, 1.4, 0); g.add(lathe);
    base.push(P(box(0.4, 0.5, 0.5), 0x37474f, -0.85, 1.35, 0), P(box(0.4, 0.5, 0.5), 0x37474f, 0.85, 1.35, 0));
    anim.push((t, w, dt) => { if (w) lathe.rotation.x += dt * 18; });
  }
  if (kind === 'bottler') {
    // süt tankı + dolum başlıkları
    base.push(P(cyl(0.75, 0.75, 1.6, 14), 0xeceff1, -0.6, 2.0, -0.2), P(cyl(0.76, 0.76, 0.1, 14), color, -0.6, 2.85, -0.2), P(new THREE.SphereGeometry(0.75, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xeceff1, -0.6, 2.8, -0.2));
    base.push(P(box(1.4, 0.3, 1.2), color, 1.0, 2.25, 0));
    for (let i = 0; i < 3; i++) base.push(P(cyl(0.06, 0.06, 0.5, 6), 0x90a4ae, 0.6 + i * 0.4, 1.85, 0));
    const fill = mesh(merge([P(box(1.3, 0.12, 0.3), 0x37474f)]), vcMat);
    fill.position.set(1.0, 1.6, 0); g.add(fill);
    anim.push((t, w) => { fill.position.y = 1.6 - (w ? Math.abs(Math.sin(t * 5)) * 0.35 : 0); });
  } else if (kind === 'spinner') {
    // eğirme çarkı
    base.push(P(box(1.8, 0.8, 1.2), color, 0, 1.4, 0), P(box(0.2, 1.4, 0.2), 0x8d6e63, -0.4, 2.3, 0));
    const wheel = new THREE.Group(); wheel.position.set(-0.4, 2.9, 0.15);
    wheel.add(mesh(merge([P(new THREE.TorusGeometry(0.7, 0.06, 5, 18), 0x6d4c41), P(box(1.36, 0.06, 0.06), 0x8d6e63), P(box(0.06, 1.36, 0.06), 0x8d6e63), P(box(0.06, 1.36, 0.06), 0x8d6e63, 0, 0, 0, 0, 0, Math.PI / 4), P(box(0.06, 1.36, 0.06), 0x8d6e63, 0, 0, 0, 0, 0, -Math.PI / 4)]), vcMat));
    g.add(wheel);
    base.push(P(cyl(0.18, 0.18, 0.5, 8), 0xba68c8, 0.6, 2.05, 0, 0, 0, Math.PI / 2));
    anim.push((t, w, dt) => { if (w) wheel.rotation.z -= dt * 6; });
  } else if (kind === 'honeypress') {
    // bal süzme tamburu
    base.push(P(box(2.0, 0.6, 1.4), color, 0, 1.3, 0));
    const drum = new THREE.Group(); drum.position.set(0, 2.25, 0);
    drum.add(mesh(merge([P(cyl(0.7, 0.7, 1.0, 12), 0xcfd8dc, 0, 0, 0, Math.PI / 2, 0, 0), P(cyl(0.72, 0.72, 0.08, 12), 0x90a4ae, 0, 0, 0.45, Math.PI / 2, 0, 0), P(box(1.3, 0.12, 0.12), 0xffb300)]), vcMat));
    g.add(drum);
    base.push(P(cyl(0.08, 0.08, 0.4, 6), 0x90a4ae, 0.9, 1.75, 0), P(cyl(0.15, 0.12, 0.2, 8), 0xffa000, 0.9, 1.5, 0));
    anim.push((t, w, dt) => { if (w) drum.rotation.z += dt * 8; });
  } else if (kind === 'eggpacker') {
    base.push(P(box(2.2, 1.3, 1.8), color, 0, 1.6, 0), P(box(2.3, 0.12, 1.9), 0xfff3e0, 0, 2.3, 0));
    base.push(P(box(0.9, 0.5, 0.05), 0x263238, 0, 1.75, 0.92));
    for (let i = 0; i < 4; i++) base.push(P(new THREE.SphereGeometry(0.12, 7, 5), 0xfff3e0, -0.6 + i * 0.4, 2.5, 0, 0, 0, 0, 1, 1.3, 1));
    const roller = mesh(merge([P(cyl(0.18, 0.18, 1.6, 8), 0xffcc80, 0, 0, 0, Math.PI / 2, 0, 0)]), vcMat);
    roller.position.set(-1.6, 1.05, 0); g.add(roller);
    anim.push((t, w, dt) => { if (w) roller.rotation.z -= dt * 10; });
  }
  if (kind === 'autoline') {
    // ek bölümler: zımpara tamburu + paketleme presi
    base.push(P(box(1.2, 1.0, 1.9), 0xf2b632, -1.6, 1.5, 0));
    base.push(P(box(1.2, 1.4, 1.9), 0x3a7bd5, 1.6, 1.75, 0));
    base.push(P(cyl(0.15, 0.15, 0.6, 8), 0x00e5ff, 0, 2.7, 0));
  }
  const body = mesh(merge(base), vcMatMetal);
  g.add(body);

  // Çalışma ışığı
  const lamp = mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: 0x66bb6a, emissive: 0x66bb6a, emissiveIntensity: 0.2 }), false);
  lamp.position.set(-2.3, 1.15, 0.8); g.add(lamp);

  function setBlades(n) {
    if (!blades) return;
    blades.clear();
    const count = Math.max(1, n);
    for (let i = 0; i < count; i++) {
      const b = new THREE.Group();
      b.add(mesh(blades.userData.bladeGeo, vcMatMetal, true, false));
      b.add(mesh(blades.userData.toothGeo, vcMatMetal, false, false));
      b.position.z = (i - (count - 1) / 2) * Math.min(0.28, 1.4 / count);
      blades.add(b);
    }
  }
  if (blades) {
    anim.push((t, w, dt) => { for (const b of blades.children) b.rotation.x -= dt * (w ? 22 : 1.5); });
  }
  anim.push((t, w) => {
    lamp.material.emissiveIntensity = w ? 0.8 + Math.sin(t * 8) * 0.3 : 0.15;
    lamp.material.color.setHex(w ? 0x66bb6a : 0xffa726); lamp.material.emissive.setHex(w ? 0x66bb6a : 0xffa726);
  });
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, anim, setBlades };
}

// ---------------------------------------------------------------
// BİNALAR
// ---------------------------------------------------------------
export function makeDepot(w = 5.4, d = 4.2) {
  const parts = [];
  parts.push(P(box(w + 0.6, 0.12, d + 0.6), 0x8d7b68, 0, 0.06, 0));
  const posts = [];
  for (let i = 0; i <= 6; i++) posts.push([-w / 2 + (w * i) / 6, -d / 2], [-w / 2 + (w * i) / 6, d / 2]);
  for (let i = 1; i < 4; i++) posts.push([-w / 2, -d / 2 + (d * i) / 4], [w / 2, -d / 2 + (d * i) / 4]);
  for (const [x, z] of posts) {
    if (z === d / 2 && Math.abs(x) < 1.2) continue; // ön giriş boşluğu
    parts.push(P(box(0.16, 1.0, 0.16), 0x6d4c41, x, 0.5, z));
  }
  parts.push(P(box(w, 0.1, 0.08), 0x8d6e63, 0, 0.75, -d / 2), P(box(w, 0.1, 0.08), 0x8d6e63, 0, 0.4, -d / 2));
  parts.push(P(box(0.08, 0.1, d), 0x8d6e63, -w / 2, 0.75, 0), P(box(0.08, 0.1, d), 0x8d6e63, w / 2, 0.75, 0));
  parts.push(P(box(0.08, 0.1, d), 0x8d6e63, -w / 2, 0.4, 0), P(box(0.08, 0.1, d), 0x8d6e63, w / 2, 0.4, 0));
  parts.push(P(box(w / 2 - 1.2, 0.1, 0.08), 0x8d6e63, -w / 4 - 0.6, 0.75, d / 2), P(box(w / 2 - 1.2, 0.1, 0.08), 0x8d6e63, w / 4 + 0.6, 0.75, d / 2));
  // tabela
  parts.push(P(box(0.12, 2.0, 0.12), 0x5d4037, -w / 2 - 0.3, 1.0, -d / 2), P(box(1.4, 0.6, 0.1), 0xa1887f, -w / 2 - 0.3, 2.0, -d / 2));
  const g = new THREE.Group();
  g.add(mesh(merge(parts), vcMat));
  return g;
}

export function makeDock() {
  const parts = [
    P(box(3.6, 0.3, 6.4), 0xb0bec5, 0, 0.15, 0),
    P(box(0.15, 0.32, 6.4), 0xffd600, 1.75, 0.16, 0),
    P(box(1.6, 2.2, 1.6), 0xeceff1, -0.8, 1.1, -3.6),      // kulübe
    P(box(1.8, 0.15, 1.8), 0x2e7d32, -0.8, 2.28, -3.6),
    P(box(0.6, 0.5, 0.05), 0x81d4fa, -0.8, 1.4, -2.79),
  ];
  for (let i = 0; i < 6; i++) parts.push(P(box(0.36, 0.02, 0.15), i % 2 ? 0x212121 : 0xffd600, 1.2, 0.31, -2.6 + i * 1.0));
  const g = new THREE.Group(); g.add(mesh(merge(parts), vcMat));
  return g;
}

export function makeCabin(color = 0x8d6e63, roof = 0xc62828, w = 4.5, d = 3.5) {
  const parts = [
    P(box(w + 0.4, 0.2, d + 0.4), 0x9e9e9e, 0, 0.1, 0),
    P(box(w, 2.4, d), color, 0, 1.4, 0),
    P(box(0.9, 1.5, 0.08), 0x4e342e, -w / 4, 0.95, d / 2 + 0.02),
    P(box(0.9, 0.7, 0.06), 0x81d4fa, w / 4, 1.6, d / 2 + 0.02),
    P(box(1.0, 0.1, 0.12), 0xffffff, w / 4, 1.2, d / 2 + 0.06),
    P(box(w + 0.6, 0.18, d / 2 + 0.5), roof, 0, 2.95, d / 4 + 0.05, 0.42, 0, 0),
    P(box(w + 0.6, 0.18, d / 2 + 0.5), roof, 0, 2.95, -d / 4 - 0.05, -0.42, 0, 0),
    P(box(0.5, 1.0, 0.5), 0x757575, w / 3, 3.4, -0.4),
  ];
  for (let i = 0; i < 5; i++) parts.push(P(box(w + 0.02, 0.05, d + 0.02), 0x6d4c41, 0, 0.5 + i * 0.45, 0));
  const g = new THREE.Group(); g.add(mesh(merge(parts), vcMat));
  return g;
}

export function makeShed(w = 10, d = 7, color = 0x90a4ae, roof = 0x607d8b, h = 4) {
  const parts = [P(box(w + 0.4, 0.2, d + 0.4), 0xbdbdbd, 0, 0.1, 0)];
  for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, d / 2]) parts.push(P(box(0.3, h, 0.3), 0x546e7a, x, h / 2, z));
  parts.push(P(box(w, h, 0.15), color, 0, h / 2, -d / 2));
  parts.push(P(box(0.15, h, d), color, -w / 2, h / 2, 0), P(box(0.15, h, d), color, w / 2, h / 2, 0));
  parts.push(P(box(w + 0.8, 0.2, d / 2 + 0.6), roof, 0, h + 0.6, d / 4, 0.3, 0, 0));
  parts.push(P(box(w + 0.8, 0.2, d / 2 + 0.6), roof, 0, h + 0.6, -d / 4, -0.3, 0, 0));
  for (let i = 0; i < 3; i++) parts.push(P(box(w - 1, 0.1, 0.8), 0x795548, 0, 1 + i * 1.0, -d / 2 + 0.6));
  const g = new THREE.Group(); g.add(mesh(merge(parts), vcMat));
  return g;
}

// ---------------------------------------------------------------
// ÇİFTLİK HAYVANLARI ve yapıları
// ---------------------------------------------------------------
/** İnek: gövde + lekeler + baş + bacaklar (bacaklar yürürken sallanır) */
export function makeCow(seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const body = [P(box(1.5, 0.75, 0.75), 0xfafafa, 0, 1.0, 0)];
  for (let i = 0; i < 4; i++) body.push(P(box(0.32 + r() * 0.25, 0.04, 0.3 + r() * 0.2), 0x263238, -0.5 + r() * 1.0, 1.385, -0.2 + r() * 0.4));
  for (let i = 0; i < 3; i++) body.push(P(box(0.3 + r() * 0.2, 0.3 + r() * 0.2, 0.04), 0x263238, -0.5 + r() * 1.0, 1.0 + (r() - 0.5) * 0.3, 0.38));
  body.push(P(box(0.5, 0.5, 0.45), 0xfafafa, 0.95, 1.25, 0), P(box(0.22, 0.22, 0.4), 0xf8bbd0, 1.25, 1.12, 0));
  body.push(P(box(0.06, 0.16, 0.06), 0xfff8e1, 0.95, 1.55, 0.16), P(box(0.06, 0.16, 0.06), 0xfff8e1, 0.95, 1.55, -0.16));
  body.push(P(box(0.08, 0.06, 0.06), 0x212121, 1.15, 1.32, 0.18), P(box(0.08, 0.06, 0.06), 0x212121, 1.15, 1.32, -0.18));
  body.push(P(box(0.3, 0.12, 0.3), 0xf8bbd0, -0.35, 0.58, 0), P(box(0.05, 0.5, 0.05), 0xfafafa, -0.78, 1.05, 0, 0, 0, -0.3));
  g.add(mesh(merge(body), vcMat));
  const legs = [];
  for (const [x, z] of [[0.55, 0.25], [0.55, -0.25], [-0.55, 0.25], [-0.55, -0.25]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.65, z);
    leg.add(mesh(merge([P(box(0.17, 0.62, 0.17), 0xfafafa, 0, -0.31, 0), P(box(0.18, 0.1, 0.18), 0x37474f, 0, -0.6, 0)]), vcMat));
    g.add(leg); legs.push(leg);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, legs };
}
/** Tavuk */
export function makeHen(seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const col = r() < 0.3 ? 0xc68642 : 0xfafafa;
  const parts = [
    P(new THREE.SphereGeometry(0.26, 8, 6), col, 0, 0.42, 0, 0, 0, 0, 1.25, 1, 1),
    P(new THREE.SphereGeometry(0.15, 8, 6), col, 0.27, 0.66, 0),
    P(box(0.12, 0.1, 0.04), 0xe53935, 0.27, 0.82, 0), P(box(0.06, 0.1, 0.04), 0xe53935, 0.38, 0.58, 0),
    P(new THREE.ConeGeometry(0.05, 0.12, 4), 0xffa000, 0.43, 0.66, 0, 0, 0, -Math.PI / 2),
    P(box(0.04, 0.04, 0.04), 0x212121, 0.34, 0.7, 0.09), P(box(0.04, 0.04, 0.04), 0x212121, 0.34, 0.7, -0.09),
    P(box(0.18, 0.22, 0.05), col, -0.3, 0.55, 0, 0, 0, 0.5),
  ];
  g.add(mesh(merge(parts), vcMat));
  const legs = [];
  for (const z of [0.08, -0.08]) {
    const leg = new THREE.Group(); leg.position.set(0, 0.22, z);
    leg.add(mesh(merge([P(box(0.04, 0.22, 0.04), 0xffa000, 0, -0.11, 0), P(box(0.12, 0.03, 0.08), 0xffa000, 0.03, -0.21, 0)]), vcMat));
    g.add(leg); legs.push(leg);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, legs };
}
/** Koyun: kabarık yün (kırpılınca küçülür, zamanla yeniden kabarır) */
export function makeSheep(seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const fluff = [];
  for (let i = 0; i < 9; i++) fluff.push(P(new THREE.IcosahedronGeometry(0.3 + r() * 0.08, 0), 0xfafafa, -0.4 + (i % 3) * 0.4 + (r() - 0.5) * 0.1, 0.95 + Math.floor(i / 3) * 0.12 + (r() - 0.5) * 0.08, -0.25 + (i % 3 === 1 ? 0.25 : 0) * (Math.floor(i / 3) - 1) + (r() - 0.5) * 0.3));
  const wool = mesh(merge(fluff), vcMat); g.add(wool);
  g.add(mesh(merge([
    P(box(1.0, 0.45, 0.55), 0xeeeeee, 0, 0.95, 0),                       // kırpılmış gövde
    P(box(0.32, 0.34, 0.3), 0x37474f, 0.66, 1.15, 0), P(box(0.12, 0.08, 0.2), 0x37474f, 0.62, 1.32, 0.2, 0.4, 0, 0), P(box(0.12, 0.08, 0.2), 0x37474f, 0.62, 1.32, -0.2, -0.4, 0, 0),
    P(box(0.05, 0.05, 0.05), 0xffffff, 0.83, 1.2, 0.09), P(box(0.05, 0.05, 0.05), 0xffffff, 0.83, 1.2, -0.09),
  ]), vcMat));
  const legs = [];
  for (const [x, z] of [[0.35, 0.18], [0.35, -0.18], [-0.35, 0.18], [-0.35, -0.18]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.62, z);
    leg.add(mesh(merge([P(box(0.12, 0.62, 0.12), 0x37474f, 0, -0.31, 0)]), vcMat));
    g.add(leg); legs.push(leg);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, legs, wool };
}
/** Arı kovanı (sabit) + etrafında dönen arılar */
export function makeHive(seed = 1) {
  const g = new THREE.Group();
  g.add(mesh(merge([
    P(box(0.9, 0.12, 0.9), 0x6d4c41, 0, 0.3, 0), P(box(0.12, 0.3, 0.12), 0x6d4c41, -0.35, 0.15, -0.35), P(box(0.12, 0.3, 0.12), 0x6d4c41, 0.35, 0.15, -0.35), P(box(0.12, 0.3, 0.12), 0x6d4c41, -0.35, 0.15, 0.35), P(box(0.12, 0.3, 0.12), 0x6d4c41, 0.35, 0.15, 0.35),
    P(box(0.8, 0.38, 0.8), 0xfff3e0, 0, 0.55, 0), P(box(0.8, 0.38, 0.8), 0xffcc80, 0, 0.94, 0), P(box(0.8, 0.38, 0.8), 0xfff3e0, 0, 1.33, 0),
    P(box(0.95, 0.1, 0.95), 0x8d6e63, 0, 1.57, 0), P(box(0.3, 0.06, 0.04), 0x3e2723, 0, 0.42, 0.41),
  ]), vcMat));
  const bees = new THREE.Group(); bees.position.y = 1.0; g.add(bees);
  const r = rng(seed);
  for (let i = 0; i < 4; i++) {
    const b = mesh(merge([P(new THREE.SphereGeometry(0.06, 6, 4), 0xffc107, 0, 0, 0, 0, 0, 0, 1.4, 1, 1), P(box(0.04, 0.01, 0.1), 0xffffff, 0, 0.05, 0)]), vcMat);
    b.userData = { a: r() * 6.28, rad: 0.6 + r() * 0.3, h: (r() - 0.5) * 0.6, sp: 1.5 + r() * 1.5 };
    bees.add(b);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, legs: [], bees };
}

/** Ağıl / kümes çiti (dikdörtgen, ön tarafta giriş boşluğu) */
export function makePen(w, d, gapX = 0, color = 0xfff8e1) {
  const parts = [];
  const post = (x, z) => parts.push(P(box(0.14, 0.9, 0.14), 0x8d6e63, x, 0.45, z));
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 2) { post(x, -d / 2); if (Math.abs(x - gapX) > 1.4) post(x, d / 2); }
  for (let z = -d / 2 + 2; z < d / 2; z += 2) { post(-w / 2, z); post(w / 2, z); }
  for (const y of [0.35, 0.7]) {
    parts.push(P(box(w, 0.08, 0.06), color, 0, y, -d / 2));
    parts.push(P(box(0.06, 0.08, d), color, -w / 2, y, 0), P(box(0.06, 0.08, d), color, w / 2, y, 0));
    const left = gapX - 1.4 - -w / 2, right = w / 2 - (gapX + 1.4);
    parts.push(P(box(left, 0.08, 0.06), color, -w / 2 + left / 2, y, d / 2), P(box(right, 0.08, 0.06), color, w / 2 - right / 2, y, d / 2));
  }
  const g = new THREE.Group(); g.add(mesh(merge(parts), vcMat));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Kilitli bölge sınırı için çit direği + ip */
export function fencePostGeometry() {
  return merge([P(box(0.18, 1.1, 0.18), 0x795548, 0, 0.55, 0), P(box(0.22, 0.12, 0.22), 0xff7043, 0, 1.12, 0)]);
}

export function rockGeometry(seed) {
  const r = rng(seed);
  const g = new THREE.DodecahedronGeometry(0.6 + r() * 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.8 + r() * 0.4), pos.getY(i) * (0.5 + r() * 0.3), pos.getZ(i) * (0.8 + r() * 0.4));
  return merge([P(g, 0, 0, 0.2, 0, 0, 0, 0, 1, 1, 1, [0x78909c, 0xb0bec5])]);
}
export function bushGeometry(seed) {
  const r = rng(seed);
  const ps = [];
  for (let i = 0; i < 3; i++) ps.push(P(ico(0.45 + r() * 0.25, 0), [0x558b2f, 0x689f38, 0x7cb342][i], (r() - 0.5) * 0.7, 0.35 + r() * 0.2, (r() - 0.5) * 0.7, r(), r(), r()));
  return merge(ps);
}
export function flowerGeometry(color) {
  return merge([P(cyl(0.02, 0.02, 0.35, 3), 0x558b2f, 0, 0.17, 0), P(ico(0.1, 0), color, 0, 0.38, 0)]);
}
export function grassGeometry() {
  const ps = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    ps.push(P(cone(0.07, 0.45, 3), 0, Math.cos(a) * 0.08, 0.22, Math.sin(a) * 0.08, 0, a, (i - 1) * 0.25, 1, 1, 1, [0x558b2f, 0x9ccc65]));
  }
  return merge(ps);
}
export function mountainGeometry(seed) {
  const r = rng(seed);
  const g = new THREE.ConeGeometry(1, 1, 7, 3);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.49) { pos.setX(i, pos.getX(i) * (0.85 + r() * 0.3)); pos.setZ(i, pos.getZ(i) * (0.85 + r() * 0.3)); pos.setY(i, y + (r() - 0.5) * 0.06); }
  }
  const ng = g.toNonIndexed();
  const p2 = ng.attributes.position; const col = new Float32Array(p2.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p2.count; i += 3) {
    const yy = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3;
    if (yy > 0.25) c.setHex(0xf5f5f5); else if (yy > 0.0) c.setHex(0x78909c); else c.setHex(0x5d7a5a);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.deleteAttribute('uv');
  ng.computeVertexNormals();
  return ng;
}

export { mesh, rng };
