import * as THREE from 'three';
import { padTexture } from '../world/Textures.js';

/** Zemin alanı (pad) görseli */
const padGeo = new THREE.PlaneGeometry(1, 1);
export function createPadMesh(game, type, x, z, size = 2.4) {
  const m = new THREE.Mesh(padGeo, new THREE.MeshBasicMaterial({ map: padTexture(type), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.06, z);
  m.scale.set(size, size, 1);
  m.renderOrder = 2;
  game.scene.add(m);
  return m;
}

/** Pad oluştur + kaydet. type: drop|take|sell|buy|build */
export function makePad(game, opts) {
  const pad = {
    x: opts.x, z: opts.z, r: opts.r ?? 1.35,
    mode: opts.mode, type: opts.type, buffer: opts.buffer ?? null,
    station: opts.station ?? null, filter: opts.filter ?? null,
    dropPoint: opts.dropPoint ?? null, onReceive: opts.onReceive ?? null,
    label: opts.label ?? null, id: opts.id ?? null, data: opts.data ?? null, filterMsg: opts.filterMsg ?? null,
    active: opts.active ?? true,
  };
  pad.mesh = createPadMesh(game, opts.type, opts.x, opts.z, (pad.r * 2) * 0.92);
  game.addPad(pad);
  return pad;
}

/** Pad'in oyuncu üzerindeyken parlaması */
export function animatePads(game) {
  const p = game.player.pos;
  for (const pad of game.pads) {
    if (!pad.mesh) continue;
    pad.mesh.visible = pad.active;
    const on = pad.active && Math.hypot(pad.x - p.x, pad.z - p.z) < pad.r;
    const target = on ? 1.12 : 1;
    const base = pad.r * 2 * 0.92;
    const cur = pad.mesh.scale.x / base;
    const k = cur + (target - cur) * 0.2 + (on ? Math.sin(game.time * 8) * 0.004 : 0);
    pad.mesh.scale.set(base * k, base * k, 1);
  }
}

/** Ölçek animasyonlu "inşa" efekti */
export function popIn(group, game, dur = 0.8) {
  const start = game.time;
  group.scale.set(1, 0.01, 1);
  const tick = () => {
    const k = Math.min(1, (game.time - start) / dur);
    const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
    group.scale.set(1, Math.max(0.01, e), 1);
    if (k < 1) requestAnimationFrame(tick);
    else group.scale.set(1, 1, 1);
  };
  tick();
}
