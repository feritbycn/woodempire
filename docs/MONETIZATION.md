# Reklam ve Uygulama İçi Satın Alma

## Durum (dürüst özet)
| Bileşen | Kod | Test durumu |
|---|---|---|
| AdMob ödüllü reklam (`@capacitor-community/admob`) | Tam entegre (başlatma, UMP/GDPR onayı, ön yükleme, ödül olayı, hata durumları) | **Gerçek cihazda test edilmedi.** Web'de yalnızca etiketli simülasyon test edildi. |
| Google Play Billing (`cordova-plugin-purchase` v13) | Ürün kaydı, satın alma, sunucu doğrulaması, tek seferlik verme, geri yükleme | **Gerçek Play hesabıyla test edilmedi.** Web'de güvenli şekilde kapalı olduğu test edildi. |
| Doğrulama sunucusu (`server/verify-purchase`) | Play Developer API ile token kontrolü | **Çalıştırılmadı** (hizmet hesabı gerekir). |

Satın alma sistemi **doğrulama sunucusu adresi tanımlanmadan çalışmaz** (bilinçli tasarım): sahte/doğrulanmamış satın alma verilmez.

## Reklam kurulumu
1. AdMob'da uygulama oluşturun, bir **Ödüllü (Rewarded)** reklam birimi açın.
2. `src/config/monetization.js` → `ADS.appIdAndroid`, `ADS.rewardedAndroid` değerlerini kendi kimliklerinizle değiştirin, `testing: false` yapın.
3. `android/app/src/main/res/values/strings.xml` → `admob_app_id` değerini aynı uygulama kimliğiyle değiştirin.
4. AdMob'da **GDPR mesajı** (UMP) oluşturun — oyun açılışta otomatik gösterir.
5. Dahili test kanalında, test cihazı olarak işaretli bir telefonda deneyin.

Reklam kullanım yerleri (hepsi isteğe bağlı): bedava para/altın, hızlandırmalar, günlük ödül x2, çevrimdışı kazanç x2. Günlük sınır: 20. Reklam yüklenemezse oyuncuya kısa bilgi verilir, oyun etkilenmez.

## Satın alma kurulumu
1. Play Console → Uygulama → **Monetize → Products → In-app products**: aşağıdaki kimliklerle ürün oluşturun.

| Ürün kimliği | Tür | İçerik |
|---|---|---|
| `gold_small` | Tüketilebilir | 100 altın |
| `gold_medium` | Tüketilebilir | 550 altın |
| `gold_large` | Tüketilebilir | 1200 altın |
| `boost_pack` | Tüketilebilir | 30 dk Üretim x2 + 30 dk Satış x2 |
| `truck_pack` | Tek seferlik | Altın Kamyon (+%25 satış) + 150 altın |
| `worker_pack` | Tek seferlik | Premium işçi + oyuncuya +2 taşıma |
| `skin_pack` | Tek seferlik | "Kereste Kralı" görünümü |
| `no_ads` | Tek seferlik | Reklam ödüllerini reklamsız alma |

2. Google Cloud'da bir **hizmet hesabı** oluşturun, JSON anahtarını indirin; Play Console → **Users and permissions** bölümünden bu hesaba "View financial data / Manage orders" izni verin.
3. Doğrulama sunucusunu yayınlayın (Cloud Run, Render, Fly.io vb.):
```bash
cd server/verify-purchase && npm install
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json PACKAGE_NAME=com.woodempire.game PORT=8080 npm start
```
4. `src/config/monetization.js` → `IAP.verifyUrl = 'https://sunucunuz/verify'` yazın, yeniden derleyin.
5. Play Console **dahili test** kanalına AAB yükleyin, lisans test hesabıyla satın almayı deneyin. Başarılı olduğunu doğrulamadan yayına almayın.

## Güvenlik notları
- Aynı işlem kimliği kayıtta tutulur (`processedOrders`) — bir satın alma iki kez verilmez.
- Tek seferlik ürünler "Satın alımları geri yükle" ile geri gelir.
- İstemci tarafı oyun kaydı cihazdadır; çok oyunculu/rekabetçi özellik eklenirse sunucu tarafı ekonomi gerekir.
