import * as THREE from 'three';
import { itemGeometry } from './Models.js';
import { WOODS, ITEMS } from '../config/balance.js';

/**
 * Bütün ürünler (yığınlar, sırttaki istif, bantlar, kamyon kasası, uçan ürünler)
 * tür başına tek InstancedMesh ile çizilir. Her karede begin() → add() → end().
 * Bu sayede binlerce ürün az sayıda draw-call ile gösterilir (mobil performans).
 */
const MAX = { log: 2500, plank: 3000, sanded: 2500, package: 2000, pallet: 800, panel: 800, furniture: 800, milk: 1200, bottle: 1600, egg: 1200, carton: 1200, wool: 1200, yarn: 1400, comb: 1200, honey: 1400 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color();

const TINT = {
  package: (w) => _c.setHex(0xc8a165).lerp(new THREE.Color(WOODS[w].color), 0.25),
};

export class ItemRenderer {
  constructor(scene) {
    this.meshes = {};
    this.counts = {};
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
    for (const kind of Object.keys(ITEMS)) {
      const im = new THREE.InstancedMesh(itemGeometry(kind), material, MAX[kind]);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true; im.receiveShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      // instanceColor başlat
      im.setColorAt(0, _c.setHex(0xffffff));
      scene.add(im);
      this.meshes[kind] = im;
      this.counts[kind] = 0;
    }
  }
  begin() { for (const k in this.counts) this.counts[k] = 0; }
  /** wood: ağaç türü (renk), yaw: Y açısı, extra: {rx, rz, scale} */
  add(kind, wood, x, y, z, yaw = 0, rx = 0, rz = 0, scale = 1) {
    const im = this.meshes[kind];
    const i = this.counts[kind];
    if (i >= MAX[kind]) return;
    _q.setFromEuler(_e.set(rx, yaw, rz));
    _s.set(scale, scale, scale);
    _m.compose(_v.set(x, y, z), _q, _s);
    im.setMatrixAt(i, _m);
    if (ITEMS[kind].ownColor) im.setColorAt(i, _c.setHex(0xffffff));
    else if (TINT[kind]) im.setColorAt(i, TINT[kind](wood));
    else im.setColorAt(i, _c.setHex(WOODS[wood]?.color ?? 0xd09a5c));
    this.counts[kind] = i + 1;
  }
  end() {
    for (const k in this.meshes) {
      const im = this.meshes[k];
      im.count = this.counts[k];
      im.visible = im.count > 0; // boş tür için çizim çağrısı yapma
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  total() { let t = 0; for (const k in this.counts) t += this.counts[k]; return t; }
}

/** Bir alana düzenli yığın yerleşimi: grid (cols x rows) katmanlar halinde */
export function pileLayout(index, kind, cols, rows) {
  const h = ITEMS[kind].h;
  const per = cols * rows;
  const layer = Math.floor(index / per);
  const r = index % per;
  const cx = r % cols, cz = Math.floor(r / cols);
  const farm = kind === 'milk' || kind === 'egg' || kind === 'wool' || kind === 'comb' ? 0.58 : kind === 'bottle' || kind === 'carton' ? 0.7 : kind === 'yarn' || kind === 'honey' ? 0.48 : 0;
  const sx = farm || (kind === 'log' ? 1.2 : kind === 'pallet' || kind === 'panel' ? 1.25 : kind === 'furniture' ? 0.85 : 1.2);
  const sz = farm ? (kind === 'milk' || kind === 'egg' || kind === 'wool' || kind === 'comb' ? 0.58 : 0.5) : kind === 'log' ? 0.38 : kind === 'package' ? 0.56 : kind === 'pallet' ? 1.05 : kind === 'panel' ? 0.85 : kind === 'furniture' ? 0.55 : 0.36;
  // katmanları çaprazlama (kereste için doğal görünüm)
  const cross = (kind === 'plank' || kind === 'sanded') && layer % 2 === 1;
  return {
    x: (cx - (cols - 1) / 2) * sx,
    z: (cz - (rows - 1) / 2) * sz,
    y: layer * h + h / 2,
    yaw: cross ? 0.04 : 0,
  };
}
