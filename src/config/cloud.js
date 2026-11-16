/**
 * Firebase (bulut kaydı, kullanıcı adı, hediyeler) yapılandırması.
 * Bu değerler GİZLİ DEĞİLDİR: her web/mobil uygulamada görünürler. Güvenlik firestore.rules ile sağlanır.
 */
export const FIREBASE = {
  apiKey: 'AIzaSyCvPap7oTyQtS4WkSU4Ugd5l5gA_4smQEE',
  authDomain: 'woodempire-37573.firebaseapp.com',
  projectId: 'woodempire-37573',
  storageBucket: 'woodempire-37573.firebasestorage.app',
  messagingSenderId: '674111438478',
  appId: '1:674111438478:web:2b063ff9fd9fa6de2493df',
};

export const CLOUD = {
  backupEvery: 120,     // sn — tam kayıt yedeği (yalnızca değiştiyse yazılır); hesap aktarımı en güncel hâli taşısın
  syncEvery: 300,       // sn — oyuncu özeti buluta bu aralıkla yazılır (ayrıca seviye atlayınca, arka plana geçince); ücretsiz Firebase kotasına göre
  giftCheckEvery: 300,  // sn — yeni hediye kontrolü (ayrıca oyun açılınca)
  nameLevel: 2,         // bu seviyeden itibaren kullanıcı adı sorulur
  nameMin: 3, nameMax: 16,
};

/** Kullanıcı adı kuralları: 3–16 karakter, harf/rakam/alt çizgi (Türkçe harfler dahil); yasaklı kelimeler */
const BANNED = ['admin', 'yonetici', 'yönetici', 'moderator', 'woodempire', 'destek', 'support', 'official', 'resmi',
  'amk', 'aq', 'sik', 'yarak', 'orospu', 'pic', 'piç', 'got', 'göt', 'ibne', 'kahpe', 'yavsak', 'yavşak', 'sikerim', 'anan', 'fuck', 'shit', 'bitch', 'nigger', 'nazi'];
export function normalizeName(n) { return String(n || '').trim().toLocaleLowerCase('tr-TR'); }
export function nameProblem(name) {
  const n = String(name || '').trim();
  if (n.length < CLOUD.nameMin) return `En az ${CLOUD.nameMin} karakter olmalı`;
  if (n.length > CLOUD.nameMax) return `En fazla ${CLOUD.nameMax} karakter olmalı`;
  if (!/^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]+$/.test(n)) return 'Sadece harf, rakam ve _ kullanılabilir';
  const low = normalizeName(n).replace(/_/g, '');
  const flat = low.replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
  // uzun yasaklı kelimeler adın içinde, kısa olanlar (aq, got…) yalnızca adın tamamıysa engellenir (Aqua, Hakan gibi adlar takılmasın)
  if (BANNED.some((b) => (b.length >= 4 ? (low.includes(b) || flat.includes(b)) : (low === b || flat === b)))) return 'Bu ad kullanılamaz';
  return null;
}
