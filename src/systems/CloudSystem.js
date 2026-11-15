import { FIREBASE, CLOUD, normalizeName, nameProblem } from '../config/cloud.js';
import { fmt } from './MissionSystem.js';

/**
 * BULUT: isimsiz oyuncu kimliği (Firebase Anonymous Auth), oyuncu özeti (yönetim paneli için),
 * benzersiz kullanıcı adı ve yönetici hediyeleri.
 *
 * Firestore yapısı (kurallar: firestore.rules)
 *   players/{uid}            — oyuncu özeti (yalnızca sahibi yazar, yönetici okur)
 *   players/{uid}/claimed/{giftId} — alınmış hediyeler (bir hediye bir kez alınır)
 *   usernames/{adKüçükHarf}  — { uid, name } benzersizlik kaydı (bir kez oluşturulur, değiştirilemez)
 *   gifts/{id}               — { to: uid | 'all', items: {gold,money,xp,logs}, msg, createdAt } (yalnızca yönetici yazar)
 *   admins/{uid}             — yöneticiler (Firebase konsolundan elle eklenir)
 *
 * Oyun internetsiz de oynanır: bulut hatası oyunu asla durdurmaz, sonra tekrar denenir.
 */
export class CloudSystem {
  constructor(game) {
    this.game = game;
    this.uid = null; this.status = 'off';
    this.syncT = 10; this.giftT = 8;
    this.shownGift = new Set();
  }

  enabled() {
    const q = new URLSearchParams(location.search);
    if (q.has('nocloud')) return false;
    if (navigator.webdriver && !q.has('cloud')) return false; // otomatik testlerde buluta yazma
    return true;
  }

  async init() {
    if (!this.enabled()) return;
    this.status = 'loading';
    try {
      const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
      this.F = F;
      this.app = initializeApp(FIREBASE);
      this.auth = A.getAuth(this.app);
      this.db = F.getFirestore(this.app);
      await new Promise((res) => { const off = A.onAuthStateChanged(this.auth, (u) => { off(); res(u); }); });
      if (!this.auth.currentUser) await A.signInAnonymously(this.auth);
      this.uid = this.auth.currentUser.uid;
      this.status = 'ok';
      const c = this.game.state.cloud || (this.game.state.cloud = {});
      if (c.uid && c.uid !== this.uid) { c.name = null; } // kimlik değişmiş (veri temizlenmiş): eski ad bu kimliğe ait değil
      c.uid = this.uid;
      await this.sync(true);
      this.game.bus.on('levelUp', () => { this.sync(); setTimeout(() => this.maybeAskName(), 1500); });
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.sync(); });
      setTimeout(() => this.maybeAskName(), 2500); // seviyesi yetmiş ama adı olmayan eski oyunculara da hemen sorulur
      setTimeout(() => this.checkGifts(), 6000);
      // kişiye özel hediye ve düzenlemeler ANINDA gelir (oyun açıkken); herkese olanlar 5 dakikada bir kontrol edilir
      try { F.onSnapshot(F.query(F.collection(this.db, 'gifts'), F.where('to', '==', this.uid)), (snap) => { if (!snap.metadata?.hasPendingWrites && snap.docChanges().some((c) => c.type === 'added')) this.checkGifts(); }, () => {}); } catch {}
    } catch (e) {
      console.warn('[Bulut] kullanılamıyor', e);
      this.status = 'error';
      setTimeout(() => this.status === 'error' && this.init(), 120000);
    }
  }

  update(dt) {
    if (this.status !== 'ok') return;
    this.syncT -= dt; this.giftT -= dt;
    if (this.syncT <= 0) { this.syncT = CLOUD.syncEvery; this.sync(); }
    if (this.giftT <= 0) { this.giftT = CLOUD.giftCheckEvery; this.checkGifts(); }
    // zorunlu ad: pencere herhangi bir şekilde kapanmışsa yeniden aç
    this.nameT = (this.nameT || 0) - dt;
    if (this.nameT <= 0) { this.nameT = 5; if (this.needsName()) this.maybeAskName(); }
  }

  shortId() { return this.uid ? this.uid.slice(0, 6).toUpperCase() : '—'; }
  displayName() { return this.game.state.cloud?.name || (this.uid ? `Oyuncu #${this.shortId()}` : 'Çevrimdışı'); }

  /** Yönetim panelinde görünen oyuncu özeti */
  summary() {
    const g = this.game, s = g.state;
    let workers = 0, animals = 0;
    try { workers = g.workers.list.filter((w) => !w.data.temp).length; } catch {}
    try { animals = g.animals.list.length; } catch {}
    const logs = g.sites.get('depot1')?.buffer?.count ?? 0;
    return {
      level: s.level, xp: Math.floor(s.xp), money: Math.floor(s.money), gold: Math.floor(s.gold),
      totalEarned: Math.floor(s.stats?.moneyEarned || 0), zones: (s.zones || []).length, zoneList: [...(s.zones || [])].slice(0, 80),
      workers, animals, logs, trees: Math.floor(s.stats?.treesFelled || 0), trucks: Math.floor(s.stats?.trucksShipped || 0),
      playTime: Math.floor(s.playTime || 0), noAds: !!s.purchases?.noAds, premium: !!s.purchases?.premium,
      platform: (window.Capacitor?.getPlatform?.() || 'web'), version: '1.0.0',
    };
  }

  async sync(first = false) {
    if (this.status !== 'ok' || this.syncing) return;
    this.syncing = true;
    const F = this.F;
    try {
      const ref = F.doc(this.db, 'players', this.uid);
      const data = { ...this.summary(), lastSeen: F.serverTimestamp() };
      if (first) {
        const snap = await F.getDoc(ref);
        if (!snap.exists()) { data.createdAt = F.serverTimestamp(); data.name = null; data.nameLower = null; }
        else { // buluttaki ad yerelde yoksa (yeniden kurulum değil, kayıt temizliği) geri al
          const d = snap.data(); if (d.name && !this.game.state.cloud.name) this.game.state.cloud.name = d.name;
        }
      }
      await F.setDoc(ref, data, { merge: true });
      this.lastSync = Date.now();
    } catch (e) { console.warn('[Bulut] eşitleme hatası', e?.code || e); }
    this.syncing = false;
  }

  // ---------- KULLANICI ADI ----------
  /** 2. seviyeden itibaren kullanıcı adı ZORUNLU: ad seçilene kadar pencere kapanmaz (geri tuşu, dışarı dokunma işe yaramaz).
   *  Bulut bağlantısı yoksa ad benzersizliği denetlenemeyeceği için oyun engellenmez; bağlantı gelince sorulur. */
  needsName() { const g = this.game; return this.status === 'ok' && !g.state.cloud?.name && g.state.level >= CLOUD.nameLevel; }
  maybeAskName(force = false) {
    const g = this.game;
    if (this.status !== 'ok' || g.state.cloud?.name) return;
    if (!force && g.state.level < CLOUD.nameLevel) return;
    if (document.querySelector('.namepick')) return; // zaten açık
    if (document.querySelector('.modal-wrap')) { clearTimeout(this.askT); this.askT = setTimeout(() => this.maybeAskName(force), 3000); return; }
    const ui = g.ui; const must = g.state.level >= CLOUD.nameLevel; // 2. seviye altında Ayarlar'dan açılırsa isteğe bağlı
    const m = ui.modal(`<div class="namepick"><h2>Kullanıcı adını seç</h2>
      <p>${must ? 'Oyuna devam etmek için bir kullanıcı adı seçmelisin. ' : ''}Bu ad sana özel olacak; başka hiç kimse aynı adı alamaz. ${CLOUD.nameMin}–${CLOUD.nameMax} karakter: harf, rakam ve _ kullanabilirsin.</p>
      <input id="np-in" maxlength="${CLOUD.nameMax}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ör. Kereste_Kralı">
      <div class="np-msg" id="np-msg"></div>
      ${must ? '<button class="btn green wide" id="np-ok">Kaydet ve devam et</button>' : '<div class="btn-row"><button class="btn" data-act="modal:close">Sonra</button><button class="btn green" id="np-ok">Kaydet</button></div>'}</div>`, { sticky: must, cls: 'namepick-modal' });
    const realClose = m.close; if (must) m.close = () => {}; // zorunluyken ad seçilmeden kapanmaz (geri tuşu dahil)
    const inp = m.querySelector('#np-in'), msg = m.querySelector('#np-msg'), ok = m.querySelector('#np-ok');
    const show = (t, good = false) => { msg.textContent = t || ''; msg.className = 'np-msg' + (good ? ' good' : t ? ' bad' : ''); };
    inp.addEventListener('input', () => show(nameProblem(inp.value) && inp.value.length >= CLOUD.nameMin ? nameProblem(inp.value) : ''));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
    ok.addEventListener('click', async () => {
      const p = nameProblem(inp.value); if (p) { show(p); return; }
      ok.disabled = true; show('Kontrol ediliyor…');
      const r = await this.claimName(inp.value.trim());
      ok.disabled = false;
      if (r.ok) { show(`Hoş geldin, ${r.name}!`, true); g.audio?.play?.('reward'); g.bus.emit('toast', { text: `Kullanıcı adın: ${r.name}`, type: 'success' }); setTimeout(() => realClose(), 700); }
      else show(r.error);
    });
    setTimeout(() => inp.focus(), 200);
  }

  /** Adı benzersiz olarak al: usernames/{küçükAd} ve players/{uid} AYNI ANDA yazılır (kurallar ikisini birlikte denetler) */
  async claimName(name) {
    const F = this.F; const lower = normalizeName(name);
    try {
      const taken = await F.getDoc(F.doc(this.db, 'usernames', lower));
      if (taken.exists() && taken.data().uid !== this.uid) return { ok: false, error: 'Bu ad kullanılıyor, başka bir ad dene' };
      const b = F.writeBatch(this.db);
      b.set(F.doc(this.db, 'usernames', lower), { uid: this.uid, name, at: F.serverTimestamp() });
      b.set(F.doc(this.db, 'players', this.uid), { name, nameLower: lower }, { merge: true });
      await b.commit();
      this.game.state.cloud.name = name;
      this.game.save.requestSave();
      return { ok: true, name };
    } catch (e) {
      console.warn('[Bulut] ad alınamadı', e?.code || e);
      if (e?.code === 'permission-denied') return { ok: false, error: 'Bu ad kullanılıyor, başka bir ad dene' };
      return { ok: false, error: 'Bağlantı yok, sonra tekrar dene' };
    }
  }

  // ---------- HEDİYELER ----------
  async checkGifts() {
    if (this.status !== 'ok') return;
    if (this.checking) { this.recheck = true; return; }
    this.checking = true;
    const F = this.F;
    try {
      const col = F.collection(this.db, 'gifts');
      const [mine, all, claimed] = await Promise.all([
        F.getDocs(F.query(col, F.where('to', '==', this.uid))),
        F.getDocs(F.query(col, F.where('to', '==', 'all'))),
        F.getDocs(F.collection(this.db, 'players', this.uid, 'claimed')),
      ]);
      const done = new Set(claimed.docs.map((d) => d.id));
      const now = Date.now();
      const list = [...mine.docs, ...all.docs]
        .filter((d) => !done.has(d.id) && !this.shownGift.has(d.id))
        .filter((d) => { const x = d.data(); return !x.expiresAt || x.expiresAt.toMillis() > now; });
      for (const d of list) {
        this.shownGift.add(d.id);
        const x = d.data();
        if (x.kind === 'set') this.applySet(d.id, x); else this.showGift(d.id, x); // yönetici düzenlemesi pencere açmadan uygulanır
      }
    } catch (e) { console.warn('[Bulut] hediye kontrolü', e?.code || e); }
    this.checking = false;
    if (this.recheck) { this.recheck = false; setTimeout(() => this.checkGifts(), 500); }
  }

  /** YÖNETİCİ DÜZENLEMESİ: panelden seviye / altın / para / XP doğrudan ayarlanır (ekleme değil, yeni değer).
   *  Önce "alındı" kaydı yazılır → aynı düzenleme ikinci kez uygulanmaz. */
  async applySet(id, data) {
    const F = this.F; const g = this.game; const s = g.state; const v = data.set || {};
    try { await F.setDoc(F.doc(this.db, 'players', this.uid, 'claimed', id), { at: F.serverTimestamp() }); }
    catch (e) { console.warn('[Bulut] düzenleme kaydı', e?.code || e); return; }
    const num = (x) => (x === undefined || x === null || x === '' || !isFinite(Number(x)) ? null : Math.max(0, Math.floor(Number(x))));
    const changed = [];
    if (num(v.level) !== null) { s.level = Math.max(1, num(v.level)); changed.push(`Seviye ${s.level}`); }
    if (num(v.xp) !== null) { s.xp = num(v.xp); changed.push(`${fmt(s.xp)} XP`); }
    try { const need = g.levels.need; if (s.xp >= need) s.xp = need - 1; } catch {}
    if (num(v.gold) !== null) { const d = num(v.gold) - s.gold; s.gold = num(v.gold); g.bus.emit('gold', { amount: d, source: 'admin' }); changed.push(`${fmt(s.gold)} altın`); }
    if (num(v.money) !== null) { const d = num(v.money) - s.money; s.money = num(v.money); g.bus.emit('money', { amount: d, source: 'admin' }); changed.push(`${fmt(s.money)} para`); }
    g.bus.emit('xp', { amount: 0 });
    g.save.requestSave(true); this.sync();
    const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const open = () => {
      if (document.querySelector('.modal-wrap')) { setTimeout(open, 3000); return; }
      g.ui.modal(`<div class="giftbox"><div class="gift-ic">🛠️</div><h2>Hesabın güncellendi</h2>
        ${data.msg ? `<p class="gift-msg">${esc(data.msg)}</p>` : '<p class="gift-msg">Yönetici hesabında değişiklik yaptı.</p>'}
        <div class="gift-items">${changed.map((c) => `<div class="gl">${c}</div>`).join('')}</div>
        <button class="btn green wide" data-act="modal:close">Tamam</button></div>`);
    };
    if (changed.length) open();
  }

  giftLines(items) {
    const L = [];
    if (items.gold) L.push(`<div class="gl">🪙 <b>${fmt(items.gold)}</b> altın</div>`);
    if (items.money) L.push(`<div class="gl">💰 <b>${fmt(items.money)}</b> para</div>`);
    if (items.xp) L.push(`<div class="gl">⭐ <b>${fmt(items.xp)}</b> XP</div>`);
    if (items.logs) L.push(`<div class="gl">🪵 <b>${fmt(items.logs)}</b> kütük (Kütük Deposu'na)</div>`);
    return L.join('');
  }

  showGift(id, data) {
    const g = this.game; const items = data.items || {};
    const open = () => {
      if (document.querySelector('.modal-wrap')) { setTimeout(open, 4000); return; }
      const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const m = g.ui.modal(`<div class="giftbox"><div class="gift-ic">🎁</div><h2>Hediyen var!</h2>
        ${data.msg ? `<p class="gift-msg">${esc(data.msg)}</p>` : ''}<div class="gift-items">${this.giftLines(items)}</div>
        <button class="btn green wide" id="gift-take">Al</button></div>`);
      m.querySelector('#gift-take').addEventListener('click', async (e) => {
        e.target.disabled = true;
        const ok = await this.claimGift(id, items);
        m.close?.();
        if (!ok) g.bus.emit('toast', { text: 'Hediye alınamadı, internet bağlantını kontrol et', type: 'error' });
      });
    };
    open();
  }

  /** Önce "alındı" kaydı yazılır (kurallar ikinciye izin vermez) → sonra ödül verilir: aynı hediye iki kez alınamaz */
  async claimGift(id, items) {
    const F = this.F; const g = this.game;
    try {
      await F.setDoc(F.doc(this.db, 'players', this.uid, 'claimed', id), { at: F.serverTimestamp() });
    } catch (e) { console.warn('[Bulut] hediye kaydı', e?.code || e); return e?.code === 'permission-denied'; }
    const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
    if (n(items.gold)) g.economy.addGold(n(items.gold), 'gift');
    if (n(items.money)) g.economy.addMoney(n(items.money), 'gift');
    if (n(items.xp)) g.levels.addXP(n(items.xp));
    if (n(items.logs)) {
      const d = g.sites.get('depot1');
      if (d?.buffer) {
        const need = n(items.logs) - d.buffer.free;
        if (need > 0) d.buffer.capacity += need; // hediye kütükleri depo dolu olsa da sığar
        for (let i = 0; i < n(items.logs); i++) d.buffer.push({ kind: 'log', wood: 'pine', dep: 1, o: 0 });
      }
    }
    g.fx?.confetti?.(g.player.pos.x, 2, g.player.pos.z, 40);
    g.audio?.play?.('reward');
    g.bus.emit('toast', { text: 'Hediye alındı!', type: 'success' });
    g.save.requestSave(); this.sync();
    return true;
  }

  /** Ayarlar → "Bulut verilerimi sil": oyuncu özeti ve kullanıcı adı silinir (oyun kaydı cihazda kalır) */
  async deleteCloudData() {
    if (this.status !== 'ok') return false;
    const F = this.F; const c = this.game.state.cloud || {};
    try {
      const b = F.writeBatch(this.db);
      if (c.name) b.delete(F.doc(this.db, 'usernames', normalizeName(c.name)));
      b.delete(F.doc(this.db, 'players', this.uid));
      await b.commit();
      c.name = null; this.game.save.requestSave();
      this.status = 'deleted'; // bu oturumda tekrar yazılmaz
      return true;
    } catch (e) { console.warn('[Bulut] silinemedi', e?.code || e); return false; }
  }
}
