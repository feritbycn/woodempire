import { Capacitor } from '@capacitor/core';
import { ADS } from '../config/monetization.js';

/**
 * Ödüllü reklamlar — Google AdMob (@capacitor-community/admob) gerçek SDK entegrasyonu.
 * - Reklam zorunlu değildir; yüklenemezse oyun hata vermez, ilerleme etkilenmez.
 * - "Reklamsız Premium" sahipleri ödülü reklamsız anında alır.
 * - Web/geliştirme ortamında SDK yoktur: yalnızca dev modda açıkça etiketli bir simülasyon gösterilir.
 */
export class AdsManager {
  constructor(game) {
    this.game = game;
    this.native = Capacitor.isNativePlatform();
    this.ready = false;
    this.loading = false;
    this.AdMob = null;
    // Web/önizleme sürümünde gerçek reklam SDK'sı yoktur: açıkça etiketli simülasyon gösterilir (Android'de AdMob)
    this.devSim = !this.native;
    this.status = this.native ? 'init' : this.devSim ? 'dev' : 'unavailable';
    if (this.native) this.init().catch((e) => { console.warn('[Ads] init', e); this.status = 'error'; });
  }

  async init() {
    const mod = await import('@capacitor-community/admob');
    this.AdMob = mod.AdMob; this.Events = mod.RewardAdPluginEvents; this.IEvents = mod.InterstitialAdPluginEvents;
    await this.AdMob.initialize({ initializeForTesting: ADS.testing });
    // GDPR / UMP onayı
    try {
      const info = await this.AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') await this.AdMob.showConsentForm();
    } catch (e) { console.warn('[Ads] consent', e); }
    this.status = 'ok';
    this.preload();
    this.preloadInter();
  }

  async preload() {
    if (!this.AdMob || this.loading || this.ready) return;
    this.loading = true;
    try {
      await this.AdMob.prepareRewardVideoAd({ adId: ADS.rewardedAndroid, isTesting: ADS.testing });
      this.ready = true;
    } catch (e) { console.warn('[Ads] yüklenemedi', e); this.ready = false; setTimeout(() => this.preload(), 30000); }
    this.loading = false;
  }

  // ---------- GEÇİŞ (tam ekran) REKLAMI ----------
  async preloadInter() {
    if (!this.AdMob || this.iLoading || this.iReady || !ADS.interstitialAndroid) return;
    this.iLoading = true;
    try { await this.AdMob.prepareInterstitial({ adId: ADS.interstitialAndroid, isTesting: ADS.testing }); this.iReady = true; }
    catch (e) { console.warn('[Ads] geçiş yüklenemedi', e); this.iReady = false; setTimeout(() => this.preloadInter(), 60000); }
    this.iLoading = false;
  }
  /** Doğal bir arada (seviye atlama, alan alma, kapalıyken kazanç sonrası) KURALLAR uygunsa geçiş reklamı göster.
   *  Oyuncu yürüyorsa hemen değil, durunca (en geç 20 sn içinde) gösterilir; uygun olmazsa vazgeçilir. */
  maybeInterstitial(reason) {
    if (!this.interAllowed()) return;
    if (this.iPending) return;
    this.iPending = { reason, t: performance.now() };
    const tryShow = () => {
      if (!this.iPending) return;
      if (!this.interAllowed() || performance.now() - this.iPending.t > 20000) { this.iPending = null; return; }
      const v = this.game.player?.vel; const moving = v && Math.hypot(v.x, v.z) > 0.3;
      const busy = document.querySelector('.modal-wrap:not(.hidden)') || document.hidden;
      if (moving || busy) { setTimeout(tryShow, 1500); return; }
      this.iPending = null; this.showInterstitial(reason);
    };
    setTimeout(tryShow, 1200);
  }
  interAllowed() {
    const g = this.game; const R = ADS.interstitial;
    if (!this.native || !this.AdMob || this.status !== 'ok' || !this.iReady) return false;
    if (this.hasNoAds()) return false;                                   // Reklamsız Premium: hiç geçiş reklamı yok
    if ((g.state.level || 1) < R.minLevel) return false;                 // yeni oyuncuya gösterilmez
    const now = performance.now() / 1000;
    if (now < R.minSession) return false;                                // oturumun ilk 10 dakikası yok
    if (this.lastInter && now - this.lastInter < R.minGap) return false; // iki geçiş arası en az 4 dk
    if (this.lastRewarded && now - this.lastRewarded < R.afterRewarded) return false; // ödüllüden hemen sonra yok
    return true;
  }
  async showInterstitial(reason) {
    const g = this.game;
    try {
      g.audio.suspendForAd(true);
      await new Promise((resolve) => {
        const subs = []; let fin = false;
        const done = () => { if (fin) return; fin = true; subs.forEach((s) => s.then?.((h) => h.remove())); resolve(); };
        subs.push(this.AdMob.addListener(this.IEvents.Dismissed, done));
        subs.push(this.AdMob.addListener(this.IEvents.FailedToShow, done));
        this.AdMob.showInterstitial().catch(done);
        setTimeout(done, 90000);
      });
      this.lastInter = performance.now() / 1000; g.stat('interstitials');
    } catch (e) { console.warn('[Ads] geçiş gösterilemedi', e); }
    g.audio.suspendForAd(false);
    this.iReady = false; this.preloadInter();
  }

  hasNoAds() { return !!this.game.state.purchases.noAds; }
  available() {
    if (this.hasNoAds()) return true;
    if (this.game.state.daily.adsToday >= ADS.dailyLimit) return false;
    return this.devSim || (this.native && this.status === 'ok');
  }

  /** Ödüllü reklam göster. Ödül kazanıldıysa true döner. Hiçbir durumda hata fırlatmaz. */
  async showRewarded(placement = 'generic') {
    const g = this.game;
    try {
      if (this.hasNoAds()) return true;
      if (g.state.daily.adsToday >= ADS.dailyLimit) { g.bus.emit('toast', { text: 'Bugünlük reklam limiti doldu', type: 'info' }); return false; }
      let ok = false;
      if (this.native && this.AdMob) {
        if (!this.ready) { await this.preload(); }
        if (!this.ready) { g.bus.emit('toast', { text: 'Reklam şu an yüklenemedi, daha sonra tekrar dene', type: 'info' }); return false; }
        g.audio.suspendForAd(true);
        ok = await new Promise((resolve) => {
          let rewarded = false; const subs = [];
          let fin = false; const done = (v) => { if (fin) return; fin = true; subs.forEach((s) => s.then?.((h) => h.remove())); resolve(v); };
          subs.push(this.AdMob.addListener(this.Events.Rewarded, () => { rewarded = true; }));
          subs.push(this.AdMob.addListener(this.Events.Dismissed, () => done(rewarded)));
          subs.push(this.AdMob.addListener(this.Events.FailedToShow, () => done(false)));
          // ödül yalnızca SDK'nın Rewarded olayı veya ödül nesnesi döndürmesiyle verilir
          this.AdMob.showRewardVideoAd().then((item) => { if (item && (item.amount > 0 || item.type)) rewarded = true; }).catch(() => done(false));
          setTimeout(() => done(rewarded), 120000);
        });
        g.audio.suspendForAd(false);
        this.ready = false; this.preload();
      } else if (this.devSim) {
        // yalnızca geliştirme: UI'daki etiketli simülasyon penceresi sonucu bildirir
        ok = await new Promise((res) => { g.bus.emit('devAd', res); setTimeout(() => res(false), 15000); });
      } else {
        g.bus.emit('toast', { text: 'Reklamlar yalnızca Android sürümünde', type: 'info' });
        return false;
      }
      this.lastRewarded = performance.now() / 1000;
      if (ok) { g.state.daily.adsToday++; g.stat('adsWatched'); g.save.requestSave(); }
      return ok;
    } catch (e) {
      console.warn('[Ads] gösterim hatası', e);
      g.audio.suspendForAd(false);
      return false;
    }
  }
}
