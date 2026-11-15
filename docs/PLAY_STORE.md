# Google Play Console — doldurulacak bilgiler

## Bağlantılar
- **Gizlilik politikası URL'si:** https://feritbycn.github.io/woodempire/privacy.html
- **Hesap/veri silme URL'si (Veri güvenliği formu):** https://feritbycn.github.io/woodempire/delete-data.html
- **Kullanım şartları:** https://feritbycn.github.io/woodempire/terms.html
- **app-ads.txt:** `docs/site/app-ads.txt` dosyasını mağaza kaydındaki geliştirici web sitesinin KÖKÜNE koy
  (ör. https://turkuazads.com/app-ads.txt). İçerik: `google.com, pub-4446596500153010, DIRECT, f08c47fec0942fa0`

## Uygulama içeriği
- **Reklamlar:** Evet, uygulamada reklam var.
- **Reklam kimliği (AD_ID):** Evet kullanılıyor → amaç: Reklam veya pazarlama.
- **Hedef kitle:** 13+ (çocuklara yönelik değil). 13 altını seçersen Aileler politikası ve AdMob çocuk ayarları gerekir.
- **İçerik derecelendirmesi:** Şiddet yok, kumar yok; uygulama içi satın alma ve reklam var.

## Veri güvenliği formu
| Soru | Cevap |
|---|---|
| Kullanıcı verisi toplanıyor/paylaşılıyor mu? | Evet (Google AdMob SDK aracılığıyla) |
| Aktarımda şifreleniyor mu? | Evet |
| Kullanıcı veri silme isteyebilir mi? | Evet (delete-data.html) |
| **Konum → Yaklaşık konum** | Toplanır, paylaşılır · Reklam, dolandırıcılık önleme |
| **Uygulama etkinliği → Uygulama etkileşimleri** | Toplanır, paylaşılır · Reklam, analiz |
| **Uygulama bilgisi ve performans → Kilitlenme günlükleri, Teşhis** | Toplanır, paylaşılır · Analiz, dolandırıcılık önleme |
| **Cihaz veya diğer kimlikler → Cihaz kimlikleri (reklam kimliği)** | Toplanır, paylaşılır · Reklam, dolandırıcılık önleme |
| **Finansal bilgi → Satın alma geçmişi** | Google Play işler; geliştirici sunucusu yok (doğrulama sunucusu kapalı) |
| **Kişisel bilgi → Kullanıcı kimlikleri** (isimsiz oyuncu kimliği + oyun içi kullanıcı adı) | Toplanır, paylaşılmaz · Uygulama işlevselliği, Hesap yönetimi, Dolandırıcılık önleme · İsteğe bağlı değil (kimlik), ad isteğe bağlı |
| **Uygulama etkinliği → Diğer uygulama etkinlikleri** (oyun özeti: seviye, para, altın, oynama süresi) | Toplanır, paylaşılmaz · Uygulama işlevselliği, Analiz |
| Gerçek ad, e-posta, telefon, fotoğraf, kişiler, mesaj | Toplanmaz |

Firebase verisi: Google Cloud (eur3, Avrupa). Kullanıcı oyunda **Ayarlar → Bulut verilerimi sil** ile siler.

Not: Satın alma doğrulama sunucusu (`server/verify-purchase`) açılırsa bu form ve gizlilik politikası güncellenmelidir.

## AdMob
- Uygulama kimliği: `ca-app-pub-4446596500153010~6267475467` (android/app/src/main/res/values/strings.xml)
- Ödüllü birim: `ca-app-pub-4446596500153010/1962378889`
- Geçiş birimi: `ca-app-pub-4446596500153010/3522872562` (src/config/monetization.js)
- AdMob → Gizlilik ve mesajlaşma → GDPR mesajı oluştur (oyun UMP izin formunu kendisi açar).
