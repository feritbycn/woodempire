/**
 * Girdi: ekranın sol yarısında dinamik sanal joystick, iki parmakla yakınlaştırma,
 * masaüstü testleri için WASD/ok tuşları ve fare tekerleği.
 * Test ajanı window.__WE.setMove(x,y) ile aynı vektörü kullanır.
 */
export class Input {
  constructor(game) {
    this.game = game;
    this.move = { x: 0, y: 0 };      // x: sağ, y: ileri (ekranda yukarı)
    this.joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.keys = new Set();
    this.external = null;            // test / otomasyon girdisi
    this.pinch = null;
    this.radius = 60;
    this.el = null;
    this.knob = null;

    window.addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code === 'KeyQ') game.cameraRig.rotate(-1); if (e.code === 'KeyE') game.cameraRig.rotate(1); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.release(); });
    game.canvas.addEventListener('wheel', (e) => { e.preventDefault(); game.cameraRig.zoom(Math.sign(e.deltaY) * 0.08); }, { passive: false });
  }

  /** Joystick DOM katmanını bağla (UI tarafından çağrılır) */
  attach(zoneEl, baseEl, knobEl) {
    this.el = baseEl; this.knob = knobEl;
    const start = (id, x, y) => {
      this.joy = { active: true, id, ox: x, oy: y, x: 0, y: 0, sx: x, sy: y, t0: performance.now(), maxD: 0 };
      baseEl.style.left = x + 'px'; baseEl.style.top = y + 'px';
      baseEl.classList.add('active');
      knobEl.style.transform = 'translate(-50%,-50%)';
      this.game.audio?.unlock();
    };
    const moveTo = (x, y) => {
      let dx = x - this.joy.ox, dy = y - this.joy.oy;
      this.joy.maxD = Math.max(this.joy.maxD || 0, Math.hypot(x - this.joy.sx, y - this.joy.sy));
      const d = Math.hypot(dx, dy), r = this.radius;
      if (d > r) { dx = (dx / d) * r; dy = (dy / d) * r; }
      this.joy.x = dx / r; this.joy.y = -dy / r;
      knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    zoneEl.addEventListener('touchstart', (e) => {
      if (e.touches.length >= 2) { this.release(); this.startPinch(e); return; }
      const t = e.changedTouches[0];
      // takılı kalmış joystick (bitiş olayı kaçmış parmak) yeni dokunuşu engellemesin
      if (this.joy.active && ![...e.touches].some((x) => x.identifier === this.joy.id)) this.release();
      if (!this.joy.active) start(t.identifier, t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    zoneEl.addEventListener('touchmove', (e) => {
      if (this.pinch && e.touches.length >= 2) { this.doPinch(e); e.preventDefault(); return; }
      for (const t of e.changedTouches) if (t.identifier === this.joy.id) moveTo(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      if (e.touches && e.touches.length < 2) this.pinch = null;
      for (const t of e.changedTouches) if (t.identifier === this.joy.id) { this.tapCheck(t.clientX, t.clientY); this.release(); }
    };
    zoneEl.addEventListener('touchend', end); zoneEl.addEventListener('touchcancel', end);
    // fare (masaüstü / emülatör)
    let mouse = false;
    zoneEl.addEventListener('mousedown', (e) => { mouse = true; start('m', e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => { if (mouse && this.joy.active) moveTo(e.clientX, e.clientY); });
    window.addEventListener('mouseup', (e) => { if (mouse) { mouse = false; this.tapCheck(e.clientX, e.clientY); this.release(); } });
  }
  /** Kısa ve kımıldamadan yapılan dokunuş = tıklama: altındaki dünya etiketine (bant, makine, tabela) iletilir */
  tapCheck(x, y) {
    if (!this.joy.active || this.joy.maxD > 12 || performance.now() - this.joy.t0 > 1500) return;
    for (const el of document.elementsFromPoint(x, y)) {
      const wl = el.closest?.('.wl');
      if (wl && wl._tap) { wl._tap(); return; }
    }
  }
  startPinch(e) {
    const [a, b] = e.touches;
    this.pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  }
  doPinch(e) {
    const [a, b] = e.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = this.pinch.d / d;
    this.game.cameraRig.zoom((ratio - 1) * 0.9);
    this.pinch.d = d;
  }
  release() {
    this.joy.active = false; this.joy.x = 0; this.joy.y = 0;
    if (this.el) this.el.classList.remove('active');
    if (this.knob) this.knob.style.transform = 'translate(-50%,-50%)';
  }

  update() {
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (x || y) { const d = Math.hypot(x, y); x /= d; y /= d; }
    if (this.joy.active) { x = this.joy.x; y = this.joy.y; }
    if (this.external) { x = this.external.x; y = this.external.y; }
    this.move.x = x; this.move.y = y;
  }
}
