#!/usr/bin/env bash
# GitHub'a yüklenmeye hazır kaynak ZIP'i üretir (node_modules, derleme çıktıları, anahtarlar hariç).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-../WoodEmpire-source.zip}"
rm -f "$OUT"
zip -qr "$OUT" . \
  -x 'node_modules/*' 'dist/*' '.git/*' '*.log' 'shot.png' \
     'android/app/build/*' 'android/build/*' 'android/.gradle/*' 'android/local.properties' \
     'android/app/src/main/assets/public/*' 'android/capacitor-cordova-android-plugins/build/*' \
     'scripts/.audio-tmp/*' 'scripts/.fonts/*' '*.keystore' '*.jks' 'server/verify-purchase/node_modules/*'
echo "ZIP: $OUT ($(du -h "$OUT" | cut -f1))"
