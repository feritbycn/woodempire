// =============================================================
// WOOD EMPIRE - Oyun dengesi (tüm sayısal değerler tek yerde)
// Bu dosyadaki değerler değiştirilerek ekonomi ayarlanabilir.
// =============================================================

/** Ağaç / odun türleri. mul = ürün fiyat çarpanı */
export const WOODS = {
  pine:  { name: 'Çam',         mul: 1.0, color: 0xd09a5c, leaf: 0x3f9b46, hp: 3,  logs: 2, regrow: 22, xp: 2 },
  birch: { name: 'Huş',         mul: 1.4, color: 0xeadcb8, leaf: 0x8cc63f, hp: 4,  logs: 3, regrow: 26, xp: 3 },
  oak:   { name: 'Meşe',        mul: 1.8, color: 0x9c6a3c, leaf: 0x2f7d32, hp: 6,  logs: 3, regrow: 32, xp: 4 },
  cedar: { name: 'Sedir',       mul: 2.6, color: 0xc0623e, leaf: 0x1f6b52, hp: 8,  logs: 4, regrow: 40, xp: 6 },
  rare:  { name: 'Altın Ceviz', mul: 4.5, color: 0xe2b23c, leaf: 0xf2a623, hp: 12, logs: 5, regrow: 60, xp: 10 },
};
export const WOOD_ORDER = ['pine', 'birch', 'oak', 'cedar', 'rare'];

/** Ürün türleri. price = baz satış fiyatı (çam için), h = istif yüksekliği */
/** Ahşap (kereste) ürünlerinin satış geliri çarpanı: oyuncu isteğiyle %80 düşürüldü (para kazanmak daha zor) */
export const WOOD_SALE_MUL = 0.2;
export const WOOD_KINDS = ['log', 'plank', 'sanded', 'package', 'pallet', 'panel', 'furniture'];
/** Diğer bütün ürünlerin (süt, yumurta, yün, bal…) satış geliri çarpanı: oyuncu isteğiyle %70 düşürüldü */
export const OTHER_SALE_MUL = 0.3;

export const ITEMS = {
  log:       { name: 'Kütük',          price: 2,  h: 0.36, sellable: false },
  plank:     { name: 'Kereste',        price: 5,  h: 0.13, sellable: true },
  sanded:    { name: 'Zımparalı Tahta', price: 7,  h: 0.13, sellable: true },
  package:   { name: 'Paketli Ürün',    price: 11, h: 0.48, sellable: true },
  pallet:    { name: 'Palet',           price: 30, h: 0.28, sellable: true },
  panel:     { name: 'Ahşap Panel',     price: 34, h: 0.16, sellable: true },
  furniture: { name: 'Mobilya',         price: 40, h: 0.62, sellable: true },
  // Çiftlik tesisleri (kendi renkleri vardır, ağaç rengiyle boyanmaz)
  milk:      { name: 'Süt Kovası',      price: 3,  h: 0.52, sellable: false, ownColor: true },
  bottle:    { name: 'Süt Kasası',      price: 8,  h: 0.44, sellable: true, ownColor: true },
  egg:       { name: 'Yumurta Sepeti',  price: 3,  h: 0.30, sellable: false, ownColor: true },
  carton:    { name: 'Yumurta Kolisi',  price: 9,  h: 0.36, sellable: true, ownColor: true },
  wool:      { name: 'Yün Yığını',      price: 4,  h: 0.42, sellable: false, ownColor: true },
  yarn:      { name: 'Yün Yumağı',      price: 11, h: 0.40, sellable: true, ownColor: true },
  comb:      { name: 'Bal Peteği',      price: 4,  h: 0.28, sellable: false, ownColor: true },
  honey:     { name: 'Bal Kavanozu',    price: 12, h: 0.42, sellable: true, ownColor: true },
};
export const PRODUCT_KINDS = ['plank', 'sanded', 'package', 'pallet', 'panel', 'furniture', 'bottle', 'carton', 'yarn', 'honey'];
/** Ham ürünler: önce depoya girmeden makineye giremez */
export const RAW_KINDS = ['log', 'milk', 'egg', 'wool', 'comb'];

/** Üretim makineleri */
export const MACHINES = {
  saw: {
    name: 'Testere', input: 'log', inCount: 1, output: 'plank', outCount: 2,
    time: 2.2, inCap: 10, outCap: 24, color: 0xd8432f, blades: true,
  },
  sander: {
    name: 'Zımpara Makinesi', input: 'plank', inCount: 1, output: 'sanded', outCount: 1,
    time: 1.4, inCap: 16, outCap: 24, color: 0xf2b632,
  },
  packer: {
    name: 'Paketleme Makinesi', input: 'sanded', inCount: 1, output: 'package', outCount: 1,
    time: 1.6, inCap: 16, outCap: 24, color: 0x3a7bd5,
  },
  palletizer: {
    name: 'Palet Tesisi', input: 'plank', inCount: 4, output: 'pallet', outCount: 1,
    time: 3.0, inCap: 24, outCap: 16, color: 0x3aa35b,
  },
  panelpress: {
    name: 'Ahşap Panel Fabrikası', input: 'sanded', inCount: 3, output: 'panel', outCount: 1,
    time: 2.6, inCap: 24, outCap: 16, color: 0xef7d22,
  },
  furniture: {
    name: 'Mobilya Atölyesi', input: 'package', inCount: 2, output: 'furniture', outCount: 1,
    time: 3.4, inCap: 16, outCap: 12, color: 0x8e5bd6,
  },
  bottler: {
    name: 'Şişeleme Makinesi', input: 'milk', inCount: 1, output: 'bottle', outCount: 2,
    time: 2.0, inCap: 10, outCap: 24, color: 0x4dabf7,
  },
  eggpacker: {
    name: 'Yumurta Paketleme', input: 'egg', inCount: 2, output: 'carton', outCount: 1,
    time: 1.8, inCap: 20, outCap: 20, color: 0xffa94d,
  },
  spinner: {
    name: 'Eğirme Makinesi', input: 'wool', inCount: 1, output: 'yarn', outCount: 1,
    time: 1.8, inCap: 12, outCap: 20, color: 0xab47bc,
  },
  honeypress: {
    name: 'Bal Süzme Makinesi', input: 'comb', inCount: 1, output: 'honey', outCount: 1,
    time: 1.8, inCap: 12, outCap: 20, color: 0xffa000,
  },
  autoline: {
    name: 'Otomatik Kereste Hattı', input: 'log', inCount: 1, output: 'package', outCount: 3,
    time: 1.2, inCap: 30, outCap: 40, color: 0x5f6b7a,
  },
};

/** Makine yükseltmeleri. cost = base * growth^level */
export const MACHINE_UPGRADES = {
  speed:    { name: 'Üretim Hızı',       base: 40,  growth: 1.55, max: 25, desc: 'İşlem süresi %8 kısalır' },
  capacity: { name: 'Üretim Kapasitesi', base: 50,  growth: 1.6,  max: 20, desc: 'Giriş/çıkış deposu büyür' },
  quality:  { name: 'Ürün Kalitesi',     base: 120, growth: 1.75, max: 20, desc: 'Ürün satış değeri +%6' },
  blades:   { name: 'Bıçak Sayısı',      base: 150, growth: 2.4,  max: 6,  desc: 'Kütük başına +1 kereste', only: ['saw'] },
  size:     { name: 'Makine Boyutu',     base: 2500, growth: 6,   max: 3,  desc: 'Daha büyük makine: aynı anda +1 işlem', gates: [3, 5, 8] },
};

/** Karakter yükseltmeleri */
export const CAPACITY_TABLE = [10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
export const PLAYER_UPGRADES = {
  speed:     { name: 'Hareket Hızı',    base: 30, growth: 1.5,  max: 15, desc: 'Daha hızlı yürü ve koş' },
  capacity:  { name: 'Taşıma Kapasitesi', base: 25, growth: 1.75, max: 30, desc: 'Tek seferde daha çok taşı' },
  chop:      { name: 'Kesme Hızı',      base: 35, growth: 1.55, max: 20, desc: 'Balta daha hızlı sallanır' },
  power:     { name: 'Güç',             base: 60, growth: 1.7,  max: 20, desc: 'Her vuruş daha çok hasar' },
  collect:   { name: 'Toplama Hızı',    base: 40, growth: 1.6,  max: 15, desc: 'Odun toplama ve bırakma hızı' },
};
export function playerCapacity(level) {
  if (level < CAPACITY_TABLE.length) return CAPACITY_TABLE[level];
  return CAPACITY_TABLE[CAPACITY_TABLE.length - 1] + (level - CAPACITY_TABLE.length + 1) * 5;
}

/** Depo */
export const DEPOT_UPGRADE = { name: 'Depoyu Genişlet', base: 60, growth: 1.45, max: Infinity, desc: '+200 yer, depo alanı büyür (sınırsız)' };
export const DEPOT_STEP = 200;     // her genişletmede eklenen yer (40 → 200): tek işçinin bir seferde getirdiğiyle dolmaz; genişletme sınırsız
export const DEPOT_SECTION = 120;  // bir depo bölmesine sığan kütük (3 kat); dolunca yeni bölme kurulur
export const DEPOT_BASE_CAP = 150; // başlangıç 50 → 150

/** Kamyonlar */
export const TRUCK_TIERS = [
  { id: 'small',      name: 'Küçük Kamyon',      cap: 20,  cost: 0,      zone: 0, color: 0xf4b400, len: 1.0, speed: 1.0 },
  { id: 'medium',     name: 'Orta Kamyon',       cap: 50,  cost: 2500,   zone: 1, color: 0x2e86de, len: 1.25, speed: 1.05 },
  { id: 'large',      name: 'Büyük Kamyon',      cap: 100, cost: 20000,  zone: 5, color: 0xd63031, len: 1.5, speed: 1.1 },
  { id: 'industrial', name: 'Endüstriyel Kamyon', cap: 200, cost: 120000, zone: 9, color: 0x2d3436, len: 1.8, speed: 1.15 },
];
export const TRUCK_UPGRADES = {
  speed:  { name: 'Araç Hızı',         base: 120, growth: 1.6, max: 15, desc: 'Kamyonlar daha hızlı döner' },
  bonus:  { name: 'Pazarlık (Satış Fiyatı)', base: 300, growth: 1.8, max: 25, desc: 'Satışlardan +%5 gelir' },
  load:   { name: 'Yükleme Hızı',      base: 90,  growth: 1.55, max: 15, desc: 'Daha hızlı yükleme; her 3 seviyede +1 ürün aynı anda yüklenir' },
};
export const TRUCK_BASE_TURNAROUND = 5; // sn: kamyonun gidip yenisinin gelme süresi
export const TRUCK_IDLE_DEPART = 10;    // sn: yük varken bekleme sonrası otomatik çıkış

/** İşçiler */
/** İşçi görevleri: işçi tek noktadan "İŞÇİ AL" ile alınır, görevi sonradan İşçiler panelinden değiştirilir */
export const WORKER_ROLES = {
  lumberjack: { name: 'Oduncu',            desc: 'Ağaç keser, kesilmemiş kütükleri depoya taşır' },
  carrier:    { name: 'Dağıtım İşçisi',    desc: 'Kesilmiş odunu stoktan / depodan alıp gereken makineye götürür' },
  loader:     { name: 'Taşıyıcı',          desc: 'Hazır ürünleri üretim alanından kamyon rampasına taşır' },
  sawop:      { name: 'Kesme Operatörü',   desc: 'Makinenin başında durur: kesimi %30 hızlandırır (makine başına en fazla 2)' },
  beltop:     { name: 'Bant Operatörü',    desc: 'Bir bandın başında durur: bandı %30 hızlandırır (bant başına en fazla 2)' },
  farmer:     { name: 'Bakıcı',            desc: 'Hayvanlara yem verir, ürünü toplar ve depoya taşır' },
};
/** Çiftliğe göre bakıcı adı */
export const CARETAKER_NAME = { cow: 'İnek Bakıcısı', hen: 'Tavuk Bakıcısı', sheep: 'Koyun Bakıcısı', hive: 'Arı Bakıcısı' };
/** Yem: hayvanlar yemle üretir; her ürün (sağım / yumurta / kırkım / petek) 1 yem tüketir */
export const FEED = { startUnits: 15, capBase: 12, capPerAnimal: 4, priceMul: 0.015, refillAt: 0.35 };
export const WORKER_HIRE = { base: 400, growth: 1.85 };
export const WORKER_UPGRADES = {
  slots:    { name: 'İşçi Sayısı',      base: 300, growth: 1.9, max: 16, desc: '+1 işçi kapasitesi' },
  speed:    { name: 'Çalışma Hızı',     base: 120, growth: 1.55, max: 20, desc: 'İşçiler daha hızlı yürür ve keser' },
  capacity: { name: 'Taşıma Gücü',      base: 150, growth: 1.65, max: 20, desc: 'Her işçi daha çok taşır' },
  efficiency:{ name: 'Verimlilik',      base: 180, growth: 1.65, max: 20, desc: 'Daha hızlı bırakır, alır ve sağar' },
};
export const WORKER_BASE = { speed: 3.4, capacity: 3, chopInterval: 1.0, transfer: 0.32 };

/** Forklift */
export const FORKLIFT_BUY = { base: 6000, growth: 3, max: 4 };
export const FORKLIFT_UPGRADES = {
  capacity: { name: 'Taşıma Kapasitesi', base: 600,  growth: 1.7, max: 20, desc: '+4 ürün' },
  speed:    { name: 'Hareket Hızı',      base: 500,  growth: 1.6, max: 15, desc: 'Daha hızlı sürüş' },
  lift:     { name: 'Kaldırma Yüksekliği', base: 900, growth: 1.9, max: 8, desc: 'Daha yüksek istif: +%15 kapasite' },
  loading:  { name: 'Yükleme Hızı',      base: 450,  growth: 1.6, max: 15, desc: 'Daha hızlı yükleme / boşaltma' },
  fuel:     { name: 'Yakıt Verimliliği', base: 700,  growth: 1.7, max: 10, desc: 'Daha az mola (dolum) süresi' },
};
export const FORKLIFT_BASE = { capacity: 12, speed: 6, transfer: 0.12, refuelEvery: 8, refuelTime: 4 };

/** Konveyör bantları */
export const CONVEYOR_UPGRADES = {
  speed:    { name: 'Bant Hızı',      base: 400, growth: 1.6, max: 20, desc: 'Ürünler daha hızlı akar' },
  capacity: { name: 'Bant Kapasitesi', base: 350, growth: 1.6, max: 12, desc: 'Her 3 seviyede taşıma kapasitesi artar: önce 2 şerit, sonra daha hızlı akış (bant en fazla 2 şerit genişler)' },
};

/** Seviye / XP */
export function xpForLevel(level) {
  // Sonsuz seviye: her seviye daha fazla XP ister; 5. seviyeden sonra eğri ayrıca dikleşir (doğrusal değil)
  const base = 40 * Math.pow(level, 1.55) + 20 * level;
  return Math.round(level <= 5 ? base : base * (1 + 0.06 * (level - 5)));
}
/** XP kazanım çarpanı: ilk 5 seviye hızlı (tanıtım), sonrası %70 daha az XP */
export function xpGainMul(level) { return level < 5 ? 1 : 0.3;
}
export function levelReward(level) {
  return { money: Math.round(30 * Math.pow(level, 1.5)), gold: 5 + Math.floor(level / 5) * 5 };
}

/** XP kaynakları */
export const XP = {
  chopTree: 2, collectLog: 1, produce: 1, shipTruckBase: 10, buyLand: 60, buyMachine: 25, upgrade: 4, hire: 15,
};

/** Hızlandırmalar (altın veya reklamla) */
export const BOOSTS = {
  production: { name: '2x Üretim',        dur: 180, gold: 15, icon: 'factory', desc: '3 dakika boyunca makineler 2 kat hızlı' },
  sales:      { name: '2x Para',          dur: 180, gold: 20, icon: 'coin',    desc: '3 dakika boyunca satışlar 2 kat değerli' },
  speed:      { name: '2x Hız',           dur: 120, gold: 10, icon: 'run',     desc: '2 dakika boyunca karakter 2 kat hızlı' },
  magnet:     { name: 'Otomatik Toplama', dur: 120, gold: 8,  icon: 'magnet',  desc: '2 dakika boyunca kütükler sana kendiliğinden çekilir' },
  autochop:   { name: 'Otomatik Kesim',   dur: 120, gold: 12, icon: 'axe',     desc: '2 dakika boyunca yanından geçtiğin ağaçlar yürürken bile kesilir' },
  helper:     { name: 'Yardımcı İşçi',   dur: 60,  gold: 10, icon: 'worker',  desc: '1 dakika boyunca altın baretli bir işçi gelip en çok gereken işi yapar' },
  carry:      { name: 'Süper Taşıma',     dur: 180, gold: 10, icon: 'box',     desc: '3 dakika boyunca +10 taşıma kapasitesi' },
  truck:      { name: 'Hızlı Sevkiyat',   dur: 0,   gold: 5,  icon: 'truck',   desc: 'Bekleyen kamyon anında gelir' },
};

export const SPRINT = { mul: 1.75, dur: 4, cooldown: 10 };
export const MAGNET = { radius: 9, dur: 2.5, cooldown: 12 };

/** Offline kazanç */
export const OFFLINE = { maxSeconds: 2 * 3600, factor: 0.5 };

export function upgradeCost(def, level) {
  return Math.round(def.base * Math.pow(def.growth, level));
}
