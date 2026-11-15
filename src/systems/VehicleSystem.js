import { makeForklift, makeShed } from '../world/Models.js';
import { Agent, inPadOf, outBufOf } from './Agent.js';
import { FORKLIFT_BUY, FORKLIFT_UPGRADES, FORKLIFT_BASE, XP, upgradeCost } from '../config/balance.js';

class Forklift extends Agent {
  constructor(game, data) {
    super(game, data.x, data.z);
    this.data = data;
    this.model = makeForklift();
    game.scene.add(this.model.group);
    this.stack.load(data.stack);
    this.radius = 0.9;
    this.state = 'idle'; this.trips = data.trips || 0; this.refuelT = 0;
    this.stackYaw = Math.PI / 2;
    this.maxVisual = 60;
    this.forkH = 0.25;
  }
  anchor() { const p = this.model.loadAnchor.getWorldPosition(this._v ||= this.pos.clone()); return { x: p.x, y: p.y, z: p.z }; }
  transferInterval() { return FORKLIFT_BASE.transfer / (1 + this.game.state.forkliftUp.loading * 0.15); }
  speed() { return FORKLIFT_BASE.speed * (1 + this.game.state.forkliftUp.speed * 0.1); }
  wantKinds(pad) {
    if (this.data.mode === 'logs') return ['log'];
    return null;
  }
}

/**
 * Araçlar: Forklift garajı, forklift satın alma ve yükseltmeleri.
 * Forkliftler gerçekten çalışır: ürün modu (makine çıkışları → kamyon rampası / ürün deposu)
 * veya kütük modu (depolar → testere / otomatik hat). Belirli sefer sonra yakıt molası verir.
 */
export class VehicleSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.garage = null;
    this.up = game.state.forkliftUp;
  }

  createGarage(site) {
    const g = this.game;
    const st = { id: site.id, type: 'garage', name: site.name, x: site.x, z: site.z };
    st.group = makeShed(8, 6, 0xffcc80, 0xe65100, 3.6);
    st.group.position.set(site.x, 0, site.z);
    g.scene.add(st.group);
    g.obstacles.push({ x0: site.x - 4.1, x1: site.x + 4.1, z0: site.z - 3.1, z1: site.z - 1.5 });
    st.labelPos = { x: site.x, y: 5, z: site.z };
    st.label = () => ({ title: st.name, value: `${this.list.length}/${FORKLIFT_BUY.max} forklift`, icon: 'forklift' });
    this.garage = st;
    g.sites.set(st.id, st);
    return st;
  }

  init() { this.game.state.forklifts.forEach((d) => this.spawn(d)); }
  spawn(d) {
    const f = new Forklift(this.game, d);
    f.stack.capacity = this.capacity();
    this.list.push(f);
    this.game.inventory.register(f);
    return f;
  }

  buyCost() { return Math.round(FORKLIFT_BUY.base * Math.pow(FORKLIFT_BUY.growth, this.list.length)); }
  buy() {
    const g = this.game;
    if (!this.garage) { g.bus.emit('toast', { text: 'Önce Forklift Garajı kurulmalı', type: 'error' }); return false; }
    if (this.list.length >= FORKLIFT_BUY.max) return false;
    if (!g.economy.spend(this.buyCost(), 'forklift')) return false;
    const d = { x: this.garage.x, z: this.garage.z + 1, stack: [], mode: 'products', trips: 0 };
    g.state.forklifts.push(d);
    const f = this.spawn(d);
    g.stat('forkliftsBought');
    g.levels.addXP(XP.buyMachine * 2);
    g.audio.play('engine');
    g.fx.confetti(f.pos.x, 2, f.pos.z, 30);
    g.bus.emit('forkliftBought', { forklift: f });
    g.save.requestSave(true);
    return true;
  }
  setMode(f, mode) { f.data.mode = mode; f.state = 'idle'; this.game.save.requestSave(); }

  capacity() { return Math.round((FORKLIFT_BASE.capacity + this.up.capacity * 4) * (1 + this.up.lift * 0.15)); }
  upgradeCost(key) { return upgradeCost(FORKLIFT_UPGRADES[key], this.up[key]); }
  upgrade(key) {
    const def = FORKLIFT_UPGRADES[key];
    if (this.up[key] >= def.max) return false;
    if (!this.game.economy.spend(this.upgradeCost(key), 'upgrade')) return false;
    this.up[key]++;
    for (const f of this.list) f.stack.capacity = this.capacity();
    this.game.stat('upgradesVehicle');
    this.game.levels.addXP(XP.upgrade);
    this.game.audio.play('upgrade');
    this.game.bus.emit('upgrade', { target: 'forklift', key, level: this.up[key] });
    return true;
  }

  pickSource(f) {
    const g = this.game;
    let best = null, bs = 0;
    if (f.data.mode === 'logs') {
      for (const st of g.storage.depots) {
        if (st.import || st.zone != null || !st.takePad) continue; // ithalat/tesis depoları kendi bölgesine aittir; testereyi kendisi besleyen depo forklifte kapalı
        const n = st.buffer.count; if (n > bs) { bs = n; best = st; }
      }
      return best ? { st: best, pad: best.takePad } : null;
    }
    for (const st of g.production.machines) {
      if (st.zone != null) continue; // tesis / ithalatlı bölge makinelerini kendi yükleyicileri boşaltır
      if (g.production.nextMachineFor(st.def.output, null)) continue; // ara ürün kamyona gitmez
      const n = st.outBuf.count; if (!n) continue;
      const score = n * g.economy.itemValue(st.outBuf.items[0]) - this.list.filter((o) => o.src?.st === st).length * 40;
      if (score > bs) { bs = score; best = st; }
    }
    return best ? { st: best, pad: best.outPad } : null;
  }
  pickDest(f) {
    const g = this.game;
    if (f.data.mode === 'logs') {
      const targets = g.production.machines.filter((m) => m.def.input === 'log' && m.zone == null && !m.inBuf.isFull());
      targets.sort((a, b) => a.inBuf.count / a.inBuf.capacity - b.inBuf.count / b.inBuf.capacity);
      return targets[0] ? { st: targets[0], pad: targets[0].inPad } : null;
    }
    let best = null, bd = Infinity;
    for (const d of g.trucks.docks) { if (d.staging.isFull() || d.zone != null) continue; const dd = Math.hypot(d.pad.x - f.pos.x, d.pad.z - f.pos.z); if (dd < bd) { bd = dd; best = { st: d, pad: d.pad }; } }
    if (!best) for (const w of g.storage.warehouses) if (!w.buffer.isFull()) best = { st: w, pad: w.pad };
    return best;
  }

  update(dt) {
    const g = this.game;
    const refuelEvery = FORKLIFT_BASE.refuelEvery + this.up.fuel * 2;
    for (const f of this.list) {
      f.tickBubble(dt);
      f.vel.set(0, 0, 0);
      if (f.state === 'refuel') {
        if (f.moveTo(this.garage.x, this.garage.z + 0.5, f.speed(), dt, 1)) {
          f.refuelT += dt;
          if (f.refuelT === dt) f.say('⛽ Yakıt alıyor', FORKLIFT_BASE.refuelTime);
          if (f.refuelT > FORKLIFT_BASE.refuelTime / (1 + this.up.fuel * 0.15)) { f.refuelT = 0; f.trips = 0; f.state = 'idle'; }
        }
      } else if (f.state === 'idle') {
        if (f.stack.count) { f.dst = this.pickDest(f); f.state = f.dst ? 'drop' : 'idle'; if (!f.dst) f.say('Yer yok', 1); }
        else if (f.trips >= refuelEvery) f.state = 'refuel';
        else { f.src = this.pickSource(f); if (f.src) f.state = 'pick'; else f.say('İş bekleniyor…', 1); }
      } else if (f.state === 'pick') {
        if (f.moveTo(f.src.pad.x, f.src.pad.z, f.speed(), dt, 0.9)) {
          const got = g.inventory.transfer(f, f.src.pad, dt);
          f.waitT = (f.waitT || 0) + dt; if (got) f.waitT = 0;
          const buf = outBufOf(f.src.st);
          if (f.stack.isFull() || (buf.count === 0 && f.stack.count > 0 && f.waitT > 0.5)) { f.state = 'idle'; f.waitT = 0; }
          else if (buf.count === 0 && f.waitT > 2) { f.state = 'idle'; f.src = null; f.waitT = 0; }
        }
      } else if (f.state === 'drop') {
        if (f.moveTo(f.dst.pad.x, f.dst.pad.z, f.speed(), dt, 0.9)) {
          g.inventory.transfer(f, f.dst.pad, dt);
          const buf = f.dst.st.inBuf || f.dst.st.staging || f.dst.st.buffer;
          if (f.stack.count === 0) { f.state = 'idle'; f.trips++; }
          else if (buf.isFull()) { f.state = 'idle'; }
        }
      }
      // görsel: çatallar yükle birlikte yükselir
      const target = f.stack.count ? 0.55 + this.up.lift * 0.03 : 0.25;
      f.forkH += (target - f.forkH) * Math.min(1, dt * 4);
      f.model.forks.position.y = f.forkH;
      f.model.group.position.copy(f.pos); f.model.group.rotation.y = f.yaw;
      const sp = f.vel.length();
      for (const w of f.model.wheels) w.rotation.x += sp * dt / 0.38;
      f.model.beacon.material.emissiveIntensity = sp > 0.1 ? 0.5 + Math.sin(g.time * 12) * 0.5 : 0.2;
      f.data.x = f.pos.x; f.data.z = f.pos.z; f.data.trips = f.trips;
    }
  }

  renderItems() {}
  serialize() { this.game.state.forklifts = this.list.map((f) => ({ ...f.data, stack: f.stack.serialize() })); }
}
