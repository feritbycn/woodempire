import { BOOSTS } from '../config/balance.js';
import { IAP } from '../config/monetization.js';
import { SKINS } from '../world/Models.js';

/** Mağaza: altınla alınanlar (hızlandırma, görünüm, özel araç, premium işçi) ve IAP ödülleri */
export class ShopSystem {
  constructor(game) { this.game = game; }

  goldItems() {
    const s = this.game.state;
    return [
      { id: 'golden_truck', title: 'Altın Kamyon', desc: 'Tüm satışlara kalıcı +%25', gold: 300, owned: s.trucks.golden },
      { id: 'premium_worker', title: 'Premium İşçi', desc: '1.5x hızlı, +3 taşıma, kapasiteden bağımsız', gold: 150, owned: false },
    ];
  }

  async buyBoost(name, via = 'gold') {
    const g = this.game;
    const def = BOOSTS[name];
    if (via === 'gold') { if (!g.economy.spendGold(def.gold)) return false; }
    else { const ok = await g.ads.showRewarded('boost_' + name); if (!ok) return false; }
    g.economy.activateBoost(name);
    g.stat('boostsUsed');
    g.bus.emit('toast', { text: `${def.name} etkin!`, type: 'success' });
    return true;
  }

  buyGoldItem(id) {
    const g = this.game; const s = g.state;
    if (id === 'golden_truck') {
      if (s.trucks.golden) return false;
      if (!g.economy.spendGold(300)) return false;
      s.trucks.golden = true;
      g.bus.emit('toast', { text: 'Altın Kamyon filonda! (sonraki kamyonlar)', type: 'success' });
    } else if (id === 'premium_worker') {
      if (!g.workers.office) { g.bus.emit('toast', { text: 'Önce İşçi Ofisi kurulmalı', type: 'error' }); return false; }
      if (!g.economy.spendGold(150)) return false;
      g.workers.hire('lumberjack', true);
    }
    g.audio.play('upgrade');
    g.save.requestSave(true);
    return true;
  }

  skins() {
    const s = this.game.state.player;
    return Object.entries(SKINS).map(([id, d]) => ({ id, ...d, owned: s.skins.includes(id) || (id === 'royal' && this.game.state.purchases.royalSkin), active: s.skin === id }));
  }
  buySkin(id) {
    const g = this.game; const s = g.state.player; const d = SKINS[id];
    const owned = s.skins.includes(id) || (id === 'royal' && g.state.purchases.royalSkin);
    if (!owned) {
      if (d.iap) { g.bus.emit('toast', { text: 'Bu görünüm mağaza paketinde', type: 'info' }); return false; }
      if (!g.economy.spendGold(d.price)) return false;
      s.skins.push(id);
    }
    g.player.setSkin(id);
    g.audio.play('upgrade');
    g.save.requestSave();
    return true;
  }

  /** Reklam karşılığı küçük ödüller */
  async adReward(kind) {
    const g = this.game;
    const ok = await g.ads.showRewarded(kind);
    if (!ok) return false;
    const L = g.state.level;
    if (kind === 'money') g.economy.addMoney(Math.round(150 * Math.pow(L, 1.5)), 'ad');
    else if (kind === 'gold') g.economy.addGold(5, 'ad');
    else if (kind === 'carry') g.economy.activateBoost('carry');
    else if (kind === 'truck') g.economy.activateBoost('truck');
    else if (kind === 'production') g.economy.activateBoost('production');
    g.audio.play('cash');
    return true;
  }

  /** Doğrulanmış IAP ürününü uygula (BillingManager çağırır) */
  grantProduct(id, orderId) {
    const g = this.game; const s = g.state;
    const p = IAP.products.find((x) => x.id === id);
    if (!p) return;
    if (p.gold) g.economy.addGold(p.gold, 'iap');
    if (p.boosts) for (const [b, sec] of Object.entries(p.boosts)) g.economy.activateBoost(b, sec);
    if (p.grant === 'goldenTruck') s.trucks.golden = true;
    if (p.grant) s.purchases[p.grant] = true;
    if (p.grant === 'royalSkin' && !s.player.skins.includes('royal')) s.player.skins.push('royal');
    if (p.grant === 'premiumWorkerPack' && g.workers.office) g.workers.hire('loader', true);
    g.audio.play('mission');
    g.bus.emit('toast', { text: `${p.title} hesabına eklendi. Teşekkürler!`, type: 'success' });
  }
}
