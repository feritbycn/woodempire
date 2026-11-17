import * as THREE from 'three';
import { ICONS, ITEM_ICON } from './icons.js';
import { fmt } from '../systems/MissionSystem.js';
import { Panels } from './Panels.js';
import { WorldLabels } from './WorldLabels.js';
import { Capacitor } from '@capacitor/core';
import { xpGainMul, xpForLevel, OFFLINE, BOOSTS, WORKER_ROLES } from '../config/balance.js';
import { DWELL_T } from '../systems/PlayerController.js';
import { LOGIN_REWARDS } from '../systems/DailyRewardSystem.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/** Oyun arayüzü: HUD, joystick, eylem düğmeleri, alt menü, bildirimler, modallar */
export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.build();
    this.panels = new Panels(game, this);
    this.labels = new WorldLabels(game, this);
    this.bind();
    this.buildGuideArrow();
    this.shown = { money: game.state.money, gold: game.state.gold };
    this.lastHud = 0;
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <div id="hud-top">
        <div class="res-row">
          <div class="pill money" id="pill-money">${ICONS.coin}<span id="money">0</span></div>
          <div class="pill gold" id="pill-gold">${ICONS.gold}<span id="gold">0</span><button class="plus" data-act="open:shop" aria-label="Altın al">+</button></div>
          <button class="round" id="btn-settings" aria-label="Ayarlar">${ICONS.gear}</button>
        </div>
        <div class="lvl-row">
          <div class="lvl-badge"><small>SV</small><span id="lvl">1</span></div>
          <div class="xpbar"><div class="fill" id="xp-fill"></div><span id="xp-text">0 / 0 XP</span></div>
        </div>
        <button class="mission-card" id="mission-card" data-act="open:missions">
          <div class="m-ico">${ICONS.list}</div>
          <div class="m-body"><div class="m-title" id="m-title">…</div><div class="m-bar"><div class="fill" id="m-fill"></div></div></div>
          <div class="m-count" id="m-count"></div>
        </button>
        <div class="boosts" id="boosts"></div>
      </div>
      <div id="world-layer"></div>
      <div id="dwell" class="hidden"><svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18"/></svg><span></span></div>
      <button id="ad-offer" class="ad-offer hidden" aria-label="Reklam izle, ödül kazan">
        <svg class="ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29"/></svg>
        <span class="ao-ico"></span><span class="ao-name"></span><span class="ao-dur"></span><span class="ao-tag">REKLAM</span>
      </button>
      <div id="joy-zone"></div>
      <div id="joy-base"><div id="joy-knob"></div></div>
      <div id="cam-ctrl">
        <button class="mini" data-act="cam:l" aria-label="Sola döndür">${ICONS.rotL}</button>
        <button class="mini" data-act="cam:r" aria-label="Sağa döndür">${ICONS.rotR}</button>
        <button class="mini" data-act="cam:in" aria-label="Yakınlaştır">${ICONS.zoomIn}</button>
        <button class="mini" data-act="cam:out" aria-label="Uzaklaştır">${ICONS.zoomOut}</button>
      </div>
      <div id="carry-chip"><span id="carry-ico"></span><b id="carry-n">0/2</b></div>
      <div id="prompt" class="hidden"></div>
      <div id="actions">
        <button class="act main hidden" id="act-main"><span class="ico">${ICONS.truck}</span><span class="lbl">Gönder</span></button>
      </div>
      <nav id="bottom-bar">
        <button class="toggle" id="bar-toggle" aria-label="Menüyü gizle/göster">${ICONS.chevDown}</button>
        <div class="tabs">
          ${[
            ['upgrades', 'up', 'Geliştirme'], ['missions', 'list', 'Görevler'], ['land', 'map', 'Arazi'], ['shop', 'cart', 'Mağaza'],
            ['vehicles', 'truck', 'Araçlar'], ['workers', 'worker', 'İşçiler'], ['factory', 'factory', 'Fabrika'],
          ].map(([id, ic, n]) => `<button class="tab" data-act="open:${id}" id="tab-${id}">${ICONS[ic]}<span>${n}</span><i class="badge hidden"></i></button>`).join('')}
        </div>
      </nav>
      <section id="sheet" class="sheet hidden" role="dialog">
        <header class="sheet-head"><div class="sheet-title" id="sheet-title"></div><button class="round close" data-act="close">${ICONS.close}</button></header>
        <div class="sheet-tabs" id="sheet-tabs"></div>
        <div class="sheet-body" id="sheet-body"></div>
      </section>
      <div id="toasts"></div>
      <div id="banner" class="hidden"></div>
      <div id="modal-root"></div>
      <div id="edge-arrow" class="hidden">▲</div>
      <div id="fps" class="hidden"></div>
    `;
  }

  bind() {
    const g = this.game;
    g.input.attach($('#joy-zone'), $('#joy-base'), $('#joy-knob'));
    // delegeli tıklama
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      g.audio.play('click', { vol: 0.5 });
      this.handle(el.dataset.act, el);
    });
    $('#btn-settings').onclick = () => { g.audio.play('click'); this.panels.settings(); };
    $('#bar-toggle').onclick = () => { this.root.classList.toggle('bar-hidden'); $('#bar-toggle').innerHTML = this.root.classList.contains('bar-hidden') ? ICONS.chevUp : ICONS.chevDown; };
    $('#act-main').onclick = () => {
      // Oyuncunun ekranda gördüğü eylemi çalıştır; çift dokunuşta ikinci eylem (ör. Gönder → Yönet paneli) tetiklenmesin
      const now = performance.now();
      if (now - (this._actT || 0) < 350) return;
      this._actT = now;
      g.audio.play('click');
      (this._shownAction || this.contextAction())?.run();
      this._shownAction = null; $('#act-main')._k = null;
    };

    // olaylar
    // bildirim tekilleştirme: aynı uyarı (aynı sorun devam ettiği sürece) art arda tekrar gösterilmez
    this._toastSeen = new Map();
    g.bus.on('toast', ({ text, type }) => {
      if (type === 'error' || g.state.smartLogistics) {
        const last = this._toastSeen.get(text), now = performance.now();
        this._toastSeen.set(text, now);
        if (last && now - last < (g.state.smartLogistics ? 12000 : 2500)) return;
        if (this._toastSeen.size > 60) this._toastSeen.clear();
      }
      this.toast(text, type);
    });
    g.bus.on('prompt', (pad) => this.showPrompt(pad));
    g.bus.on('adOffer', (o) => this.showAdOffer(o));
    $('#ad-offer').onclick = () => { g.audio.play('click'); g.adOffers.claim(); };
    g.bus.on('upgradePad', (st) => {
      if (st) { this.panels.station(st); this._padPanel = st; }
      else if (this._padPanel && this.panels.cur?.station === this._padPanel) { this.panels.close(); this._padPanel = null; }
      else this._padPanel = null;
    });
    g.bus.on('missionComplete', (m) => this.missionDone(m));
    g.bus.on('levelUp', (e) => this.levelUp(e));
    g.bus.on('banner', (b) => this.banner(b.title, b.text));
    // geçiş reklamı yalnızca doğal aralarda (kurallar AdsManager.interAllowed içinde)
    g.bus.on('levelUp', () => g.ads.maybeInterstitial('levelUp'));
    g.bus.on('zoneBought', () => g.ads.maybeInterstitial('zone'));
    g.bus.on('money', (e) => { if (e.at && e.amount > 0) this.labels.floater(e.at, `+${fmt(e.amount)}`, e.source === 'sale' ? 'money big' : 'money'); if (e.source === 'sale') this.coinBurst(e.at); this.bump('#pill-money'); });
    g.bus.on('gold', (e) => { if (e.amount > 0) this.bump('#pill-gold'); });
    g.bus.on('xp', (e) => { if (e.at) this.labels.floater(e.at, `+${e.amount} XP`, 'xp'); });
    g.bus.on('devAd', (resolve) => this.devAd(resolve));
    g.bus.on('haptic', (k) => this.haptic(k));
    g.bus.on('badges', () => this.updateBadges());
    g.bus.on('frame', () => this.frame());
    g.every(0.5, () => { this.updateBadges(); this.panels.refreshIfOpen(); });
  }

  handle(act, el) {
    const g = this.game;
    const [cmd, arg, arg2] = act.split(':');
    switch (cmd) {
      case 'open': this.panels.open(arg, arg2); break;
      case 'prompt': {
        const pad = this.promptPad; if (!pad) break;
        const ok = pad.mode === 'hire' ? g.workers.hireFromPad(pad) : g.animals.buyFromPad(pad);
        this.showPrompt(ok ? pad : pad); // yeni fiyatla yenile
        break;
      }
      case 'close': this.panels.close(); break;
      case 'cam':
        if (arg === 'l') g.cameraRig.rotate(-1); else if (arg === 'r') g.cameraRig.rotate(1);
        else if (arg === 'in') g.cameraRig.zoom(-0.15); else g.cameraRig.zoom(0.15);
        break;
      default: this.panels.action(act, el);
    }
  }

  // ---------------- HUD ----------------
  showAdOffer(o) {
    const el = $('#ad-offer');
    if (!o) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden', 'left', 'right'); el.classList.add(o.side);
    el.querySelector('.ao-ico').innerHTML = ICONS[o.def.icon] || ICONS.gift;
    el.querySelector('.ao-name').textContent = o.def.name;
    el.querySelector('.ao-dur').textContent = o.dur >= 120 ? '2 dk' : '1 dk';
  }
  frame() {
    const g = this.game, s = g.state;
    // alan üzerinde bekleme halkası (seçenek kartı açılana kadar)
    const pl = g.player, dw = $('#dwell');
    if (pl.dwellPad && !pl.dwellDone && pl.dwellT > 0.05) {
      const sp = this.labels.project(pl.pos.x, 3.1, pl.pos.z);
      if (sp) {
        dw.classList.remove('hidden');
        dw.style.transform = `translate(${sp.x}px,${sp.y}px) translate(-50%,-100%)`;
        dw.querySelector('.fg').style.strokeDashoffset = 113.1 * (1 - pl.dwellT / DWELL_T);
        dw.querySelector('span').textContent = Math.ceil(DWELL_T - pl.dwellT);
      }
    } else dw.classList.add('hidden');
    const off = g.adOffers.cur;
    if (off) { const c = $('#ad-offer .ring circle'); const len = 182.2; c.style.strokeDasharray = len; c.style.strokeDashoffset = len * (1 - off.left / off.total); }
    // para/altın sayaçları yumuşak artar
    this.shown.money += (s.money - this.shown.money) * 0.18;
    if (Math.abs(s.money - this.shown.money) < 1) this.shown.money = s.money;
    this.shown.gold += (s.gold - this.shown.gold) * 0.25;
    if (Math.abs(s.gold - this.shown.gold) < 1) this.shown.gold = s.gold;
    this.setText('#money', fmt(this.shown.money));
    this.setText('#gold', fmt(this.shown.gold));
    const now = performance.now();
    if (now - this.lastHud > 120) {
      this.lastHud = now;
      this.setText('#lvl', s.level);
      $('#xp-fill').style.width = (g.levels.progress * 100).toFixed(1) + '%';
      this.setText('#xp-text', `${fmt(s.xp)} / ${fmt(g.levels.need)} XP`);
      const mv = g.missions.view();
      this.setText('#m-title', mv.title || '');
      $('#m-fill').style.width = Math.min(100, (mv.value / mv.target) * 100) + '%';
      const mc = mv.money ? `${ICONS.coin}<span>${fmt(Math.floor(mv.value))}/${fmt(mv.target)}</span>` : (mv.target > 1 ? `${fmt(mv.value)}/${fmt(mv.target)}` : mv.value >= 1 ? '✓' : '');
      const mce = $('#m-count'); if (mce._h !== mc) { mce._h = mc; mce.innerHTML = mc; mce.classList.toggle('money', !!mv.money); }
      const p = g.player;
      this.setText('#carry-n', `${p.stack.count}/${p.stack.capacity}`);
      const top = p.stack.items[p.stack.items.length - 1];
      const ik = top ? ITEM_ICON[top.kind] : 'log';
      if (this._carryIco !== ik) { this._carryIco = ik; $('#carry-ico').innerHTML = ICONS[ik]; }
      $('#carry-chip').classList.toggle('full', p.stack.isFull());
      this.updateBoosts();
      this.updateMainAction();
      if (s.settings.showFps) { $('#fps').classList.remove('hidden'); $('#fps').textContent = `${g.fps} FPS · ${g.renderer.info.render.calls} çizim`; }
      else $('#fps').classList.add('hidden');
    }
    this.labels.update();
    this.updateGuide();
    g.audio.updateLoops();
  }
  setText(sel, v) { const el = typeof sel === 'string' ? $(sel) : sel; const t = String(v); if (el && el.textContent !== t) el.textContent = t; }
  bump(sel) { const el = $(sel); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  cooldown(sel, cd, max, active) {
    const el = $(sel); const i = el.querySelector('.cd');
    i.style.height = (cd > 0 ? (cd / max) * 100 : 0) + '%';
    el.classList.toggle('active', active);
  }
  updateBoosts() {
    const g = this.game;
    const html = Object.keys(BOOSTS).filter((b) => b !== 'truck' && g.economy.boostActive(b)).map((b) => {
      const r = Math.ceil(g.economy.boostRemaining(b));
      return `<div class="boost-chip">${ICONS[BOOSTS[b].icon] || ICONS.bolt}<span>${BOOSTS[b].name}</span><b>${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}</b></div>`;
    }).join('');
    const el = $('#boosts'); if (el._h !== html) { el._h = html; el.innerHTML = html; }
  }
  updateBadges() {
    const g = this.game;
    const set = (id, n) => { const b = $(`#tab-${id} .badge`); if (!b) return; b.classList.toggle('hidden', !n); b.textContent = n > 9 ? '9+' : n; };
    set('missions', g.daily.claimableCount() + g.missions.claimableCount());
    set('land', g.land.list().filter((z) => z.status.ok).length);
    const p = g.player; const cheapest = Math.min(...['speed', 'capacity', 'chop', 'power', 'collect'].map((k) => p.upgradeCost(k)));
    set('upgrades', g.state.money >= cheapest ? 1 : 0);
  }

  // ---------------- Bağlamsal eylem düğmesi ----------------
  contextAction() {
    const g = this.game; const p = g.player;
    const pad = p.promptPad;
    if (pad?.mode === 'buy') return { label: 'Satın Al', icon: 'coin', run: () => g.land.buy(pad.data.zoneId), hot: g.land.status(pad.data.zoneId).ok };
    if (pad?.mode === 'build' && pad.data.conveyor) return { label: 'Bandı Kur', icon: 'conveyor', run: () => { if (g.conveyors.buy(pad.data.conveyor.id)) this.showPrompt(null); }, hot: g.economy.canAfford(pad.data.conveyor.cost) && g.state.level >= (pad.data.conveyor.level || 0) };
    if (pad?.mode === 'build' && pad.data.expand) { const E = pad.data.expand(); return { label: 'Genişlet', icon: 'up', run: () => { E.run(); this.showPrompt(pad); }, hot: !E.maxed && g.economy.canAfford(E.cost) }; }
    if (pad?.mode === 'build') return { label: 'İnşa Et', icon: 'hammer', run: () => g.construction.build(pad.data.site.id), hot: g.economy.canAfford(pad.data.site.cost) };
    // yakındaki istasyon
    let best = null, bd = 5.5;
    for (const st of g.sites.values()) {
      const d = Math.hypot(st.x - p.pos.x, st.z - p.pos.z);
      if (d < bd) { bd = d; best = st; }
    }
    if (best?.type === 'dock') {
      const tr = g.trucks.atDock(best);
      if (tr && tr.load.length > 0) return { label: 'Gönder', icon: 'truck', run: () => g.trucks.send(best), hot: true };
      return { label: 'Yönet', icon: 'truck', run: () => this.panels.station(best) };
    }
    if (best?.type === 'machine') return { label: 'Geliştir', icon: 'up', run: () => this.panels.station(best) };
    if (best) return { label: 'Yönet', icon: best.type === 'machine' ? 'factory' : best.type === 'office' ? 'worker' : best.type === 'garage' ? 'forklift' : 'box', run: () => this.panels.station(best) };
    if (g.trees.nearestStanding(p.pos.x, p.pos.z, 2.3)) return { label: 'Kes', icon: 'axe', run: () => { p.chopHeld = true; setTimeout(() => (p.chopHeld = false), 900); } };
    return { label: 'Etkileşim', icon: 'hand', run: () => this.toast('Yakında etkileşim yok — bir ağaca, makineye veya alana yaklaş', 'info'), dim: true };
  }
  updateMainAction() {
    const a = this.contextAction();
    this._shownAction = a;
    const el = $('#act-main');
    // Kesme, toplama ve alan etkileşimleri otomatik; ekranda yalnızca kamyonu erken gönderme düğmesi kalır
    el.classList.toggle('hidden', a.label !== 'Gönder');
    const key = a.label + a.icon + !!a.hot + !!a.dim;
    if (el._k === key) return; el._k = key;
    el.querySelector('.ico').innerHTML = ICONS[a.icon];
    el.querySelector('.lbl').textContent = a.label;
    el.classList.toggle('hot', !!a.hot); el.classList.toggle('dim', !!a.dim);
  }

  showPrompt(pad) {
    const el = $('#prompt');
    if (!pad) { el.classList.add('hidden'); return; }
    const g = this.game;
    const L = pad.label();
    let status = '';
    if (pad.mode === 'buy') { const st = g.land.status(pad.data.zoneId); status = st.ok ? '' : st.reason; }
    else if (L.level && g.state.level < L.level) status = `Seviye ${L.level} gerekli`;
    else if (!g.economy.canAfford(L.price)) status = 'Yetersiz para';
    this.promptPad = pad;
    if (pad.mode === 'hire' || pad.mode === 'animal') {
      // işçi / hayvan: para yalnızca düğmeye basınca çekilir; kart açık kalır, istersen tekrar alırsın
      const fac = pad.data?.fac ?? null;
      const full = pad.mode === 'hire' ? !g.workers.canHire(fac) : L.count >= L.max;
      const st2 = full ? (pad.mode === 'hire' ? `Kapasite dolu (${g.workers.countAll(fac)}/${g.workers.maxWorkers(fac)}) — İşçi Sayısı yükselt` : 'Ağıl dolu')
        : L.level && g.state.level < L.level ? `Seviye ${L.level} gerekli` : !g.economy.canAfford(L.price) ? 'Yetersiz para' : '';
      const ico = pad.mode === 'hire' ? ICONS.worker : ICONS[g.animals.zones.get(pad.data.zone).def.farm.type];
      // darboğaz varken taşıma işçisi almak işe yaramaz: önce makineyi geliştir
      const jam = pad.mode === 'hire' ? g.production.bottleneckIn(fac) : null;
      const bn = jam ? `${jam.name.split(' · ').pop()} yetişemiyor: işçi yerine önce makineyi geliştir` : '';
      const prole = pad.data?.role && pad.data.role !== 'worker' ? pad.data.role : g.workers.defaultRole(fac);
      const desc = pad.mode === 'hire' ? `<b>${g.workers.roleTitle(prole, fac)}</b>: ${WORKER_ROLES[prole].desc}. Görevini sonra İşçiler menüsünden değiştirebilirsin.` : `Ağılda ${L.count}/${L.max}. Her hayvan daha çok ürün ve daha çok yem ihtiyacı demek.`;
      el.innerHTML = `<div class="p-title">${ico}<span>${L.title}${pad.mode === 'hire' && L.count ? ` · ${L.count} kişi` : ''}</span></div>
        <div class="p-desc">${desc}</div>
        <button class="btn buy ${st2 ? 'disabled' : ''}" data-act="prompt:go">${ICONS.coin}<b>${fmt(L.price)}</b><span>${pad.mode === 'hire' ? 'İşe Al' : 'Satın Al'}</span></button>
        ${st2 ? `<div class="p-warn">${st2}</div>` : ''}${bn ? `<div class="p-warn">${bn}</div>` : ''}`;
      el.classList.remove('hidden');
      return;
    }
    if (pad.data?.expand) {
      const E = pad.data.expand();
      el.innerHTML = `<div class="p-title">${ICONS.up}<span>${E.name} · ${E.title || 'Genişlet'}</span></div>
        <div class="p-desc">${E.desc || `${E.what[0].toUpperCase() + E.what.slice(1)}: <b>${E.count}/${E.cap}</b>${E.count >= E.cap ? ' — DOLU' : ''}. Genişletince +${E.step} yer açılır, alan büyür.`}</div>
        <button class="btn buy ${E.maxed || !g.economy.canAfford(E.cost) ? 'disabled' : ''}" data-act="expand:go">${ICONS.coin}<b>${E.maxed ? 'MAKS' : fmt(E.cost)}</b><span>${E.title ? 'Yükselt' : 'Genişlet'}</span></button>`;
      el.classList.remove('hidden');
      return;
    }
    const act = pad.mode === 'buy' ? 'land:buy:' + pad.data.zoneId : pad.data.conveyor ? 'conv:buy:' + pad.data.conveyor.id : 'build:' + pad.data.site.id;
    el.innerHTML = `<div class="p-title">${pad.mode === 'buy' ? ICONS.map : pad.data.conveyor ? ICONS.conveyor : ICONS.hammer}<span>${L.title}</span></div>
      ${pad.data.conveyor ? '<div class="p-desc">Depodaki kütükleri testereye kendiliğinden taşır.</div>' : ''}
      ${pad.mode === 'buy' ? `<div class="p-desc">${g.land.zoneDef(pad.data.zoneId).desc || ''}</div>` : ''}
      <button class="btn buy ${status ? 'disabled' : ''}" data-act="${act}">${ICONS.coin}<b>${fmt(L.price)}</b><span>${pad.mode === 'buy' ? 'Satın Al' : pad.data.conveyor ? 'Bandı Kur' : 'İnşa Et'}</span></button>
      ${status ? `<div class="p-warn">${status}</div>` : ''}`;
    el.classList.remove('hidden');
  }

  // ---------------- Rehber ok ----------------
  buildGuideArrow() {
    const g = this.game;
    const grp = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xff5252, emissive: 0xff1744, emissiveIntensity: 0.45, flatShading: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 4), m); cone.rotation.x = Math.PI; grp.add(cone);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.32), m); shaft.position.y = 0.8; grp.add(shaft);
    g.scene.add(grp);
    this.arrow3d = grp;
    // oyuncunun etrafında hedefi gösteren zemin oku
    const tri = new THREE.Shape(); tri.moveTo(0, 0.9); tri.lineTo(0.55, 0); tri.lineTo(0.2, 0); tri.lineTo(0.2, -0.6); tri.lineTo(-0.2, -0.6); tri.lineTo(-0.2, 0); tri.lineTo(-0.55, 0); tri.closePath();
    const ga = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.85, depthWrite: false }));
    ga.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group(); holder.add(ga); ga.position.z = -1.9;
    g.scene.add(holder);
    this.groundArrow = holder;
  }
  updateGuide() {
    const g = this.game;
    const t = g.missions.guideTarget();
    const p = g.player.pos;
    if (!t) { this.arrow3d.visible = false; this.groundArrow.visible = false; $('#edge-arrow').classList.add('hidden'); return; }
    this.arrow3d.visible = true;
    this.arrow3d.position.set(t.x, (t.y ?? 2) + Math.abs(Math.sin(g.time * 3)) * 0.5 + 0.4, t.z);
    this.arrow3d.rotation.y = g.time * 2;
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    this.groundArrow.visible = d > 4.5;
    this.groundArrow.position.set(p.x, 0.07, p.z);
    this.groundArrow.rotation.y = Math.atan2(t.x - p.x, t.z - p.z) + Math.PI;
    // ekran dışındaysa kenar oku
    const v = new THREE.Vector3(t.x, t.y ?? 2, t.z).project(g.camera);
    const off = v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95;
    const ea = $('#edge-arrow');
    if (off) {
      const W = window.innerWidth, H = window.innerHeight;
      let x = v.x, y = v.y; if (v.z > 1) { x = -x; y = -y; }
      const k = 0.85 / Math.max(Math.abs(x), Math.abs(y));
      x *= k; y *= k;
      ea.style.left = ((x + 1) / 2) * W + 'px'; ea.style.top = ((1 - y) / 2) * H + 'px';
      ea.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(x, y)}rad)`;
      ea.classList.remove('hidden');
    } else ea.classList.add('hidden');
  }

  // ---------------- Bildirimler ----------------
  toast(text, type = 'info') {
    const box = $('#toasts');
    if ([...box.children].some((c) => c.textContent === text)) return;
    const el = h(`<div class="toast ${type}">${text}</div>`);
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2400);
  }
  banner(title, text) {
    const el = $('#banner');
    el.innerHTML = `<div class="b-title">${title}</div><div class="b-text">${text}</div>`;
    el.classList.remove('hidden', 'out'); void el.offsetWidth; el.classList.add('in');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.classList.add('hidden'), 500); }, 3200);
  }
  missionDone(m) {
    const r = m.reward || {};
    const parts = [];
    if (r.money) parts.push(`${ICONS.coin} ${fmt(r.money)}`);
    if (r.gold) parts.push(`${ICONS.gold} ${r.gold}`);
    if (r.xp) parts.push(`${r.xp} XP`);
    const el = h(`<div class="mission-done"><div class="md-head">${ICONS.check} GÖREV TAMAMLANDI</div><div class="md-title">${m.title}</div><div class="md-rew">${parts.join(' · ')}</div></div>`);
    this.root.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 2400);
  }
  levelUp(e) {
    // aynı anda birden fazla seviye atlanırsa tek pencere güncellenir (pencere yığılmaz)
    if (this._luModal && this._luModal.isConnected) {
      this._luTotal.money += e.reward.money; this._luTotal.gold += e.reward.gold;
      const m = this._luModal;
      m.querySelector('.lu-num').textContent = e.level;
      m.querySelector('.lu-rew').innerHTML = `<span>${ICONS.coin} +${fmt(this._luTotal.money)}</span><span>${ICONS.gold} +${this._luTotal.gold}</span>`;
      return;
    }
    this._luTotal = { money: e.reward.money, gold: e.reward.gold };
    const un = e.unlocks.length ? `<div class="lu-unlocks">${e.unlocks.map((u) => `<div>${ICONS.lock} ${u} açılabilir</div>`).join('')}</div>` : '';
    this._luModal = this.modal(`<div class="levelup">
      <div class="lu-burst"></div>
      <div class="lu-label">SEVİYE ATLADIN!</div>
      <div class="lu-num">${e.level}</div>
      <div class="lu-rew"><span>${ICONS.coin} +${fmt(e.reward.money)}</span><span>${ICONS.gold} +${e.reward.gold}</span></div>
      ${un}
      <button class="btn green big" data-act="modal:close">Harika!</button></div>`, { cls: 'lu-modal' });

  }

  coinBurst(at) {
    const v = new THREE.Vector3(at.x, at.y, at.z).project(this.game.camera);
    const sx = ((v.x + 1) / 2) * window.innerWidth, sy = ((1 - v.y) / 2) * window.innerHeight;
    const target = $('#pill-money').getBoundingClientRect();
    for (let i = 0; i < 8; i++) {
      const c = h(`<div class="fly-coin">${ICONS.coin}</div>`);
      c.style.left = sx + (Math.random() - 0.5) * 60 + 'px'; c.style.top = sy + (Math.random() - 0.5) * 40 + 'px';
      this.root.appendChild(c);
      setTimeout(() => {
        c.style.transition = `left .7s cubic-bezier(.5,-0.3,.7,1) ${i * 0.04}s, top .7s cubic-bezier(.3,0,.7,1) ${i * 0.04}s, opacity .2s ${0.6 + i * 0.04}s`;
        c.style.left = target.left + 14 + 'px'; c.style.top = target.top + 6 + 'px'; c.style.opacity = '0';
      }, 30);
      setTimeout(() => c.remove(), 1300);
    }
  }

  // ---------------- Modallar ----------------
  modal(html, opts = {}) {
    const root = $('#modal-root');
    const el = h(`<div class="modal-wrap ${opts.cls || ''}"><div class="modal">${html}</div></div>`);
    root.appendChild(el);
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); opts.onClose?.(); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (e.target === el && !opts.sticky) el.close();
      if (b?.dataset.act === 'modal:close') el.close();
    });
    el.close = close;
    return el;
  }

  /** Web/dev ortamı için açıkça etiketli reklam simülasyonu (gerçek cihazda AdMob kullanılır) */
  devAd(resolve) {
    let left = 3, done = false, iv = 0;
    const finish = (v) => { if (done) return; done = true; clearInterval(iv); resolve(v); };
    const m = this.modal(`<div class="devad"><div class="devad-tag">ÖNİZLEME — REKLAM SİMÜLASYONU</div><p>Android sürümünde burada Google AdMob ödüllü reklamı gösterilir. Ödül, sayaç bitince verilir.</p><div class="devad-count" id="devad-c">${left}</div><button class="btn" data-act="modal:close" id="devad-skip">Vazgeç</button></div>`, { sticky: true, cls: 'devad-modal', onClose: () => finish(false) });
    iv = setInterval(() => {
      left--; const c = m.querySelector('#devad-c'); if (c) c.textContent = left;
      if (left <= 0) { m.querySelector('#devad-skip')?.remove(); finish(true); m.close(); }
    }, 1000);
  }

  haptic(kind) {
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light })).catch(() => {});
    } else if (navigator.vibrate && kind !== 'light') navigator.vibrate(kind === 'heavy' ? 30 : 15);
  }

  // ---------------- Açılış akışı ----------------
  startupFlow(offlineSec) {
    const g = this.game;
    const steps = [];
    if (!this.resumeWatched) { this.resumeWatched = true; this.watchResume(); }
    if (g.fresh) steps.push(() => this.welcome());
    const off = this.offlineCalc(offlineSec);
    if (off) steps.push(() => this.offline(off.amount, off.sec, off.xp));
    if (!g.fresh && g.daily.canClaimLogin()) steps.push(() => this.panels.dailyLogin());
    // modallar sırayla gösterilir: biri kapanınca sonraki açılır
    const run = () => { const s = steps.shift(); if (!s) return; const m = s(); if (m) { const orig = m.close; m.close = () => { orig(); setTimeout(run, 300); }; } };
    run();
  }
  /** Uzakta geçen süreye göre kazanç. Hem oyun kapatılıp açılınca hem de arka plandan dönünce kullanılır. */
  offlineCalc(offlineSec) {
    const g = this.game, s = g.state;
    if (g.cloud?.banActive?.(s.ban)) return null; // askıdaki hesap kazanç almaz
    if (!(offlineSec > 120) || !(s.autoRate > 0.05 || s.autoXpRate > 0.001)) return null;
    const sec = Math.min(offlineSec, OFFLINE.maxSeconds);
    const amount = Math.round(sec * s.autoRate * OFFLINE.factor);
    // XP: makinelerin/kamyonların oyun açıkken kazandırdığı hız × xpFactor; seviyenin belli bir oranını geçmez
    let xp = sec * (s.autoXpRate || 0) * OFFLINE.xpFactor;
    const mul = xpGainMul(s.level) || 1;
    const cap = (xpForLevel(s.level) * OFFLINE.xpMaxLevelFrac) / mul; // addXP içinde ×mul uygulanır
    xp = Math.round(Math.min(xp, cap));
    return amount > 0 || xp > 0 ? { amount, sec, xp } : null;
  }
  /** Arka plandan dönüş: oyun kapatılmadan (Android'de ana ekrana dönüp gelmek, tarayıcıda sekme değiştirmek)
   *  geri gelindiğinde de "Sen yokken" kazancı verilir. Önceden yalnızca oyun tamamen kapatılıp açılınca veriliyordu. */
  watchResume() {
    const g = this.game;
    let hiddenAt = 0;
    const hide = () => { if (!hiddenAt) hiddenAt = Date.now(); };
    const show = () => {
      if (!hiddenAt) return;
      const sec = (Date.now() - hiddenAt) / 1000; hiddenAt = 0;
      const off = this.offlineCalc(sec);
      if (!off) return;
      const open = () => { if (document.hidden) return; if ($('#modal-root')?.children.length) { setTimeout(open, 1500); return; } this.offline(off.amount, off.sec, off.xp); };
      setTimeout(open, 400);
    };
    document.addEventListener('visibilitychange', () => (document.hidden ? hide() : show()));
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => (isActive ? show() : hide()));
    }).catch(() => {});
  }
  welcome() {
    return this.modal(`<div class="welcome">
      <div class="w-logo">WOOD<br><span>EMPIRE</span></div>
      <p>Küçük bir orman işletmesinden dev bir kereste imparatorluğu kur!</p>
      <ul class="w-steps">
        <li>${ICONS.tree}<span>Ekranda parmağını sürükleyerek yürü, ağacın yanında dur: <b>otomatik keser</b>.</span></li>
        <li>${ICONS.log}<span>Kütükleri topla, önce <b>depoya</b> bırak. Depodan alıp <b>testereye</b> götür.</span></li>
        <li>${ICONS.factory}<span>Testere keresteye çevirir, <b>turuncu</b> alandan al. Makineyi önündeki <b>mor GELİŞTİR</b> alanından yükselt.</span></li>
        <li>${ICONS.truck}<span>Ürünleri <b>kamyona</b> yükle, sat. Sonra <b>işçi</b> al, <b>bant</b> kur, her şeyi otomatikleştir!</span></li>
      </ul>
      <button class="btn green big" data-act="modal:close">Başla!</button></div>`, { sticky: true });
  }
  offline(amount, sec, xp = 0) {
    const g = this.game;
    const giveXp = (k) => { if (xp > 0) g.levels.addXP(xp * k); };
    const m = this.modal(`<div class="offline"><div class="o-title">Sen yokken işçilerin çalıştı!</div>
      <div class="o-time">${Math.floor(sec / 3600)} sa ${Math.floor((sec % 3600) / 60)} dk</div>
      <div class="o-amount">${ICONS.coin}<b>${fmt(amount)}</b></div>
      ${xp > 0 ? `<div class="o-amount o-xp">${ICONS.star || ''}<b>+${fmt(Math.floor(xp * xpGainMul(g.state.level)))} XP</b></div>` : ''}
      <div class="o-btns"><button class="btn" data-act="modal:close" id="o-take">Al</button>
      <button class="btn green" id="o-double">${ICONS.play} 2 Katı</button></div></div>`, { sticky: true });
    m.querySelector('#o-take').addEventListener('click', () => { g.economy.addMoney(amount, 'offline'); giveXp(1); g.ads.maybeInterstitial('offline'); });
    m.querySelector('#o-double').addEventListener('click', async () => {
      const ok = await g.ads.showRewarded('offline');
      g.economy.addMoney(amount * (ok ? 2 : 1), 'offline'); giveXp(ok ? 2 : 1); m.close();
    });
    return m;
  }
}
