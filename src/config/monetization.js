// =============================================================
// Reklam ve uygulama içi satın alma yapılandırması
// YAYINDAN ÖNCE: test kimliklerini kendi AdMob kimliklerinizle,
// doğrulama adresini kendi sunucunuzla değiştirin (docs/MONETIZATION.md).
// =============================================================

export const ADS = {
  // GERÇEK AdMob kimlikleri (Woodempire · Android)
  appIdAndroid: 'ca-app-pub-4446596500153010~6267475467',
  rewardedAndroid: 'ca-app-pub-4446596500153010/1962378889', // Ödüllü reklam birimi "Odullu"
  interstitialAndroid: 'ca-app-pub-4446596500153010/3522872562', // Geçiş reklam birimi "Gecis"
  // Geçiş reklamı kuralları: yalnızca doğal aralarda, seyrek, yeni oyuncuya değil, ödüllüyle üst üste değil
  interstitial: { minGap: 240, minLevel: 5, minSession: 600, afterRewarded: 180 },
  testing: false,          // gerçek reklamlar (kendi reklamına tıklama/izleme yapma; test için AdMob'da test cihazı ekle)
  dailyLimit: 20,
};

export const IAP = {
  // Satın alma doğrulama sunucusu (server/verify-purchase). Boşsa satın alma KAPALIDIR.
  verifyUrl: '',
  products: [
    { id: 'gold_small',   type: 'consumable',    title: 'Küçük Altın Paketi', gold: 100,  priceHint: '₺29,99' },
    { id: 'gold_medium',  type: 'consumable',    title: 'Orta Altın Paketi',  gold: 550,  priceHint: '₺119,99', tag: '+%10' },
    { id: 'gold_large',   type: 'consumable',    title: 'Büyük Altın Paketi', gold: 1200, priceHint: '₺229,99', tag: 'En iyi değer' },
    { id: 'boost_pack',   type: 'consumable',    title: 'Hızlandırma Paketi', gold: 0, boosts: { production: 1800, sales: 1800 }, priceHint: '₺49,99' },
    { id: 'truck_pack',   type: 'non-consumable', title: 'Altın Kamyon Paketi', grant: 'goldenTruck', gold: 150, priceHint: '₺89,99' },
    { id: 'worker_pack',  type: 'non-consumable', title: 'Premium İşçi Paketi', grant: 'premiumWorkerPack', priceHint: '₺89,99' },
    { id: 'skin_pack',    type: 'non-consumable', title: 'Kereste Kralı Görünümü', grant: 'royalSkin', priceHint: '₺49,99' },
    { id: 'no_ads',       type: 'non-consumable', title: 'Reklamsız Premium', grant: 'noAds', priceHint: '₺99,99', desc: 'Geçiş reklamları çıkmaz, reklam ödüllerini reklam izlemeden anında al' },
  ],
};
