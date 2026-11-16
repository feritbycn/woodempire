# Yönetim paneli ve bulut kurulumu

Panel adresi: **https://feritbycn.github.io/woodempire/admin/**

## Bir kerelik kurulum (Firebase konsolu, proje: woodempire-37573)
1. **Authentication → Sign-in method:** *Anonymous* ve *Google* açık olmalı.
2. **Authentication → Settings → Authorized domains:** şunları ekle
   - `feritbycn.github.io` (panel)
   - `turkuazads.com` (web sürümü)
   (`localhost` zaten ekli — Android uygulaması bunu kullanır.)
3. **Firestore Database → Create database** → konum `eur3 (Europe)` → *production mode*.
4. **Firestore Database → Rules:** depodaki `firestore.rules` dosyasının TAMAMINI yapıştır → **Publish**.
5. Paneli aç → **Google ile giriş yap**. "Bu hesap henüz yönetici değil" yazar ve UID'ni gösterir.
6. **Firestore Database → Data → Start collection** → koleksiyon `admins` → belge kimliği = o UID → alan `ok` (boolean) = `true` → Save.
7. Paneli yenile. Artık oyuncuları görür ve hediye gönderirsin.

## Veri yapısı
| Yol | İçerik | Kim yazar |
|---|---|---|
| `players/{uid}` | oyuncu özeti (seviye, para, altın, alan, işçi, oynama süresi, ad, son görülme) | oyuncunun kendisi |
| `players/{uid}/claimed/{giftId}` | alınmış hediyeler (bir hediye bir kez) | oyuncunun kendisi |
| `usernames/{adKüçükHarf}` | `{ uid, name }` — ad benzersizliği | oyuncu (bir kez, değiştirilemez) |
| `saves/{uid}` | tam oyun kaydının yedeği `{ data, enc, size, level, at }` (hesap aktarımı için; ~5 dk'da bir, değiştiyse) | oyuncunun kendisi |
| `gifts/{id}` | ekleme: `{ to: uid veya 'all', items: {level, gold, money, xp, logs}, msg, expiresAt }` · düzenleme: `{ kind: 'set', set: {...} }` · hesap aktarımı: `{ kind: 'restore', save, enc, fromUid, fromName }` | yalnızca yönetici |
| `admins/{uid}` | yöneticiler | yalnızca konsoldan |

## Hesap aktarımı
Panel → kaynak oyuncuya tıkla → **Hesap aktarımı** → hedef hesabın kullanıcı adını veya kimliğini yaz → **Aktar**.
Kaynağın bulut yedeği hedefe kopyalanır; hedefin eski ilerlemesi silinir, adı ve kimliği aynı kalır; kaynak hesap değişmez.
Hedef oyun açıksa birkaç saniyede, kapalıysa açılınca uygulanır ve oyun yeniden başlar. Bunun için `firestore.rules` içindeki
`saves` kuralının Firebase konsolunda yayınlanmış olması gerekir.

## Notlar
- Oyun özeti her 5 dakikada, seviye atlayınca ve oyun arka plana geçince yazılır. Hediyeler oyun açılınca ve her 5 dakikada kontrol edilir (ücretsiz kotayı aşmamak için).
- Oyunun asıl kaydı cihazdadır; panelde gördüğün değerler özettir. Hediye vermek dışında oyuncunun kaydını panelden değiştiremezsin.
- Kullanıcı adı 2. seviyede sorulur; 3–16 karakter, harf/rakam/_; büyük-küçük harf farkı yok; küfür ve "admin" gibi adlar engellenir.
- Firebase ücretsiz (Spark) planı: günde 50.000 okuma / 20.000 yazma. Panel her açılışta en son görülen 1000 oyuncuyu okur.
