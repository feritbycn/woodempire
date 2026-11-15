# Kurulum, Geliştirme ve Android Derlemesi

## Gereksinimler
| Araç | Sürüm |
|---|---|
| Node.js | 22 LTS |
| JDK | 21 (Capacitor 8 için zorunlu) |
| Android SDK | Platform 36, Build-Tools 36 (Android Studio ile gelir) |
| (İsteğe bağlı) Android Studio | Ladybug veya üstü |

## 1. Yerel geliştirme (tarayıcıda)
```bash
npm ci
npm run dev            # http://localhost:5173  (telefonda aynı ağdan açılabilir)
```
Masaüstü kontrolleri: **WASD / ok tuşları** hareket, **Q / E** kamera döndürme, **fare tekerleği** yakınlaştırma.
Geliştirme modunda reklam düğmeleri açıkça etiketli bir **simülasyon** gösterir (gerçek reklam değildir).

## 2. Android projesine aktarma
```bash
npm run build          # dist/ klasörünü üretir
npx cap sync android   # web dosyalarını + eklentileri android/ projesine kopyalar
npx cap open android   # Android Studio'da açar (Run ▶ ile cihaza kurulur)
```

## 3. Komut satırından APK / AAB
```bash
cd android
./gradlew assembleDebug      # android/app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease      # android/app/build/outputs/bundle/release/app-release.aab
./gradlew assembleRelease    # android/app/build/outputs/apk/release/app-release(-unsigned).apk
```

## 4. Yükleme anahtarı (imzalama) — Play Store için zorunlu
```bash
keytool -genkeypair -v -keystore upload.keystore -alias woodempire -keyalg RSA -keysize 2048 -validity 10000
```
Yerel derlemede ortam değişkenleri:
```bash
export ANDROID_KEYSTORE_PATH=/tam/yol/upload.keystore
export ANDROID_KEYSTORE_PASSWORD=...
export ANDROID_KEY_ALIAS=woodempire
export ANDROID_KEY_PASSWORD=...
```
> `upload.keystore` dosyasını **asla** depoya eklemeyin (`.gitignore` engeller). Kaybederseniz uygulamayı güncelleyemezsiniz — Play App Signing kullanın.

## 5. GitHub Actions ile otomatik APK + AAB
Depo GitHub'a yüklendiğinde `.github/workflows/android.yml` her push'ta iki iş çalıştırır:

1. **test** — Oyunu derler, headless Chromium'da uçtan uca oynanış testini, sistem testini ve ekonomi simülasyonunu çalıştırır; rapor + ekran görüntülerini `test-reports` artefaktı olarak yükler.
2. **android** — `debug APK`, `release APK` ve `release AAB` üretir; `wood-empire-android` artefaktı olarak yükler. `v1.0.0` gibi bir etiket push edilirse dosyaları GitHub Release'e ekler.

İmzalı sürüm için depo **Settings → Secrets and variables → Actions** altına ekleyin:

| Secret | Değer |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.keystore` çıktısı |
| `ANDROID_KEYSTORE_PASSWORD` | anahtar deposu şifresi |
| `ANDROID_KEY_ALIAS` | `woodempire` |
| `ANDROID_KEY_PASSWORD` | anahtar şifresi |

Secrets yoksa derleme yine başarılı olur, ancak release APK/AAB **imzasız** olur (Play Console kabul etmez; debug APK cihazda doğrudan kurulabilir).

Sürüm numarası: `versionCode = GitHub run numarası`, `versionName = 1.0.<run>` (otomatik).

## 6. Testleri yerelde çalıştırma
```bash
npm run build
npx vite preview --port 4173 &
npx playwright install chromium     # ilk kez
node tests/playtest.mjs             # Bölüm 30 senaryosu (≈5 dk)
node tests/systems-test.mjs         # geç oyun sistemleri
node tests/economy-sim.mjs          # ilerleme hızı modeli
```
Raporlar: `tests/report/*.json`, ekran görüntüleri: `docs/screenshots/`.

## 7. Varlıkları yeniden üretme
```bash
npm run audio                 # public/audio/*.mp3|ogg (ffmpeg gerekir)
python3 scripts/gen-icons.py  # uygulama simgesi, açılış ekranı, Play görseli (Pillow + fonttools gerekir)
```
Tüm 3B modeller kod içinde prosedürel üretilir (`src/world/Models.js`); harici model dosyası gerekmez.
