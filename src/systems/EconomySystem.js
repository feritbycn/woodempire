import { ITEMS, WOODS, MACHINES, BOOSTS, WOOD_SALE_MUL, WOOD_KINDS, OTHER_SALE_MUL } from '../config/balance.js';
import { getZone } from '../config/zones.js';

/** Para, altın, fiyatlar, satış geçmişi, hızlandırmalar ve istatistikler */
export class EconomySystem {
  constructor(game) {
    this.game = game;
    this.s = game.state;
    game.stat = (key, n = 1) => {
      this.s.stats[key] = (this.s.stats[key] || 0) + n;
      game.bus.emit('stat', { key, n, total: this.s.stats[key] });
    };
    this.sessionAuto = 0; this.sessionTime = 0; this.sessionXp = 0;
  }

  get money() { return this.s.money; }
  get gold() { return this.s.gold; }

  addMoney(amount, source = 'other', at = null) {
    amount = Math.round(amount);
    if (amount <= 0) return;
    this.s.money += amount;
    this.game.stat('moneyEarned', amount);
    this.game.bus.emit('money', { amount, source, at });
  }
  canAfford(amount) { return this.s.money >= amount; }
  spend(amount, what = '') {
    amount = Math.round(amount);
    if (this.s.money < amount) { this.game.bus.emit('toast', { text: 'Yeterli paran yok!', type: 'error' }); this.game.audio.play('error'); return false; }
    this.s.money -= amount;
    this.game.stat('moneySpent', amount);
    this.game.bus.emit('money', { amount: -amount, source: what });
    this.game.save.requestSave();
    return true;
  }
  addGold(n, source = '') {
    if (n <= 0) return;
    this.s.gold += n;
    this.game.bus.emit('gold', { amount: n, source });
    this.game.save.requestSave();
  }
  spendGold(n) {
    if (this.s.gold < n) { this.game.bus.emit('toast', { text: 'Yeterli altının yok!', type: 'error' }); this.game.audio.play('error'); return false; }
    this.s.gold -= n;
    this.game.bus.emit('gold', { amount: -n });
    this.game.save.requestSave();
    return true;
  }

  /** Ürün kalitesi: ilgili makinenin kalite seviyesi */
  qualityMul(kind) {
    let best = 0;
    for (const [id, site] of this.game.sites) {
      if (site.type === 'machine' && MACHINES[site.machine].output === kind) best = Math.max(best, site.up.quality || 0);
    }
    return 1 + best * 0.06;
  }
  itemValue(item) {
    const wood = WOOD_KINDS.includes(item.kind) ? WOOD_SALE_MUL : OTHER_SALE_MUL;
    return ITEMS[item.kind].price * (WOODS[item.wood]?.mul ?? 1) * this.qualityMul(item.kind) * wood;
  }
  saleMultiplier() {
    let m = 1 + (this.s.trucks.up.bonus || 0) * 0.05;
    if (this.s.trucks.golden) m *= 1.25;
    for (const zid of this.s.zones) { const z = getZone(zid); if (z.saleBonus) m += z.saleBonus; }
    if (this.boostActive('sales')) m *= 2;
    return m;
  }

  recordSale(amount, items, dockId) {
    const counts = {};
    for (const it of items) counts[it.kind] = (counts[it.kind] || 0) + 1;
    this.s.sales.unshift({ t: Date.now(), amount: Math.round(amount), n: items.length, counts, dock: dockId });
    if (this.s.sales.length > 50) this.s.sales.length = 50;
  }

  // --- Hızlandırmalar (gerçek zaman bazlı) ---
  boostActive(name) { return (this.s.boosts[name] || 0) > Date.now(); }
  boostRemaining(name) { return Math.max(0, ((this.s.boosts[name] || 0) - Date.now()) / 1000); }
  activateBoost(name, seconds = BOOSTS[name].dur) {
    if (name === 'truck') { this.game.trucks.rushTrucks(); return; }
    const base = Math.max(Date.now(), this.s.boosts[name] || 0);
    this.s.boosts[name] = base + seconds * 1000;
    this.game.bus.emit('boost', { name });
    this.game.audio.play('boost');
    this.game.save.requestSave();
  }

  /** Otomasyon geliri (offline kazanç hesabı için) */
  noteAutomatedIncome(amount) { this.sessionAuto += amount; }
  noteAutomatedXP(n) { this.sessionXp = (this.sessionXp || 0) + n; }
  update(dt) {
    this.sessionTime += dt;
    this.s.playTime += dt;
    if (this.sessionTime > 60) {
      const rate = this.sessionAuto / this.sessionTime;
      this.s.autoRate = this.s.autoRate * 0.6 + rate * 0.4;
      this.s.autoXpRate = (this.s.autoXpRate || 0) * 0.6 + ((this.sessionXp || 0) / this.sessionTime) * 0.4;
      this.sessionAuto = 0; this.sessionTime = 0; this.sessionXp = 0;
    }
  }
}
