import { Capacitor } from '@capacitor/core';
import { SAVE_VERSION, defaultState } from '../core/State.js';

/**
 * Kalıcı kayıt — bozulmaya karşı güvenli:
 *  - İki kayıt yuvası (A/B) dönüşümlü yazılır; yazma sırasında kapanma olsa bile diğeri sağlamdır.
 *  - Her kayıt sağlama toplamı (FNV-1a) ve sayaç içerir; yüklemede geçerli en yeni kayıt seçilir.
 *  - Android'de Capacitor Preferences (SharedPreferences), web'de localStorage.
 *  - Otomatik kayıt: 10 sn'de bir, önemli olaylarda hemen, uygulama arka plana geçince/kapanırken.
 */
const KEYS = ['we_save_a', 'we_save_b'];

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

const backend = {
  prefs: null,
  async init() {
    if (Capacitor.isNativePlatform()) {
      try { this.prefs = (await import('@capacitor/preferences')).Preferences; } catch (e) { console.warn('[Save] Preferences yok', e); }
    }
  },
  async get(k) {
    if (this.prefs) return (await this.prefs.get({ key: k })).value;
    try { return localStorage.getItem(k); } catch { return null; }
  },
  async set(k, v) {
    if (this.prefs) return this.prefs.set({ key: k, value: v });
    localStorage.setItem(k, v);
  },
  async remove(k) {
    if (this.prefs) return this.prefs.remove({ key: k });
    try { localStorage.removeItem(k); } catch {}
  },
};

/** Oyun başlamadan önce kaydı yükle */
export async function loadSave() {
  await backend.init();
  const found = [];
  for (const k of KEYS) {
    try {
      const raw = await backend.get(k);
      if (!raw) continue;
      const env = JSON.parse(raw);
      if (!env || typeof env.data !== 'string') continue;
      if (fnv(env.data) !== env.sum) { console.warn('[Save] bozuk yuva atlandı:', k); continue; }
      found.push({ k, n: env.n, data: JSON.parse(env.data) });
    } catch (e) { console.warn('[Save] okunamadı:', k, e); }
  }
  if (!found.length) return { state: null, slot: 0, n: 0 };
  found.sort((a, b) => b.n - a.n);
  const best = found[0];
  return { state: migrate(best.data), slot: KEYS.indexOf(best.k), n: best.n, recovered: found.length === 1 && found[0].k !== KEYS[0] && found[0].k !== KEYS[1] };
}

function migrate(data) {
  // eksik alanları varsayılanlarla tamamla (ileriye dönük uyumluluk)
  const d = defaultState();
  const merge = (base, over) => {
    for (const k of Object.keys(base)) {
      if (over[k] === undefined) over[k] = base[k];
      else if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && typeof over[k] === 'object' && !Array.isArray(over[k])) merge(base[k], over[k]);
    }
    return over;
  };
  const out = merge(d, data);
  out.v = SAVE_VERSION;
  return out;
}

export class SaveSystem {
  constructor(game) {
    this.game = game;
    this.slot = game.saveSlot ?? 0;
    this.n = game.saveN ?? 0;
    this.dirty = false;
    this.writing = false;
    this.lastSave = 0;
    this.lastResult = null;
    game.every(10, () => this.save());
    game.every(1, () => { if (this.dirty && performance.now() - this.lastSave > 1500) this.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('pagehide', () => this.save());
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('pause', () => this.save());
        App.addListener('appStateChange', ({ isActive }) => { if (!isActive) this.save(); });
      }).catch(() => {});
    }
  }

  requestSave(now = false) { this.dirty = true; if (now) this.save(); }

  /** Sistemlerden güncel durumu topla */
  collect() {
    const g = this.game; const s = g.state;
    g.player.serialize();
    g.trees.persist();
    g.wood.persist();
    const sites = {};
    for (const [id, v] of Object.entries(s.sites)) if (v.built) sites[id] = v;
    g.storage.serialize(sites);
    g.production.serialize(sites);
    g.trucks.serialize(sites);
    for (const id of ['office', 'garage']) if (g.sites.has(id)) sites[id] = { built: true };
    s.sites = sites;
    g.conveyors.serialize();
    g.workers.serialize();
    g.vehicles.serialize();
    s.lastSeen = Date.now();
    return s;
  }

  async save() {
    if (this.writing || !this.game.ready) return;
    this.writing = true;
    try {
      const data = JSON.stringify(this.collect());
      this.n++;
      this.slot = (this.slot + 1) % 2;
      const env = JSON.stringify({ v: SAVE_VERSION, n: this.n, t: Date.now(), sum: fnv(data), data });
      await backend.set(KEYS[this.slot], env);
      this.dirty = false;
      this.lastSave = performance.now();
      this.lastResult = { ok: true, n: this.n, bytes: env.length, at: Date.now() };
      this.game.bus.emit('saved', this.lastResult);
    } catch (e) {
      console.error('[Save] yazılamadı', e);
      this.lastResult = { ok: false, error: String(e) };
    }
    this.writing = false;
  }

  async reset() {
    for (const k of KEYS) await backend.remove(k);
  }
}
