import { ITEMS } from '../config/balance.js';

/**
 * Taşıyıcıların (oyuncu, işçi, forklift) istiflerini çizer ve
 * taşıyıcı ↔ alan (pad) arasındaki ürün aktarımını yönetir.
 */
export class InventorySystem {
  constructor(game) {
    this.game = game;
    this.carriers = new Set();
  }
  register(c) { this.carriers.add(c); }
  unregister(c) { this.carriers.delete(c); }

  /** Taşıyıcının istifindeki i. ürünün dünya konumu */
  stackPoint(c, i) {
    const a = c.anchor();
    let h = 0;
    for (let k = 0; k < i && k < c.stack.items.length; k++) h += ITEMS[c.stack.items[k].kind].h;
    const it = c.stack.items[Math.min(i, c.stack.items.length - 1)];
    const ih = it ? ITEMS[it.kind].h : 0.3;
    return { x: a.x, y: a.y + h + ih / 2, z: a.z };
  }

  /**
   * Bir taşıyıcı alanın üzerinde dururken çağrılır. Bir ürün aktarırsa true döner.
   * pad.mode: 'in' (taşıyıcıdan hazneye) | 'out' (hazneden taşıyıcıya)
   */
  transfer(c, pad, dt) {
    c.tcd = (c.tcd || 0) - dt;
    if (c.tcd > 0) return false;
    const g = this.game;
    if (pad.mode === 'in') {
      const buf = pad.buffer;
      if (buf.isFull()) {
        if (c.isPlayer) {
          pad.fullWarn = g.time;
          if (c.stack.count > 0 && g.time - (pad.msgT || -9) > 3) {
            pad.msgT = g.time;
            const nm = pad.station?.name || 'Burası';
            const tip = pad.type === 'sell' ? ' — kamyonu bekle ya da yanındaki "Yükleme Alanını Genişlet" noktasından büyüt' : ' — genişletilebilir ya da boşalmasını bekle';
            g.bus.emit('toast', { text: `${nm} dolu${tip}`, type: 'error' }); g.audio.play('error', { vol: 0.5 });
          }
        }
        return false;
      }
      const top = this.stackPoint(c, c.stack.count - 1);
      const item = c.stack.popMatching((it) => buf.canAccept(it) && (!pad.filter || pad.filter(it, c)));
      if (!item) {
        if (c.isPlayer && c.stack.count > 0 && g.time - (pad.msgT || -9) > 3) {
          // bırakılamıyor: neden ve nereye götürüleceğini söyle (ürün türü uymasa da)
          let msg = c.stack.items.some((it) => buf.canAccept(it)) ? pad.filterMsg : null;
          if (!msg && pad.type !== 'sell') { const it = c.stack.items[0]; const to = g.production.whereTo(it); msg = `${ITEMS[it.kind].name} buraya konmaz → ${to}`; }
          if (msg) { pad.msgT = g.time; g.bus.emit('toast', { text: msg, type: 'error' }); g.audio.play('error', { vol: 0.5 }); }
        }
        return false;
      }
      buf.push(item); buf.hold++;
      const dest = pad.dropPoint ? pad.dropPoint(buf.count - 1, item) : { x: pad.x, y: 0.5, z: pad.z };
      g.fx.fly(item, top, dest, 0.26, () => { buf.hold = Math.max(0, buf.hold - 1); });
      c.tcd = c.transferInterval();
      g.bus.emit('deposit', { item, pad, carrier: c });
      if (c.isPlayer && item.kind === 'log' && pad.station?.type === 'machine') g.stat('logsToMachine');
      if (c.isPlayer) { g.audio.play('drop', { pitch: 0.9 + Math.random() * 0.2, vol: 0.6 }); g.haptic('light'); }
      pad.onReceive?.(item, c);
      return true;
    }
    if (pad.mode === 'out') {
      if (c.stack.isFull()) return false;
      const buf = pad.buffer;
      const want = c.wantKinds ? c.wantKinds(pad) : null;
      if (want && want.length === 0) return false;
      const srcIndex = buf.count - 1;
      const item = buf.pop(want);
      if (!item) return false;
      const from = pad.dropPoint ? pad.dropPoint(srcIndex, item) : { x: pad.x, y: 0.5, z: pad.z };
      c.stack.push(item); c.stack.hold++;
      g.fx.fly(item, from, () => this.stackPoint(c, c.stack.count - 1), 0.24, () => { c.stack.hold = Math.max(0, c.stack.hold - 1); });
      c.tcd = c.transferInterval();
      g.bus.emit('pickup', { item, pad, carrier: c });
      if (c.isPlayer) { g.audio.play('pickup', { pitch: 0.9 + Math.random() * 0.25, vol: 0.5 }); g.haptic('light'); }
      return true;
    }
    return false;
  }

  /** Yerdeki bir kütüğü taşıyıcıya al (toplama) */
  pickFromGround(c, item, from) {
    if (c.stack.isFull()) return false;
    c.stack.push(item); c.stack.hold++;
    this.game.fx.fly(item, from, () => this.stackPoint(c, c.stack.count - 1), 0.22, () => { c.stack.hold = Math.max(0, c.stack.hold - 1); }, 1.0);
    return true;
  }

  update() {}

  renderItems(R) {
    for (const c of this.carriers) {
      if (!c.visible || c.stack.count === 0) continue;
      const a = c.anchor();
      const n = c.stack.count - c.stack.hold;
      const yaw = c.yaw;
      const vx = c.vel ? c.vel.x : 0, vz = c.vel ? c.vel.z : 0;
      const maxShow = Math.min(n, c.maxVisual || 45);
      if (c.pairStack) {
        // işçi: ikişerli sıra (biri sırtta, biri hemen arkasında), en fazla 3 kat — devasa yığın oluşmaz, vücudu kapatmaz
        const fx = Math.sin(yaw), fz = Math.cos(yaw); let hh = 0;
        for (let i = 0; i < maxShow; i++) {
          const it = c.stack.items[i]; const ih = ITEMS[it.kind].h * 0.9;
          const back = (i % 2) * 0.4;
          R.add(it.kind, it.wood, a.x - fx * back, a.y + hh + ih / 2, a.z - fz * back, yaw);
          if (i % 2 === 1) hh += ih;
        }
        continue;
      }
      let h = 0;
      for (let i = 0; i < maxShow; i++) {
        const it = c.stack.items[i];
        const ih = ITEMS[it.kind].h;
        // istif hareket yönünün tersine hafifçe salınır
        const lag = i * 0.012;
        R.add(it.kind, it.wood, a.x - vx * lag, a.y + h + ih / 2, a.z - vz * lag, yaw + (c.stackYaw || 0) + Math.sin(i * 1.7) * 0.03);
        h += ih;
      }
    }
  }
}
