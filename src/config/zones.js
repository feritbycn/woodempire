// =============================================================
// WOOD EMPIRE - Harita ve bölge tanımları
// Koordinatlar dünya birimi (≈ metre). -Z ekranda "yukarı" yöndür.
// Sütunlar: Batı (orman) x[-70,-20] | Merkez (üretim+yol) x[-20,36] | Doğu (lojistik) x[36,76]
// Yol: x ≈ 28-36 arası, kuzey-güney boyunca uzanır.
// =============================================================

export const ROAD = { x: 32, width: 7, laneA: 30.4, laneB: 33.6, zStart: 760, zEnd: -420 };

/**
 * Her bölge:
 *  rect: {x0,x1,z0,z1} (z0 < z1)
 *  forests: ağaç alanları ve tür ağırlıkları
 *  sites: binalar/makineler (cost 0 => başlangıçta kurulu)
 *  pad: satın alma noktası (sahip olunan komşu bölgede durur)
 */
export const ZONES = [
  {
    id: 0, name: 'Başlangıç Ormanı', cost: 0, level: 1,
    rect: { x0: -20, x1: 36, z0: -12, z1: 26 },
    forests: [{ x0: -18, x1: -5, z0: -10, z1: 24, spacing: 3.3, mix: { pine: 1 } }],
    sites: [
      // ORMAN → KAPALI DEPO → TESTERE → KESİLMİŞ ODUN STOKU → İŞÇİLER → HEDEF BİNALAR (tek sıra)
      // kapalı depo: bütün kütükler buraya; çıkış kapısındaki iç bant kütükleri testereye kendiliğinden verir
      { id: 'depot1', type: 'depot', x: 2, z: -2, cost: 0, name: 'Kütük Deposu', closed: true, feeds: 'saw' },
      // testere deponun hemen çıkışında; kesilen odun yanındaki STOK ALANINDA birikir (dolunca alan genişletilir)
      { id: 'saw', type: 'machine', machine: 'saw', x: 14, z: -2, cost: 0, stock: { x: 23.6, z: -2, base: 40, step: 30, max: 12, cost: 120, name: 'Kesilmiş Odun Stoku' } },
      { id: 'dock1', type: 'dock', x: 24, z: 12, lane: 'A', cost: 0, name: 'Yükleme Alanı' },
    ],
    decor: { rocks: 10, bushes: 14, flowers: 30, ponds: [] },
    desc: 'Küçük bir orman, depo, testere ve kamyon alanı.',
  },
  {
    id: 1, name: 'Küçük Kereste Fabrikası', cost: 300, level: 2,
    rect: { x0: -20, x1: 36, z0: -42, z1: -12 },
    pad: { x: 9.6, z: -10.2 }, // deponun 2. bölmesi büyüyünce altında kalmasın diye depodan uzakta
    forests: [{ x0: -18, x1: -8, z0: -40, z1: -16, spacing: 3.6, mix: { pine: 0.7, birch: 0.3 } }],
    sites: [
      { id: 'sander', type: 'machine', machine: 'sander', x: 12, z: -26, cost: 250 },
      { id: 'office', type: 'office', x: -1, z: -32, cost: 450, name: 'İşçi Ofisi' },
    ],
    decor: { rocks: 8, bushes: 10, flowers: 20, ponds: [{ x: 26, z: -34, r: 3.4 }] },
    desc: 'Zımpara makinesi ve işçi ofisi açılır.',
  },
  {
    id: 2, name: 'Geniş Orman Alanı', cost: 1500, level: 4,
    rect: { x0: -70, x1: -20, z0: -42, z1: 26 },
    pad: { x: -18.4, z: 4 },
    forests: [{ x0: -68, x1: -32, z0: -40, z1: 24, spacing: 4.0, mix: { pine: 0.4, birch: 0.3, oak: 0.3 } }],
    // ayrı depo yok: bütün kütükler tek Kütük Deposu'nda toplanır; bu orman deponun kapasitesini büyütür
    sites: [],
    depotBonus: 50,
    decor: { rocks: 16, bushes: 20, flowers: 30, ponds: [{ x: -48, z: -6, r: 5 }] },
    desc: 'Huş ve meşe ağaçlarıyla dolu büyük orman. Kütük Deposu büyür (+50); bütün oduncular kütüğü aynı depoya taşır.',
  },
  {
    id: 3, name: 'Endüstriyel Üretim Bölgesi', cost: 5000, level: 6,
    rect: { x0: -20, x1: 36, z0: -72, z1: -42 },
    pad: { x: 4, z: -40.2 },
    forests: [{ x0: -18, x1: -8, z0: -70, z1: -46, spacing: 3.8, mix: { pine: 0.5, birch: 0.5 } }],
    sites: [
      { id: 'packer', type: 'machine', machine: 'packer', x: 12, z: -56, cost: 3000 },
    ],
    decor: { rocks: 6, bushes: 8, flowers: 10, ponds: [] },
    unlocks: ['conveyors'],
    desc: 'Kendi ithalatıyla çalışan paketleme hattı ve konveyör bantları.',
  },
  {
    id: 4, name: 'Büyük Depolama Merkezi', cost: 12000, level: 8,
    rect: { x0: 36, x1: 76, z0: -42, z1: 26 },
    pad: { x: 34.6, z: -2 },
    forests: [{ x0: 64, x1: 74, z0: -40, z1: 24, spacing: 3.8, mix: { pine: 0.5, oak: 0.5 } }],
    sites: [
      { id: 'warehouse', type: 'warehouse', x: 47, z: -6, cost: 8000, name: 'Ürün Deposu' },
      { id: 'garage', type: 'garage', x: 52, z: 14, cost: 4000, name: 'Forklift Garajı' },
    ],
    decor: { rocks: 8, bushes: 10, flowers: 14, ponds: [] },
    unlocks: ['forklift'],
    desc: 'Büyük ürün deposu ve forkliftler.',
  },
  {
    id: 5, name: 'Lojistik ve Kamyon Merkezi', cost: 30000, level: 10,
    rect: { x0: 36, x1: 76, z0: -102, z1: -42 },
    pad: { x: 52, z: -40.2 },
    forests: [{ x0: 62, x1: 74, z0: -100, z1: -46, spacing: 4, mix: { oak: 0.6, birch: 0.4 } }],
    sites: [
      { id: 'dock2', type: 'dock', x: 40, z: -70, lane: 'B', cost: 0, name: 'Lojistik Rampası' },
    ],
    decor: { rocks: 8, bushes: 10, flowers: 10, ponds: [] },
    desc: 'İthal kütükle çalışan kendi testeresi, kendi rampası ve büyük kamyonlar.',
  },
  {
    id: 6, name: 'Değerli Ağaç Ormanı', cost: 70000, level: 13,
    rect: { x0: -70, x1: -20, z0: -102, z1: -42 },
    pad: { x: -45, z: -40.2 },
    forests: [{ x0: -68, x1: -24, z0: -100, z1: -44, spacing: 4.2, mix: { cedar: 0.45, oak: 0.25, birch: 0.18, rare: 0.12 } }],
    sites: [],
    decor: { rocks: 14, bushes: 16, flowers: 30, ponds: [{ x: -40, z: -72, r: 4.5 }] },
    desc: 'Sedir ve nadir Altın Ceviz ağaçları.',
  },
  {
    id: 7, name: 'Mobilya ve Palet Tesisi', cost: 150000, level: 16,
    rect: { x0: -20, x1: 36, z0: -102, z1: -72 },
    pad: { x: 4, z: -70.2 },
    forests: [],
    sites: [
      { id: 'palletizer', type: 'machine', machine: 'palletizer', x: -4, z: -86, cost: 60000 },
      { id: 'furniture', type: 'machine', machine: 'furniture', x: 15, z: -86, cost: 90000 },
    ],
    decor: { rocks: 6, bushes: 8, flowers: 10, ponds: [] },
    desc: 'İthal kereste ve paketle palet ve mobilya üretimi.',
  },
  {
    id: 8, name: 'Büyük Kereste İmparatorluğu', cost: 400000, level: 20,
    rect: { x0: -70, x1: 36, z0: -132, z1: -102 },
    pad: { x: 4, z: -100.2 },
    forests: [{ x0: -68, x1: -4, z0: -130, z1: -104, spacing: 4.2, mix: { pine: 0.2, birch: 0.2, oak: 0.2, cedar: 0.25, rare: 0.15 } }],
    sites: [
      { id: 'panelpress', type: 'machine', machine: 'panelpress', x: 14, z: -116, cost: 200000 },
    ],
    decor: { rocks: 12, bushes: 14, flowers: 20, ponds: [] },
    desc: 'Dev orman ve ithal tahtayla çalışan panel fabrikası.',
  },
  {
    id: 9, name: 'İleri Teknoloji Üretim Bölgesi', cost: 1000000, level: 25,
    rect: { x0: 36, x1: 76, z0: -132, z1: -102 },
    pad: { x: 52, z: -100.2 },
    forests: [],
    sites: [
      { id: 'autoline', type: 'machine', machine: 'autoline', x: 56, z: -116, cost: 600000 },
    ],
    decor: { rocks: 4, bushes: 6, flowers: 6, ponds: [] },
    desc: 'İthal kütükten pakete otomatik kereste hattı.',
  },
];

/**
 * İTHALATLI BÖLGELER: sonradan açılan üretim bölgeleri önceki bölgelerden malzeme ÇEKMEZ.
 * Her birinin kendi ithalat deposu (ithalat kamyonu ucuz fiyata hammadde getirir), makinesi,
 * satış rampası, bant satın alma noktaları ve işçi alma noktaları vardır — tesislerle aynı mantık:
 *   ithalat kamyonu → ithalat deposu → (elle / taşıyıcı / bant) → makine → (elle / yükleyici / bant) → rampa → kamyon
 * valueMul: bölge + makine yatırımı tam otomasyonda ~10 dakikada geri dönsün diye rampa fiyat çarpanı.
 */
const IMPORT_ZONES = {
  3: { kinds: ['sanded'], depot: { x: 22, z: -65 }, dock: { x: 24, z: -47, lane: 'A' }, valueMul: 2.5,
    machines: ['packer'],
    hire: [{ role: 'carrier', x: 22.8, z: -58.2, base: 400 }, { role: 'loader', x: 19.6, z: -51, base: 550 }], upPad: { x: 4, z: -62 },
    belts: [
      { id: 'c_z3_in', name: 'İthalat Bandı (Paketleme)', from: 'imp3', to: 'packer', cost: 2500, buyPad: { x: 12, z: -63 }, path: [[19.4, -66.6], [5.4, -66.6], [5.4, -56], [7.6, -56]] },
      { id: 'c_z3_out', name: 'Paketleme Yükleme Bandı', from: 'packer', to: 'dock3', cost: 4000, buyPad: { x: 19.6, z: -59.6 }, path: [[17.4, -56], [21, -56], [21, -49], [26.2, -49]] },
    ] },
  5: { kinds: ['log'], depot: { x: 46, z: -90 }, dockId: 'dock2', valueMul: 14, acceptFresh: true,
    extraSites: [{ id: 'saw5', type: 'machine', machine: 'saw', x: 54, z: -72, cost: 6000, name: 'Lojistik Testeresi' }],
    machines: ['saw5'],
    hire: [{ role: 'carrier', x: 44.5, z: -81, base: 1200 }, { role: 'loader', x: 58, z: -66.8, base: 1600 }], upPad: { x: 44, z: -77 },
    belts: [
      { id: 'c_z5_in', name: 'İthal Kütük Bandı', from: 'imp5', to: 'saw5', cost: 9000, buyPad: { x: 54, z: -86 }, path: [[48.6, -91.6], [50.4, -91.6], [50.4, -76], [47.6, -76], [47.6, -72], [49.6, -72]] },
      { id: 'c_z5_out', name: 'Lojistik Yükleme Bandı', from: 'saw5', to: 'dock2', cost: 12000, buyPad: { x: 47, z: -61.4 }, path: [[59.4, -72], [61, -72], [61, -64], [41.6, -64], [41.6, -68.5], [38.8, -68.5]] },
    ] },
  7: { kinds: ['plank', 'package'], depot: { x: 22, z: -97 }, dock: { x: 24, z: -76, lane: 'A' }, valueMul: 29,
    machines: ['palletizer', 'furniture'],
    hire: [{ role: 'carrier', x: 16, z: -92.6, base: 6000 }, { role: 'loader', x: 8, z: -78.4, base: 8000 }], upPad: { x: 0, z: -93 },
    belts: [
      { id: 'c_z7_inf', name: 'İthalat Bandı (Mobilya)', from: 'imp7', to: 'furniture', cost: 40000, buyPad: { x: 14, z: -95.6 }, path: [[19.4, -98.6], [9.6, -98.6], [9.6, -86], [10.6, -86]] },
      { id: 'c_z7_inp', name: 'İthalat Bandı (Palet)', from: 'imp7', to: 'palletizer', cost: 40000, buyPad: { x: -2, z: -96 }, path: [[19.4, -100.6], [-9.4, -100.6], [-9.4, -86], [-8.4, -86]] },
      { id: 'c_z7_outf', name: 'Mobilya Yükleme Bandı', from: 'furniture', to: 'dock7', cost: 60000, buyPad: { x: 24.6, z: -82 }, path: [[20.4, -86], [22, -86], [22, -78], [26.2, -78]] },
      { id: 'c_z7_outp', name: 'Palet Yükleme Bandı', from: 'palletizer', to: 'dock7', cost: 60000, buyPad: { x: 6, z: -77.2 }, path: [[1.4, -86], [3, -86], [3, -74.5], [26.2, -74.5]] },
    ] },
  8: { kinds: ['sanded'], depot: { x: 22, z: -127 }, dock: { x: 24, z: -106, lane: 'A' }, valueMul: 98,
    machines: ['panelpress'],
    hire: [{ role: 'carrier', x: 16, z: -123, base: 15000 }, { role: 'loader', x: 19.4, z: -110.6, base: 20000 }], upPad: { x: 4, z: -122 },
    belts: [
      { id: 'c_z8_in', name: 'İthalat Bandı (Panel)', from: 'imp8', to: 'panelpress', cost: 120000, buyPad: { x: 12, z: -125 }, path: [[19.4, -128.6], [7.6, -128.6], [7.6, -116], [9.6, -116]] },
      { id: 'c_z8_out', name: 'Panel Yükleme Bandı', from: 'panelpress', to: 'dock8', cost: 160000, buyPad: { x: 24.6, z: -112 }, path: [[19.4, -116], [22, -116], [22, -108], [26.2, -108]] },
    ] },
  9: { kinds: ['log'], depot: { x: 46, z: -127 }, dock: { x: 40, z: -106, lane: 'B' }, valueMul: 99,
    machines: ['autoline'],
    hire: [{ role: 'carrier', x: 54, z: -124, base: 40000 }, { role: 'loader', x: 60, z: -109, base: 50000 }], upPad: { x: 45.5, z: -118 },
    belts: [
      { id: 'c_z9_in', name: 'İthal Kütük Bandı (Otomatik Hat)', from: 'imp9', to: 'autoline', cost: 300000, buyPad: { x: 47, z: -112 }, path: [[48.6, -128.6], [50.6, -128.6], [50.6, -116], [51.6, -116]] },
      { id: 'c_z9_out', name: 'Otomatik Hat Yükleme Bandı', from: 'autoline', to: 'dock9', cost: 400000, buyPad: { x: 66, z: -110 }, path: [[61.4, -116], [63, -116], [63, -104.5], [38.8, -104.5]] },
    ] },
};
for (const [zid, c] of Object.entries(IMPORT_ZONES)) {
  const id = Number(zid); const z = ZONES[id];
  const depotId = `imp${id}`;
  const dockId = c.dockId || `dock${id}`;
  z.importZone = true; z.valueMul = c.valueMul;
  z.sites.push(...(c.extraSites || []));
  for (const s of z.sites) { s.zone = id; if (c.machines.includes(s.id)) s.importOnly = id; }
  z.sites.push({ id: depotId, type: 'depot', import: true, zone: id, accepts: c.kinds, acceptFresh: !!c.acceptFresh, x: c.depot.x, z: c.depot.z, cost: 0, name: 'İthalat Deposu' });
  if (c.dock) z.sites.push({ id: dockId, type: 'dock', zone: id, x: c.dock.x, z: c.dock.z, lane: c.dock.lane, cost: 0, name: `${z.name} Rampası`, valueMul: c.valueMul });
  else { const d = z.sites.find((s) => s.id === dockId); d.valueMul = c.valueMul; d.zone = id; }
  z.importer = { depot: depotId, dock: dockId, kinds: c.kinds, stopZ: c.depot.z };
  z.lines = c.machines.map((m) => ({ from: depotId, to: m }));
  z.machines = c.machines;
  z.hire = c.hire; z.upPad = c.upPad;
  z.conveyors = c.belts.map((b) => ({ id: b.id, name: b.name, from: { site: b.from }, to: { site: b.to }, zone: id, cost: b.cost, buyPad: b.buyPad, path: b.path }));
}

/**
 * Sonsuz tesisler: 10. bölgeden itibaren başlangıç ormanının GÜNEYİNE, yolun yanına sırayla yeni tesisler açılır.
 * Döngü: Süt Çiftliği → Tavuk Çiftliği → Kereste Fabrikası → (daha büyük ölçekte tekrar) …
 * Her tesis sıfırdan, elle başlar: kaynak (orman / inek / tavuk) → depo → makine → satış rampası.
 * Sonra o tesise özel işçi noktaları ve bant satın alma noktalarıyla otomatikleşir.
 */
export const FACILITY_TYPES = {
  dairy:   { name: 'Süt Çiftliği',      raw: 'milk', machine: 'bottler',  depotName: 'Süt Deposu',     source: 'cow', gather: 'farmer', icon: 'cow' },
  poultry: { name: 'Tavuk Çiftliği',    raw: 'egg',  machine: 'eggpacker', depotName: 'Yumurta Deposu', source: 'hen', gather: 'farmer', icon: 'hen' },
  lumber:  { name: 'Kereste Fabrikası', raw: 'log',  machine: 'saw',      depotName: 'Kütük Deposu',   source: 'tree', gather: 'lumberjack', icon: 'tree' },
  sheep:   { name: 'Koyun Çiftliği',    raw: 'wool', machine: 'spinner',  depotName: 'Yün Deposu',     source: 'sheep', gather: 'farmer', icon: 'sheep' },
  bee:     { name: 'Arı Çiftliği',      raw: 'comb', machine: 'honeypress', depotName: 'Petek Deposu', source: 'hive', gather: 'farmer', icon: 'hive' },
};
const FAC_ORDER = ['dairy', 'poultry', 'lumber', 'sheep', 'bee'];
const FACILITY_ANIMAL = { dairy: 'inek', poultry: 'tavuk', sheep: 'koyun', bee: 'kovan' };
/** Çiftlik ağılı tesis şeridinin üst kısmıdır (z0+3 … z0+FARM_PEN_Z1); genişletmelerin bantları altından geçer */
export const FARM_PEN_Z1 = 17;
const FARM_LANE_Z = 21;
const FAC_H = 34;

/** Bir bölgenin bağlı olduğu ana tesis (genişletmeler ana tesisin parçasıdır) */
export function parentOf(id) { const z = getZone(id); return z.parent ?? id; }
export const EXP_W = 40; // her genişletmenin genişliği (batıya doğru)

export function getZone(id) {
  if (id < ZONES.length) return ZONES[id];
  const k = id - ZONES.length;
  const ti = k % FAC_ORDER.length;
  const type = FAC_ORDER[ti];
  const T = FACILITY_TYPES[type];
  const round = Math.floor(k / FAC_ORDER.length);                 // 0 = ana tesis, 1+ = genişletme
  const cost = [2000, 8000, 30000][k] ?? Math.round(30000 * Math.pow(2.6, k - 2));
  const level = [5, 8, 11][k] ?? 11 + (k - 2) * 3;
  const scale = cost / 2000;
  // tam çalışan tesisin kendini ~10 dakikada amorti etmesi için rampa fiyat çarpanı (temel makine hızına göre)
  const baseRate = { dairy: 8, poultry: 5, lumber: 8, sheep: 7, bee: 7 }[type];
  const vm = Math.max(1, cost / (600 * baseRate));
  const valueMul = vm >= 10 ? Math.round(vm) : Math.round(vm * 10) / 10;
  const mixes = [{ pine: 0.5, birch: 0.5 }, { oak: 0.5, birch: 0.3, cedar: 0.2 }, { cedar: 0.5, oak: 0.3, rare: 0.2 }];
  // tesis şeridi: her tür kendi şeridinde (ana tesis), genişletmeler aynı şeritte batıya eklenir
  const z0 = 26 + ti * FAC_H, z1 = z0 + FAC_H, cz = (z0 + z1) / 2;
  const baseId = ZONES.length + ti;
  const mName = { saw: 'Testere', bottler: 'Şişeleme', eggpacker: 'Paketleme', spinner: 'Eğirme', honeypress: 'Bal Süzme' }[T.machine];
  const farmMax = { cow: 10 + round * 4, hen: 20 + round * 8, sheep: 10 + round * 4, hive: 8 + round * 3 }[T.source];
  // genişletme bölümündeki hayvanlar alan bedeline göre 5 kat daha ucuz (eskisi çok pahalıydı); ana tesis aynı
  const pk = round > 0 ? 0.2 : 1;
  const farmPrice = { cow: Math.max(150, Math.round(cost * 0.08 * pk)), hen: Math.max(60, Math.round(cost * 0.02 * pk)), sheep: Math.max(200, Math.round(cost * 0.05 * pk)), hive: Math.max(200, Math.round(cost * 0.045 * pk)) }[T.source];
  const baseName = type === 'lumber' ? 'Kereste Fabrikası 2' : `${T.name}`;

  if (round > 0) {
    // ---- GENİŞLETME: yeni yer açmaz, ana tesisin alanını batıya büyütür ----
    // depo ve rampa ana tesisinkidir (depo kapasitesi büyür); yeni makine KURULMAZ, ana makine hızlanır
    const x1 = -20 - EXP_W * (round - 1), x0 = x1 - EXP_W;
    const p = `f${id}`, bp = `f${baseId}`;
    const isFarm = type !== 'lumber';
    // çiftlikte üst şerit TEK büyük ağıldır (her genişletmede batıya uzar); makineler ve bantlar alt yarıda
    const mx = x0 + 28, mz = isFarm ? z0 + 27 : z0 + 17;
    const lane = (round - 1) % 3;
    const inZ = isFarm ? z0 + FARM_LANE_Z + lane * 1.2 : z0 + 0.7 + lane * 1.2, outZ = z1 - 0.8 - lane * 1.2;
    const inPath = isFarm ? [[-0.6, z0 + 7.4], [-3.6, z0 + 7.4], [-3.6, inZ], [mx - 6.6, inZ], [mx - 6.6, mz], [mx - 4.4, mz]]
      : [[-0.6, z0 + 7.4], [-0.6, inZ], [mx - 6.6, inZ], [mx - 6.6, mz], [mx - 4.4, mz]];
    const kz = cz + 8; // ana rampa
    return {
      id, endless: true, facility: type, round, parent: baseId, valueMul,
      name: `${baseName} · Genişletme ${round}`,
      cost, level,
      rect: { x0, x1, z0, z1 },
      pad: { x: x1 + 1.8, z: z0 + 1.6 },
      forests: type === 'lumber' ? [{ x0: x0 + 2, x1: x0 + 16, z0: z0 + 3, z1: z1 - 6, spacing: 3.4, mix: mixes[Math.min(round, 2)] }] : [],
      // yeni ağıl KURULMAZ: ana tesisin ağılı bu alanın üst şeridine uzar ve hayvan sınırı artar
      farm: isFarm ? { type: T.source, extend: baseId, rect: { x0: x0, x1: x1, z0: z0 + 3, z1: z0 + FARM_PEN_Z1 }, addMax: farmMax, price: farmPrice } : null,
      // YENİ FABRİKA/MAKİNE KURULMAZ (oyuncu isteği): alan büyür, ana tesisin makinesi her genişletmede hızlanır (+%50) ve girişi büyür
      sites: [], lines: [], machines: [], hire: [], noUpPad: true, conveyors: [],
      machineBoost: 0.5,
      decor: { rocks: 4, bushes: 6, flowers: 14, ponds: [] },
      saleBonus: 0.03,
      desc: type === 'lumber' ? `Yeni fabrika açılmaz: ${baseName} alanı büyür. Yeni orman gelir, depo kapasitesi ve rampanın fiyatı artar, ${mName} %50 hızlanır.`
        : `Yeni çiftlik açılmaz: mevcut ağıl bu alana doğru büyür, +${farmMax} ${FACILITY_ANIMAL[type]} alabilirsin. Depo büyür, ${mName} %50 hızlanır, rampanın fiyatı artar.`,
    };
  }

  // ---- ANA TESİS (her türün ilk tesisi) ----
  const dz = cz - 8, mz = cz + 2, kz = cz + 8;          // depo, makine, rampa (başlangıç arazisiyle aynı düzen)
  const p = `f${id}`;
  return {
    id, endless: true, facility: type, round, valueMul,
    name: type === 'lumber' ? baseName : `${T.name} 1`,
    cost, level,
    rect: { x0: -20, x1: 36, z0, z1 },
    pad: { x: 4, z: z0 - 1.8 },
    forests: type === 'lumber' ? [{ x0: -18, x1: -5, z0: z0 + 2, z1: z1 - 2, spacing: 3.4, mix: mixes[0] }] : [],
    // çiftlik az hayvanla açılır; kalanı ağılın önündeki noktadan satın alınarak çoğaltılır
    farm: type === 'lumber' ? null : { type: T.source, rect: { x0: -18, x1: -5, z0: z0 + 3, z1: z0 + FARM_PEN_Z1 }, start: T.source === 'hen' ? 3 : 2, max: farmMax, price: farmPrice },
    sites: [
      { id: `${p}_depot`, type: 'depot', accepts: T.raw, zone: id, x: 2, z: dz, cost: 0, name: T.depotName },
      { id: `${p}_m`, type: 'machine', machine: T.machine, zone: id, x: 12, z: mz, cost: 0, name: `${type === 'lumber' ? baseName : T.name + ' 1'} · ${mName}` },
      { id: `${p}_dock`, type: 'dock', lane: 'A', zone: id, x: 24, z: kz, cost: 0, name: `${type === 'lumber' ? baseName : T.name} Rampası`, valueMul },
    ],
    lines: [{ from: `${p}_depot`, to: `${p}_m` }], machines: [`${p}_m`],
    hire: [
      { role: T.gather, x: -1.4, z: dz + 7.2, base: Math.round(100 * Math.sqrt(scale)) },
      { role: 'carrier', x: 2.8, z: dz + 7.2, base: Math.round(150 * Math.sqrt(scale)) },
      { role: 'loader', x: 19.6, z: mz + 5, base: Math.round(220 * Math.sqrt(scale)) },
    ],
    conveyors: [
      { id: `c_${p}_in`, name: `${T.depotName} Bandı`, from: { site: `${p}_depot` }, to: { site: `${p}_m` }, zone: id, cost: Math.round(cost * 0.15),
        buyPad: { x: 9.8, z: dz + 3.4 }, path: [[4.6, dz - 1.6], [7.2, dz - 1.6], [7.2, dz + 8.4], [7.6, mz]] },
      { id: `c_${p}_out`, name: `${T.name} Yükleme Bandı`, from: { site: `${p}_m` }, to: { site: `${p}_dock` }, zone: id, cost: Math.round(cost * 0.3),
        buyPad: { x: 19.6, z: mz - 3.4 }, path: [[17.4, mz], [21, mz], [21, kz - 2], [26.2, kz - 2]] },
    ],
    decor: { rocks: 6, bushes: 10, flowers: 18, ponds: type === 'dairy' ? [{ x: 28 - 10, z: z1 - 6, r: 2.6 }] : [] },
    saleBonus: 0.03,
    desc: type === 'sheep' ? 'Koyunları kırp, yünü depoya taşı, eğir ve yumak olarak sat. Sonra alanı genişlet: alan büyür, makine hızlanır.'
      : type === 'bee' ? 'Kovanlardan bal peteği topla, depoya taşı, süz ve kavanozla sat. Sonra alanı genişlet: alan büyür, makine hızlanır.'
      : type === 'dairy' ? 'İnekleri sağ, sütü depoya taşı, şişele ve sat. Sonra alanı genişlet: alan büyür, makine hızlanır.'
      : type === 'poultry' ? 'Tavukların yumurtalarını topla, depoya taşı, kolile ve sat. Sonra alanı genişlet: alan büyür, makine hızlanır.'
      : 'Yeni bir kereste fabrikası: daha değerli ağaçlar. Sonra alanı genişlet: alan büyür, makine hızlanır.',
  };
}

/** Konveyör bantları (gerçek ürün taşır) */
export const CONVEYORS = [
  // İlk bant: başta oyuncu depodan testereye elle taşır; Seviye 3'te dünyadaki satın alma noktasından kurulur
  // Depo çıkış bandı: kapalı deponun kapısından testereye (oyunla birlikte gelir, ücretsiz; hızı yükseltilebilir)
  { id: 'c_depot_saw', name: 'Depo Çıkış Bandı', from: { site: 'depot1' }, to: { site: 'saw' }, zone: 0, cost: 0, auto: true,
    path: [[5.4, -2], [9.6, -2]] },
  { id: 'c_saw_sander', name: 'Stok → Zımpara Bandı', from: { site: 'saw' }, to: { site: 'sander' }, zone: 3, cost: 3500, buyPad: { x: 16.2, z: -7.4 },
    path: [[21.4, -3.2], [19.45, -3.2], [19.45, -16.5], [7.6, -16.5], [7.6, -26]] },
];

/** Görsel arka plan dağları (harita dışı) */
export const MOUNTAINS = [
  [-640, 40, 30], [-120, -20, 38], [-115, -90, 34], [-118, -160, 40], [-110, -240, 36],
  [120, 30, 30], [118, -40, 36], [125, -110, 42], [115, -190, 34], [122, -260, 40],
  [-60, -470, 46], [10, -480, 50], [80, -465, 44],
  [-640, 120, 34], [-650, 220, 38], [-110, 330, 36], [-120, 440, 40], [118, 120, 34], [124, 230, 40], [116, 340, 36], [122, 450, 38],
];
