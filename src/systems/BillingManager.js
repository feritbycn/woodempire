import { Capacitor } from '@capacitor/core';
import { IAP } from '../config/monetization.js';

/**
 * Google Play Billing — cordova-plugin-purchase (CdvPurchase v13) ile.
 * Satın alma YALNIZCA sunucu doğrulaması başarılı olursa verilir (IAP.verifyUrl).
 * Doğrulama adresi tanımlı değilse mağaza satın almayı kapatır ve bunu açıkça gösterir.
 * Aynı işlem iki kez verilmez (processedOrders).
 */
export class BillingManager {
  constructor(game) {
    this.game = game;
    this.native = Capacitor.isNativePlatform();
    this.store = null;
    this.status = !this.native ? 'web' : !IAP.verifyUrl ? 'no-validator' : 'init';
    this.prices = {};
    if (this.native) {
      document.addEventListener('deviceready', () => this.init().catch((e) => { console.warn('[IAP]', e); this.status = 'error'; }), false);
    }
  }

  statusText() {
    return {
      web: 'Satın alma yalnızca Google Play sürümünde kullanılabilir.',
      'no-validator': 'Mağaza yapılandırılmadı: doğrulama sunucusu tanımlı değil (docs/MONETIZATION.md).',
      init: 'Mağaza yükleniyor…',
      error: 'Google Play mağazasına bağlanılamadı.',
      ok: '',
    }[this.status] ?? '';
  }
  enabled() { return this.status === 'ok'; }

  async init() {
    const CdvPurchase = window.CdvPurchase;
    if (!CdvPurchase) { this.status = 'error'; return; }
    const { store, ProductType, Platform, LogLevel } = CdvPurchase;
    this.store = store;
    store.verbosity = LogLevel.WARNING;
    store.register(IAP.products.map((p) => ({
      id: p.id, platform: Platform.GOOGLE_PLAY,
      type: p.type === 'consumable' ? ProductType.CONSUMABLE : ProductType.NON_CONSUMABLE,
    })));
    if (!IAP.verifyUrl) { this.status = 'no-validator'; }
    else store.validator = IAP.verifyUrl;
    store.when()
      .productUpdated((p) => { if (p.pricing) this.prices[p.id] = p.pricing.price; this.game.bus.emit('shopUpdated'); })
      .approved((tx) => { if (IAP.verifyUrl) tx.verify(); })
      .verified((receipt) => { this.grantFromReceipt(receipt); receipt.finish(); })
      .unverified((r) => { this.game.bus.emit('toast', { text: 'Satın alma doğrulanamadı', type: 'error' }); console.warn('[IAP] unverified', r?.payload); });
    await store.initialize([Platform.GOOGLE_PLAY]);
    if (IAP.verifyUrl) this.status = 'ok';
    this.game.bus.emit('shopUpdated');
  }

  price(id) { return this.prices[id] || IAP.products.find((p) => p.id === id)?.priceHint || ''; }

  async buy(id) {
    const g = this.game;
    if (!this.enabled()) { g.bus.emit('toast', { text: this.statusText(), type: 'info' }); return false; }
    try {
      const product = this.store.get(id);
      const offer = product?.getOffer();
      if (!offer) { g.bus.emit('toast', { text: 'Ürün bulunamadı', type: 'error' }); return false; }
      const err = await offer.order();
      if (err) { if (err.code !== window.CdvPurchase.ErrorCode.PAYMENT_CANCELLED) g.bus.emit('toast', { text: 'Satın alma başarısız', type: 'error' }); return false; }
      return true;
    } catch (e) { console.warn('[IAP] order', e); return false; }
  }

  async restore() { try { if (this.store) await this.store.restorePurchases(); } catch (e) { console.warn(e); } }

  /** Doğrulanmış makbuzdaki her işlemi bir kez uygula */
  grantFromReceipt(receipt) {
    const s = this.game.state;
    const txs = receipt?.sourceReceipt?.transactions || [];
    for (const tx of txs) {
      const key = tx.transactionId || tx.purchaseId;
      if (!key || s.processedOrders.includes(key)) continue;
      for (const p of tx.products || []) this.game.shop.grantProduct(p.id, key);
      s.processedOrders.push(key);
      if (s.processedOrders.length > 300) s.processedOrders.shift();
    }
    this.game.save.requestSave(true);
  }
}
