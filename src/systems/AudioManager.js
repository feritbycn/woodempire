/**
 * Ses: WebAudio ile önceden çözülmüş ses tamponları, tonda rastgelelik,
 * mesafeye bağlı makine/motor döngüleri ve rahatlatıcı müzik.
 * İlk dokunuşta açılır (mobil tarayıcı kuralı). Uygulama arka plana geçince susar.
 */
const FILES = ['chop', 'creak', 'thud', 'woodDrop', 'pickup', 'drop', 'cash', 'mission', 'levelup', 'upgrade', 'build', 'unlock', 'horn', 'brake', 'load', 'produce', 'step', 'whoosh', 'magnet', 'error', 'click', 'hire', 'boost', 'engine'];
const LOOPS = ['saw_loop', 'engine_loop'];

export class AudioManager {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.buffers = {};
    this.loops = {};
    this.music = null;
    this.unlocked = false;
    this.lastPlay = {};
    this.muted = false;
    document.addEventListener('visibilitychange', () => this.setBackground(document.hidden));
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  get settings() { return this.game.state.settings; }

  async unlock() {
    if (this.unlocked) { if (this.ctx?.state === 'suspended' && !this.muted) this.ctx.resume(); return; }
    this.unlocked = true;
    // oyuncu isteği: oyun sırasında müzik çalmaz (yalnızca efektler). Eski kayıtlarda da bir kez kapatılır; ayarlardan açılabilir.
    if (!this.settings.musicV2) { this.settings.music = 0; this.settings.musicV2 = true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
    this.applyVolumes();
    const base = (import.meta.env.BASE_URL || './') + 'audio/';
    const load = async (name, ext) => {
      try {
        const res = await fetch(base + name + ext);
        const ab = await res.arrayBuffer();
        this.buffers[name] = await this.ctx.decodeAudioData(ab);
      } catch (e) { console.warn('[Audio] yüklenemedi', name, e); }
    };
    await Promise.all([...FILES.map((f) => load(f, '.mp3')), ...LOOPS.map((f) => load(f, '.ogg'))]);
    for (const l of LOOPS) this.startLoop(l);
    this.musicLoad = () => { if (!this.musicLoading) { this.musicLoading = true; load('music', '.mp3').then(() => this.startMusic()); } };
    if (this.settings.music > 0) this.musicLoad();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.sfxGain.gain.value = this.settings.sfx;
    this.musicGain.gain.value = this.settings.music * 0.55;
    if (this.settings.music > 0) this.musicLoad?.(); // ayarlardan açılınca müzik o an yüklenip başlar
  }

  play(name, { vol = 1, pitch = 1 } = {}) {
    if (!this.ctx || this.muted) return;
    const b = this.buffers[name];
    if (!b) return;
    // aynı sesin aşırı üst üste binmesini engelle
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.03) return;
    this.lastPlay[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = b; src.playbackRate.value = pitch;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
  }

  startLoop(name) {
    const b = this.buffers[name];
    if (!b) return;
    const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(this.sfxGain); src.start();
    this.loops[name] = { src, g };
  }
  startMusic() {
    const b = this.buffers.music;
    if (!b || this.music) return;
    const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
    src.connect(this.musicGain); src.start();
    this.music = src;
  }

  /** Her karede: en yakın çalışan makine ve kamyona göre döngü sesleri */
  updateLoops() {
    if (!this.ctx) return;
    const p = this.game.player.pos;
    let saw = 0;
    for (const m of this.game.production.machines) {
      if (!m.working) continue;
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      saw = Math.max(saw, Math.max(0, 1 - d / 22));
    }
    let eng = 0;
    for (const d of this.game.trucks.docks) for (const t of d.queue) {
      const dd = Math.hypot(t.model.group.position.x - p.x, t.z - p.z);
      eng = Math.max(eng, Math.max(0, 1 - dd / 30) * (Math.abs(t.speed) > 0.5 ? 1 : 0.4));
    }
    for (const f of this.game.vehicles.list) { const dd = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); eng = Math.max(eng, Math.max(0, 1 - dd / 18) * 0.6); }
    const t = this.ctx.currentTime;
    if (this.loops.saw_loop) { this.loops.saw_loop.g.gain.setTargetAtTime(saw * 0.12, t, 0.15); this.loops.saw_loop.src.playbackRate.setTargetAtTime(0.9 + saw * 0.2, t, 0.2); }
    if (this.loops.engine_loop) this.loops.engine_loop.g.gain.setTargetAtTime(eng * 0.2, t, 0.2);
  }

  setBackground(bg) {
    if (!this.ctx) return;
    if (bg) this.ctx.suspend(); else if (!this.muted) this.ctx.resume();
  }
  suspendForAd(on) { this.muted = on; this.setBackground(on); }
}
