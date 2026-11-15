// tests/report/*.json dosyalarından docs/TEST_REPORT.md üretir.
// Rapor yalnızca gerçekten çalıştırılmış testlerin sonuçlarını içerir.
import fs from 'node:fs';
import path from 'node:path';

const R = (f) => { try { return JSON.parse(fs.readFileSync(path.resolve('tests/report', f), 'utf8')); } catch { return null; } };
const play = R('playtest-report.json');
const sys = R('systems-report.json');
const eco = R('economy-report.json');

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const short = (o) => { if (o == null) return ''; const s = typeof o === 'string' ? o : JSON.stringify(o); return s.length > 220 ? s.slice(0, 217) + '…' : s; };
function shots(d) {
  if (!d) return [];
  const out = [];
  const walk = (v) => { if (typeof v === 'string' && v.endsWith('.png')) out.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(d); return out;
}
function table(rep) {
  if (!rep) return '_Bu test çalıştırılmadı._\n';
  let s = `**Sonuç: ${rep.passed} başarılı, ${rep.failed} başarısız, ${rep.pageErrors?.length || 0} sayfa hatası** — ${rep.date}\n\n`;
  s += '| # | Adım | Durum | Süre | Ayrıntı |\n|---|---|---|---|---|\n';
  for (const st of rep.steps) {
    const det = st.ok ? short({ ...st.detail, screenshot: undefined, screenshots: undefined, shots: undefined }) : short(st.error);
    s += `| ${st.n} | ${esc(st.name)} | ${st.ok ? '✅' : '❌'} | ${(st.ms / 1000).toFixed(1)} sn | ${esc(det)} |\n`;
  }
  if (rep.pageErrors?.length) s += '\n**Sayfa hataları:**\n' + rep.pageErrors.slice(0, 10).map((e) => '- `' + esc(e) + '`').join('\n') + '\n';
  return s;
}
function gallery(rep) {
  if (!rep) return '';
  const all = rep.steps.flatMap((st) => shots(st.detail).map((f) => ({ f, name: st.name })));
  if (!all.length) return '';
  return all.map(({ f, name }) => `| ![${esc(name)}](${path.relative('docs', f)}) | ${esc(name)} |`).join('\n');
}

let md = `# WOOD EMPIRE — Test Raporu

Bu rapor \`node tests/make-report.mjs\` ile, **gerçekten çalıştırılmış** otomatik testlerin JSON çıktılarından üretilmiştir.

## Test ortamı ve sınırlar (dürüst beyan)
- Testler, derlenmiş oyunu (\`vite build\`) **headless Chromium + SwiftShader (yazılımsal WebGL)** üzerinde çalıştırır. Telefon ekranı 412×892, dokunmatik etkin.
- Karakter **ışınlanmaz**: test, joystick ile aynı girdi yolunu (hareket vektörü) ve gerçek CDP dokunma olaylarını kullanır; menüler gerçek dokunuşlarla açılır.
- Oyun süresi test sırasında hızlandırılır (timeScale); bu, oyun mantığını değiştirmez.
- **Gerçek Android cihazda test yapılmamıştır.** Geliştirme ortamında Android SDK ve Unity/Gradle sunucularına erişim yoktu. APK/AAB, GitHub Actions iş akışında (\`.github/workflows/android.yml\`) derlenir; ilk çalıştırmanın sonucunu GitHub'da kontrol edin.
- **Reklam (AdMob) ve Google Play Billing gerçek cihazda test edilmemiştir.** Web sürümünde reklam yalnızca açıkça etiketli bir simülasyondur; satın alma web'de kapalıdır. Bkz. MONETIZATION.md.
- FPS değerleri yazılımsal render içindir, gerçek cihaz performansını göstermez.

## 1. Uçtan uca oynanış testi (Bölüm 30 senaryosu) — \`tests/playtest.mjs\`
${table(play)}
## 2. Sistem entegrasyon testi — \`tests/systems-test.mjs\`
${table(sys)}
## 3. Ekonomi simülasyonu — \`tests/economy-sim.mjs\`
`;
if (eco) {
  md += `${eco.model || ''}\n\n| Dakika | Seviye | Olay | Maliyet |\n|---|---|---|---|\n`;
  for (const e of eco.events.slice(0, 40)) md += `| ${e.min} | ${e.level} | ${esc(e.event)} | ${Number(e.cost).toLocaleString('tr-TR')} |\n`;
  md += `\nEn uzun büyük-satın-almasız bekleme: **${eco.longestWaitBetweenPurchasesMin} dk** (bu arada küçük yükseltmeler alınabilir). Simüle edilen süre: ${eco.simulatedHours} saat.\n\n${'```json'}\n${JSON.stringify(eco.final, null, 2)}\n${'```'}\n`;
} else md += '_Çalıştırılmadı._\n';

const g1 = gallery(play), g2 = gallery(sys);
if (g1 || g2) md += `\n## 4. Oyun içi gerçek ekran görüntüleri\nTüm görüntüler testler sırasında oyunun kendisinden alınmıştır (düzenleme yok).\n\n| Görüntü | Adım |\n|---|---|\n${[g1, g2].filter(Boolean).join('\n')}\n`;

md += `
## 5. Testleri yeniden çalıştırma
\`\`\`bash
npm ci && npm run build
npx vite preview --port 4173 &
node tests/playtest.mjs       # Bölüm 30 senaryosu
node tests/systems-test.mjs   # tüm sistemler
node tests/economy-sim.mjs    # ekonomi eğrisi
node tests/make-report.mjs    # bu raporu üretir
\`\`\`
`;
fs.writeFileSync(path.resolve('docs/TEST_REPORT.md'), md);
console.log('docs/TEST_REPORT.md yazıldı', { play: play && `${play.passed}/${play.steps.length}`, sys: sys && `${sys.passed}/${sys.steps.length}` });
