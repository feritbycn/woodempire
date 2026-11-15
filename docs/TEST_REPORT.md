# WOOD EMPIRE — Test Raporu

Bu rapor `node tests/make-report.mjs` ile, **gerçekten çalıştırılmış** otomatik testlerin JSON çıktılarından üretilmiştir.

## Test ortamı ve sınırlar (dürüst beyan)
- Testler, derlenmiş oyunu (`vite build`) **headless Chromium + SwiftShader (yazılımsal WebGL)** üzerinde çalıştırır. Telefon ekranı 412×892, dokunmatik etkin.
- Karakter **ışınlanmaz**: test, joystick ile aynı girdi yolunu (hareket vektörü) ve gerçek CDP dokunma olaylarını kullanır; menüler gerçek dokunuşlarla açılır.
- Oyun süresi test sırasında hızlandırılır (timeScale); bu, oyun mantığını değiştirmez.
- **Gerçek Android cihazda test yapılmamıştır.** Geliştirme ortamında Android SDK ve Unity/Gradle sunucularına erişim yoktu. APK/AAB, GitHub Actions iş akışında (`.github/workflows/android.yml`) derlenir; ilk çalıştırmanın sonucunu GitHub'da kontrol edin.
- **Reklam (AdMob) ve Google Play Billing gerçek cihazda test edilmemiştir.** Web sürümünde reklam yalnızca açıkça etiketli bir simülasyondur; satın alma web'de kapalıdır. Bkz. MONETIZATION.md.
- FPS değerleri yazılımsal render içindir, gerçek cihaz performansını göstermez.

## 1. Uçtan uca oynanış testi (Bölüm 30 senaryosu) — `tests/playtest.mjs`
**Sonuç: 16 başarılı, 0 başarısız, 0 sayfa hatası** — 2026-11-15T11:32:53.754Z

| # | Adım | Durum | Süre | Ayrıntı |
|---|---|---|---|---|
| 1 | Oyuna gir (yükleme + hoş geldin ekranı) | ✅ | 6.6 sn | {} |
| 2 | Karakteri dokunmatik joystick ile hareket ettir | ✅ | 15.1 sn | {"from":["4.0","10.0"],"to":["-19.4","-8.8"],"moved":"30.04"} |
| 3 | Bir ağacı kes (kesme + devrilme animasyonu) | ✅ | 16.9 sn | {"treeType":"pine","logsOnGround":2,"stumpPassable":true} |
| 4 | Odunları topla (sırtta görsel istif) | ✅ | 8.2 sn | {"carrying":2,"capacity":10} |
| 5 | Depoya taşı ve bırak | ✅ | 10.9 sn | {"deposited":"0 → 2"} |
| 6 | Depo testereyi kendiliğinden besler (depo çıkış bandı → testere) | ✅ | 0.0 sn | {"depot":0,"onBelt":0,"sawIn":0,"working":false} |
| 7 | Ürün oluştur (kütük → kereste) | ✅ | 6.3 sn | {"planksProduced":4} |
| 8 | Kamyonu yükle | ✅ | 12.2 sn | {"truckLoad":3} |
| 9 | Satışı gerçekleştir ("Gönder" düğmesi) ve para kazan | ✅ | 6.6 sn | {"money":"11 → 14","sale":{"t":1794742075691,"amount":3,"n":3,"counts":{"plank":3},"dock":"dock1"}} |
| 10 | Ekonomi döngüsü: taşıma kapasitesi yükseltmesi için para biriktir | ✅ | 98.3 sn | {"cycles":4,"money":177} |
| 11 | Taşıma kapasitesini yükselt (Geliştirme menüsü) | ✅ | 11.8 sn | {"capacity":"10 → 12"} |
| 12 | Yeni alan satın almak için seviye + para biriktir (görevler dahil) | ✅ | 129.0 sn | {"cycles":7,"money":507,"level":3,"missionsCompleted":8} |
| 13 | Yeni bir alan satın al (Küçük Kereste Fabrikası) | ✅ | 19.2 sn | {"zones":[0,1],"money":207} |
| 14 | Oyunu kaydet ve kapat | ✅ | 3.8 sn | {"save":{"ok":true,"n":47,"bytes":3022,"at":1794742342435},"snapshot":{"money":207,"gold":30,"level":3,"xp":160,"zones":[0,1],"cap":12,"capLvl":1,"depot":0,"sawIn":0,"sawOut":0,"carry":0,"mission":8,"trees":10,"sales"… |
| 15 | Yeniden aç ve ilerlemenin korunduğunu doğrula | ✅ | 19.2 sn | {"restored":{"money":407,"gold":30,"level":3,"xp":160,"zones":[0,1],"cap":12,"capLvl":1,"depot":0,"sawIn":0,"sawOut":0,"carry":0,"mission":8,"trees":10,"sales":5,"x":3.9,"z":12.3},"workersResumed":[]} |
| 16 | Kayıt bozulmasına dayanıklılık (yuvalardan biri bozulunca) | ✅ | 12.1 sn | {"corrupted":"we_save_b","loadedFromBackup":{"level":3,"zones":[0,1],"money":407}} |

## 2. Sistem entegrasyon testi — `tests/systems-test.mjs`
**Sonuç: 27 başarılı, 0 başarısız, 0 sayfa hatası** — 2026-11-15T11:19:50.669Z

| # | Adım | Durum | Süre | Ayrıntı |
|---|---|---|---|---|
| undefined | Depo kuralı, işçi noktaları, bant satın alma noktası ve reklam teklifi | ✅ | 14.3 sn | {"freshRejected":true,"marked":true,"depotLogAccepted":true,"noTakeFromFeedingDepot":true,"okHire":true,"workers":[0,1],"beltPad":true,"offer":{"boost":"helper","side":"left"},"boostStarted":"helper"} |
| undefined | Reklamla geçici yardımcı işçi + parası yetmeyen satın alma görevi | ✅ | 0.0 sn | {"came":["lumberjack"],"savedTemp":false,"left":0,"mission":{"title":"İlk işçini al","value":50,"target":100,"money":true},"stillAfterMoney":"İlk işçini al"} |
| undefined | Test kurulumu: hesaba para ve seviye ekle | ✅ | 1.1 sn | {"money":50027520,"level":60} |
| undefined | Arazi genişletme: 1-9 arası tüm bölgeleri sırayla satın al | ✅ | 0.0 sn | {"bought":[1,2,3,4,5,6,7,8,9],"zones":[0,1,2,3,4,5,6,7,8,9],"walk":[true,true]} |
| undefined | Sonsuz genişleme: 10. bölgeden itibaren tesisler (Süt, Tavuk, Kereste…) oluşur ve satın alınır | ✅ | 0.0 sn | {"z10":"Süt Çiftliği 1","cost10":2000,"ok10":true,"z11":"Tavuk Çiftliği 1","known":13,"bonus":1.03} |
| undefined | Tüm inşaat alanlarını kur (makineler, depo, ofis, garaj, rampa) | ✅ | 0.0 sn | {"built":10,"sites":["depot1","saw_stock","saw","dock1","imp3","dock3","dock2","imp5","imp7","dock7","imp8","dock8","imp9","dock9","f10_depot","f10_m","f10_dock","sander","office","packer","warehouse","garage","saw5",… |
| undefined | Üretim zinciri: her makine girdiyle gerçek ürün üretir, girdisiz üretmez | ✅ | 8.4 sn | {"saw":{"out":12,"kind":"plank","wood":"oak"},"f10_m":{"out":14,"kind":"bottle","wood":"pine"},"sander":{"out":8,"kind":"sanded","wood":"birch"},"packer":{"out":8,"kind":"package","wood":"cedar"},"saw5":{"out":12,"kin… |
| undefined | Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik | ✅ | 62.3 sn | {"animals":{"start":{"cows":2,"hens":3},"after":{"cows":4,"hens":4},"saved":{"10":2,"11":1},"priceUp":true},"bought":[true,true,true],"names":["Süt Çiftliği 1","Tavuk Çiftliği 1","Kereste Fabrikası 2","Koyun Çiftliği … |
| undefined | Makine yükseltmeleri: hız, kapasite, kalite, bıçak (görsel), boyut | ✅ | 6.2 sn | {"time":["2.20","1.86"],"outCap":[40,40],"planksPerLog":[2,4],"blades":[1,3],"plankValue":[1,"1.06"],"scale":"1.12"} |
| undefined | İşçiler: oduncu ağaç keser ve depoya taşır | ✅ | 27.5 sn | {"felled":10,"playerFelled":0,"deposited":10,"depot":1,"states":["milk","idle","idle","deliver","idle","idle","milk","idle","idle","milk","idle","idle","goTree","deliver"]} |
| undefined | Odun sistemi: depo → (çıkış bandı) testere → stok, yükleyici stoktan kamyona | ✅ | 25.0 sn | {"planks":112,"loaded":3,"sanded":14,"sanderIn":0,"dockStaging":0,"workers":["farmer:collect","carrier:idle","loader:idle","farmer:feed","carrier:idle","loader:idle","farmer:deliver","carrier:idle","loader:idle","farm… |
| undefined | Konveyör bantları: 4 bant satın alınır, gerçek ürün taşır (paketleme kendi ithalatıyla) | ✅ | 58.4 sn | {"onBelts":{"c_depot_saw":4,"c_f10_in":0,"c_f10_out":0,"c_f11_in":2,"c_f11_out":2,"c_f13_in":0,"c_f13_out":1,"c_f14_in":3,"c_f14_out":0,"c_saw_sander":29,"c_z3_in":21,"c_z3_out":3},"sanded":53,"packages":83,"delivered… |
| undefined | İthalatlı bölgeler: her bölge kendi malını ithal eder, önceki bölgelerden mal almaz | ✅ | 38.2 sn | {"missing":[],"crossRoutes":[],"zoneRoutes":[[],["imp5>saw5"],["imp7>palletizer","imp7>furniture"],["imp8>panelpress"],["imp9>autoline"]],"prices":{"sanded3":1,"log5":2,"sellPkg3":6},"imported0":837,"spent0":12237,"st… |
| undefined | Forklift: garaj + forklift satın al, ürünleri gerçekten taşır, yakıt molası | ✅ | 28.0 sn | {"state":"pick","trips":2,"carrying":0,"pos":["17.9","-9.6"]} |
| undefined | Kamyon kademeleri, kuyruk ve satış | ✅ | 16.5 sn | {"ok":[true,true,true],"tier":3,"queue":[3,3,3,3,3,3,3,3,3,3,3],"caps":[[20,20,200],[20,20,200],[20,20,200],[20,20,200],[20,20,200],[20,20,200],[20,20,200],[20,20,200],[20,20,200],[20,20,200],[20,20,200]],"shipped":39… |
| undefined | Görevler: ana zincir ilerler, sonra sonsuz prosedürel görevler | ✅ | 0.1 sn | {"main":41,"generated":48,"sample":["320 paketli ürün sat","22 kamyon gönder","190 ağaç kes","Yeni arazi aç: Süt Çiftliği · Genişletme 1","527K para kazan","510 odun topla","65 palet üret","Yeni arazi aç: Süt Çiftliği… |
| undefined | Seviye sistemi sonsuz: büyük XP ile çok seviye atlanır | ✅ | 1.5 sn | {"from":60,"to":72,"nextNeed":159154} |
| undefined | Günlük ödül, günlük görevler ve başarılar | ✅ | 0.0 sn | {"preClaimed":false,"claim":true,"again":false,"quests":["81 ürün üret","3 makine yükselt","4 kamyon gönder"],"achievementsClaimed":["trucks","lands","factory","money","produce","workers"],"gold":[4529,4674]} |
| undefined | Mağaza: altınla hızlandırma (üretim x2 gerçekten hızlandırır), görünüm, altın kamyon | ✅ | 0.0 sn | {"procTime":["1.86","0.93"],"skin":true,"golden":true,"skinNow":"forest","saleMul":"1.46"} |
| undefined | Reklam: ödüllü reklam akışı (web dev simülasyonu) — ödül yalnızca izlenince | ✅ | 8.2 sn | {"rewarded":true,"cancelledNoReward":true} |
| undefined | Uygulama içi satın alma: web sürümünde güvenli şekilde kapalı (sahte satın alma yok) | ✅ | 10.5 sn | {"status":"web","text":"Satın alma yalnızca Google Play sürümünde kullanılabilir.","enabledButtons":0} |
| undefined | Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar) | ✅ | 35.2 sn | {} |
| undefined | Değerli Ağaç Ormanı ve sonsuz bölge görüntüsü | ✅ | 17.2 sn | {} |
| undefined | İşçi görevleri, operatörler, çiftlik yemi ve XP yavaşlaması | ✅ | 5.8 sn | {"role0":"lumberjack","ok":true,"bad":false,"t":["0.931","0.716"],"v":["3.68","4.78"],"hungryReady":0,"milkedWhileHungry":0,"bought":true,"paid":4,"feedNow":2,"level":72,"xpGain":30,"roleName":"Tavuk Bakıcısı"} |
| undefined | Alan genişletme: yeni arazi/fabrika açılmaz, Süt Çiftliği genişler (tek depo + tek rampa + tek makine hızlanır) | ✅ | 8.4 sn | {"bought":true,"name":"Süt Çiftliği · Genişletme 1","parent":10,"walk":true,"cap":[150,200],"mul":[1,110],"newDocks":0,"newDepots":0,"built":true,"routes":[],"hire":[],"d1cap":350} |
| undefined | Geç oyun kaydı: işçiler, forklift, bantlar, kamyon yükü yeniden açılınca korunur | ✅ | 9.6 sn | {"before":{"workers":["farmer","carrier","loader","farmer","carrier","loader","farmer","carrier","loader","farmer","carrier","loader","lumberjack","lumberjack","carrier","loader","beltop"],"forklifts":1,"belts":["c_de… |
| undefined | Performans örneği (headless SwiftShader — gerçek cihaz değildir) | ✅ | 3.0 sn | {"fpsSwiftShader":32,"drawCalls":118,"triangles":427950,"geometries":318,"textures":13,"workers":17,"trees":641} |

## 3. Ekonomi simülasyonu — `tests/economy-sim.mjs`
Yaklaşık ilerleme modeli — gerçek oynanış verisi değildir

| Dakika | Seviye | Olay | Maliyet |
|---|---|---|---|
| 15.4 | 4 | İlk işçi | 100 |
| 33.7 | 5 | Arazi 1: Küçük Kereste Fabrikası | 300 |
| 44.2 | 5 | Kuruldu: sander | 250 |
| 63.3 | 6 | Kuruldu: office | 450 |
| 110.5 | 8 | Arazi 2: Geniş Orman Alanı | 1.500 |
| 131.1 | 9 | Arazi 10: Süt Çiftliği 1 | 2.000 |
| 184.7 | 11 | Kamyon: Orta Kamyon | 2.500 |
| 195.3 | 11 | Arazi 3: Endüstriyel Üretim Bölgesi | 5.000 |
| 202 | 11 | Kuruldu: packer | 3.000 |
| 238.8 | 13 | Arazi 11: Tavuk Çiftliği 1 | 8.000 |
| 273.9 | 14 | Arazi 4: Büyük Depolama Merkezi | 12.000 |
| 275.3 | 14 | Kuruldu: garage | 4.000 |
| 278.3 | 14 | Kuruldu: warehouse | 8.000 |
| 396.4 | 17 | Arazi 5: Lojistik ve Kamyon Merkezi | 30.000 |
| 400.3 | 17 | Kuruldu: saw5 | 6.000 |
| 415.6 | 17 | Arazi 12: Kereste Fabrikası 2 | 30.000 |
| 451.9 | 18 | Kamyon: Büyük Kamyon | 20.000 |
| 575.2 | 21 | Arazi 6: Değerli Ağaç Ormanı | 70.000 |
| 605.4 | 21 | Arazi 13: Koyun Çiftliği 1 | 78.000 |
| 751.1 | 24 | Arazi 7: Mobilya ve Palet Tesisi | 150.000 |
| 762.6 | 24 | Kuruldu: palletizer | 60.000 |
| 772.7 | 24 | Kuruldu: furniture | 90.000 |
| 830.9 | 25 | Arazi 14: Arı Çiftliği 1 | 202.800 |

En uzun büyük-satın-almasız bekleme: **10 dk** (bu arada küçük yükseltmeler alınabilir). Simüle edilen süre: 14 saat.

```json
{
  "level": 25,
  "zones": [
    0,
    1,
    2,
    10,
    3,
    11,
    4,
    5,
    12,
    6,
    13,
    7,
    14
  ],
  "earned": 6263400,
  "workers": 38,
  "tier": "Büyük Kamyon"
}
```

## 4. Oyun içi gerçek ekran görüntüleri
Tüm görüntüler testler sırasında oyunun kendisinden alınmıştır (düzenleme yok).

| Görüntü | Adım |
|---|---|
| ![Oyuna gir (yükleme + hoş geldin ekranı)](screenshots/01_hosgeldin.png) | Oyuna gir (yükleme + hoş geldin ekranı) |
| ![Bir ağacı kes (kesme + devrilme animasyonu)](screenshots/03_agac_kesme.png) | Bir ağacı kes (kesme + devrilme animasyonu) |
| ![Bir ağacı kes (kesme + devrilme animasyonu)](screenshots/04_agac_devriliyor.png) | Bir ağacı kes (kesme + devrilme animasyonu) |
| ![Odunları topla (sırtta görsel istif)](screenshots/05_odun_toplama.png) | Odunları topla (sırtta görsel istif) |
| ![Depoya taşı ve bırak](screenshots/06_depo.png) | Depoya taşı ve bırak |
| ![Ürün oluştur (kütük → kereste)](screenshots/07_testere_uretim.png) | Ürün oluştur (kütük → kereste) |
| ![Kamyonu yükle](screenshots/08_kamyon_yukleme.png) | Kamyonu yükle |
| ![Satışı gerçekleştir ("Gönder" düğmesi) ve para kazan](screenshots/09_satis_para.png) | Satışı gerçekleştir ("Gönder" düğmesi) ve para kazan |
| ![Taşıma kapasitesini yükselt (Geliştirme menüsü)](screenshots/10_gelistirme_menusu.png) | Taşıma kapasitesini yükselt (Geliştirme menüsü) |
| ![Yeni bir alan satın al (Küçük Kereste Fabrikası)](screenshots/11_arazi_satin_al.png) | Yeni bir alan satın al (Küçük Kereste Fabrikası) |
| ![Yeni bir alan satın al (Küçük Kereste Fabrikası)](screenshots/12_arazi_acildi.png) | Yeni bir alan satın al (Küçük Kereste Fabrikası) |
| ![Yeniden aç ve ilerlemenin korunduğunu doğrula](screenshots/13_yeniden_acildi.png) | Yeniden aç ve ilerlemenin korunduğunu doğrula |
| ![Depo kuralı, işçi noktaları, bant satın alma noktası ve reklam teklifi](screenshots/34_reklam_teklifi.png) | Depo kuralı, işçi noktaları, bant satın alma noktası ve reklam teklifi |
| ![Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik](screenshots/35_sut_ciftligi.png) | Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik |
| ![Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik](screenshots/36_tavuk_ciftligi.png) | Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik |
| ![Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik](screenshots/37_koyun_ciftligi.png) | Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik |
| ![Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik](screenshots/38_ari_ciftligi.png) | Tesisler: Süt, Tavuk, Kereste 2, Koyun, Arı — tesis işçileri ve bantlarıyla otomatik |
| ![Makine yükseltmeleri: hız, kapasite, kalite, bıçak (görsel), boyut](screenshots/20_testere_yukseltilmis.png) | Makine yükseltmeleri: hız, kapasite, kalite, bıçak (görsel), boyut |
| ![İşçiler: oduncu ağaç keser ve depoya taşır](screenshots/21_isci_oduncu.png) | İşçiler: oduncu ağaç keser ve depoya taşır |
| ![Konveyör bantları: 4 bant satın alınır, gerçek ürün taşır (paketleme kendi ithalatıyla)](screenshots/22_konveyor_hatti.png) | Konveyör bantları: 4 bant satın alınır, gerçek ürün taşır (paketleme kendi ithalatıyla) |
| ![İthalatlı bölgeler: her bölge kendi malını ithal eder, önceki bölgelerden mal almaz](screenshots/39_ithalat_paketleme.png) | İthalatlı bölgeler: her bölge kendi malını ithal eder, önceki bölgelerden mal almaz |
| ![Forklift: garaj + forklift satın al, ürünleri gerçekten taşır, yakıt molası](screenshots/23_forklift.png) | Forklift: garaj + forklift satın al, ürünleri gerçekten taşır, yakıt molası |
| ![Kamyon kademeleri, kuyruk ve satış](screenshots/24_kamyon_kuyrugu.png) | Kamyon kademeleri, kuyruk ve satış |
| ![Reklam: ödüllü reklam akışı (web dev simülasyonu) — ödül yalnızca izlenince](screenshots/25_reklam_simulasyonu.png) | Reklam: ödüllü reklam akışı (web dev simülasyonu) — ödül yalnızca izlenince |
| ![Uygulama içi satın alma: web sürümünde güvenli şekilde kapalı (sahte satın alma yok)](screenshots/26_magaza_paketler.png) | Uygulama içi satın alma: web sürümünde güvenli şekilde kapalı (sahte satın alma yok) |
| ![Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar)](screenshots/27_menu_gorevler.png) | Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar) |
| ![Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar)](screenshots/28_menu_arazi.png) | Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar) |
| ![Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar)](screenshots/29_menu_isciler.png) | Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar) |
| ![Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar)](screenshots/30_menu_fabrika.png) | Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar) |
| ![Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar)](screenshots/31_menu_araclar.png) | Menü ekran görüntüleri (Görevler, Arazi, İşçiler, Fabrika, Araçlar) |
| ![Değerli Ağaç Ormanı ve sonsuz bölge görüntüsü](screenshots/32_degerli_agac_ormani.png) | Değerli Ağaç Ormanı ve sonsuz bölge görüntüsü |
| ![Değerli Ağaç Ormanı ve sonsuz bölge görüntüsü](screenshots/33_sonsuz_bolge.png) | Değerli Ağaç Ormanı ve sonsuz bölge görüntüsü |
| ![Alan genişletme: yeni arazi/fabrika açılmaz, Süt Çiftliği genişler (tek depo + tek rampa + tek makine hızlanır)](screenshots/40_alan_genisletme.png) | Alan genişletme: yeni arazi/fabrika açılmaz, Süt Çiftliği genişler (tek depo + tek rampa + tek makine hızlanır) |

## 5. Testleri yeniden çalıştırma
```bash
npm ci && npm run build
npx vite preview --port 4173 &
node tests/playtest.mjs       # Bölüm 30 senaryosu
node tests/systems-test.mjs   # tüm sistemler
node tests/economy-sim.mjs    # ekonomi eğrisi
node tests/make-report.mjs    # bu raporu üretir
```
