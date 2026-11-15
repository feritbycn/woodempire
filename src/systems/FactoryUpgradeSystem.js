import { MACHINE_UPGRADES, upgradeCost, XP } from '../config/balance.js';

/**
 * Makine yükseltmeleri: hız, kapasite, kalite, bıçak sayısı (testere), makine boyutu.
 * Her yükseltme hem değeri hem de gerektiğinde görünümü değiştirir.
 */
/** Her yükseltmenin makinede yarattığı görsel değişiklik */
const VISUAL = { speed: 'Bıçaklar daha hızlı döner', capacity: 'Giriş/çıkış masaları büyür', quality: 'Daha temiz kesim', blades: 'Makineye yeni bıçak eklenir', size: 'Makine büyür, bıçaklar irileşir' };

export class FactoryUpgradeSystem {
  constructor(game) { this.game = game; }

  /** Bir makinede kullanılabilir yükseltmeler */
  options(st) {
    return Object.entries(MACHINE_UPGRADES)
      .filter(([k, d]) => !d.only || d.only.includes(st.machine))
      .map(([key, def]) => {
        const lvl = st.up[key] || 0;
        const maxed = lvl >= def.max;
        let locked = null;
        if (def.gates && !maxed) {
          const gateZone = def.gates[lvl];
          if (!this.game.land.owns(gateZone)) locked = `${this.game.land.zoneDef(gateZone).name} gerekli`;
        }
        // şimdi → sonra (yükseltme öncesi ne kazanılacağı) + görsel değişiklik
        let next = '';
        if (!maxed) { st.up[key] = lvl + 1; next = this.effectText(st, key); st.up[key] = lvl; }
        return { key, def, level: lvl, maxed, locked, cost: this.cost(st, key), effect: this.effectText(st, key), next, visual: VISUAL[key] };
      });
  }
  cost(st, key) {
    const def = MACHINE_UPGRADES[key];
    const tierMul = ({ saw: 1, sander: 1.6, packer: 3, palletizer: 12, furniture: 16, panelpress: 30, autoline: 60 }[st.machine] || 1) * (st.id.startsWith('line_') ? 4 * (1 + +st.id.slice(5) - 10) : 1);
    return Math.round(upgradeCost(def, st.up[key] || 0) * tierMul);
  }
  effectText(st, key) {
    const P = this.game.production;
    switch (key) {
      case 'speed': return `${P.procTime(st).toFixed(2)} sn / işlem (${P.perMin(st)}/dk)`;
      case 'capacity': return `Giriş ${P.inCap(st)} · Çıkış ${P.outCap(st)}`;
      case 'quality': return `Değer +%${(st.up.quality || 0) * 6}`;
      case 'blades': return `${1 + st.up.blades} bıçak · kütük başına ${P.outCount(st)} kereste`;
      case 'size': return `${['Küçük', 'Orta', 'Büyük', 'Endüstriyel'][st.up.size || 0]} · aynı anda ${P.batch(st)} işlem (${P.perMin(st)}/dk)`;
    }
    return '';
  }

  upgrade(st, key) {
    const g = this.game;
    const opt = this.options(st).find((o) => o.key === key);
    if (!opt || opt.maxed || opt.locked) return false;
    if (!g.economy.spend(opt.cost, 'upgrade')) return false;
    st.up[key] = (st.up[key] || 0) + 1;
    const P = g.production;
    if (key === 'capacity') { st.inBuf.capacity = P.inCap(st); st.outBuf.capacity = P.outCap(st); }
    if (key === 'blades') st.model.setBlades(1 + st.up.blades);
    if (key === 'size') P.applySizeVisual(st);
    g.stat('upgradesMachine');
    g.levels.addXP(XP.upgrade * (key === 'size' ? 5 : 1));
    g.audio.play('upgrade');
    g.fx.burst(st.x, 2.2, st.z, [0xffd54f, 0xffffff, 0x40c4ff], 36, { speed: 4, up: 6 });
    g.bus.emit('upgrade', { target: st.id, key, level: st.up[key] });
    return true;
  }
}
