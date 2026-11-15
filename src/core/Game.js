import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { windUniforms } from '../world/Materials.js';
import { ItemRenderer } from '../world/ItemRenderer.js';
import { WorldBuilder } from '../world/WorldBuilder.js';
import { CameraRig } from './CameraRig.js';
import { Input } from './Input.js';
import { FX } from '../world/FX.js';

import { EconomySystem } from '../systems/EconomySystem.js';
import { LevelSystem } from '../systems/LevelSystem.js';
import { PlayerController } from '../systems/PlayerController.js';
import { TreeSystem } from '../systems/TreeSystem.js';
import { WoodCollectionSystem } from '../systems/WoodCollectionSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { StorageSystem } from '../systems/StorageSystem.js';
import { ProductionSystem } from '../systems/ProductionSystem.js';
import { FactoryUpgradeSystem } from '../systems/FactoryUpgradeSystem.js';
import { ConveyorSystem } from '../systems/ConveyorSystem.js';
import { WorkerSystem } from '../systems/WorkerSystem.js';
import { VehicleSystem } from '../systems/VehicleSystem.js';
import { TruckLoadingSystem } from '../systems/TruckLoadingSystem.js';
import { ImportSystem } from '../systems/ImportSystem.js';
import { LandExpansionSystem } from '../systems/LandExpansionSystem.js';
import { ConstructionSystem } from '../systems/ConstructionSystem.js';
import { MissionSystem } from '../systems/MissionSystem.js';
import { DailyRewardSystem } from '../systems/DailyRewardSystem.js';
import { CloudSystem } from '../systems/CloudSystem.js';
import { ShopSystem } from '../systems/ShopSystem.js';
import { AdsManager } from '../systems/AdsManager.js';
import { AdOfferSystem } from '../systems/AdOfferSystem.js';
import { AnimalSystem } from '../systems/AnimalSystem.js';
import { BillingManager } from '../systems/BillingManager.js';
import { AudioManager } from '../systems/AudioManager.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { defaultState } from './State.js';

export const QUALITY = {
  low:    { shadows: false, dpr: 1.0, grass: 0,    shadowSize: 512, antialias: false },
  medium: { shadows: true,  dpr: 1.5, grass: 0.5,  shadowSize: 1024, antialias: false },
  high:   { shadows: true,  dpr: 2.0, grass: 1.0,  shadowSize: 2048, antialias: true },
};

export class Game {
  constructor(canvas, load = null) {
    const saved = load?.state || null;
    this.saveSlot = load?.slot ?? 0;
    this.saveN = load?.n ?? 0;
    this.ready = false;
    this.canvas = canvas;
    this.bus = new EventBus();
    this.state = saved ? Object.assign(defaultState(), saved) : defaultState();
    this.fresh = !saved;
    this.time = 0;
    this.timeScale = 1;
    this.paused = false;
    this.pads = [];         // etkileşim alanları
    this.obstacles = [];    // {x,z,r} veya {x0,x1,z0,z1}
    this.sites = new Map(); // id -> istasyon nesnesi
    this.updaters = [];

    const q = QUALITY[this.state.settings.quality] || QUALITY.medium;
    this.quality = q;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8f0);
    this.scene.fog = new THREE.Fog(0x9fd8f0, 70, 150);

    // Işıklandırma
    this.hemi = new THREE.HemisphereLight(0xdff3ff, 0x5c7a3a, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    const sc = this.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun); this.scene.add(this.sun.target);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    this.items = new ItemRenderer(this.scene);
    this.fx = new FX(this);
    this.input = new Input(this);
    this.cameraRig = new CameraRig(this);
    this.world = new WorldBuilder(this);

    // Sistemler (sıra önemlidir)
    this.save = new SaveSystem(this);
    this.audio = new AudioManager(this);
    this.economy = new EconomySystem(this);
    this.levels = new LevelSystem(this);
    this.inventory = new InventorySystem(this);
    this.trees = new TreeSystem(this);
    this.animals = new AnimalSystem(this);
    this.wood = new WoodCollectionSystem(this);
    this.storage = new StorageSystem(this);
    this.production = new ProductionSystem(this);
    this.factory = new FactoryUpgradeSystem(this);
    this.trucks = new TruckLoadingSystem(this);
    this.construction = new ConstructionSystem(this);
    this.land = new LandExpansionSystem(this);
    this.conveyors = new ConveyorSystem(this);
    this.player = new PlayerController(this);
    this.workers = new WorkerSystem(this);
    this.vehicles = new VehicleSystem(this);
    this.missions = new MissionSystem(this);
    this.daily = new DailyRewardSystem(this);
    this.ads = new AdsManager(this);
    this.adOffers = new AdOfferSystem(this);
    this.imports = new ImportSystem(this);
    this.billing = new BillingManager(this);
    this.shop = new ShopSystem(this);
    this.cloud = new CloudSystem(this);

    this.world.build();
    this.land.init();          // bölgeleri, ağaçları, istasyonları kurar (kayıttan)
    this.conveyors.init();
    this.player.init();
    this.workers.init();
    this.vehicles.init();
    this.trucks.init();
    this.missions.init();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.fpsAcc = 0; this.fpsFrames = 0; this.fps = 60;
  }

  /** Belirli aralıklarla çalışacak hafif güncellemeler */
  every(interval, fn) { this.updaters.push({ interval, fn, acc: 0 }); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.75 ? 46 : 38;
    this.camera.updateProjectionMatrix();
  }

  setQuality(name) {
    this.state.settings.quality = name;
    const q = QUALITY[name];
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.world.setGrassDensity(q.grass);
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const raw = Math.min(this.clock.getDelta(), 0.1);
      this.fpsAcc += raw; this.fpsFrames++;
      if (this.fpsAcc > 1) { this.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }
      if (this.paused) { this.render(); return; }
      // Büyük hızlandırmalarda (test) sabit adımlarla ilerle
      let remaining = raw * this.timeScale;
      while (remaining > 1e-6) {
        const dt = Math.min(remaining, 0.05);
        this.step(dt);
        remaining -= dt;
      }
      this.render();
    };
    requestAnimationFrame(loop);
  }

  step(dt) {
    this.time += dt;
    windUniforms.uTime.value = this.time;
    this.input.update(dt);
    this.player.update(dt);
    this.trees.update(dt);
    this.animals.update(dt);
    this.wood.update(dt);
    this.inventory.update(dt);
    this.cloud.update(dt);
    this.production.update(dt);
    this.storage.update(dt);
    this.conveyors.update(dt);
    this.workers.update(dt);
    this.vehicles.update(dt);
    this.trucks.update(dt);
    this.imports.update(dt);
    this.construction.update(dt);
    this.land.update(dt);
    this.economy.update(dt);
    this.adOffers.update(dt);
    this.fx.update(dt);
    this.world.update(dt);
    for (const u of this.updaters) {
      u.acc += dt;
      if (u.acc >= u.interval) { u.acc = 0; u.fn(); }
    }
  }

  render() {
    this.cameraRig.update(1 / 60);
    // gölge kamerası oyuncuyu takip eder
    const t = this.cameraRig.target;
    this.sun.position.set(t.x + 22, 40, t.z + 14);
    this.sun.target.position.set(t.x, 0, t.z);
    this.items.begin();
    this.storage.renderItems(this.items);
    this.production.renderItems(this.items);
    this.wood.renderItems(this.items);
    this.inventory.renderItems(this.items);
    this.conveyors.renderItems(this.items);
    this.trucks.renderItems(this.items);
    this.imports.renderItems(this.items);
    this.vehicles.renderItems(this.items);
    this.fx.renderItems(this.items);
    this.items.end();
    this.renderer.render(this.scene, this.camera);
    this.bus.emit('frame');
  }

  // --- yardımcılar ---
  /** Oyuncu / ajan için en yakın etkileşim alanı */
  padAt(x, z, filter) {
    let best = null, bd = Infinity;
    for (const p of this.pads) {
      if (!p.active) continue;
      if (filter && !filter(p)) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < p.r && d < bd) { bd = d; best = p; }
    }
    return best;
  }
  addPad(pad) { pad.active = pad.active ?? true; this.pads.push(pad); return pad; }
  removePad(pad) { const i = this.pads.indexOf(pad); if (i >= 0) this.pads.splice(i, 1); if (pad.mesh) pad.mesh.removeFromParent(); }

  /** Çarpışma: dairesel ve dikdörtgen engellerden it */
  /** Bu nokta yürünebilir ve hiçbir engelin içinde değil mi? */
  isFree(x, z, radius = 0.45) {
    if (!this.land.isWalkable(x, z)) return false;
    for (const o of this.obstacles) {
      if (o.disabled) continue;
      if (o.r !== undefined) { if (Math.hypot(x - o.x, z - o.z) < o.r + radius - 0.02) return false; }
      else { const cx = Math.max(o.x0, Math.min(x, o.x1)), cz = Math.max(o.z0, Math.min(z, o.z1)); if (Math.hypot(x - cx, z - cz) < radius - 0.02) return false; }
    }
    return true;
  }
  /** Çevrede en yakın boş noktayı bul (sarmal arama) */
  nearestFree(x, z, radius = 0.45, maxR = 8) {
    if (this.isFree(x, z, radius)) return { x, z };
    for (let r = 0.4; r <= maxR; r += 0.4) {
      const n = Math.max(8, Math.round(r * 10));
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (this.isFree(px, pz, radius)) return { x: px, z: pz }; }
    }
    return this.land.nearestWalkable(x, z);
  }

  resolveCollision(pos, radius) {
    for (const o of this.obstacles) {
      if (o.disabled) continue;
      if (o.r !== undefined) {
        const dx = pos.x - o.x, dz = pos.z - o.z;
        const d = Math.hypot(dx, dz), min = o.r + radius;
        if (d < min && d > 1e-4) { pos.x = o.x + (dx / d) * min; pos.z = o.z + (dz / d) * min; }
      } else {
        const cx = Math.max(o.x0, Math.min(pos.x, o.x1)), cz = Math.max(o.z0, Math.min(pos.z, o.z1));
        const dx = pos.x - cx, dz = pos.z - cz; const d = Math.hypot(dx, dz);
        if (d < radius) {
          if (d > 1e-4) { pos.x = cx + (dx / d) * radius; pos.z = cz + (dz / d) * radius; }
          else {
            // içeride: en yakın kenara it
            const l = pos.x - o.x0, r = o.x1 - pos.x, t = pos.z - o.z0, b = o.z1 - pos.z;
            const m = Math.min(l, r, t, b);
            if (m === l) pos.x = o.x0 - radius; else if (m === r) pos.x = o.x1 + radius; else if (m === t) pos.z = o.z0 - radius; else pos.z = o.z1 + radius;
          }
        }
      }
    }
  }

  haptic(kind = 'light') { if (this.state.settings.haptics) this.bus.emit('haptic', kind); }
}
