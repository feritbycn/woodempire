import { fmt } from './MissionSystem.js';

/** 7 günlük giriş ödülü döngüsü */
export const LOGIN_REWARDS = [
  { money: 200, label: '200 para' },
  { gold: 10, label: '10 altın' },
  { money: 600, label: '600 para' },
  { boost: 'production', label: 'Üretim x2' },
  { gold: 20, label: '20 altın' },
  { money: 2000, label: '2.000 para' },
  { gold: 50, boost: 'sales', label: '50 altın + Satış x2', special: true },
];

const QUEST_POOL = [
  { id: 'chop', stat: 'treesFelled', base: 15, title: (n) => `${n} ağaç kes` },
  { id: 'produce', stat: 'producedAny', base: 60, title: (n) => `${n} ürün üret` },
  { id: 'trucks', stat: 'trucksShipped', base: 3, title: (n) => `${n} kamyon gönder` },
  { id: 'upgrade', stat: 'upgradesMachine', base: 2, title: (n) => `${n} makine yükselt` },
  { id: 'money', stat: 'moneyEarned', base: 800, title: (n) => `${fmt(n)} para kazan` },
  { id: 'logs', stat: 'logsCollected', base: 40, title: (n) => `${n} odun topla` },
];

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Günlük giriş ödülleri ve günlük görevler (oyuncuyu geri getiren sistemler) */
export class DailyRewardSystem {
  constructor(game) {
    this.game = game;
    this.s = game.state.daily;
    this.refresh();
    game.every(5, () => this.refresh());
  }

  refresh() {
    const t = today();
    if (this.s.day !== t) {
      // seri: dün giriş yaptıysa devam, değilse sıfırla
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterday = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
      if (this.s.claimedDay !== yesterday && this.s.claimedDay !== t) this.s.streak = 0;
      this.s.day = t;
      this.makeQuests();
    }
    if (this.s.adDay !== t) { this.s.adDay = t; this.s.adsToday = 0; }
  }

  makeQuests() {
    const L = this.game.state.level;
    const seed = this.s.day.split('-').reduce((a, b) => a * 31 + +b, 7);
    const picks = [];
    const pool = [...QUEST_POOL];
    for (let i = 0; i < 3; i++) picks.push(pool.splice((seed + i * 13) % pool.length, 1)[0]);
    this.s.quests = picks.map((q) => {
      const n = Math.round(q.base * (1 + L * 0.35) * (q.id === 'money' ? Math.pow(L, 0.9) : 1));
      return { id: q.id, stat: q.stat, n, base: this.game.state.stats[q.stat] || 0, title: q.title(n), claimed: false, reward: { gold: 5 + Math.floor(L / 3), money: Math.round(100 * Math.pow(L, 1.4)) } };
    });
  }

  canClaimLogin() { return this.s.claimedDay !== today(); }
  loginIndex() { return this.s.streak % 7; }
  claimLogin(double = false) {
    if (!this.canClaimLogin()) return false;
    const g = this.game;
    const r = LOGIN_REWARDS[this.loginIndex()];
    const m = double ? 2 : 1;
    if (r.money) g.economy.addMoney(r.money * m, 'daily');
    if (r.gold) g.economy.addGold(r.gold * m, 'daily');
    if (r.boost) g.economy.activateBoost(r.boost);
    this.s.streak++;
    this.s.claimedDay = today();
    g.audio.play('mission');
    g.bus.emit('dailyClaimed', r);
    g.save.requestSave(true);
    return true;
  }

  questView() {
    return this.s.quests.map((q) => {
      const v = Math.min(q.n, (this.game.state.stats[q.stat] || 0) - q.base);
      return { ...q, value: v, done: v >= q.n };
    });
  }
  /** Tamamlanmış tüm günlük görevlerin ödülünü tek seferde al */
  claimAllQuests() {
    let gold = 0, money = 0, n = 0;
    for (const v of this.questView()) {
      if (!v.done || v.claimed) continue;
      const q = this.s.quests.find((x) => x.id === v.id); if (!q || q.claimed) continue;
      q.claimed = true; gold += q.reward.gold; money += q.reward.money; n++;
    }
    if (!n) return false;
    this.game.economy.addGold(gold, 'daily');
    this.game.economy.addMoney(money, 'daily');
    this.game.audio.play('mission');
    this.game.bus.emit('toast', { text: `${n} görev ödülü alındı: +${money} para, +${gold} altın`, type: 'success' });
    this.game.save.requestSave();
    return true;
  }
  claimQuest(id) {
    const q = this.s.quests.find((x) => x.id === id);
    const v = this.questView().find((x) => x.id === id);
    if (!q || q.claimed || !v.done) return false;
    q.claimed = true;
    this.game.economy.addGold(q.reward.gold, 'daily');
    this.game.economy.addMoney(q.reward.money, 'daily');
    this.game.audio.play('mission');
    this.game.save.requestSave();
    return true;
  }
  claimableCount() { return this.questView().filter((q) => q.done && !q.claimed).length + (this.canClaimLogin() ? 1 : 0); }
}
