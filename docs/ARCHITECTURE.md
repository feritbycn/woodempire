# Teknik Mimari

## Teknoloji seçimi
| Katman | Teknoloji |
|---|---|
| 3B motor | **Three.js 0.180** (WebGL 2, PBR malzemeler, PCF yumuşak gölgeler, ACES ton eşleme) |
| Dil / derleme | Modern JavaScript (ES modülleri) + **Vite 7** |
| Android kabuğu | **Capacitor 8** (native Android projesi, WebView içinde donanım hızlandırmalı WebGL) |
| Kayıt | Capacitor Preferences (Android SharedPreferences) / web'de localStorage |
| Reklam | Google AdMob — `@capacitor-community/admob` |
| Satın alma | Google Play Billing — `cordova-plugin-purchase` v13 + sunucu doğrulaması |

> Spesifikasyonda Unity tercih edilmişti. Proje sahibinin onayıyla, oyunun bu ortamda **gerçekten çalıştırılıp test edilebilmesi** ve GitHub Actions'ta **lisans gerektirmeden** APK/AAB üretilebilmesi için Three.js + Capacitor seçildi. Aşağıdaki sistem ayrımı, spesifikasyondaki Unity sistem listesiyle birebir eşleşir; ileride Unity'ye taşımak isteyen ekip aynı sorumluluk sınırlarını kullanabilir.

## Sistemler (spesifikasyon § 26 ile eşleşme)
| Spesifikasyon | Dosya | Sorumluluk |
|---|---|---|
| PlayerController | `src/systems/PlayerController.js` | Kameraya göre hareket, koşu, otomatik/elle kesme, alan etkileşimi, yükseltmeler |
| TreeSystem | `src/systems/TreeSystem.js` | Ağaç türleri, dayanıklılık, sallanma, devrilme, kütüğe ayrılma, kök, yeniden büyüme, LOD |
| WoodCollectionSystem | `src/systems/WoodCollectionSystem.js` | Yer kütükleri fiziği, otomatik toplama, mıknatıs |
| InventorySystem | `src/systems/InventorySystem.js` | Taşıyıcı istifleri (görsel), ürün aktarımı (uçan ürün animasyonu) |
| StorageSystem | `src/systems/StorageSystem.js` | Kütük depoları, ürün deposu, kapasite yükseltme |
| ProductionSystem | `src/systems/ProductionSystem.js` | 7 makine, girdi/çıktı tamponları, üretim zamanlaması |
| FactoryUpgradeSystem | `src/systems/FactoryUpgradeSystem.js` | Hız, kapasite, kalite, bıçak, boyut (+ görsel değişim) |
| ConveyorSystem | `src/systems/ConveyorSystem.js` | Gerçek ürün taşıyan bantlar, aralık/kuyruk, hız/kapasite yükseltmesi |
| WorkerSystem | `src/systems/WorkerSystem.js` | İşe alma, roller, çalışma alanı atama, yapay zeka durum makineleri |
| VehicleSystem | `src/systems/VehicleSystem.js` | Forklift garajı, forkliftler, modlar, yakıt molası |
| TruckLoadingSystem | `src/systems/TruckLoadingSystem.js` | Rampalar, görünür kuyruk, yükleme, sevkiyat, satış, kamyon kademeleri |
| EconomySystem | `src/systems/EconomySystem.js` | Para/altın, fiyatlar, çarpanlar, hızlandırmalar, satış geçmişi, istatistik |
| LevelSystem | `src/systems/LevelSystem.js` | Sonsuz seviye, XP, seviye ödülleri |
| MissionSystem | `src/systems/MissionSystem.js` | Ana görev zinciri, sonsuz prosedürel görevler, başarılar, rehber ok |
| LandExpansionSystem | `src/systems/LandExpansionSystem.js` | Bölgeler, yürünebilir alan, kilit/çit, açılış animasyonu, sonsuz bölgeler |
| — (ek) ConstructionSystem | `src/systems/ConstructionSystem.js` | İnşaat alanları ve inşa animasyonu |
| — (ek) DailyRewardSystem | `src/systems/DailyRewardSystem.js` | 7 günlük giriş ödülü, günlük görevler |
| SaveSystem | `src/systems/SaveSystem.js` | Çift yuva + sağlama toplamı, otomatik kayıt, göç |
| ShopSystem | `src/systems/ShopSystem.js` | Altın harcamaları, görünümler, IAP ödülleri |
| AdsManager | `src/systems/AdsManager.js` | AdMob ödüllü reklam |
| — (ek) AdOfferSystem | `src/systems/AdOfferSystem.js` | Ekranda ara sıra beliren süreli reklam teklifleri (2x hız / para / üretim, otomatik toplama / kesim) |
| — (ek) AnimalSystem | `src/systems/AnimalSystem.js` | Çiftlik tesisleri: inek sağma, tavuk yumurtlama, hayvan dolaşma |
| (Billing) | `src/systems/BillingManager.js` | Google Play Billing |
| AudioManager | `src/systems/AudioManager.js` | Ses efektleri, mesafeye bağlı döngüler, müzik |

Diğer katmanlar:
- `src/core/` — `Game` (döngü, sabit adım), `EventBus`, `Input` (joystick/klavye), `CameraRig`, `Buffer/Stack`, `State`
- `src/world/` — prosedürel modeller (`Models.js`), malzemeler/rüzgar gölgelendiricileri, dokular, dünya kurucu, efektler, ürün çizici
- `src/ui/` — HUD, alt menü panelleri, dünya etiketleri, ikonlar, stil
- `src/config/` — **tüm denge değerleri** (`balance.js`), harita (`zones.js`), reklam/IAP (`monetization.js`)

## Veri akışı
```
Ağaç (TreeSystem) ─kesilir→ Yer kütükleri (WoodCollection) ─toplanır→ Taşıyıcı istifi (Inventory)
   → Depo (Storage) / Makine girdisi (Production) → Makine çıktısı → [Bant | İşçi | Forklift | Oyuncu]
   → Sonraki makine … → Rampa hazırlık yığını → Kamyon kasası (TruckLoading) → Sevkiyat → Satış (Economy)
```
Sistemler birbirine `EventBus` olaylarıyla (`stat`, `deposit`, `produced`, `sale`, `levelUp`, `zoneBought` …) haber verir; görevler ve başarılar bu olaylardan ilerler.

## Performans (§ 25)
- **Instanced rendering:** tüm ürünler (yığınlar, istifler, bantlar, kamyon kasaları, uçan ürünler) tür başına tek `InstancedMesh`; ağaçlar bölge × tür × varyant başına bir `InstancedMesh`; çimen, sınır ormanı, çitler instanced.
- **Bölge bazlı frustum culling:** görünmeyen bölgelerin ağaçları hiç çizilmez.
- **LOD:** uzak ağaçlar düşük poligonlu modele geçer (mesafe kalite ayarına bağlı).
- **Birleştirilmiş geometri:** statik bina/dekor parçaları vertex-renkli tek mesh; karakterler eklem başına tek mesh.
- **Havuzlama:** parçacıklar ve ürünler sabit kapasiteli instanced tamponlarda yeniden kullanılır (her karede nesne oluşturulmaz).
- **Fizik:** yalnızca yerdeki kütüklere basit fizik; durduktan sonra hesaplama yapılmaz.
- **Grafik ayarı:** Düşük (gölge yok, çimen yok, 1x çözünürlük) / Orta / Yüksek.
- Ekran oranları: dikey öncelikli; yatay ve tablet düzenleri CSS ile uyarlanır, güvenli alan (çentik) desteklenir.

## Kayıt formatı
`we_save_a` / `we_save_b` anahtarlarında `{ v, n, t, sum, data }`. `sum` = FNV-1a sağlama toplamı. Yükleme en yüksek `n` değerli geçerli yuvayı seçer; bozuk yuva atlanır. Eksik alanlar varsayılanlarla tamamlanır (sürüm göçü).
