import { ICONS, ITEM_ICON } from './icons.js';
import { fmt } from '../systems/MissionSystem.js';
import {
  PLAYER_UPGRADES, playerCapacity, TRUCK_TIERS, TRUCK_UPGRADES, FORKLIFT_UPGRADES, FORKLIFT_BUY, WORKER_UPGRADES, WORKER_ROLES,
  CONVEYOR_UPGRADES, DEPOT_UPGRADE, BOOSTS, ITEMS, WOODS, MACHINES, WORKER_BASE,
} from '../config/balance.js';
import { IAP } from '../config/monetization.js';
import { LOGIN_REWARDS } from '../systems/DailyRewardSystem.js';
import { CARRIER_ROUTES } from '../systems/WorkerSystem.js';

const $ = (s, r = document) => r.querySelector(s);

/** Alt menü panelleri (bottom sheet) ve istasyon yönetim ekranları */
export class Panels {
  constructor(game, ui) {
    this.game = game; this.ui = ui;
    this.cur = null;
    this.sheet = $('#sheet');
  }

  open(name, sub) {
    if (name === 'boosts') { name = 'shop'; sub = 'boosts'; }
    const defaults = { upgrades: 'player', missions: 'main', shop: 'boosts', vehicles: 'trucks', factory: 'machines' };
    if (name === 'missions' && !sub) sub = this.missionReady('daily') ? 'daily' : this.missionReady('achievements') ? 'achievements' : 'main';
    this.cur = { name, sub: sub || defaults[name] || null };
    this.sheet.classList.remove('hidden');
    this.ui.root.classList.add('sheet-open');
    document.querySelectorAll('#bottom-bar .tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + name));
    this.render(true);
  }
  /** Görevler panelinde o sekmede alınmayı bekleyen ödül sayısı */
  missionReady(sub) {
    const g = this.game;
    if (sub === 'daily') return g.daily.questView().filter((q) => q.done && !q.claimed).length + (g.daily.canClaimLogin() ? 1 : 0);
    if (sub === 'achievements') return g.missions.achievementView().filter((a) => a.done).length;
    return 0;
  }
  belt(b) { this.station({ type: 'belt', belt: b, name: b.def.name }); }
  station(st) { this.cur = { name: 'station', station: st }; this.sheet.classList.remove('hidden'); this.ui.root.classList.add('sheet-open'); this.render(true); }
  close() {
    this.cur = null; this.sheet.classList.add('hidden'); this.ui.root.classList.remove('sheet-open');
    document.querySelectorAll('#bottom-bar .tab').forEach((t) => t.classList.remove('on'));
  }
  refreshIfOpen() { if (this.cur) this.render(false); }

  render(reset) {
    const c = this.cur; if (!c) return;
    const body = $('#sheet-body');
    const scroll = body.scrollTop;
    const titles = { upgrades: 'Geliştirme', missions: 'Görevler', land: 'Arazi', shop: 'Mağaza', vehicles: 'Araçlar', workers: 'İşçiler', factory: 'Fabrika' };
    const tabs = {
      upgrades: [['player', 'Karakter'], ['factory', 'Fabrika'], ['vehicles', 'Araçlar'], ['workers', 'İşçiler']],
      missions: [['main', 'Görev'], ['daily', 'Günlük'], ['achievements', 'Başarılar']],
      shop: [['boosts', 'Hızlandırma'], ['gold', 'Özel'], ['skins', 'Görünüm'], ['packs', 'Paketler']],
      vehicles: [['trucks', 'Kamyonlar'], ['forklifts', 'Forklift'], ['sales', 'Satışlar']],
      factory: [['machines', 'Makineler'], ['conveyors', 'Konveyör'], ['storage', 'Depolar']],
    };
    const title = c.name === 'station' ? c.station.name : titles[c.name];
    this.ui.setText('#sheet-title', title);
    const t = tabs[c.name];
    const tabHtml = t ? t.map(([id, n]) => { const k = c.name === 'missions' ? this.missionReady(id) : 0; return `<button class="stab ${c.sub === id ? 'on' : ''}" data-act="open:${c.name}:${id}">${n}${k ? `<i class="stab-badge">${k}</i>` : ''}</button>`; }).join('') : '';
    const te = $('#sheet-tabs'); if (te._h !== tabHtml) { te._h = tabHtml; te.innerHTML = tabHtml; }
    te.classList.toggle('hidden', !t);
    let html = '';
    try {
      const fn = { upgrades: this.upgrades, missions: this.missions, land: this.land, shop: this.shop, vehicles: this.vehicles, workers: this.workers, factory: this.factory, station: this.stationView }[c.name];
      html = fn.call(this, c.sub);
    } catch (e) { console.error(e); html = `<div class="empty">Hata: ${e.message}</div>`; }
    if (body._h !== html) { body._h = html; body.innerHTML = html; body.scrollTop = reset ? 0 : scroll; }
  }

  // ------------------------------------------------------------
  row(o) {
    const g = this.game;
    const cur = o.currency === 'gold' ? 'gold' : 'coin';
    const afford = o.currency === 'gold' ? g.state.gold >= o.cost : g.state.money >= o.cost;
    let btn;
    if (o.maxed) btn = `<button class="btn small done" disabled>MAKS</button>`;
    else if (o.locked) btn = `<button class="btn small locked" disabled>${ICONS.lock}<span>${o.locked}</span></button>`;
    else if (o.btnText) btn = `<button class="btn small ${o.btnCls || 'green'}" data-act="${o.act}">${o.btnText}</button>`;
    else btn = `<button class="btn small ${afford ? 'green' : 'poor'}" data-act="${o.act}">${ICONS[cur]}<b>${fmt(o.cost)}</b></button>`;
    return `<div class="row ${o.cls || ''}">
      <div class="r-ico">${ICONS[o.icon] || o.icon || ''}</div>
      <div class="r-body"><div class="r-title">${o.title}${o.level !== undefined ? ` <em>Sv.${o.level}</em>` : ''}</div>
      <div class="r-sub">${o.sub || ''}</div>${o.bar !== undefined ? `<div class="r-bar"><i style="width:${Math.min(100, o.bar * 100)}%"></i></div>` : ''}</div>
      <div class="r-act">${btn}</div></div>`;
  }
  section(title, inner) { return `<h3 class="sec">${title}</h3>${inner}`; }

  // ------------------------------------------------------------ GELİŞTİRME
  upgrades(sub) {
    const g = this.game;
    if (sub === 'player') {
      const p = g.player; const up = p.up;
      const eff = {
        speed: `${p.moveSpeed().toFixed(1)} m/sn`, capacity: `${playerCapacity(up.capacity)} → ${playerCapacity(up.capacity + 1)} ürün`,
        chop: `${(1 / p.chopInterval()).toFixed(2)} vuruş/sn`, power: `${p.chopDamage().toFixed(1)} hasar/vuruş`, collect: `${(1 / p.transferInterval()).toFixed(1)} ürün/sn`,
      };
      const ic = { speed: 'run', capacity: 'log', chop: 'axe', power: 'hammer', collect: 'magnet' };
      return `<div class="hint">Karakter geliştirmeleri hem hızını hem de sırtındaki istifi büyütür.</div>` +
        Object.entries(PLAYER_UPGRADES).map(([k, d]) => this.row({ icon: ic[k], title: d.name, level: up[k] + 1, sub: `${d.desc} · <b>${eff[k]}</b>`, cost: p.upgradeCost(k), act: `up:player:${k}`, maxed: up[k] >= d.max })).join('');
    }
    if (sub === 'factory') return this.factory('machines');
    if (sub === 'vehicles') return this.vehicles('trucks');
    if (sub === 'workers') return this.workers();
    return '';
  }

  machineRows(st) {
    const g = this.game;
    return g.factory.options(st).map((o) => this.row({
      icon: { speed: 'bolt', capacity: 'box', quality: 'star', blades: 'axe', size: 'factory' }[o.key], title: o.def.name, level: o.level + 1,
      sub: `${o.def.desc}<br>Şimdi <b>${o.effect}</b>${o.next ? ` → Sonra <b>${o.next}</b>` : ''}<br><i>Görsel: ${o.visual || '-'}</i>`, cost: o.cost, act: `up:machine:${st.id}:${o.key}`, maxed: o.maxed, locked: o.locked,
    })).join('');
  }

  // ------------------------------------------------------------ FABRİKA
  factory(sub) {
    const g = this.game;
    if (sub === 'machines') {
      const built = g.production.machines;
      let html = built.map((st) => `<div class="card machine">
        <div class="c-head">${ICONS[ITEM_ICON[st.def.output]]}<div><b>${st.name}</b><small>${ITEMS[st.def.input].name} ×${st.def.inCount} → ${ITEMS[st.def.output].name} ×${g.production.outCount(st)}</small></div>
        <button class="btn small" data-act="station:${st.id}">Yönet</button></div>
        <div class="c-stats"><span>Giriş <b>${st.inBuf.count}/${st.inBuf.capacity}</b></span><span>Çıkış <b>${st.outBuf.count}/${st.outBuf.capacity}</b></span><span><b>${g.production.procTime(st).toFixed(2)}</b> sn</span></div>
        <div class="r-bar"><i style="width:${st.working ? Math.min(100, (st.t / g.production.procTime(st)) * 100) : 0}%"></i></div></div>`).join('');
      const pend = [...g.construction.pending.values()].filter((p) => p.site.type === 'machine');
      if (pend.length) html += this.section('Kurulabilir makineler', pend.map((p) => this.row({ icon: 'hammer', title: p.site.name || MACHINES[p.site.machine].name, sub: `${ITEMS[MACHINES[p.site.machine].input].name} → ${ITEMS[MACHINES[p.site.machine].output].name} · İnşaat alanına git`, btnText: 'Git', btnCls: '', act: `goto:${p.pad.x}:${p.pad.z}` })).join(''));
      const locked = Object.entries(MACHINES).filter(([k]) => !g.sites.has(k) && ![...g.construction.pending.values()].some((p) => p.site.machine === k));
      if (locked.length) html += this.section('İleride açılacak', locked.map(([k, d]) => this.row({ icon: 'lock', title: d.name, sub: `${ITEMS[d.input].name} → ${ITEMS[d.output].name}`, locked: 'Arazi', cls: 'dim' })).join(''));
      return html;
    }
    if (sub === 'conveyors') {
      const list = g.conveyors.list();
      return `<div class="hint">Konveyörler gerçek ürünleri makineden makineye otomatik taşır.</div>` + list.map((c) => {
        if (!c.built) return this.row({ icon: 'conveyor', title: c.def.name, sub: `${g.construction.siteName({ id: c.def.from.site, ...this.siteDef(c.def.from.site) })} → ${g.construction.siteName({ id: c.def.to.site, ...this.siteDef(c.def.to.site) })}`, cost: c.def.cost, act: `conv:buy:${c.def.id}`, locked: c.reason });
        const b = c.belt;
        return `<div class="card"><div class="c-head">${ICONS.conveyor}<div><b>${c.def.name}</b><small>Bant üzerinde ${b.items.length} ürün · ${g.conveyors.speed(b).toFixed(1)} m/sn</small></div></div>` +
          Object.entries(CONVEYOR_UPGRADES).map(([k, d]) => this.row({ icon: k === 'speed' ? 'bolt' : 'box', title: d.name, level: b.up[k] + 1, sub: d.desc, cost: g.conveyors.upgradeCost(b, k), act: `conv:up:${c.def.id}:${k}`, maxed: b.up[k] >= d.max })).join('') + '</div>';
      }).join('');
    }
    if (sub === 'storage') {
      return [...g.storage.depots, ...g.storage.warehouses].map((st) => `<div class="card"><div class="c-head">${ICONS[st.type === 'depot' ? 'log' : 'box']}<div><b>${st.name}</b><small>${st.buffer.count} / ${st.buffer.capacity}</small></div></div>
        <div class="r-bar"><i style="width:${(st.buffer.count / st.buffer.capacity) * 100}%"></i></div>
        ${this.row({ icon: 'box', title: DEPOT_UPGRADE.name, level: st.up.capacity + 1, sub: '+200 yer, alan büyür · sınırsız', cost: g.storage.upgradeCost(st), act: `up:depot:${st.id}`, maxed: st.up.capacity >= DEPOT_UPGRADE.max })}</div>`).join('');
    }
    return '';
  }
  siteDef(id) {
    for (let z = 0; z < 10; z++) { const s = this.game.land.zoneDef(z).sites.find((x) => x.id === id); if (s) return s; }
    return {};
  }

  // ------------------------------------------------------------ GÖREVLER
  missions(sub) {
    const g = this.game;
    if (sub === 'main') {
      const v = g.missions.view(); const r = v.reward || {};
      return `<div class="card mission-big"><div class="mb-tag">${v.main ? 'ANA GÖREV' : 'GÖREV'} #${v.index + 1}</div>
        <div class="mb-title">${v.title}</div>${v.hint ? `<div class="mb-hint">${v.hint}</div>` : ''}
        <div class="r-bar big"><i style="width:${Math.min(100, (v.value / v.target) * 100)}%"></i><span>${fmt(v.value)} / ${fmt(v.target)}</span></div>
        <div class="mb-rew">Ödül: ${r.money ? `${ICONS.coin} ${fmt(r.money)}` : ''} ${r.gold ? `${ICONS.gold} ${r.gold}` : ''} ${r.xp ? `· ${r.xp} XP` : ''}</div></div>
        <div class="hint">Görevler seviye ilerledikçe değişir ve hiç bitmez. Kırmızı ok seni hedefe götürür.</div>
        ${this.section('İstatistikler', this.statsHtml())}`;
    }
    if (sub === 'daily') {
      const d = g.daily;
      const idx = d.loginIndex();
      const login = `<div class="login-row">${LOGIN_REWARDS.map((r, i) => `<div class="login-day ${i < idx ? 'got' : ''} ${i === idx && d.canClaimLogin() ? 'today' : ''} ${r.special ? 'special' : ''}"><small>${i + 1}. Gün</small>${ICONS[r.gold ? 'gold' : r.boost ? 'bolt' : 'coin']}<span>${r.label}</span></div>`).join('')}</div>
        ${d.canClaimLogin() ? `<div class="btn-row"><button class="btn green" data-act="daily:claim">Ödülü Al</button><button class="btn" data-act="daily:claim2">${ICONS.play} 2 Katı</button></div>` : `<div class="hint center">Bugünün ödülü alındı. Yarın tekrar gel!</div>`}`;
      const qv = d.questView();
      const qRank = (q) => (q.done && !q.claimed ? 0 : q.claimed ? 2 : 1);
      qv.sort((a, b) => qRank(a) - qRank(b) || (b.value / b.n) - (a.value / a.n));
      const qReady = qv.filter((q) => q.done && !q.claimed).length;
      const quests = (qReady ? this.claimAllBtn('quest', qReady) : '') + qv.map((q) => this.row({ icon: 'calendar', title: q.title, sub: `${ICONS.gold} ${q.reward.gold} · ${ICONS.coin} ${fmt(q.reward.money)}`, bar: q.value / q.n, btnText: q.claimed ? '✓' : q.done ? 'Al' : `${fmt(q.value)}/${fmt(q.n)}`, btnCls: q.claimed ? 'done' : q.done ? 'green' : 'poor', act: q.done && !q.claimed ? `quest:claim:${q.id}` : 'noop' })).join('');
      return this.section('Günlük Giriş Ödülü', login) + this.section('Günlük Görevler', quests);
    }
    if (sub === 'achievements') {
      const av = g.missions.achievementView();
      av.sort((a, b) => (b.done - a.done) || (b.value / b.target) - (a.value / a.target));
      const aReady = av.filter((a) => a.done).length;
      return (aReady ? this.claimAllBtn('ach', aReady) : '') + av.map((a) => this.row({
        icon: 'trophy', title: `${a.def.name} ${a.tier + 1}`, sub: `${a.def.desc(a.target)} · ${ICONS.gold} ${a.gold}`, bar: a.value / a.target,
        btnText: a.done ? 'Al' : `${fmt(Math.min(a.value, a.target))}/${fmt(a.target)}`, btnCls: a.done ? 'green' : 'poor', act: a.done ? `ach:claim:${a.def.id}` : 'noop',
      })).join('');
    }
    return '';
  }
  claimAllBtn(kind, n) {
    return `<button class="btn green claim-all" data-act="${kind}:all">${ICONS.gift} Tümünü Al <em>${n}</em></button>`;
  }
  statsHtml() {
    const s = this.game.state.stats;
    const items = [['Kesilen ağaç', s.treesFelled], ['Toplanan odun', s.logsCollected], ['Üretilen ürün', s.producedAny], ['Gönderilen kamyon', s.trucksShipped], ['Satılan ürün', s.itemsSold], ['Toplam kazanç', s.moneyEarned], ['Açılan arazi', (s.landsOwned || 0) + 1], ['Oyun süresi', Math.round(this.game.state.playTime / 60) + ' dk']];
    return `<div class="stats">${items.map(([k, v]) => `<div><small>${k}</small><b>${typeof v === 'string' ? v : fmt(v || 0)}</b></div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------ ARAZİ
  land() {
    const g = this.game;
    return `<div class="hint">Yeni araziler yeni ağaçlar, makineler ve satış noktaları açar. Harita sonsuza kadar genişler.</div>` + g.land.list().map(({ id, def, owned, status }) => {
      const trees = Object.keys(def.forests[0]?.mix || {}).map((w) => WOODS[w].name).join(', ');
      const btn = owned ? `<button class="btn small" data-act="land:go:${id}">Git</button>`
        : status.ok ? `<button class="btn small green" data-act="land:buy:${id}">${ICONS.coin}<b>${fmt(def.cost)}</b></button>`
        : `<button class="btn small ${status.money ? 'poor' : 'locked'}" ${status.money ? `data-act="land:buy:${id}"` : 'disabled'}>${status.money ? `${ICONS.coin}<b>${fmt(def.cost)}</b>` : `${ICONS.lock}<span>${status.reason}</span>`}</button>`;
      return `<div class="row zone ${owned ? 'owned' : ''}"><div class="r-ico">${ICONS[owned ? 'check' : 'map']}</div>
        <div class="r-body"><div class="r-title">${def.name} ${!owned ? `<em>Sv.${def.level}</em>` : ''}</div><div class="r-sub">${def.desc || ''}${trees ? ` · Ağaçlar: ${trees}` : ''}</div></div>
        <div class="r-act">${btn}${!owned && def.pad ? `<button class="btn tiny" data-act="goto:${def.pad.x}:${def.pad.z}">Göster</button>` : ''}</div></div>`;
    }).join('');
  }

  // ------------------------------------------------------------ MAĞAZA
  shop(sub) {
    const g = this.game;
    if (sub === 'boosts') {
      const ads = g.ads.available();
      const boost = Object.entries(BOOSTS).map(([k, d]) => `<div class="card boost"><div class="c-head">${ICONS[d.icon] || ICONS.bolt}<div><b>${d.name}</b><small>${d.desc}${g.economy.boostActive(k) ? ` · <b>${Math.ceil(g.economy.boostRemaining(k))} sn kaldı</b>` : ''}</small></div></div>
        <div class="btn-row"><button class="btn ${g.state.gold >= d.gold ? 'gold' : 'poor'}" data-act="shop:boost:${k}:gold">${ICONS.gold}<b>${d.gold}</b></button>
        <button class="btn ${ads ? 'green' : 'locked'}" data-act="shop:boost:${k}:ad" ${ads ? '' : 'disabled'}>${ICONS.play}<span>${g.state.purchases.noAds ? 'Ücretsiz' : 'Reklam İzle'}</span></button></div></div>`).join('');
      const free = this.section('Ücretsiz ödüller', [['money', 'coin', 'Bedava para', `${fmt(Math.round(150 * Math.pow(g.state.level, 1.5)))} para`], ['gold', 'gold', 'Bedava altın', '5 altın']].map(([k, ic, t, s]) =>
        this.row({ icon: ic, title: t, sub: `${s} · Bugün ${g.state.daily.adsToday}/20 reklam`, btnText: `${ICONS.play} ${g.state.purchases.noAds ? 'Al' : 'İzle'}`, btnCls: ads ? 'green' : 'locked', act: ads ? `shop:ad:${k}` : 'noop' })).join(''));
      return `<div class="hint">Reklam izlemek tamamen isteğe bağlıdır. ${g.ads.status === 'unavailable' ? 'Reklamlar yalnızca Android sürümünde gösterilir.' : ''}</div>` + boost + free;
    }
    if (sub === 'gold') {
      return g.shop.goldItems().map((it) => this.row({ icon: it.id === 'golden_truck' ? 'truck' : 'worker', title: it.title, sub: it.desc, cost: it.gold, currency: 'gold', act: `shop:gold:${it.id}`, maxed: it.owned })).join('');
    }
    if (sub === 'skins') {
      return `<div class="skins">${g.shop.skins().map((s) => `<div class="skin ${s.active ? 'active' : ''}">
        <div class="sk-prev" style="--shirt:#${s.shirt.toString(16).padStart(6, '0')};--pants:#${s.pants.toString(16).padStart(6, '0')};--hat:#${s.hat.toString(16).padStart(6, '0')}"><i class="hat"></i><i class="head"></i><i class="body"></i><i class="legs"></i></div>
        <b>${s.name}</b>
        ${s.active ? '<button class="btn small done" disabled>Seçili</button>' : s.owned ? `<button class="btn small" data-act="shop:skin:${s.id}">Giy</button>` : s.iap ? '<button class="btn small locked" data-act="open:shop:packs">Paket</button>' : `<button class="btn small ${g.state.gold >= s.price ? 'gold' : 'poor'}" data-act="shop:skin:${s.id}">${ICONS.gold}<b>${s.price}</b></button>`}
        </div>`).join('')}</div>`;
    }
    if (sub === 'packs') {
      const b = g.billing;
      const note = b.statusText();
      return (note ? `<div class="hint warn">${note}</div>` : '') + IAP.products.map((p) => {
        const owned = p.grant && g.state.purchases[p.grant];
        return this.row({ icon: p.gold ? 'gold' : p.grant === 'noAds' ? 'play' : p.grant === 'goldenTruck' ? 'truck' : p.grant === 'royalSkin' ? 'star' : p.boosts ? 'bolt' : 'worker',
          title: p.title + (p.tag ? ` <span class="tag">${p.tag}</span>` : ''), sub: p.desc || (p.gold ? `${p.gold} altın` : p.boosts ? '30 dk Üretim x2 + 30 dk Satış x2' : ''),
          btnText: owned ? 'Sahipsin' : b.price(p.id), btnCls: owned ? 'done' : b.enabled() ? 'green' : 'locked', act: owned || !b.enabled() ? 'noop' : `shop:iap:${p.id}` });
      }).join('') + (b.enabled() ? `<button class="btn wide" data-act="shop:restore">Satın alımları geri yükle</button>` : '');
    }
    return '';
  }

  // ------------------------------------------------------------ ARAÇLAR
  vehicles(sub) {
    const g = this.game; const T = g.trucks;
    if (sub === 'trucks') {
      const tiers = TRUCK_TIERS.map((t, i) => {
        const owned = g.state.trucks.owned.includes(i);
        const active = g.state.trucks.tier === i;
        const locked = !g.land.owns(t.zone) ? `${g.land.zoneDef(t.zone).name}` : null;
        return this.row({ icon: 'truck', title: t.name, sub: `Kapasite ${t.cap} ürün`, cls: active ? 'active' : '',
          ...(active ? { btnText: 'Kullanımda', btnCls: 'done', act: 'noop' } : owned ? { btnText: 'Seç', btnCls: '', act: `truck:tier:${i}` } : { cost: t.cost, act: `truck:tier:${i}`, locked }) });
      }).join('');
      const tval = (k) => k === 'speed' ? `${T.turnaround().toFixed(1)} sn gidiş-dönüş` : k === 'load' ? `${T.loadBatch()} ürün/sefer · ${T.perMin()}/dk` : `satış +%${g.state.trucks.up.bonus * 5}`;
      const ups = Object.entries(TRUCK_UPGRADES).map(([k, d]) => { const up = g.state.trucks.up; const now = tval(k); let nx = ''; if (up[k] < d.max) { up[k]++; nx = tval(k); up[k]--; }
        return this.row({ icon: k === 'speed' ? 'run' : k === 'bonus' ? 'coin' : 'box', title: d.name, level: up[k] + 1, sub: `${d.desc}<br>Şimdi <b>${now}</b>${nx ? ` → Sonra <b>${nx}</b>` : ''}`, cost: T.upgradeCost(k), act: `truck:up:${k}`, maxed: up[k] >= d.max }); }).join('');
      const docks = T.docks.map((d) => { const tr = T.atDock(d); return this.row({ icon: 'truck', title: d.name, sub: tr ? `Yük: ${tr.load.length}/${tr.cap} · Kuyruk: ${d.queue.length}` : `Kamyon yolda · Kuyruk: ${d.queue.length}`, bar: tr ? tr.load.length / tr.cap : 0, btnText: 'Gönder', btnCls: tr && tr.load.length ? 'green' : 'locked', act: tr && tr.load.length ? `truck:send:${d.id}` : 'noop' }); }).join('');
      return this.section('Rampalar', docks) + this.section('Kamyon Filosu', tiers) + this.section('Araç Geliştirme', ups) + (g.state.trucks.golden ? '<div class="hint">Altın Kamyon aktif: satışlara +%25</div>' : '');
    }
    if (sub === 'forklifts') {
      const V = g.vehicles;
      if (!V.garage) return `<div class="empty">${ICONS.forklift}<p>Forkliftler için <b>Büyük Depolama Merkezi</b> arazisinde <b>Forklift Garajı</b> kurulmalı.</p></div>`;
      const buy = V.list.length < FORKLIFT_BUY.max ? this.row({ icon: 'forklift', title: `Forklift satın al (${V.list.length}/${FORKLIFT_BUY.max})`, sub: `Kapasite ${V.capacity()} ürün`, cost: V.buyCost(), act: 'fork:buy' }) : '';
      const list = V.list.map((f, i) => `<div class="row"><div class="r-ico">${ICONS.forklift}</div><div class="r-body"><div class="r-title">Forklift ${i + 1}</div><div class="r-sub">${f.bubble || ({ idle: 'Beklemede', pick: 'Yükleniyor', drop: 'Taşıyor', refuel: 'Yakıt molası' }[f.state])} · ${f.stack.count}/${f.stack.capacity}</div></div>
        <div class="r-act seg"><button class="btn tiny ${f.data.mode === 'products' ? 'on' : ''}" data-act="fork:mode:${i}:products">Ürün→Kamyon</button><button class="btn tiny ${f.data.mode === 'logs' ? 'on' : ''}" data-act="fork:mode:${i}:logs">Kütük→Testere</button></div></div>`).join('');
      const ups = Object.entries(FORKLIFT_UPGRADES).map(([k, d]) => this.row({ icon: { capacity: 'box', speed: 'run', lift: 'up', loading: 'bolt', fuel: 'star' }[k], title: d.name, level: V.up[k] + 1, sub: d.desc, cost: V.upgradeCost(k), act: `fork:up:${k}`, maxed: V.up[k] >= d.max })).join('');
      return buy + list + this.section('Forklift Geliştirme', ups);
    }
    if (sub === 'sales') {
      const sales = g.state.sales;
      if (!sales.length) return `<div class="empty">${ICONS.truck}<p>Henüz satış yok. İlk kamyonu gönder!</p></div>`;
      return `<div class="sales">${sales.map((s) => `<div class="sale"><span>${new Date(s.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span><span>${s.n} ürün · ${Object.entries(s.counts || {}).map(([k, n]) => `${ITEMS[k]?.name || k} ${n}`).join(', ')}</span><b>${ICONS.coin}${fmt(s.amount)}</b></div>`).join('')}</div>`;
    }
    return '';
  }

  // ------------------------------------------------------------ İŞÇİLER
  workers() {
    const g = this.game; const W = g.workers;
    const lv = W.hireLevel(); const lockd = g.state.level < lv; const hc = W.hireCost(null, null);
    const hire = `<div class="card"><div class="c-head">${ICONS.worker}<div><b>Başlangıç alanına İŞÇİ AL (${W.countAll(null)} işçi)</b><small>İşçi oduncu olarak gelir; görevini aşağıdan değiştir. Her yeni işçi biraz daha pahalı. Diğer tesislere o tesisteki İŞÇİ AL noktasından alınır.</small></div></div>
      <div class="btn-row"><button class="btn ${!lockd && g.state.money >= hc ? 'green' : 'poor'}" data-act="worker:hire:worker"><span>İşçi Al</span>${lockd ? `${ICONS.lock}<b>Sv.${lv}</b>` : `${ICONS.coin}<b>${fmt(hc)}</b>`}</button></div></div>`;
    const row = (w, i) => {
      const role = WORKER_ROLES[w.data.role];
      let target = 'Otomatik';
      if (w.data.target !== 'auto') {
        if (w.data.role === 'lumberjack') target = Number.isFinite(+w.data.target) ? g.land.zoneDef(+w.data.target).name : 'Otomatik';
        else if (w.data.role === 'carrier') target = g.workers.availableRoutes().find((r) => r.id === w.data.target)?.name || '?';
        else target = g.sites.get(w.data.target)?.name || '?';
      }
      const fac = w.data.fac ?? null;
      const area = fac === null ? 'Başlangıç alanı' : g.land.zoneDef(fac).name;
      const eff = Math.round((1 + W.up.efficiency * 0.12) * (w.data.premium ? 1.5 : 1) * 100);
      const roles = W.rolesFor(fac).map((k) => `<button class="btn tiny ${w.data.role === k ? 'on' : ''}" data-act="worker:role:${i}:${k}">${k === 'farmer' && fac !== null ? W.roleName({ data: { role: 'farmer', fac } }) : WORKER_ROLES[k].name}</button>`).join('');
      return `<div class="row worker"><div class="r-ico">${ICONS.worker}${w.data.premium ? '<i class="prem">★</i>' : ''}</div>
        <div class="r-body"><div class="r-title">İşçi ${i + 1} · ${W.roleName(w)}${W.isWaiting(w) ? ' <em class="wait-badge">bekliyor</em>' : ''}${w.data.origRole ? ` <em class="wait-badge auto">otomatik · asıl: ${WORKER_ROLES[w.data.origRole].name}</em>` : ''}</div><div class="r-sub">${w.bubble || role.desc}</div>
        <div class="r-sub">Bölge <b>${area}</b> · Hız <b>${w.speed().toFixed(1)} m/sn</b> · Taşıma <b>${w.stack.count}/${w.stack.capacity}</b> · Verim <b>%${eff}</b></div>
        ${w.data.temp ? '' : `<div class="seg roles">${roles}</div>`}
        ${['lumberjack', 'carrier', 'loader'].includes(w.data.role) ? `<button class="btn tiny area" data-act="worker:area:${i}">Çalışma alanı: <b>${target}</b></button>` : ''}</div></div>`;
    };
    // filtre: Tümü / Bekleyenler  +  Otomatik iş dağılımı (aç/kapa)
    const nWait = W.waitingList().length; const onlyWait = this.workerFilter === 'wait';
    const auto = !!g.state.autoAssign;
    const tools = `<div class="card"><div class="seg roles wfilter"><button class="btn tiny ${onlyWait ? '' : 'on'}" data-act="worker:filter:all">Tümü (${W.list.filter((w) => !w.data.temp).length})</button><button class="btn tiny ${onlyWait ? 'on' : ''} ${nWait ? 'warn' : ''}" data-act="worker:filter:wait">Bekleyenler (${nWait})</button></div>
      <label class="set autoassign"><span><b>Otomatik iş dağılımı</b><small>Açıkken bir süredir boş bekleyen işçi, kendi alanında iş bekleyen göreve (Taşıyıcı, Dağıtım, Oduncu, Bakıcı) kendiliğinden geçer. Kapatınca herkes asıl görevine döner (elinde yük varsa önce onu bırakır).</small></span><input type="checkbox" ${auto ? 'checked' : ''} data-act="worker:auto"></label>
      <label class="set autoassign"><span><b>Akıllı lojistik</b><small>Makineler birbirinin doluluğunu dikkate alır (%80 öncelik düşer, %90 sınırlanır, %100 gönderilmez), aynı ürün için ikinci işçi gönderilmez, sıradaki makine doluysa önceki yavaşlar, depo doluysa oduncular kesimi bırakır, tekrarlayan uyarılar tekilleşir. Otomatik dağılım da açıksa boşta bekleyenler en acil işe, en yakın işçiden başlayarak dağılır.</small></span><input type="checkbox" ${g.state.smartLogistics ? 'checked' : ''} data-act="worker:smart"></label></div>`;
    // işçileri tesise göre grupla (her tesisin kendi kotası)
    const facs = [...new Set(W.list.map((w) => w.data.fac ?? null))].sort((a, b) => (a ?? -1) - (b ?? -1));
    const list = facs.map((f) => {
      const items = W.list.map((w, i) => [w, i]).filter(([w]) => (w.data.fac ?? null) === f && (!onlyWait || W.isWaiting(w)));
      if (!items.length) return '';
      const name = f === null ? 'Başlangıç Tesisi' : g.land.zoneDef(f).name;
      const quota = ` · ${W.countAll(f)} işçi`;
      return this.section(`${name}${quota}`, items.map(([w, i]) => row(w, i)).join(''));
    }).join('');
    // yükseltme etkileri sayıyla: şimdiki → sonraki
    const cap = WORKER_BASE.capacity + W.up.capacity;
    const eff = {
      speed: `Hız +%${W.up.speed * 8} → +%${(W.up.speed + 1) * 8}`,
      capacity: `Her işçi ${cap} → ${cap + 1} ürün taşır`,
      efficiency: `İş hızı +%${W.up.efficiency * 12} → +%${(W.up.efficiency + 1) * 12}`,
    };
    const ups = Object.entries(WORKER_UPGRADES).filter(([k]) => k !== 'slots').map(([k, d]) => this.row({ icon: { slots: 'worker', speed: 'run', capacity: 'box', efficiency: 'star' }[k], title: d.name, level: W.up[k] + 1, sub: eff[k], cost: W.upgradeCost(k), act: `worker:up:${k}`, maxed: W.up[k] >= d.max })).join('');
    const empty = onlyWait && !nWait ? `<div class="empty">${ICONS.worker}<p>Bekleyen işçi yok — herkes çalışıyor.</p></div>` : '';
    if (this.cur?.station?.type === 'workers') return this.section('İşçi Geliştirme', ups) + hire + tools + list + empty;
    return hire + tools + list + empty + this.section('İşçi Geliştirme', ups);
  }

  workerArea(i) {
    const g = this.game; const W = g.workers; const w = W.list[i];
    let opts = [['auto', 'Otomatik (en çok ihtiyaç olan)']];
    if (w.data.role === 'lumberjack') opts = opts.concat(W.forestZones().map((z) => [String(z.id), z.name]));
    else if (w.data.role === 'carrier') opts = opts.concat(W.availableRoutes().map((r) => [r.id, r.name]));
    else opts = opts.concat(g.production.machines.map((m) => [m.id, m.name + ' çıkışı']));
    const m = this.ui.modal(`<div class="chooser"><h3>Çalışma alanı</h3>${opts.map(([v, n]) => `<button class="btn wide ${w.data.target === v ? 'green' : ''}" data-v="${v}">${n}</button>`).join('')}<button class="btn" data-act="modal:close">Kapat</button></div>`);
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { W.setTarget(w, b.dataset.v); m.close(); this.render(); } });
  }

  // ------------------------------------------------------------ İSTASYON
  stationView() {
    const g = this.game; const st = this.cur.station;
    if (st.type === 'machine') {
      const P = g.production;
      return `<div class="card"><div class="c-head">${ICONS[ITEM_ICON[st.def.output]]}<div><b>${ITEMS[st.def.input].name} ×${st.def.inCount} → ${ITEMS[st.def.output].name} ×${P.outCount(st)}</b><small>${st.working ? 'Çalışıyor' : st.inBuf.count < st.def.inCount ? 'Hammadde bekliyor' : st.outBuf.isFull() ? 'Çıkış dolu!' : 'Hazır'}</small></div></div>
        <div class="c-stats"><span>Giriş <b>${st.inBuf.count}/${st.inBuf.capacity}</b></span><span>Çıkış <b>${st.outBuf.count}/${st.outBuf.capacity}</b></span><span>Üretilen <b>${fmt(st.produced)}</b></span></div>
        <div class="r-bar"><i style="width:${st.working ? Math.min(100, (st.t / P.procTime(st)) * 100) : 0}%"></i></div></div>` + (st.stock ? this.woodSystemCard(st) : '') + this.machineRows(st);
    }
    if (st.type === 'belt') {
      const b = st.belt; const C = g.conveyors;
      return `<div class="card"><div class="c-head">${ICONS.conveyor}<div><b>${b.def.name}</b><small>Bant üzerinde ${b.items.length} ürün · ${C.speed(b).toFixed(1)} m/sn · ${C.lanes(b)} şerit · ${C.perMin(b)} ürün/dk</small></div></div></div>` +
        Object.entries(CONVEYOR_UPGRADES).map(([k, d]) => {
          const now = k === 'speed' ? `${C.speed(b).toFixed(1)} m/sn` : `${C.lanes(b)} şerit · kapasite ×${C.capLevel(b)} (${C.perMin(b)}/dk)`;
          b.up[k]++; const nx = k === 'speed' ? `${C.speed(b).toFixed(1)} m/sn` : `${C.lanes(b)} şerit · kapasite ×${C.capLevel(b)}`; const pm = C.perMin(b); b.up[k]--;
          const vis = k === 'speed' ? 'Bant kayışı hızlanır, her 4 seviyede motor eklenir' : 'İlk kademede bant 2 şeride genişler, sonra daha hızlı akar';
          return this.row({ icon: k === 'speed' ? 'bolt' : 'box', title: d.name, level: b.up[k] + 1, sub: `${d.desc}<br>Şimdi <b>${now}</b>${b.up[k] < d.max ? ` → Sonra <b>${nx}</b> (${pm}/dk)` : ''}<br><i>Görsel: ${vis}</i>`, cost: C.upgradeCost(b, k), act: `conv:up:${b.def.id}:${k}`, maxed: b.up[k] >= d.max });
        }).join('');
    }
    if (st.type === 'depot' || st.type === 'warehouse') return this.factory('storage');
    if (st.type === 'dock') return this.vehicles('trucks');
    if (st.type === 'office' || st.type === 'workers') return this.workers();
    if (st.type === 'garage') return this.vehicles('forklifts');
    return '';
  }

  /** Odun sistemi özeti: depo → testere → stok → dağıtım (ayrı genişletme düğmeleriyle) */
  woodSystemCard(saw) {
    const g = this.game; const P = g.production;
    const dep = g.sites.get('depot1');
    const perMin = P.perMin(saw);
    const lvl = 1 + saw.up.speed + saw.up.blades + saw.up.size;
    const dist = g.workers.list.filter((w) => (w.data.fac ?? null) === null && (w.data.role === 'carrier' || w.data.role === 'loader')).length;
    const status = saw.working ? 'Kesiyor' : saw.outBuf.isFull() ? 'Stok dolu — bekliyor' : saw.inBuf.count === 0 ? 'Kütük bekliyor' : 'Hazır';
    const depCost = dep ? g.storage.upgradeCost(dep) : 0, stCost = P.stockCost(saw);
    // darboğaz danışmanı: aşamaların dakikadaki gerçek kapasitesini karşılaştır
    const C = g.conveyors; const feedB = C.belts.get('c_depot_saw');
    const feed = feedB ? C.perMin(feedB) : 0;
    const sawLogs = Math.round(60 / P.procTime(saw) * P.batch(saw)); // testerenin dakikada kesebildiği kütük
    const trucks = g.trucks.perMin();
    const fill = saw.outBuf.count / saw.outBuf.capacity;
    let adv, act = null;
    const next = P.nextMachineFor('plank', null);
    if (fill >= 0.85) {
      // stok dolu: asıl darboğaz stoktan sonraki aşama
      if (next && !C.belts.has('c_saw_sander')) adv = `Stok dolu: kesilmiş odun ${next.name}'ne yetişmiyor. Stok → Zımpara Bandı'nı kur ya da taşıyıcı al.`;
      else if (next && next.inBuf.isFull()) { adv = `Stok dolu: ${next.name} yavaş. ${next.name}'ni geliştir.`; act = 'station:' + next.id; }
      else if (!next && trucks < perMin) { adv = `Stok dolu, kamyonlar yetişmiyor (${trucks}/dk sevk). Kamyon hızı / yükleme geliştir.`; act = 'open:vehicles:trucks'; }
      else adv = 'Stok dolu: stoku genişlet ya da dağıtımcı (taşıyıcı / yükleyici) al. Dağıtımcılar şu an hızlı çalışıyor.';
    } else if (dep && dep.buffer.count > 3 && feed < sawLogs * 0.8) { adv = `Depo çıkış bandı yavaş (${feed}/dk) — testere ${sawLogs} kütük/dk kesebilir. Bandı geliştir.`; act = 'beltp:c_depot_saw'; }
    else if (dep && dep.buffer.count > 3 && saw.inBuf.isFull() && sawLogs < feed) adv = `Testere yavaş (${sawLogs} kütük/dk) — bant ${feed}/dk getiriyor. Aşağıdan testereyi geliştir (hız / boyut).`;
    else if (dep && dep.buffer.isFull()) adv = 'Depo dolu: depoyu genişlet ya da testereyi hızlandır.';
    else if (dep && dep.buffer.count === 0 && !saw.working) adv = 'Depoda kütük yok: oduncu al ya da ormandan kütük getir.';
    else adv = 'Sistem dengeli çalışıyor.';
    return `<div class="card"><div class="c-head">${ICONS.saw || ICONS.axe}<div><b>Odun Sistemi</b><small>Orman → Depo → Testere → Stok → Dağıtım</small></div></div>
      <div class="c-stats"><span>Depoda kütük <b>${dep ? `${dep.buffer.count}/${dep.buffer.capacity}` : '-'}</b></span><span>Testere <b>Sv.${lvl} · ${status}</b></span></div>
      <div class="c-stats"><span>Üretim <b>${saw.working || saw.inBuf.count ? perMin : 0}/dk</b> (kapasite ${perMin}/dk)</span><span>Stok <b>${saw.outBuf.count}/${saw.outBuf.capacity}</b></span><span>Dağıtımcı <b>${dist}</b></span></div>
      <div class="c-stats"><span>Bant <b>${feed}/dk</b></span><span>Testere <b>${sawLogs} kütük/dk</b></span><span>Kamyon <b>${trucks}/dk</b></span></div>
      <div class="hint advice">${ICONS.bolt || ''} <b>Darboğaz:</b> ${adv}${act ? ` <button class="btn tiny green" data-act="${act}">Geliştir</button>` : ''}</div>
      <div class="btn-row">
        ${dep ? `<button class="btn ${g.state.money >= depCost ? 'green' : 'poor'}" data-act="up:depot:depot1">${ICONS.up}<span>Depoyu Genişlet</span>${ICONS.coin}<b>${fmt(depCost)}</b></button>` : ''}
        <button class="btn ${g.state.money >= stCost ? 'green' : 'poor'}" data-act="stockup:${saw.id}">${ICONS.up}<span>Stoku Genişlet</span>${ICONS.coin}<b>${fmt(stCost)}</b></button>
      </div></div>`;
  }

  // ------------------------------------------------------------ AYARLAR
  settings() {
    const g = this.game; const s = g.state.settings;
    const save = g.save.lastResult;
    const m = this.ui.modal(`<div class="settings"><h2>${ICONS.gear} Ayarlar</h2>
      <label class="set"><span>Müzik</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-set="music"></label>
      <label class="set"><span>Ses efektleri</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-set="sfx"></label>
      <div class="set"><span>Grafik kalitesi</span><div class="seg">${[['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek']].map(([k, n]) => `<button class="btn tiny ${s.quality === k ? 'on' : ''}" data-q="${k}">${n}</button>`).join('')}</div></div>
      <label class="set"><span>Titreşim</span><input type="checkbox" ${s.haptics ? 'checked' : ''} data-set="haptics"></label>
      <label class="set"><span>FPS göstergesi</span><input type="checkbox" ${s.showFps ? 'checked' : ''} data-set="showFps"></label>
      <div class="set-info cloud-info">${g.cloud?.status === 'ok' ? `<b>${g.cloud.displayName()}</b> · Oyuncu kimliği ${g.cloud.shortId()}` : g.cloud?.status === 'loading' ? 'Buluta bağlanıyor…' : 'Bulut bağlantısı yok (oyun çevrimdışı da oynanır)'}</div>
      ${g.cloud?.status === 'ok' && !g.state.cloud?.name ? `<button class="btn wide" data-x="pickname">Kullanıcı adı al</button>` : ''}
      <div class="set-info">Son kayıt: ${save?.ok ? new Date(save.at).toLocaleTimeString('tr-TR') + ` (#${save.n})` : '—'} · Sürüm 1.0.0</div>
      <div class="btn-row"><button class="btn green" data-x="save">Şimdi Kaydet</button><button class="btn" data-x="restore">Satın Alımları Geri Yükle</button></div>
      <button class="btn danger wide" data-x="reset">İlerlemeyi Sıfırla</button>
      ${g.cloud?.status === 'ok' ? `<button class="btn wide" data-x="clouddel">Bulut verilerimi sil</button>` : ''}
      <div class="set-info legal"><a href="https://feritbycn.github.io/woodempire/privacy.html" target="_blank" rel="noopener">Gizlilik Politikası</a> · <a href="https://feritbycn.github.io/woodempire/terms.html" target="_blank" rel="noopener">Kullanım Şartları</a></div>
      <button class="btn wide" data-act="modal:close">Kapat</button></div>`);
    m.addEventListener('input', (e) => {
      const k = e.target.dataset.set; if (!k) return;
      s[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
      g.audio.applyVolumes(); g.save.requestSave();
    });
    m.addEventListener('click', async (e) => {
      const q = e.target.closest('[data-q]');
      if (q) { g.setQuality(q.dataset.q); m.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('on', b === q)); g.save.requestSave(); }
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'save') { await g.save.save(); this.ui.toast('Oyun kaydedildi', 'success'); }
      if (x === 'restore') g.billing.restore();
      if (x === 'pickname') { m.close?.(); g.cloud.maybeAskName(true); }
      if (x === 'clouddel') {
        const c = this.ui.modal(`<div class="confirm"><h3>Bulut verilerin silinsin mi?</h3><p>Yönetim panelindeki oyuncu özetin ve kullanıcı adın silinir. Oyun ilerlemen bu telefonda kalır.</p><div class="btn-row"><button class="btn" data-act="modal:close">Vazgeç</button><button class="btn danger" data-y="1">Sil</button></div></div>`);
        c.querySelector('[data-y]').addEventListener('click', async () => { const ok = await g.cloud.deleteCloudData(); c.close?.(); m.close?.(); this.ui.toast(ok ? 'Bulut verilerin silindi' : 'Silinemedi, internet bağlantını kontrol et', ok ? 'success' : 'error'); });
      }
      if (x === 'reset') {
        const c = this.ui.modal(`<div class="confirm"><h3>Emin misin?</h3><p>Tüm ilerleme kalıcı olarak silinecek.</p><div class="btn-row"><button class="btn" data-act="modal:close">Vazgeç</button><button class="btn danger" data-y="1">Sıfırla</button></div></div>`);
        c.addEventListener('click', async (ev) => { if (ev.target.closest('[data-y]')) { g.ready = false; await g.save.reset(); location.reload(); } });
      }
    });
  }

  dailyLogin() {
    const g = this.game; const d = g.daily;
    const idx = d.loginIndex(); const r = LOGIN_REWARDS[idx];
    const m = this.ui.modal(`<div class="daily-pop"><div class="dp-title">${ICONS.gift} Günlük Ödül</div><div class="dp-day">${idx + 1}. Gün</div>
      <div class="login-row">${LOGIN_REWARDS.map((x, i) => `<div class="login-day ${i < idx ? 'got' : ''} ${i === idx ? 'today' : ''} ${x.special ? 'special' : ''}"><small>${i + 1}</small>${ICONS[x.gold ? 'gold' : x.boost ? 'bolt' : 'coin']}</div>`).join('')}</div>
      <div class="dp-rew">${r.label}</div>
      <div class="btn-row"><button class="btn green" data-d="1">Al</button><button class="btn" data-d="2">${ICONS.play} 2 Katı</button></div></div>`, { sticky: true });
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      let dbl = false;
      if (b.dataset.d === '2') dbl = await g.ads.showRewarded('daily');
      d.claimLogin(dbl); m.close();
    });
    return m;
  }

  // ------------------------------------------------------------ EYLEMLER
  action(act) {
    const g = this.game;
    const p = act.split(':');
    const ok = (r) => { if (r !== false) this.render(); };
    switch (p[0]) {
      case 'noop': return;
      case 'up':
        if (p[1] === 'player') return ok(g.player.upgrade(p[2]));
        if (p[1] === 'machine') return ok(g.factory.upgrade(g.sites.get(p[2]), p[3]));
        if (p[1] === 'depot') return ok(g.storage.upgrade(g.sites.get(p[2])));
        return;
      case 'station': return this.station(g.sites.get(p[1]));
      case 'beltp': { const b = g.conveyors.belts.get(p[1]); if (b) this.belt(b); return; }
      case 'land':
        if (p[1] === 'buy') { if (g.land.buy(+p[2])) { this.close(); this.ui.showPrompt(null); } return; }
        if (p[1] === 'go') { const z = g.land.zoneDef(+p[2]); g.cameraRig.focus((z.rect.x0 + z.rect.x1) / 2, (z.rect.z0 + z.rect.z1) / 2, 2.5); this.close(); return; }
        return;
      case 'goto': g.cameraRig.focus(+p[1], +p[2], 2.5); this.close(); return;
      case 'build': if (g.construction.build(p[1])) this.ui.showPrompt(null); return;
      case 'stockup': return ok(g.production.expandStock(g.sites.get(p[1])));
      case 'expand': { const pad = this.ui.promptPad; if (!pad?.data?.expand) return; const r = pad.data.expand().run(); this.ui.showPrompt(pad); return ok(r); }
      case 'conv': if (p[1] === 'buy') { const r = g.conveyors.buy(p[2]); if (r) this.ui.showPrompt(null); return ok(r); } return ok(g.conveyors.upgrade(p[2], p[3]));
      case 'truck':
        if (p[1] === 'tier') return ok(g.trucks.buyTier(+p[2]));
        if (p[1] === 'up') return ok(g.trucks.upgrade(p[2]));
        if (p[1] === 'send') return ok(g.trucks.send(g.sites.get(p[2])));
        return;
      case 'fork':
        if (p[1] === 'buy') return ok(g.vehicles.buy());
        if (p[1] === 'up') return ok(g.vehicles.upgrade(p[2]));
        if (p[1] === 'mode') return ok(g.vehicles.setMode(g.vehicles.list[+p[2]], p[3]));
        return;
      case 'worker':
        if (p[1] === 'hire') return ok(g.workers.hire(p[2] === 'worker' ? g.workers.defaultRole(null) : p[2]));
        if (p[1] === 'up') return ok(g.workers.upgrade(p[2]));
        if (p[1] === 'role') return ok(g.workers.setRole(g.workers.list[+p[2]], p[3]));
        if (p[1] === 'area') return this.workerArea(+p[2]);
        if (p[1] === 'filter') { this.workerFilter = p[2]; return this.render(); }
        if (p[1] === 'smart') {
          g.state.smartLogistics = !g.state.smartLogistics;
          if (!g.state.smartLogistics) for (const m of g.production.machines) m.throttle = false;
          g.bus.emit('toast', { text: `Akıllı lojistik ${g.state.smartLogistics ? 'AÇIK' : 'KAPALI'}`, type: 'success' });
          g.save.requestSave(); return this.render();
        }
        if (p[1] === 'auto') {
          g.state.autoAssign = !g.state.autoAssign;
          const back = g.state.autoAssign ? 0 : g.workers.restoreRoles(); // kapatınca herkes asıl görevine döner
          g.bus.emit('toast', { text: g.state.autoAssign ? 'Otomatik iş dağılımı AÇIK' : `Otomatik iş dağılımı KAPALI${back ? ` — ${back} işçi asıl görevine döndü` : ''}`, type: 'success' });
          g.save.requestSave(); return this.render();
        }
        return;
      case 'shop':
        if (p[1] === 'boost') return g.shop.buyBoost(p[2], p[3]).then(() => this.render());
        if (p[1] === 'gold') return ok(g.shop.buyGoldItem(p[2]));
        if (p[1] === 'skin') return ok(g.shop.buySkin(p[2]));
        if (p[1] === 'iap') return g.billing.buy(p[2]);
        if (p[1] === 'ad') return g.shop.adReward(p[2]).then(() => this.render());
        if (p[1] === 'restore') return g.billing.restore();
        return;
      case 'daily':
        if (p[1] === 'claim') return ok(g.daily.claimLogin(false));
        if (p[1] === 'claim2') return g.ads.showRewarded('daily').then((d) => { g.daily.claimLogin(d); this.render(); });
        return;
      case 'quest':
        if (p[1] === 'all') return ok(g.daily.claimAllQuests());
        return ok(g.daily.claimQuest(p[2]));
      case 'ach':
        if (p[1] === 'all') return ok(g.missions.claimAllAchievements());
        return ok(g.missions.claimAchievement(p[2]));
    }
  }
}
