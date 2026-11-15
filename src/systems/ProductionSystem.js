import { sameOrigin } from '../core/Buffer.js';
import { Buffer } from '../core/Buffer.js';
import { MACHINES, XP, RAW_KINDS, ITEMS } from '../config/balance.js';
import { makeMachine, makeDepot } from '../world/Models.js';
import { pileLayout } from '../world/ItemRenderer.js';
import { makePad } from './Stations.js';
import { parentOf, getZone } from '../config/zones.js';

const STOCK_BAY = 84; // bir stok bölmesine sığan kesilmiş odun (7×6, 2 kat)

/**
 * Üretim makineleri. Zincir: Kütük → Kereste (testere) → Zımparalı tahta → Paketli ürün,
 * ayrıca Palet / Panel / Mobilya / Otomatik hat. Girdi olmadan üretim yapılmaz.
 */
export class ProductionSystem {
  constructor(game) {
    this.game = game;
    this.machines = [];
  }

  inCap(st) { return Math.round((st.def.inCap + st.up.capacity * Math.ceil(st.def.inCap * 0.35)) * (1 + 0.35 * this.expansions(st))); }
  /** Bu tesisin sahip olunan genişletme sayısı (genişletme yeni makine kurmaz, ana makineyi hızlandırır) */
  expansions(st) {
    if (st.zone == null || st.zone < 10) return 0;
    const owned = this.game.land.owned;
    if (this._expKey !== owned.size) { // yalnızca arazi alınınca yeniden sayılır (her karede değil)
      this._expKey = owned.size; this._exp = new Map();
      for (const id of owned) { const z = getZone(id); if (z?.parent != null) this._exp.set(z.parent, (this._exp.get(z.parent) || 0) + 1); }
      queueMicrotask(() => this.refreshExpansionBoost());
    }
    return this._exp.get(st.zone) || 0;
  }
  refreshExpansionBoost() { for (const st of this.machines) { const c = this.inCap(st); if (st.inBuf.capacity !== c) st.inBuf.capacity = c; st._balAt = null; } }
  outCap(st) { return st.stock ? this.stockCap(st) : st.def.outCap + st.up.capacity * Math.ceil(st.def.outCap * 0.35); }
  /** Stok alanı kapasitesi (alan genişletildikçe büyür) */
  stockCap(st) { return st.stock.base + (st.up.stock || 0) * st.stock.step; }
  /** Stok alanı kapasitesine göre bölme (çitli raf alanı) sayısı: alan fiziksel olarak büyür */
  ensureStockBays(st) {
    const g = this.game; const S = st.stock;
    const need = Math.min(4, Math.max(1, Math.ceil(this.stockCap(st) / STOCK_BAY)));
    while (st.stockBays.length < need) {
      const k = st.stockBays.length; const z = S.z - 4.8 * k;
      const yard = makeDepot(); yard.position.set(S.x, 0, z); g.scene.add(yard); st.stockBays.push(yard);
      g.obstacles.push({ x0: S.x - 2.8, x1: S.x + 2.8, z0: z - 2.2, z1: z + 2.2 });
      if (k > 0) g.fx.confetti(S.x, 1.5, z, 25);
    }
  }
  stockCost(st) { return Math.round(st.stock.cost * Math.pow(1.6, st.up.stock || 0)); }
  expandStock(st) {
    const g = this.game;
    if (!st.stock || (st.up.stock || 0) >= st.stock.max) return false;
    if (!g.economy.spend(this.stockCost(st), 'upgrade')) return false;
    st.up.stock = (st.up.stock || 0) + 1;
    st.outBuf.capacity = this.stockCap(st);
    this.ensureStockBays(st);
    g.stat('upgradesStorage'); g.levels.addXP(XP.upgrade); g.audio.play('upgrade');
    g.fx.confetti(st.stock.x, 1.5, st.stock.z, 30);
    g.bus.emit('toast', { text: `${st.stock.name} genişledi: ${st.outBuf.capacity} yer`, type: 'success' });
    g.save.requestSave();
    return true;
  }
  /** Bir ürünün gitmesi gereken yerin adı (oyuncuya yol göstermek için) */
  whereTo(item) {
    const g = this.game; if (!item) return null;
    if (RAW_KINDS.includes(item.kind)) { const d = g.storage.depots.find((s) => !s.import && (s.zone ?? 0) === (item.o ?? 0) && s.buffer.acceptsKind(item.kind)); return d?.name || 'deposuna'; }
    const zone = item.o == null || item.o === 0 ? null : item.o;
    const next = this.nextMachineFor(item.kind, zone);
    if (next) return next.name;
    const dock = g.trucks.docks.find((d) => (d.zone ?? 0) === (item.o ?? 0));
    return dock?.name || 'kamyon rampasına';
  }
  /** Bu ürün kendi bölgesinde başka bir makineye mi gitmeli? (öyleyse kamyona gidemez — her şey sırasıyla) */
  nextMachineFor(kind, zone) {
    for (const m of this.machines) if ((m.zone ?? null) === (zone ?? null) && m.def.input === kind) return m;
    return null;
  }
  /** Aynı anda işlenen girdi sayısı (makine boyutu büyüdükçe artar) */
  batch(st) { return 1 + (st.up.size || 0); }
  /** Dakikada üretilen ürün (gerçek değer: süre × bıçak × aynı anda işlenen) */
  perMin(st) { return Math.round(60 / this.procTime(st) * this.outCount(st) * this.batch(st)); }
  outCount(st) { return st.def.outCount + (st.def.blades ? st.up.blades : 0); }
  /** OTOMATİK DENGE: sıradaki makine en az önceki makinenin ürettiği kadar işler (yığılma olmaz);
   *  hız geliştirmeleri bu dengenin üstüne ek hız verir. Sonuç 1 sn önbelleklenir. */
  balancedTime(st) {
    const now = this.game.time || 0;
    if (st._balAt != null && now - st._balAt < 1) return st._bal;
    st._balAt = now; st._bal = null; // döngüye karşı: hesap sırasında kendini dengesiz say
    const zone = st.zone ?? null;
    let up = 0;
    for (const m of this.machines) if (m !== st && (m.zone ?? null) === zone && m.def.output === st.def.input) up += this.perMin(m);
    if (up <= 0) return null;
    const siblings = this.machines.filter((m) => (m.zone ?? null) === zone && m.def.input === st.def.input).length || 1;
    // %10 pay + BİRİKİM ERİTME: girişte biriken oldukça daha hızlı işler (giriş doluyken 2 katına kadar) → önünde kuyruk kalmaz
    const fill = st.inBuf.capacity ? st.inBuf.count / st.inBuf.capacity : 0;
    const need = (up / siblings) * (1.1 + Math.max(0, fill - 0.3) * 1.4);
    // need girdi/dk: süre = 60 × aynı anda işlenen × girdi/işlem / need
    st._bal = (60 * this.batch(st) * (st.def.inCount || 1) / need) * Math.pow(0.92, st.up.speed);
    return st._bal;
  }
  /** AKILLI ZİNCİR: sıradaki makine dolu (%90+) ve bu makinenin çıkışında yeterli stok (%60+) varsa yeni işe başlamaz;
   *  sonraki makinede yer açılınca kendiliğinden devam eder (zincir tamamen kilitlenmez). */
  throttled(st) {
    if (!this.game.state.smartLogistics) return false;
    const next = this.nextMachineFor(st.def.output, st.zone ?? null);
    if (!next) return false;
    const t = next.inBuf.count >= next.inBuf.capacity * 0.9 && st.outBuf.count >= st.outBuf.capacity * 0.6;
    st.throttle = t;
    return t;
  }
  /** Makineye ürün getiren yerde (önceki makine çıkışı / depo) yığılma var mı? */
  upstreamPiled(st) {
    const zone = st.zone ?? null;
    for (const m of this.machines) if (m !== st && (m.zone ?? null) === zone && m.def.output === st.def.input && m.outBuf.count >= m.outBuf.capacity * 0.85) return true;
    for (const d of this.game.storage.depots) if ((d.zone ?? null) === zone && d.buffer.acceptsKind(st.def.input) && d.buffer.count >= d.buffer.capacity * 0.85) return true;
    return false;
  }
  /** Bu makine darboğaz mı? (girişi uzun süredir dolu, çıkışında yer var → yetişemiyor) */
  isBottleneck(st) { return (st.jamT || 0) > 6; }
  bottleneckIn(fac) { return this.machines.find((m) => (fac === null ? m.zone == null : m.zone != null && parentOf(m.zone) === fac) && this.isBottleneck(m)) || null; }
  procTime(st) {
    let t = st.def.time * Math.pow(0.92, st.up.speed) / (1 + 0.5 * this.expansions(st)); // her alan genişletmesi +%50 hız
    const tb = this.balancedTime(st); let floor = 0.15;
    if (tb != null && tb < t) { t = tb; floor = 0.05; } // dengelenen makine çok hızlı önceki makineye yetişebilsin (alt sınır düşer)
    const ops = this.game.workers?.operators(st) || 0; if (ops) t /= 1 + 0.3 * ops; // kesme operatörleri (en fazla 2)
    if (this.game.economy.boostActive('production')) t /= 2;
    return Math.max(floor, t);
  }

  create(site, saved) {
    const g = this.game;
    const def = MACHINES[site.machine];
    const st = {
      id: site.id, type: 'machine', machine: site.machine, def, name: site.name || def.name, x: site.x, z: site.z,
      up: { speed: 0, capacity: 0, quality: 0, blades: 0, size: 0, stock: 0, ...(saved?.up || {}) },
      stock: site.stock || null,
      working: false, t: 0, current: null, animT: 0, produced: 0,
    };
    st.inBuf = new Buffer(this.inCap(st), [def.input]);
    st.outBuf = new Buffer(this.outCap(st), [def.output]);
    st.inBuf.load(saved?.in); st.outBuf.load(saved?.out);
    const model = makeMachine(site.machine, def.color);
    st.model = model;
    model.group.position.set(site.x, 0, site.z);
    g.scene.add(model.group);
    model.setBlades(1 + st.up.blades);
    this.applySizeVisual(st);
    // yığın yerleşimleri (giriş ve çıkış masaları)
    st.inPile = (i) => { const p = pileLayout(i, def.input, 1, 3); return { x: st.x - 3.2 + p.x, y: 0.7 + p.y, z: st.z + p.z, yaw: p.yaw }; };
    st.outPile = (i) => { const p = pileLayout(i, def.output, 1, 3); return { x: st.x + 3.2 + p.x, y: 0.7 + p.y, z: st.z + p.z, yaw: p.yaw }; };
    if (st.stock) {
      // kesilmiş odun stok alanı: testereden çıkan her parça buraya yığılır; alma noktası burada
      const S = st.stock;
      // stok bölmeleri: her bölme 2 kat düzgün dizilir (STOCK_BAY ürün); alan genişledikçe kuzeye yeni bölme kurulur
      st.stockBays = [];
      st.outPile = (i) => {
        const bay = Math.min(Math.floor(i / STOCK_BAY), st.stockBays.length - 1); const j = i - bay * STOCK_BAY;
        const p = pileLayout(j, def.output, 7, 6); return { x: S.x + p.x, y: 0.12 + p.y, z: S.z - 0.1 - 4.8 * bay + p.z, yaw: p.yaw };
      };
      this.ensureStockBays(st);
    }
    // Kütükle çalışan makinelere yalnızca depodan alınmış kütük girer (taze kesilen kütük önce depoya)
    const logOnly = RAW_KINDS.includes(def.input);
    const impTag = site.importOnly != null ? 1000 + site.importOnly : null;
    // ithalatlı bölge makinesi yalnızca kendi ithalat deposundan gelen malı işler; diğer makinelere ithal mal girmez
    const myZone = site.zone ?? 0;
    const filter = impTag ? (it) => it.dep === impTag : logOnly ? (it) => it.dep === 1 && sameOrigin(it, myZone) : (it) => (!it.dep || it.dep === 1) && sameOrigin(it, myZone);
    const filterMsg = impTag ? 'Bu makine yalnızca kendi bölgesinin İthalat Deposu\'ndan beslenir'
      : logOnly ? (def.input === 'log' ? 'Taze kütükleri önce depoya bırak, sonra depodan al' : `${ITEMS[def.input].name} önce depoya, sonra depodan makineye`) : 'Bu ürün başka bir bölgede üretildi; yalnızca kendi bölgesinin makinesine girer';
    st.inPad = makePad(g, { x: st.x - 3.2, z: st.z + 2.5, mode: 'in', type: 'drop', buffer: st.inBuf, station: st, dropPoint: (i) => st.inPile(i), filter, filterMsg });
    st.outPad = st.stock
      ? makePad(g, { x: st.stock.x + 1.5, z: st.stock.z + 3.0, mode: 'out', type: 'take', buffer: st.outBuf, station: st, dropPoint: (i) => st.outPile(i) })
      : makePad(g, { x: st.x + 3.2, z: st.z + 2.5, mode: 'out', type: 'take', buffer: st.outBuf, station: st, dropPoint: (i) => st.outPile(i) });
    if (st.stock) {
      const S = st.stock;
      st.stockPad = makePad(g, { x: S.x - 1.5, z: S.z + 3.0, mode: 'build', type: 'build', r: 1.15,
        label: () => ({ title: 'Stok Alanını Genişlet', price: this.stockCost(st), level: 0, maxed: (st.up.stock || 0) >= S.max }),
        data: { expand: () => ({ name: S.name, count: st.outBuf.count, cap: st.outBuf.capacity, step: S.step, cost: this.stockCost(st), maxed: (st.up.stock || 0) >= S.max, what: 'kesilen odunların biriktiği alan', run: () => this.expandStock(st) }) } });
      // stok alanının kendi etiketi (dünyada): doluluk + "genişlet" uyarısı
      g.sites.set(st.id + '_stock', { id: st.id + '_stock', type: 'stock', owner: st, name: S.name, x: S.x, z: S.z, labelPos: { x: S.x, y: 2.6, z: S.z - 2.2 },
        label: () => ({ title: S.name, value: `${st.outBuf.count}/${st.outBuf.capacity}${st.outBuf.isFull() ? ' · Genişlet!' : ''}`, full: st.outBuf.isFull(), icon: def.output }) });
    }
    // makinenin önünde, giriş ve çıkış alanlarının arasında: üzerine basınca geliştirme paneli açılır
    st.upPad = makePad(g, { x: st.x, z: st.z + 2.9, r: 1.05, mode: 'upgrade', type: 'upgrade', station: st });
    g.obstacles.push({ x0: st.x - 4.1, x1: st.x + 4.1, z0: st.z - 1.1, z1: st.z + 1.0 });
    st.labelPos = { x: st.x, y: 3.6, z: st.z };
    st.label = () => ({
      title: `${def.name} Sv.${1 + st.up.speed + st.up.blades + st.up.capacity + st.up.quality + st.up.size}`,
      value: `${st.inBuf.count} → ${st.outBuf.count}`, progress: st.working ? st.t / this.procTime(st) : 0,
      full: st.outBuf.isFull(), icon: def.output, warn: this.isBottleneck(st) ? 'DARBOĞAZ — geliştir' : st.throttle && !st.working ? 'Sıradaki makine dolu — bekliyor' : null,
    });
    this.machines.push(st);
    g.sites.set(st.id, st);
    return st;
  }

  applySizeVisual(st) {
    const s = 1 + st.up.size * 0.12;
    st.model.group.scale.set(s, s, s);
  }

  update(dt) {
    const g = this.game;
    for (const st of this.machines) {
      st.animT += dt;
      if (!st.working) st.throttle = false;
      if (st.inBuf.isFull() && !st.outBuf.isFull() && this.upstreamPiled(st)) st.jamT = (st.jamT || 0) + dt; else if (st.inBuf.count < st.inBuf.capacity * 0.6 || st.outBuf.isFull()) st.jamT = 0;
      if (!st.working) {
        const oc = this.outCount(st);
        if (st.inBuf.count >= st.def.inCount && st.outBuf.free >= oc && !this.throttled(st)) {
          // büyük makine aynı anda birden çok girdiyi işler (boyut seviyesi + 1); çıkışta yer kadar
          let n = 0; const maxN = this.batch(st);
          const taken = [];
          while (n < maxN && st.inBuf.count >= st.def.inCount && st.outBuf.free >= oc * (n + 1)) {
            for (let i = 0; i < st.def.inCount; i++) taken.push(st.inBuf.items.shift());
            n++;
          }
          st.current = taken[0]; st.batchN = n;
          st.working = true; st.t = 0;
        }
      }
      if (st.working) {
        st.t += dt;
        const T = this.procTime(st);
        if (st.t >= T) {
          st.working = false;
          const oc = this.outCount(st) * (st.batchN || 1);
          for (let i = 0; i < oc; i++) {
            const item = { kind: st.def.output, wood: st.current.wood, o: st.zone ?? 0 }; // köken: üretildiği bölge
            if (!st.outBuf.push(item)) break;
            st.outBuf.hold++;
            g.fx.fly(item, { x: st.x + 1.4, y: 1.1, z: st.z }, st.outPile(st.outBuf.count - 1), 0.25 + i * 0.05, () => { st.outBuf.hold = Math.max(0, st.outBuf.hold - 1); }, 0.6);
            st.produced++;
            g.stat('produced_' + item.kind); g.stat('producedAny');
          }
          g.levels.addXP(XP.produce, null, true);
          if (Math.hypot(st.x - g.player.pos.x, st.z - g.player.pos.z) < 14) g.audio.play('produce', { vol: 0.35, pitch: 0.9 + Math.random() * 0.2 });
          g.bus.emit('produced', { station: st, kind: st.def.output, n: oc });
          st.current = null;
        }
      }
      for (const fn of st.model.anim) fn(st.animT, st.working, dt);
      if (st.working && Math.random() < dt * 8) g.fx.chips(st.x + (Math.random() - 0.5) * 0.6, 1.3, st.z + 0.4, 0xf7e3c0);
    }
  }

  workingNear() { return this.machines.filter((m) => m.working); }

  renderItems(R) {
    for (const st of this.machines) {
      const ni = Math.min(st.inBuf.count - st.inBuf.hold, 60);
      for (let i = 0; i < ni; i++) { const p = st.inPile(i); const it = st.inBuf.items[i]; R.add(it.kind, it.wood, p.x, p.y, p.z, p.yaw); }
      const no = Math.min(st.outBuf.count - st.outBuf.hold, 60);
      for (let i = 0; i < no; i++) { const p = st.outPile(i); const it = st.outBuf.items[i]; R.add(it.kind, it.wood, p.x, p.y, p.z, p.yaw); }
      // makine içinde ilerleyen ürün
      if (st.working && st.current) {
        const k = Math.min(1, st.t / this.procTime(st));
        R.add(st.current.kind, st.current.wood, st.x - 2.3 + k * 3.4, 1.12, st.z, 0);
      }
    }
  }

  serialize(out) {
    for (const st of this.machines) {
      const inItems = st.inBuf.serialize();
      if (st.working && st.current) inItems.unshift([st.current.kind, st.current.wood]); // işlemdeki ürün kaybolmaz
      out[st.id] = { built: true, up: st.up, in: inItems.slice(0, st.inBuf.capacity), out: st.outBuf.serialize() };
    }
  }
}
