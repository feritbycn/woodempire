import * as THREE from 'three';

/** Oyuncuyu takip eden izometrik kamera: döndürme (45°) ve yakınlaştırma destekli */
export class CameraRig {
  constructor(game) {
    this.game = game;
    this.target = new THREE.Vector3(4, 0, 10);
    this.yaw = 0; this.yawTarget = 0;
    this.pitch = 0.92;   // ~53°
    this.dist = 33; this.distTarget = 33;
    this.minDist = 16; this.maxDist = 56;
    this.lookAhead = new THREE.Vector3();
    this.override = null; // { x, z, until } - arazi açılışı gibi sinematik odak
    this.shake = 0;
  }
  rotate(dir) { this.yawTarget += dir * Math.PI / 4; }
  zoom(delta) { this.distTarget = THREE.MathUtils.clamp(this.distTarget * (1 + delta), this.minDist, this.maxDist); }
  focus(x, z, seconds = 2.5) { this.override = { x, z, until: this.game.time + seconds }; }
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }

  update(dt) {
    const g = this.game;
    const p = g.player?.pos;
    if (!p) return;
    let tx = p.x, tz = p.z;
    if (this.override) {
      if (g.time > this.override.until) this.override = null;
      else { tx = this.override.x; tz = this.override.z; }
    }
    const v = g.player.vel;
    this.lookAhead.x += ((v ? v.x * 0.35 : 0) - this.lookAhead.x) * 0.04;
    this.lookAhead.z += ((v ? v.z * 0.35 : 0) - this.lookAhead.z) * 0.04;
    const k = this.override ? 0.06 : 0.12;
    this.target.x += (tx + this.lookAhead.x - this.target.x) * k;
    this.target.z += (tz + this.lookAhead.z - this.target.z) * k;
    this.yaw += (this.yawTarget - this.yaw) * 0.12;
    this.dist += (this.distTarget - this.dist) * 0.12;
    const cam = g.camera;
    const hd = Math.cos(this.pitch) * this.dist;
    let sx = 0, sz = 0;
    if (this.shake > 0) { this.shake -= dt; sx = (Math.random() - 0.5) * 0.25; sz = (Math.random() - 0.5) * 0.25; }
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * hd + sx,
      Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * hd + sz,
    );
    cam.lookAt(this.target.x, 0.8, this.target.z);
    // sis mesafesi zoom ile ölçeklenir
    g.scene.fog.near = this.dist * 2.3; g.scene.fog.far = this.dist * 4.6;
  }
}
