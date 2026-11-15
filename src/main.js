import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import './ui/styles.css';
import { Capacitor } from '@capacitor/core';
import { Game } from './core/Game.js';
import { UI } from './ui/UI.js';
import { loadSave } from './systems/SaveSystem.js';

const bar = document.getElementById('load-bar');
const msg = document.getElementById('load-msg');
const step = (p, m) => { bar.style.width = p + '%'; if (m) msg.textContent = m; return new Promise((r) => requestAnimationFrame(() => r())); };

async function boot() {
  await step(10, 'Yazı tipleri yükleniyor…');
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch {}
  await step(25, 'Kayıt okunuyor…');
  const load = await loadSave();
  await step(45, 'Orman büyütülüyor…');
  const game = new Game(document.getElementById('game'), load);
  await step(80, 'Fabrika kuruluyor…');
  const ui = new UI(game, document.getElementById('ui'));
  game.ui = ui;
  game.ready = true;
  const offlineSec = load.state ? (Date.now() - (load.state.lastSeen || Date.now())) / 1000 : 0;
  game.start();
  await step(100, 'Hazır!');
  setTimeout(() => document.getElementById('loader').classList.add('done'), 250);
  setTimeout(() => ui.startupFlow(offlineSec), 450);
  game.save.requestSave();
  game.cloud.init(); // bulut: isimsiz kimlik, oyuncu özeti, kullanıcı adı, hediyeler (hata oyunu durdurmaz)

  if (Capacitor.isNativePlatform()) setupNative(game, ui);
  exposeTestApi(game, ui);
}

async function setupNative(game, ui) {
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.hide();
  } catch {}
  try { const { SplashScreen } = await import('@capacitor/splash-screen'); await SplashScreen.hide(); } catch {}
  try {
    const { App } = await import('@capacitor/app');
    // Android geri tuşu: önce açık pencereleri kapat, sonra çıkışı onayla
    App.addListener('backButton', () => {
      const modals = document.querySelectorAll('.modal-wrap');
      if (modals.length) { modals[modals.length - 1].close?.(); return; }
      if (ui.panels.cur) { ui.panels.close(); return; }
      const m = ui.modal(`<div class="confirm"><h3>Oyundan çık?</h3><p>İlerlemen kaydedildi.</p><div class="btn-row"><button class="btn" data-act="modal:close">Kal</button><button class="btn danger" id="exit-yes">Çık</button></div></div>`);
      m.querySelector('#exit-yes').addEventListener('click', async () => { await game.save.save(); App.exitApp(); });
    });
  } catch {}
}

/**
 * Otomatik oynanış testi için arayüz (tests/playtest.mjs kullanır).
 * Karakteri gerçek girdi yoluyla (joystick vektörü) hareket ettirir; ışınlama YOKTUR.
 */
function exposeTestApi(game, ui) {
  window.__WE = {
    game, ui,
    setMove(x, y) { game.input.external = { x, y }; },
    stop() { game.input.external = null; },
    timeScale(v) { game.timeScale = v; },
    /** Dünya yönünü kameraya göre joystick vektörüne çevir */
    dirTo(tx, tz) {
      const p = game.player.pos; let dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const f = game.cameraRig.forward(), r = game.cameraRig.right();
      return { x: dx * r.x + dz * r.z, y: dx * f.x + dz * f.z, d };
    },
    info() {
      const s = game.state, p = game.player;
      return { money: s.money, gold: s.gold, level: s.level, xp: s.xp, x: p.pos.x, z: p.pos.z, carry: p.stack.count, cap: p.stack.capacity,
        carryKinds: p.stack.items.map((i) => i.kind), stats: { ...s.stats }, zones: [...s.zones], mission: game.missions.view(), fps: game.fps,
        drawCalls: game.renderer.info.render.calls, triangles: game.renderer.info.render.triangles };
    },
    pads() { return game.pads.filter((p) => p.active).map((p) => ({ mode: p.mode, type: p.type, x: p.x, z: p.z, station: p.station?.id, data: p.data?.zoneId ?? p.data?.site?.id })); },
    site(id) { const st = game.sites.get(id); if (!st) return null; return { id, x: st.x, z: st.z, in: st.inBuf?.count ?? st.buffer?.count ?? st.staging?.count, out: st.outBuf?.count, inPad: st.inPad || st.dropPad || st.pad, outPad: st.outPad || st.takePad }; },
    nearestTree() { const p = game.player.pos; const t = game.trees.nearestStanding(p.x, p.z, 999); return t ? { x: t.x, z: t.z, r: t.obstacle.r, type: t.type, hp: t.hp } : null; },
    async saveNow() { await game.save.save(); return game.save.lastResult; },
  };
}

boot().catch((e) => {
  console.error(e);
  msg.textContent = 'Başlatma hatası: ' + e.message;
});
