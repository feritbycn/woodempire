# Oyun Tasarımı — Wood Empire

## Çekirdek döngü
**Kes → Topla → Depola → İşle → Yükle → Sat → Geliştir → Otomatikleştir → Yeni tesis aç**

Her tesis **elle** başlar ve adım adım otomatikleşir:
1. Oyuncu ağacı keser (ya da ineği sağar / yumurtaları toplar). **Ham ürün önce depoya** gider; taze kütük/süt/yumurta makineye konamaz.
2. Oyuncu depodan alıp makineye **elle** taşır.
3. Seviye 2–4'te tesisin içindeki turuncu **İŞÇİ noktalarından** işçi alınır (üzerine her girişte bir işçi): Oduncu/Çiftçi (kaynak → depo), Taşıyıcı (depo → makine), Yükleyici (makine → kamyon).
4. Seviye 3'te depo ile makine arasındaki mavi noktadan **bant** satın alınır; bandın etiketine dokunup hız/kapasite yükseltilir. Makine → rampa bandı da aynı şekilde.
5. Para bir yükseltmeye yetince makine, depo, bant ve işçi noktası üstünde **yeşil ok** çıkar; makinenin önündeki mor **GELİŞTİR** alanı yükseltme panelini açar.

Referans videodaki temel mantık korunmuştur (karakter ağaç keser, kütükleri sırtında istifler, alanlara bırakır, makine işler, kamyon satın alır). Wood Empire bunu çok aşamalı üretim zinciri, işçi/forklift/konveyör otomasyonu, kamyon lojistiği ve sonsuz harita ile genişletir.

## Kontroller
| Kontrol | İşlev |
|---|---|
| Joystick (alt ekranın herhangi bir yerine bas, sürükle) | Yürü / koş (tam itme = koşu) |
| Otomatik | Ağacın yanında durunca keser, yerdeki ürünleri üzerinden geçince toplar, alanlara girince bırakır/alır, ineğin yanında durunca sağar |
| Gönder (yalnızca rampada yüklü kamyon varken) | Kamyonu dolmadan gönder |
| Sağ üst küçük düğmeler | Kamerayı döndür / yakınlaştır (iki parmakla da yakınlaştırılır) |
| Mağaza → Hızlandırma | Altınla süreli hızlandırmalar |
| Reklam teklifi (mor ikon) | 1–2 dakikada bir ekranın sağında/solunda belirir: 2x Hız, 2x Para, Otomatik Toplama, Otomatik Kesim, 2x Üretim (1–2 dk). İsteğe bağlıdır. |

Alanlar: **yeşil oklu** = bırakma, **turuncu oklu** = alma, **yeşil $** = kamyon yükleme, **altın $** = arazi satın alma, **mavi çekiç** = inşaat / bant kurma, **turuncu İŞÇİ** = işçi alma, **mor GELİŞTİR** = makine yükseltme.

## Ağaç türleri
| Tür | Dayanıklılık | Kütük | Değer çarpanı | Bulunduğu yer |
|---|---|---|---|---|
| Çam | 3 | 2 | x1.0 | Başlangıç |
| Huş | 4 | 3 | x1.4 | Fabrika, Geniş Orman |
| Meşe | 6 | 3 | x1.8 | Geniş Orman, Depolama |
| Sedir | 8 | 4 | x2.6 | Değerli Ağaç Ormanı |
| Altın Ceviz (nadir, parıldar) | 12 | 5 | x4.5 | Değerli Orman, İmparatorluk, sonsuz bölgeler |

Kesilen ağaç kök bırakır, 22–60 sn sonra fidan olarak yeniden büyür.

## Üretim zinciri
| Makine | Girdi → Çıktı | Açılış |
|---|---|---|
| Testere | 1 kütük → 2+ kereste (bıçak başına +1) | Başlangıç |
| Zımpara | kereste → zımparalı tahta | Arazi 1 |
| Paketleme | zımparalı tahta → paketli ürün | Arazi 3 |
| Palet Tesisi | 4 kereste → palet | Arazi 7 |
| Mobilya Atölyesi | 2 paket → mobilya | Arazi 7 |
| Ahşap Panel Fabrikası | 3 zımparalı → panel | Arazi 8 |
| Otomatik Kereste Hattı | 1 kütük → 3 paket | Arazi 9 (+ her sonsuz bölgede yeni hat) |

Ürün değeri = taban fiyat × odun çarpanı × kalite × satış çarpanı (pazarlık, altın kamyon, sonsuz bölge bonusları, Satış x2).

## Harita
| # | Bölge | Fiyat | Seviye | Açtıkları |
|---|---|---|---|---|
| 0 | Başlangıç Ormanı | — | 1 | Depo, testere, rampa, küçük kamyon |
| 1 | Küçük Kereste Fabrikası | 300 | 2 | Zımpara, İşçi Ofisi |
| 2 | Geniş Orman Alanı | 1.500 | 4 | Huş/meşe, Orman Deposu |
| 3 | Endüstriyel Üretim | 5.000 | 6 | Paketleme, konveyörler |
| 4 | Büyük Depolama Merkezi | 12.000 | 8 | Ürün Deposu, Forklift Garajı |
| 5 | Lojistik ve Kamyon Merkezi | 30.000 | 10 | 2. rampa, büyük kamyon |
| 6 | Değerli Ağaç Ormanı | 70.000 | 13 | Sedir, Altın Ceviz |
| 7 | Mobilya ve Palet Tesisi | 150.000 | 16 | Palet, mobilya |
| 8 | Büyük Kereste İmparatorluğu | 400.000 | 20 | Panel fabrikası, endüstriyel makine boyutu |
| 9 | İleri Teknoloji Üretim | 1.000.000 | 25 | Otomatik hat, endüstriyel kamyon |
| 10 | Süt Çiftliği 1 (güneyde) | 2.000 | 5 | İnekler → süt → Şişeleme → süt kasası |
| 11 | Tavuk Çiftliği 1 | 8.000 | 8 | Tavuklar → yumurta → Paketleme → koli |
| 12 | Kereste Fabrikası 2 | 30.000 | 11 | Değerli orman → testere |
| 13+ | Döngü tekrar eder (Süt 2, Tavuk 2, Kereste 3 …) | 30.000 × 2,6ⁿ | 11+3n | Her tesis sıfırdan, elle başlar; rampa fiyat çarpanı ölçekle artar (×1 → ×2,7 → ×6,3 → …) |

Tesisler başlangıç ormanının güneyinde, yolun yanında sonsuza kadar sıralanır. Her tesiste: kaynak alanı, depo, makine, satış rampası, 3 işçi noktası ve 2 bant satın alma noktası bulunur. Tesis işçileri yalnızca kendi tesislerinde çalışır.

## İlerleme sistemleri
- **Seviye:** sınırsız; XP = 40·L^1.55 + 20·L. Her seviye para + altın verir.
- **Görevler:** 28 adımlı ana görev zinciri (spesifikasyondaki tüm örnek görevler dahil), ardından seviyeye göre ölçeklenen sonsuz prosedürel görevler (her 4 görevden biri bir sonraki araziyi hedefler). Kırmızı rehber ok her zaman hedefi gösterir.
- **Başarılar:** 8 kategori, sonsuz kademe (100 → 1.000 → 10.000 ağaç …).
- **Günlük:** 7 günlük giriş ödülü serisi + her gün 3 günlük görev.
- **Çevrimdışı kazanç:** otomasyon gelirinin %50'si, en fazla 2 saat (reklamla x2).

## Ekonomi hedefleri (simülasyon: `tests/economy-sim.mjs`)
| Hedef | Model sonucu |
|---|---|
| İlk arazi | ~8 dk |
| İlk işçi | ~14 dk |
| Konveyör / paketleme | ~40 dk |
| Forklift | ~52 dk |
| Arazi 9 | ~3 saat |
| Sonsuz bölgeler | her ~1,5–3 saatte bir |
Model yaklaşıktır; gerçek oyuncu verisiyle (Firebase Analytics vb.) yeniden ayarlanmalıdır. Tüm değerler `src/config/balance.js` içinde tek yerdedir.
