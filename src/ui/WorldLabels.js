import * as THREE from 'three';
import { ICONS, ITEM_ICON } from './icons.js';
import { fmt } from '../systems/MissionSystem.js';

const _v = new THREE.Vector3();
const NEAR_PAD = 5.5;   // tabelanın tam adı yalnızca bu kadar yakında görünür
const NEAR_ST = 8;

/** 3B dünyaya bağlı HTML etiketleri: istasyon bilgileri, fiyat tabelaları, işçi baloncukları, uçan yazılar */
export class WorldLabels {
  constructor(game, ui) {
    this.game = game; this.ui = ui;
    this.layer = document.getElementById('world-layer');
    this.els = new Map();
    this.floaters = [];
    this.t = 0;
  }

  project(x, y, z) {
    _v.set(x, y, z).project(this.game.camera);
    if (_v.z > 1) return null;
    return { x: ((_v.x + 1) / 2) * window.innerWidth, y: ((1 - _v.y) / 2) * window.innerHeight, depth: _v.z };
  }

  /** Üst HUD ve alt kontrollerin altında kalan etiketleri soldur */
  zoneFade(y) {
    const H = window.innerHeight;
    const top = 175, bottom = H - 150;
    if (y < top) return Math.max(0, (y - (top - 40)) / 40);
    if (y > bottom) return Math.max(0, 1 - (y - bottom) / 40);
    return 1;
  }

  el(key, cls, onClick) {
    let e = this.els.get(key);
    if (!e) {
      e = document.createElement('div'); e.className = 'wl ' + cls; this.layer.appendChild(e);
      if (onClick) { e.style.pointerEvents = 'auto'; e.addEventListener('click', onClick); e._tap = onClick; e.classList.add('tappable'); }
      this.els.set(key, e);
    }
    e._seen = true;
    return e;
  }

  update() {
    const g = this.game; const p = g.player.pos;
    for (const e of this.els.values()) e._seen = false;
    const slow = (this.t++ % 6) === 0;
    // istasyonlar
    for (const st of g.sites.values()) {
      if (!st.label) continue;
      const d = Math.hypot(st.x - p.x, st.z - p.z);
      if (d > 34) continue;
      const s = this.project(st.labelPos.x, st.labelPos.y, st.labelPos.z);
      if (!s) continue;
      const e = this.el('st_' + st.id, 'station', () => this.ui.panels.station(st.owner || st));
      if (slow || !e._h) {
        const L = st.label();
        const canUp = this.canUpgrade(st);
        e.classList.toggle('can-up', canUp);
        const near = d < NEAR_ST;
        e.classList.toggle('compact', !near);
        const html = `${canUp ? `<i class="up-badge">${ICONS.up}</i>` : ''}<div class="wl-ico">${ICONS[ITEM_ICON[L.icon] || L.icon] || ''}</div><div class="wl-t">${near ? `<b>${L.title}</b>` : ''}<span class="${L.full ? 'full' : ''}">${L.value}${L.full ? ' · DOLU' : ''}</span>${L.warn ? `<span class="wl-warn">${L.warn}</span>` : ''}${L.progress !== undefined ? `<i class="wl-bar"><i style="width:${Math.min(100, L.progress * 100)}%"></i></i>` : ''}</div>`;
        if (e._h !== html) { e._h = html; e.innerHTML = html; }
      }
      e.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%) scale(${Math.max(0.7, Math.min(1, 26 / (g.cameraRig.dist + d * 0.3)))})`;
      const op = (d > 28 ? Math.max(0, (34 - d) / 6) : 1) * this.zoneFade(s.y);
      e.style.opacity = op; e.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
    }
    // bant etiketleri (dokununca bant geliştirme paneli)
    for (const b of g.conveyors.belts.values()) {
      const m = g.conveyors.midPoint(b);
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (d > 30) continue;
      const s = this.project(m.x, 1.9, m.z);
      if (!s) continue;
      const e = this.el('belt_' + b.def.id, 'station belt compact', () => this.ui.panels.belt(b));
      if (slow || !e._h) {
        const canUp = g.state.money >= g.conveyors.cheapestUpgrade(b);
        e.classList.toggle('can-up', canUp);
        const lvl = 1 + b.up.speed + b.up.capacity;
        const html = `${canUp ? `<i class="up-badge">${ICONS.up}</i>` : ''}<div class="wl-ico">${ICONS.conveyor}</div><div class="wl-t"><span>Sv.${lvl}</span></div>`;
        if (e._h !== html) { e._h = html; e.innerHTML = html; }
      }
      e.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%) scale(0.86)`;
      const op = (d > 24 ? Math.max(0, (30 - d) / 6) : 1) * this.zoneFade(s.y);
      e.style.opacity = op; e.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
    }
    // satın alma / inşaat / işçi tabelaları
    for (const pad of g.pads) {
      if (!pad.active || (pad.mode !== 'buy' && pad.mode !== 'build' && pad.mode !== 'hire' && pad.mode !== 'animal' && pad.mode !== 'feed' && !(pad.mode === 'upgrade' && pad.label))) continue;
      const d = Math.hypot(pad.x - p.x, pad.z - p.z);
      if (d > 40) continue;
      const s = this.project(pad.x, 2.2, pad.z);
      if (!s) continue;
      const key = 'pad_' + pad.x + '_' + pad.z;
      const e = this.el(key, 'sign ' + pad.mode, pad.mode === 'hire' || pad.mode === 'upgrade' ? () => this.ui.panels.station({ type: 'workers', name: 'İşçiler' }) : null);
      const near = d < NEAR_PAD;
      if (slow || !e._h || e._near !== near) {
        e._near = near;
        const L = pad.label();
        const lvlOk = !L.level || g.state.level >= L.level;
        const afford = g.state.money >= L.price;
        const fac = pad.data?.fac ?? null;
        const full = (pad.mode === 'hire' && !g.workers.canHire(fac)) || (pad.mode === 'animal' && L.count >= L.max);
        const ready = lvlOk && afford && !full && !L.maxed;
        e.classList.toggle('ready', ready);
        e.classList.toggle('compact', !near);
        e.classList.toggle('locked', !lvlOk);
        const ico = this.padIcon(pad);
        const cnt = pad.mode === 'animal' || pad.mode === 'feed' ? `<em class="${pad.mode === 'feed' && L.count < 1 ? 'empty' : ''}">${L.count}/${L.max}</em>` : (pad.mode === 'hire' && L.count ? `<em>×${L.count}</em>` : '');
        let tail;
        if (L.maxed) tail = `<span class="req">MAKS</span>`;
        else if (!lvlOk) tail = `<span class="req">${ICONS.lock}Sv.${L.level}</span>`;
        else if (full) tail = `<span class="req">Dolu</span>`;
        else tail = `<span class="price ${afford ? '' : 'poor'}">${ICONS.coin}${fmt(L.price)}</span>`;
        const html = `${ready ? `<i class="up-badge">${ICONS.up}</i>` : ''}${near ? `<b class="ttl">${L.title}</b>` : ''}<span class="srow">${ico}${cnt}${tail}</span>`;
        if (e._h !== html) { e._h = html; e.innerHTML = html; }
      }
      e.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
      e.style.opacity = this.zoneFade(s.y);
    }
    // sağılmaya hazır inekler
    for (let i = 0; i < g.animals.list.length; i++) {
      const a = g.animals.list[i];
      if (!g.animals.isReady(a)) continue;
      if (Math.hypot(a.x - p.x, a.z - p.z) > 26) continue;
      const s = this.project(a.x, 2.4, a.z);
      if (!s) continue;
      const e = this.el('cow_' + i, 'bubble cow-ready');
      if (!e._h) { e._h = 1; e.innerHTML = ICONS[{ cow: 'milk', sheep: 'wool', hive: 'comb' }[a.type]] || ICONS.milk; }
      e.classList.toggle('milking', a.milkT > 0);
      e.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
      e.style.opacity = this.zoneFade(s.y);
    }
    // işçi baloncukları
    for (const w of [...g.workers.list, ...g.vehicles.list]) {
      if (!w.bubble) continue;
      const s = this.project(w.pos.x, 2.6, w.pos.z);
      if (!s) continue;
      const e = this.el('w_' + (w.idx ?? 'f' + g.vehicles.list.indexOf(w)), 'bubble');
      if (e.textContent !== w.bubble) e.textContent = w.bubble;
      e.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
    }
    // oyuncu dolu uyarısı
    if (g.player.stack.isFull() && g.player.stack.capacity > 0) {
      const s = this.project(p.x, 3.2 + Math.min(g.player.stack.count * 0.2, 4), p.z);
      if (s) { const e = this.el('full', 'bubble max'); if (!e._h) { e._h = 1; e.textContent = 'MAKS'; } e.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`; }
    }
    for (const [k, e] of this.els) if (!e._seen) { e.remove(); this.els.delete(k); }
    // uçan yazılar
    const now = performance.now();
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      const k = (now - f.t0) / 1100;
      if (k >= 1) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      const s = this.project(f.x, f.y + k * 1.6, f.z);
      if (!s) { f.el.style.opacity = 0; continue; }
      f.el.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-50%) scale(${k < 0.15 ? 0.6 + k * 2.6 : 1})`;
      f.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
  }

  padIcon(pad) {
    const g = this.game;
    if (pad.mode === 'hire') return ICONS[{ lumberjack: 'axe', carrier: 'hand', loader: 'forklift', farmer: 'cow' }[pad.data?.role] || 'worker'] || ICONS.worker;
    if (pad.mode === 'feed') return ICONS.box;
    if (pad.mode === 'upgrade') return ICONS.worker;
    if (pad.mode === 'animal') return ICONS[g.animals.zones.get(pad.data.zone)?.def.farm.type] || ICONS.cow;
    if (pad.mode === 'build') return pad.data?.expand ? ICONS.up : pad.data?.conveyor ? ICONS.conveyor : ICONS.hammer;
    return ICONS.map;
  }

  /** Paran bu istasyonun en ucuz yükseltmesine yetiyor mu? (makine üstünde yeşil ok gösterilir) */
  canUpgrade(st) {
    const g = this.game; const m = g.state.money;
    if (st.type === 'machine') return g.factory.options(st).some((o) => !o.maxed && !o.locked && o.cost <= m);
    if (st.type === 'depot' || st.type === 'warehouse') return g.storage.upgradeCost(st) <= m;
    if (st.type === 'stock') { const o = st.owner; return o.outBuf.count >= o.outBuf.capacity * 0.8 && (o.up.stock || 0) < o.stock.max && g.production.stockCost(o) <= m; }
    return false;
  }

  floater(at, text, cls) {
    if (this.floaters.length > 25) { const f = this.floaters.shift(); f.el.remove(); }
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.innerHTML = (cls.startsWith('money') ? ICONS.coin : '') + `<span>${text}</span>`;
    this.layer.appendChild(el);
    this.floaters.push({ el, x: at.x, y: at.y, z: at.z, t0: performance.now() });
  }
}
