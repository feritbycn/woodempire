import { xpForLevel, levelReward, xpGainMul } from '../config/balance.js';

/** Sonsuz seviye ve XP sistemi */
export class LevelSystem {
  constructor(game) { this.game = game; this.s = game.state; }
  get level() { return this.s.level; }
  get need() { return xpForLevel(this.s.level); }
  get progress() { return this.s.xp / this.need; }

  addXP(n, at = null, auto = false) {
    if (auto) this.game.economy.noteAutomatedXP?.(n); // makinelerin/kamyonların kazandırdığı XP (kapalıyken kazanç hesabı için)
    // 5. seviyeden sonra kazanılan XP %70 azalır; küsurat birikir (1 XP'lik işler de sayılır, kaybolmaz)
    this.frac = (this.frac || 0) + n * xpGainMul(this.s.level);
    n = Math.floor(this.frac);
    if (n < 1) return;
    this.frac -= n;
    this.s.xp += n;
    this.game.bus.emit('xp', { amount: n, at });
    while (this.s.xp >= xpForLevel(this.s.level)) {
      this.s.xp -= xpForLevel(this.s.level);
      this.s.level++;
      const r = levelReward(this.s.level);
      this.game.economy.addMoney(r.money, 'level');
      this.game.economy.addGold(r.gold, 'level');
      this.game.audio.play('levelup');
      this.game.haptic('heavy');
      const p = this.game.player.pos;
      this.game.fx.confetti(p.x, 2.5, p.z, 80);
      this.game.bus.emit('levelUp', { level: this.s.level, reward: r, unlocks: this.unlocksAt(this.s.level) });
      this.game.save.requestSave(true);
    }
  }

  /** Bu seviyede açılan içerikler (bilgi amaçlı) */
  unlocksAt(level) {
    const out = [];
    for (let id = 0; id < 30; id++) {
      const z = this.game.land.zoneDef(id);
      if (z.level === level) out.push(`Arazi: ${z.name}`);
    }
    return out;
  }
}
