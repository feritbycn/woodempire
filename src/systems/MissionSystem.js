import { WOODS, ITEMS } from '../config/balance.js';
import { getZone, FACILITY_TYPES, parentOf } from '../config/zones.js';

/**
 * Görevler:
 *  - Ana görev zinciri (eğitim + ilerleme hedefleri)
 *  - Zincir bitince seviyeye göre ölçeklenen sonsuz prosedürel görevler
 *  - Başarılar (sonsuz kademeli)
 * Görev ilerlemesi istatistik farkı (başlangıç anındaki değere göre) ya da durum kontrolü ile ölçülür.
 */

// type: 'stat' => stat anahtarı + hedef; 'check' => fonksiyon
const MAIN = [
  { title: 'İlk ağacı kes', hint: 'Bir ağacın yanında dur — karakterin otomatik keser.', stat: 'treesFelled', n: 1, reward: { money: 10, xp: 10 }, guide: 'tree' },
  { title: '10 odun topla', hint: 'Yere düşen kütüklerin üzerinden geç.', stat: 'logsCollected', n: 10, reward: { money: 20, xp: 15 }, guide: 'log' },
  { title: 'Depoya 10 kütük bırak', hint: 'Kesilen kütükler önce depoya gider. Deponun yeşil oklu alanına gir.', stat: 'logsDeposited', n: 10, reward: { money: 25, xp: 15 }, guide: 'site:depot1:drop' },
  { title: 'Depo testereyi besler', hint: 'Depoya bıraktığın kütükler çıkış bandıyla testereye kendiliğinden gider. Kesilen odun yanındaki stok alanında birikir.', check: (g) => (g.state.stats.produced_plank || 0) >= 4, reward: { money: 25, xp: 15 }, guide: 'site:depot1:drop' },
  { title: 'Testerede 10 kereste üret', hint: 'Depoya kütük getirmeye devam et; testere depodan kendisi alır.', stat: 'produced_plank', n: 10, reward: { money: 40, xp: 20 }, guide: 'site:depot1:drop' },
  { title: 'Kereste kamyona yükle', hint: 'Kesilmiş Odun Stoku\'nun turuncu alanından keresteyi al, kamyon alanına bırak.', stat: 'itemsLoaded', n: 10, reward: { money: 30, xp: 20 }, guide: 'site:dock1' },
  { title: 'İlk kamyonu gönder', hint: 'Kamyon dolunca ya da "Gönder" ile sevkiyat yapılır.', stat: 'trucksShipped', n: 1, reward: { money: 50, gold: 5, xp: 30 }, guide: 'site:dock1' },
  { title: 'Taşıma kapasitesini yükselt', hint: 'Geliştirme menüsü → Karakter.', stat: 'upgrades_player_capacity', n: 1, reward: { money: 40, xp: 20 }, guide: 'menu:upgrades' },
  { title: 'İlk işçini al', hint: 'Deponun önündeki turuncu Oduncu Al noktasında 1 sn dur: oduncu ağaç keser, kütükleri depoya taşır.', check: (g) => g.workers.countAll(null) >= 1, cost: (g) => g.workers.hireCost(null, null), reward: { money: 60, xp: 40 }, guide: 'hire:worker' },
  { title: 'Kesilmiş odun stokunu genişlet', hint: 'Stok alanının yanındaki mor GENİŞLET noktasında 1 sn dur. Stok dolarsa testere durur.', check: (g) => (g.sites.get('saw')?.up.stock || 0) >= 1, cost: (g) => g.production.stockCost(g.sites.get('saw')), reward: { money: 80, gold: 5, xp: 60 }, guide: 'stock' },
  { title: 'Bir işçinin görevini değiştir', hint: 'Her görevin kendi İşçi Al noktası işin yapıldığı yerdedir (kilitliyse üstünde seviyesi yazar). Ya da İşçiler menüsünden bir işçinin görevini değiştir.', check: (g) => g.workers.list.some((w) => (w.data.fac ?? null) === null && w.data.role !== 'lumberjack'), cost: (g) => (g.workers.countAll(null) < 2 ? g.workers.hireCost(null, null) : 0), reward: { money: 80, xp: 40 }, guide: 'hire:worker' },
  { title: 'Depo çıkış bandını yükselt', hint: 'Depo ile testere arasındaki bandın etiketine dokun, hızını artır.', stat: 'upgradesMachine', n: 1, reward: { money: 60, xp: 30 }, guide: 'conv:c_depot_saw' },
  { title: '1.000 para kazan', hint: 'Daha çok ürün sat.', stat: 'moneyEarned', n: 1000, reward: { money: 100, gold: 5, xp: 40 } },
  { title: 'Yeni arazi aç: Küçük Kereste Fabrikası', hint: 'Altın paralı alana git.', check: (g) => g.land.owns(1), reward: { money: 100, xp: 50 }, guide: 'zone:1' },
  { title: 'Zımpara makinesini kur', hint: 'Mavi inşaat alanına git.', check: (g) => g.sites.has('sander'), reward: { money: 120, xp: 50 }, guide: 'build:sander' },
  { title: 'İlk depoyu doldur', hint: 'Depo dolu kalırsa testere sen ormandayken de çalışır. Dolunca yanındaki mor noktadan genişlet.', stat: 'depotFilled', n: 1, reward: { money: 120, gold: 5, xp: 40 }, guide: 'site:depot1:drop' },
  { title: 'Testereyi yükselt', hint: 'Makinenin önündeki mor GELİŞTİR alanına gir; para yetince makinenin üstünde yeşil ok çıkar.', stat: 'upgradesMachine', n: 1, reward: { money: 80, xp: 30 }, guide: 'site:saw:up' },
  { title: 'İşçi Ofisini kur', hint: 'Küçük Kereste Fabrikası bölgesinde.', check: (g) => g.sites.has('office'), reward: { money: 150, xp: 60 }, guide: 'build:office' },
  { title: 'Bir Taşıyıcı ata', hint: 'Yükleme Alanı yanındaki Taşıyıcı Al noktasından al (ya da İşçiler menüsünden bir işçinin görevini Taşıyıcı yap): hazır ürünleri kamyona taşır.', check: (g) => g.workers.countRole('loader') >= 1, cost: (g) => (g.workers.countAll(null) < 3 ? g.workers.hireCost(null, null) : 0), reward: { money: 150, gold: 10, xp: 60 }, guide: 'hire:loader' },
  { title: 'İlk 100 ürünü üret', hint: 'Makineleri sürekli besle.', stat: 'producedAny', n: 100, reward: { money: 250, xp: 80 } },
  { title: 'Yeni tesis: Süt Çiftliğini aç', hint: 'Başlangıç ormanının güneyindeki altın paralı alana git.', check: (g) => g.land.owns(10), reward: { money: 300, gold: 10, xp: 120 }, guide: 'zone:10' },
  { title: 'İnekleri 4 kez sağ', hint: 'Hazır bir ineğin yanında dur, kendiliğinden sağarsın.', stat: 'cowsMilked', n: 4, reward: { money: 120, xp: 50 }, guide: 'cow' },
  { title: 'Sütü depoya bırak', hint: 'Süt kovalarını topla, Süt Deposuna götür.', stat: 'deposited_milk', n: 6, reward: { money: 120, xp: 50 }, guide: 'site:f10_depot:drop' },
  { title: '10 süt kasası üret', hint: 'Depodan sütü al, Şişeleme Makinesine götür.', stat: 'produced_bottle', n: 10, reward: { money: 250, gold: 5, xp: 80 }, guide: 'site:f10_m:in' },
  { title: 'Süt Çiftliğine 2 inek daha al', hint: 'Ağılın önündeki yeşil İNEK noktasına her girişinde bir inek alırsın.', stat: 'cowsBought', n: 2, reward: { money: 200, xp: 60 }, guide: 'cowbuy' },
  { title: 'Süt Çiftliğine bakıcı al', hint: 'Çiftlikteki İŞÇİ AL noktası: inek bakıcısı yem verir, inekleri sağar, sütü depoya taşır.', check: (g) => g.workers.countRole('farmer', 10) >= 1, cost: (g) => g.workers.hireCost('farmer', 10), reward: { money: 250, xp: 80 }, guide: 'hire:farmer' },
  { title: 'Yeni orman alanını aç', hint: 'Geniş Orman Alanı batıda.', check: (g) => g.land.owns(2), reward: { money: 300, gold: 10, xp: 100 }, guide: 'zone:2' },
  { title: '5 meşe ağacı kes', hint: 'Meşe daha dayanıklı, daha değerli.', stat: 'treesFelled_oak', n: 5, reward: { money: 300, xp: 80 }, guide: 'tree:oak' },
  { title: 'Yeni tesis: Tavuk Çiftliğini aç', hint: 'Süt Çiftliğinin güneyinde.', check: (g) => g.land.owns(11), reward: { money: 800, gold: 15, xp: 200 }, guide: 'zone:11' },
  { title: '12 yumurta sepeti topla', hint: 'Tavuklar kümeste yumurta bırakır; üzerlerinden geç.', stat: 'collected_egg', n: 12, reward: { money: 400, xp: 100 }, guide: 'egg' },
  { title: 'Orta kamyonu satın al', hint: 'Araçlar menüsü → Kamyonlar.', check: (g) => g.state.trucks.owned.includes(1), reward: { money: 300, xp: 80 }, guide: 'menu:vehicles' },
  { title: 'Endüstriyel bölgeyi aç', hint: 'Kuzeyde.', check: (g) => g.land.owns(3), reward: { money: 600, gold: 15, xp: 150 }, guide: 'zone:3' },
  { title: 'Paketleme makinesini kur', hint: 'Endüstriyel bölgede.', check: (g) => g.sites.has('packer'), reward: { money: 600, xp: 120 }, guide: 'build:packer' },
  { title: 'Yeni bir konveyör bandı kur', hint: 'Makineler arasındaki mavi bant alanlarına gir.', stat: 'conveyorsBought', n: 1, reward: { money: 800, gold: 10, xp: 150 }, guide: 'menu:factory' },
  { title: '50 paketli ürün üret', hint: 'Zımparalı tahtaları paketle.', stat: 'produced_package', n: 50, reward: { money: 1000, xp: 150 }, guide: 'site:packer:in' },
  { title: 'Büyük Depolama Merkezini aç', hint: 'Yolun doğusunda.', check: (g) => g.land.owns(4), reward: { money: 1500, gold: 20, xp: 200 }, guide: 'zone:4' },
  { title: 'Forklift garajını kur', hint: 'Büyük Depolama Merkezinde.', check: (g) => g.sites.has('garage'), reward: { money: 1500, xp: 150 }, guide: 'build:garage' },
  { title: 'İlk forkliftini satın al', hint: 'Araçlar menüsü.', stat: 'forkliftsBought', n: 1, reward: { money: 2000, gold: 15, xp: 200 }, guide: 'menu:vehicles' },
  { title: 'Lojistik Merkezini aç', hint: 'Yeni satış rampası ve büyük kamyonlar.', check: (g) => g.land.owns(5), reward: { money: 4000, gold: 20, xp: 300 }, guide: 'zone:5' },
  { title: 'Değerli Ağaç Ormanını aç', hint: 'Sedir ve Altın Ceviz ağaçları.', check: (g) => g.land.owns(6), reward: { money: 8000, gold: 25, xp: 400 }, guide: 'zone:6' },
  { title: '3 Altın Ceviz kes', hint: 'Parlayan altın ağaçlar.', stat: 'treesFelled_rare', n: 3, reward: { money: 8000, gold: 20, xp: 300 }, guide: 'tree:rare' },
];

/** Prosedürel görev şablonları (seviye ile ölçeklenir) */
const TEMPLATES = [
  (L) => ({ title: `${10 + L * 3} ağaç kes`, stat: 'treesFelled', n: 10 + L * 3 }),
  (L) => ({ title: `${30 + L * 8} odun topla`, stat: 'logsCollected', n: 30 + L * 8 }),
  (L) => ({ title: `${40 + L * 15} ürün üret`, stat: 'producedAny', n: 40 + L * 15 }),
  (L) => ({ title: `${2 + Math.floor(L / 3)} kamyon gönder`, stat: 'trucksShipped', n: 2 + Math.floor(L / 3) }),
  (L) => ({ title: `${fmt(Math.round(500 * Math.pow(L, 1.7)))} para kazan`, stat: 'moneyEarned', n: Math.round(500 * Math.pow(L, 1.7)) }),
  (L) => ({ title: `${1 + Math.floor(L / 6)} yükseltme satın al`, stat: 'upgradesMachine', n: 1 + Math.floor(L / 6) }),
  (L) => ({ title: `${20 + L * 5} paketli ürün sat`, stat: 'sold_package', n: 20 + L * 5, req: (g) => g.sites.has('packer') }),
  (L) => ({ title: `${10 + L * 2} sedir kes`, stat: 'treesFelled_cedar', n: 10 + L * 2, req: (g) => g.land.owns(6) }),
  (L) => ({ title: `${5 + L} palet üret`, stat: 'produced_pallet', n: 5 + L, req: (g) => g.sites.has('palletizer') }),
  (L) => ({ title: `${3 + Math.floor(L / 2)} mobilya üret`, stat: 'produced_furniture', n: 3 + Math.floor(L / 2), req: (g) => g.sites.has('furniture') }),
];

export const ACHIEVEMENTS = [
  { id: 'trees', name: 'Oduncu', stat: 'treesFelled', base: 100, mult: 10, gold: 15, desc: (n) => `${fmt(n)} ağaç kes` },
  { id: 'logs', name: 'Toplayıcı', stat: 'logsCollected', base: 1000, mult: 10, gold: 15, desc: (n) => `${fmt(n)} odun topla` },
  { id: 'trucks', name: 'Lojistikçi', stat: 'trucksShipped', base: 10, mult: 10, gold: 20, desc: (n) => `${fmt(n)} kamyon gönder` },
  { id: 'lands', name: 'Toprak Ağası', stat: 'landsOwned', base: 3, mult: 2, gold: 25, desc: (n) => `${n} yeni arazi aç` },
  { id: 'factory', name: 'Büyük Fabrika', stat: 'machinesBuilt', base: 3, mult: 2, gold: 30, desc: (n) => `${n} makine kur` },
  { id: 'money', name: 'Kereste Baronu', stat: 'moneyEarned', base: 10000, mult: 10, gold: 30, desc: (n) => `${fmt(n)} para kazan` },
  { id: 'produce', name: 'Üretim Ustası', stat: 'producedAny', base: 500, mult: 10, gold: 20, desc: (n) => `${fmt(n)} ürün üret` },
  { id: 'workers', name: 'İşveren', stat: 'workersHired', base: 3, mult: 2, gold: 20, desc: (n) => `${n} işçi çalıştır` },
];

// Büyük sayı birimleri: K, M, B, T, Q, sonra AA, AB … AZ, BA … ZZ (her biri ×1000). Yönetim paneliyle aynı.
export const UNITS = ['', 'K', 'M', 'B', 'T', 'Q'];
for (let a = 0; a < 26; a++) for (let b = 0; b < 26; b++) UNITS.push(String.fromCharCode(65 + a) + String.fromCharCode(65 + b));

export function fmt(n) {
  n = Number(n) || 0;
  if (Math.abs(n) < 1e4) return Math.round(n).toLocaleString('tr-TR');
  let i = 0;
  while (Math.abs(n) >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
  return n.toFixed(Math.abs(n) >= 100 ? 0 : 1).replace('.0', '') + UNITS[i];
}

export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.s = game.state.missions;
    this.current = null;
  }

  init() {
    const g = this.game;
    this.loadCurrent();
    g.bus.on('stat', () => this.check());
    g.bus.on('built', () => this.check());
    g.bus.on('zoneBought', () => this.check());
    g.bus.on('upgrade', () => this.check());
    g.bus.on('deposit', (e) => { if (e.pad?.station?.type === 'dock') g.stat('itemsLoaded'); });
    g.every(1, () => { this.check(); this.checkAchievements(); this.facilityIntro(); });
  }

  stat(k) { return this.game.state.stats[k] || 0; }

  facilityIntro() {
    const g = this.game;
    const fid = this.facilityAt(g.player.pos.x, g.player.pos.z);
    if (fid === this._lastFac) return;
    this._lastFac = fid;
    if (fid === null) return;
    const def = getZone(fid); const T = FACILITY_TYPES[def.facility];
    if (def.importZone) {
      const what = def.importer.kinds.map((k) => ITEMS[k].name).join(' ve ');
      g.bus.emit('banner', { title: def.name.toUpperCase(), text: `Bu bölge kendi malzemesini ithal eder: ithalat kamyonu ${what} getirir (ucuz bir bedel ödenir) → İthalat Deposundan al, makineye götür → ürünü bu bölgenin rampasına yükle. Sonra bant ve işçilerle otomatikleştir.` });
      return;
    }
    const steps = def.facility === 'sheep' ? 'Yünü kabarık koyunların yanından geç → kırpılan yünü topla → Yün Deposuna bırak → depodan al, Eğirme Makinesine götür → yumakları kamyona yükle'
      : def.facility === 'bee' ? 'Arıları hareketli kovanların yanından geç → bal peteklerini topla → Petek Deposuna bırak → depodan al, Bal Süzme Makinesine götür → kavanozları kamyona yükle'
      : def.facility === 'dairy' ? 'İneğin yanından geç → sağılan sütü topla → Süt Deposuna bırak → depodan al, Şişeleme Makinesine götür → kasaları kamyona yükle'
      : def.facility === 'poultry' ? 'Tavukların bıraktığı yumurta sepetlerini topla → Yumurta Deposuna bırak → depodan al, Paketleme Makinesine götür → kolileri kamyona yükle'
      : 'Ağaç kes → kütükleri depoya bırak → depodan al, testereye götür → keresteyi kamyona yükle';
    g.bus.emit('banner', { title: def.name.toUpperCase(), text: steps + '. Kırmızı ok sıradaki adımı gösterir.' });
    void T;
  }

  /** Mevcut görevi durumdan yeniden oluştur */
  loadCurrent() {
    const s = this.s;
    let def;
    if (s.main < MAIN.length) def = MAIN[s.main];
    else def = this.generated(s.generated);
    this.current = { ...def };
    if (!s.current || s.current.key !== this.key()) {
      s.current = { key: this.key(), base: def.stat ? this.stat(def.stat) : 0 };
    }
    this.current.base = s.current.base;
    // gerçekçi olmayan tabanları düzelt
    if (def.stat && this.current.base > this.stat(def.stat)) this.current.base = s.current.base = this.stat(def.stat);
    this.game.bus.emit('mission', this.view());
  }
  key() { return this.s.main < MAIN.length ? 'm' + this.s.main : 'g' + this.s.generated; }

  generated(i) {
    const g = this.game;
    const L = g.state.level;
    // seviyeye ve açılmış içeriğe uygun şablon seç (deterministik ama çeşitli)
    // Henüz alınmamış bir arazi varsa her 4 görevden biri arazi görevi olur
    const nextZone = this.nextBuyableZone();
    if (nextZone !== null && i % 4 === 3) {
      const z = getZone(nextZone);
      return { title: `Yeni arazi aç: ${z.name}`, check: (gg) => gg.land.owns(nextZone), reward: this.rewardFor(L, 3), guide: 'zone:' + nextZone, zone: nextZone };
    }
    const pool = TEMPLATES.map((t) => t(L)).filter((m) => !m.req || m.req(g));
    const m = pool[(i * 7 + L) % pool.length];
    return { ...m, reward: this.rewardFor(L, 1) };
  }
  rewardFor(L, mul) {
    return { money: Math.round(80 * Math.pow(L, 1.6) * mul), gold: 3 + Math.floor(L / 4) * mul, xp: Math.round(20 * L * mul) };
  }
  nextBuyableZone() {
    for (let id = 1; id <= this.game.land.maxKnown(); id++) {
      if (this.game.land.owns(id)) continue;
      const z = getZone(id);
      if (z.pad && this.game.land.isWalkable(z.pad.x, z.pad.z)) return id;
    }
    return null;
  }

  progress() {
    const c = this.current;
    if (!c) return { value: 0, target: 1 };
    if (c.check) {
      if (c.check(this.game)) return { value: 1, target: 1, done: true };
      // satın alma görevi: para yetene kadar kartta para ilerlemesi gösterilir
      if (c.cost) { const cost = c.cost(this.game); return { value: Math.min(this.game.state.money, cost), target: cost, money: true }; }
      return { value: 0, target: 1 };
    }
    return { value: Math.min(c.n, this.stat(c.stat) - c.base), target: c.n };
  }
  view() {
    const p = this.progress();
    return { title: this.current?.title, hint: p.money && p.value < p.target ? `Para biriktir: ${Math.floor(p.value)}/${p.target} — ürün sat` : this.current?.hint, money: !!p.money, value: p.value, target: p.target, reward: this.current?.reward, guide: this.current?.guide, main: this.s.main < MAIN.length, index: this.s.completed };
  }

  check() {
    if (!this.current || this.completing) return;
    const p = this.progress();
    this.game.bus.emit('missionProgress', this.view());
    if (this.current.check ? p.done : p.value >= p.target) this.complete();
  }

  complete() {
    const g = this.game;
    this.completing = true;
    const c = this.current;
    const r = c.reward || {};
    if (r.money) g.economy.addMoney(r.money, 'mission');
    if (r.gold) g.economy.addGold(r.gold, 'mission');
    g.audio.play('mission');
    g.haptic('medium');
    g.bus.emit('missionComplete', { title: c.title, reward: r });
    this.s.completed++;
    if (this.s.main < MAIN.length) this.s.main++; else this.s.generated++;
    this.s.current = null;
    g.stat('missionsCompleted');
    this.completing = false;
    if (r.xp) g.levels.addXP(r.xp);
    this.loadCurrent();
    g.save.requestSave();
  }

  /** Başarılar: her kademe tamamlandıkça hedef büyür (sonsuz) */
  achievementView() {
    const a = this.game.state.achievements;
    return ACHIEVEMENTS.map((def) => {
      const tier = a[def.id] || 0;
      const target = Math.round(def.base * Math.pow(def.mult, tier));
      const v = this.stat(def.stat);
      return { def, tier, target, value: v, done: v >= target, gold: def.gold * (tier + 1) };
    });
  }
  claimAchievement(id) {
    const v = this.achievementView().find((x) => x.def.id === id);
    if (!v || !v.done) return false;
    this.game.state.achievements[id] = v.tier + 1;
    this.game.economy.addGold(v.gold, 'achievement');
    this.game.audio.play('mission');
    this.game.bus.emit('toast', { text: `Başarı: ${v.def.name} ${v.tier + 1}. kademe (+${v.gold} altın)`, type: 'success' });
    return true;
  }
  /** Tamamlanmış tüm başarıların ödülünü tek seferde al (birden çok kademe birikmişse hepsi) */
  claimAllAchievements() {
    let gold = 0, n = 0;
    for (let guard = 0; guard < 200; guard++) {
      const v = this.achievementView().find((x) => x.done);
      if (!v) break;
      this.game.state.achievements[v.def.id] = v.tier + 1;
      gold += v.gold; n++;
    }
    if (!n) return false;
    this.game.economy.addGold(gold, 'achievement');
    this.game.audio.play('mission');
    this.game.bus.emit('toast', { text: `${n} başarı ödülü alındı: +${gold} altın`, type: 'success' });
    this.checkAchievements();
    this.game.save.requestSave();
    return true;
  }
  checkAchievements() {
    const claimable = this.achievementView().filter((v) => v.done).length;
    if (claimable !== this._claimable) { this._claimable = claimable; this.game.bus.emit('badges'); }
  }
  claimableCount() { return this._claimable || 0; }

  /** Rehber hedef konumu (ok göstergesi için) */
  /** Oyuncu hangi tesisin içinde? (10+ bölgeler) */
  facilityAt(x, z) {
    for (const id of this.game.land.owned) {
      if (id < 10 && !getZone(id).importZone) continue;
      const R = getZone(id).rect;
      if (x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1) return parentOf(id); // genişletme = ana tesisin parçası
    }
    return null;
  }
  /** Tesis içi rehber: kaynak → (yerdeki ürün) → depo → makine → kamyon */
  facilityGuide(fid) {
    const g = this.game; const p = g.player.pos; const def = getZone(fid);
    if (def.importZone) return this.importGuide(def);
    const dep = g.sites.get(`f${fid}_depot`), m = g.sites.get(`f${fid}_m`), dock = g.sites.get(`f${fid}_dock`);
    if (!dep || !m || !dock) return null;
    const raw = dep.kind, out = m.def.output;
    const items = g.player.stack.items;
    const at = (pad, y = 2) => ({ x: pad.x, z: pad.z, y });
    if (items.some((i) => i.kind === out)) return at(dock.pad);
    if (items.some((i) => i.kind === raw && i.dep) && !m.inBuf.isFull()) return at(m.inPad);
    if (items.some((i) => i.kind === raw && !i.dep) && !dep.buffer.isFull()) return at(dep.dropPad);
    if (m.outBuf.count >= 2 && !g.player.stack.isFull()) return at(m.outPad);
    if (dep.buffer.count > 0 && !m.inBuf.isFull() && !g.conveyors.belts.has(`c_f${fid}_in`) && !g.player.stack.isFull()) return at(dep.takePad);
    if (g.player.stack.isFull()) return at(dep.dropPad);
    const R = def.rect;
    const l = g.wood.nearest(p.x, p.z, 60, null, raw);
    if (l && l.x > R.x0 && l.x < R.x1 && l.z > R.z0 && l.z < R.z1) return { x: l.x, z: l.z, y: 1.5 };
    if (def.farm && def.farm.type !== 'hen') { const a = g.animals.nearestReadyCow(p.x, p.z, fid); if (a) return { x: a.x, z: a.z, y: 2.6 }; }
    // hayvan yetersizse ve para yetiyorsa: hayvan satın alma noktası
    if (def.farm && g.animals.canBuy(fid) && g.animals.zoneCount(fid) < 6 && g.state.money >= g.animals.price(fid)) return { x: (def.farm.rect.x0 + def.farm.rect.x1) / 2, z: def.farm.rect.z1 + 2.2, y: 2 };
    if (raw === 'log') { let best = null, bd = Infinity; for (const t of g.trees.trees) { if (t.zoneId !== fid || !g.trees.isChoppable(t)) continue; const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < bd) { bd = d; best = t; } } if (best && bd > 2.5) return { x: best.x, z: best.z, y: 4.5 }; }
    return null; // tavuklar yumurtlarken / inekler dinlenirken bekle
  }

  /** İthalatlı bölge rehberi: ithal mal → makine → rampa (kurulmamış makine varsa inşaat alanı) */
  importGuide(def) {
    const g = this.game; const items = g.player.stack.items;
    const dep = g.sites.get(def.importer.depot), dock = g.sites.get(def.importer.dock);
    const at = (pad, y = 2) => ({ x: pad.x, z: pad.z, y });
    const ms = def.machines.map((id) => g.sites.get(id)).filter(Boolean);
    if (!ms.length) { const p = g.construction.pending.get(def.machines[0]); return p ? at(p.pad) : null; }
    if (!dep || !dock) return null;
    if (items.some((i) => ms.some((m) => m.def.output === i.kind))) return at(dock.pad);
    for (const m of ms) if (!m.inBuf.isFull() && items.some((i) => i.kind === m.def.input && i.dep === dep.tag)) return at(m.inPad);
    for (const m of ms) if (m.outBuf.count >= 2 && !g.player.stack.isFull()) return at(m.outPad);
    if (!g.player.stack.isFull() && ms.some((m) => !m.inBuf.isFull() && dep.buffer.countKind(m.def.input) > 0 && !g.conveyors.belts.has(`c_z${def.id}_in`) && !g.conveyors.belts.has(`c_z${def.id}_inf`))) return at(dep.takePad);
    for (const id of def.machines) { const p = g.construction.pending.get(id); if (p && g.state.money >= p.site.cost) return at(p.pad); }
    return null; // ithalat kamyonu bekleniyor
  }

  guideTarget(override) {
    const g = this.game; const gd = override ?? this.current?.guide;
    // tesis içindeyken ok o tesisin adımlarını gösterir
    if (!override) { const fid = this.facilityAt(g.player.pos.x, g.player.pos.z); if (fid !== null) return this.facilityGuide(fid); }
    if (!gd) return null;
    if (!override && this.current?.cost && !this.current.check?.(g) && g.state.money < this.current.cost(g)) {
      // satın alma görevi ama para yetmiyor: ürün üretip satmaya yönlendir
      return this.guideTarget(g.player.stack.items.some((i) => i.kind !== 'log') ? 'site:dock1' : 'site:saw:in');
    }
    const p = g.player.pos;
    if (gd === 'tree' || gd.startsWith('tree:')) {
      const type = gd.split(':')[1];
      let best = null, bd = Infinity;
      for (const t of g.trees.trees) {
        if (!g.trees.isChoppable(t) || (type && t.type !== type)) continue;
        const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < bd) { bd = d; best = t; }
      }
      if (best && bd < 2.5) return null;
      return best ? { x: best.x, z: best.z, y: 4.5 } : null;
    }
    if (gd === 'cowbuy') { const z = getZone(10).farm.rect; return { x: (z.x0 + z.x1) / 2, z: z.z1 + 2.2, y: 2 }; }
    if (gd === 'cow') { const a = g.animals.nearestReadyCow(p.x, p.z) || g.animals.list.find((x) => x.type === 'cow'); return a ? { x: a.x, z: a.z, y: 2.6 } : null; }
    if (gd === 'egg') { const e = g.wood.nearest(p.x, p.z, 400, null, 'egg'); return e ? { x: e.x, z: e.z, y: 1.5 } : (g.animals.list.find((x) => x.type === 'hen') ? { x: g.animals.list.find((x) => x.type === 'hen').x, z: g.animals.list.find((x) => x.type === 'hen').z, y: 1.8 } : null); }
    if (gd === 'log') {
      if (g.player.stack.isFull()) return this.siteTarget('depot1', 'drop');
      const l = g.wood.nearest(p.x, p.z, 80);
      return l ? { x: l.x, z: l.z, y: 1.5 } : { ...this.firstTree() };
    }
    if (gd === 'stock') { const s = g.sites.get('saw'); return s?.stockPad ? { x: s.stockPad.x, z: s.stockPad.z, y: 2 } : null; }
    if (gd.startsWith('site:')) { const [, id, part] = gd.split(':'); return this.siteTarget(id, part); }
    if (gd.startsWith('hire:')) { const pad = g.workers.hirePads?.find((q) => q.data.role === gd.slice(5)) || g.workers.hirePads?.[0]; return pad ? { x: pad.x, z: pad.z, y: 2 } : null; }
    if (gd.startsWith('conv:')) { const id = gd.split(':')[1]; const pad = g.conveyors.pads.get(id); if (pad) return { x: pad.x, z: pad.z, y: 2 }; const b = g.conveyors.belts.get(id); if (b) { const m = g.conveyors.midPoint(b); return { x: m.x, z: m.z, y: 2.4 }; } return null; }
    if (gd.startsWith('zone:')) { const z = getZone(+gd.split(':')[1]); return z.pad ? { x: z.pad.x, z: z.pad.z, y: 2 } : null; }
    if (gd.startsWith('build:')) { const s = g.construction.pending.get(gd.split(':')[1]); return s ? { x: s.pad.x, z: s.pad.z, y: 2 } : null; }
    return null;
  }
  firstTree() { const t = this.game.trees.trees.find((t) => this.game.trees.isChoppable(t)); return t ? { x: t.x, z: t.z, y: 4.5 } : null; }
  siteTarget(id, part) {
    const g = this.game;
    const st = g.sites.get(id);
    if (!st) return null;
    // görev akışına göre akıllı yönlendirme
    if (part === 'up' && st.upPad) return { x: st.upPad.x, z: st.upPad.z, y: 2 };
    const items = g.player.stack.items;
    // tesis depoları / makineleri (süt, yumurta): ham ürün önce depoya, depodan makineye
    if (id.startsWith('f') && (st.type === 'depot' || st.type === 'machine')) {
      const fac = id.slice(1, id.indexOf('_'));
      const dep = g.sites.get(`f${fac}_depot`), mach = g.sites.get(`f${fac}_m`); const kind = dep?.kind;
      const fresh = items.some((i) => i.kind === kind && !i.dep), stored = items.some((i) => i.kind === kind && i.dep);
      if (part === 'up' && mach) return { x: mach.upPad.x, z: mach.upPad.z, y: 2 };
      if (st.type === 'machine' && stored) return { x: mach.inPad.x, z: mach.inPad.z, y: 2 };
      if (fresh && dep) return { x: dep.dropPad.x, z: dep.dropPad.z, y: 2 };
      if (st.type === 'machine' && dep && dep.buffer.count > 0) return { x: dep.takePad.x, z: dep.takePad.z, y: 2 };
      const l = g.wood.nearest(g.player.pos.x, g.player.pos.z, 80, null, kind);
      if (l) return { x: l.x, z: l.z, y: 1.5 };
      if (kind === 'milk') return this.guideTarget('cow');
      if (kind === 'egg') return this.guideTarget('egg');
      return this.firstTree();
    }
    const hasDepLog = items.some((i) => i.kind === 'log' && i.dep), hasFreshLog = items.some((i) => i.kind === 'log' && !i.dep);
    const dep1 = g.sites.get('depot1');
    if (id === 'saw' && part === 'in') {
      if (hasDepLog) return { x: st.inPad.x, z: st.inPad.z, y: 2 };
      if (hasFreshLog && dep1) return { x: dep1.dropPad.x, z: dep1.dropPad.z, y: 2 };   // taze kütük önce depoya
      if (st.outBuf.count > 3) return { x: st.outPad.x, z: st.outPad.z, y: 2 };
      if (dep1?.takePad && dep1.buffer.count > 0) return { x: dep1.takePad.x, z: dep1.takePad.z, y: 2 };
      if (dep1?.feeds) return this.guideTarget('log'); // depo testereyi kendisi besler: kütük getir
      return this.firstTree();
    }
    if (id === 'dock1') {
      const sellables = g.player.stack.items.some((i) => i.kind !== 'log');
      if (!sellables && g.player.stack.count === 0) {
        const saw = g.sites.get('saw');
        if (saw && saw.outBuf.count > 0) return { x: saw.outPad.x, z: saw.outPad.z, y: 2 };
        if (saw && saw.inBuf.count === 0 && !g.player.stack.has('log')) {
          const dep = g.sites.get('depot1');
          if (dep?.takePad && dep.buffer.count > 0) return { x: dep.takePad.x, z: dep.takePad.z, y: 2 };
          if (dep?.feeds && dep.buffer.count < 4) return this.guideTarget('log');
        }
      }
      if (hasDepLog && !sellables) { const saw = g.sites.get('saw'); return { x: saw.inPad.x, z: saw.inPad.z, y: 2 }; }
      if (hasFreshLog && !sellables && dep1) return { x: dep1.dropPad.x, z: dep1.dropPad.z, y: 2 };
      return { x: st.pad.x, z: st.pad.z, y: 2 };
    }
    const pad = part === 'drop' ? st.dropPad : part === 'in' ? st.inPad : part === 'out' ? (st.outPad || st.takePad) : st.pad || st.dropPad || st.inPad;
    if (part === 'drop' && !g.player.stack.has('log')) {
      const l = g.wood.nearest(g.player.pos.x, g.player.pos.z, 60);
      if (l) return { x: l.x, z: l.z, y: 1.5 };
      return this.firstTree();
    }
    if (part === 'in' && st.def && !g.player.stack.has(st.def.input)) {
      // girdi taşımıyorsa kaynağa yönlendir
      for (const m of g.production.machines) if (m.def.output === st.def.input && m.outBuf.count) return { x: m.outPad.x, z: m.outPad.z, y: 2 };
    }
    return pad ? { x: pad.x, z: pad.z, y: 2 } : { x: st.x, z: st.z, y: 3 };
  }
}
