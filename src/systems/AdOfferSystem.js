import { BOOSTS } from '../config/balance.js';

/**
 * Süreli reklam teklifleri: ara sıra ekranın sağında veya solunda bir ödül ikonu belirir
 * (2x Hız, 2x Para, Otomatik Toplama, Otomatik Kesim, 2x Üretim). Oyuncu dokunup ödüllü reklamı
 * sonuna kadar izlerse süreli güçlendirme başlar. Reklam zorunlu değildir; teklif bir süre sonra kaybolur.
 */
export const AD_OFFERS = [
  { boost: 'helper', dur: 60 },
  { boost: 'speed', dur: 60 },
  { boost: 'sales', dur: 60 },
  { boost: 'magnet', dur: 60 },
  { boost: 'autochop', dur: 60 },
  { boost: 'production', dur: 120 },
  { boost: 'speed', dur: 120 },
  { boost: 'sales', dur: 120 },
];
const FIRST_DELAY = 45, GAP_MIN = 60, GAP_MAX = 110, VISIBLE = 22;

export class AdOfferSystem {
  constructor(game) {
    this.game = game;
    this.cur = null;
    this.next = FIRST_DELAY;
    this.side = 'right';
    this.busy = false;
  }

  update(dt) {
    const g = this.game;
    if (this.busy) return;
    if (this.cur) {
      this.cur.left -= dt;
      if (this.cur.left <= 0) { this.cur = null; this.next = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN); g.bus.emit('adOffer', null); }
      return;
    }
    if (!g.ready || !g.ads.available()) return;
    this.next -= dt;
    if (this.next > 0) return;
    const choices = AD_OFFERS.filter((o) => !g.economy.boostActive(o.boost));
    if (!choices.length) { this.next = 20; return; }
    const o = choices[Math.floor(Math.random() * choices.length)];
    this.side = this.side === 'right' ? 'left' : 'right';
    this.cur = { ...o, side: this.side, left: VISIBLE, total: VISIBLE, def: BOOSTS[o.boost] };
    g.audio.play('magnet', { vol: 0.35, pitch: 1.4 });
    g.bus.emit('adOffer', this.cur);
  }

  /** Oyuncu teklife dokundu: reklamı göster, izlenirse güçlendirmeyi başlat */
  async claim() {
    const g = this.game;
    const o = this.cur;
    if (!o || this.busy) return false;
    this.busy = true;
    let ok = false;
    try { ok = await g.ads.showRewarded('offer_' + o.boost); } catch { ok = false; }
    this.busy = false;
    this.cur = null;
    this.next = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    g.bus.emit('adOffer', null);
    if (ok) {
      g.economy.activateBoost(o.boost, o.dur);
      g.stat('adOffersClaimed');
      g.bus.emit('toast', { text: o.boost === 'helper' ? 'Yardımcı işçi geldi! (1 dakika)' : `${o.def.name} · ${o.dur >= 120 ? '2 dakika' : '1 dakika'} başladı!`, type: 'success' });
    }
    return ok;
  }
  dismiss() { if (!this.cur) return; this.cur = null; this.next = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN); this.game.bus.emit('adOffer', null); }
}
