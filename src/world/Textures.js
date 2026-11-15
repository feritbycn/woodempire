import * as THREE from 'three';

const FONT = '"Baloo 2", system-ui, sans-serif';
const cache = new Map();

function canvasTex(w, h, draw, key) {
  if (key && cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (key) cache.set(key, t);
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const PAD_STYLE = {
  drop:  { fill: 'rgba(76,175,80,0.30)', line: '#e8f5e9', icon: 'down', iconColor: '#66bb6a' },
  take:  { fill: 'rgba(255,152,0,0.30)', line: '#fff3e0', icon: 'up', iconColor: '#ffa726' },
  sell:  { fill: 'rgba(76,175,80,0.35)', line: '#ffffff', icon: 'coin', iconColor: '#ffd54f' },
  buy:   { fill: 'rgba(255,193,7,0.35)', line: '#fff8e1', icon: 'coin', iconColor: '#ffca28' },
  build: { fill: 'rgba(33,150,243,0.30)', line: '#e3f2fd', icon: 'hammer', iconColor: '#42a5f5' },
  upgrade: { fill: 'rgba(156,39,176,0.30)', line: '#f3e5f5', icon: 'upgrade', iconColor: '#ce93d8' },
  hire: { fill: 'rgba(255,112,67,0.32)', line: '#fff3e0', icon: 'worker', iconColor: '#ff8a65' },
  buycow: { fill: 'rgba(38,166,154,0.32)', line: '#e0f2f1', icon: 'cow', iconColor: '#4db6ac' },
  buyhen: { fill: 'rgba(38,166,154,0.32)', line: '#e0f2f1', icon: 'hen', iconColor: '#4db6ac' },
  buysheep: { fill: 'rgba(38,166,154,0.32)', line: '#e0f2f1', icon: 'sheep', iconColor: '#4db6ac' },
  buyhive: { fill: 'rgba(38,166,154,0.32)', line: '#e0f2f1', icon: 'hive', iconColor: '#4db6ac' },
};

/** Zemin bırakma/alma alanları (kesik çizgili çerçeve + ok) */
export function padTexture(type) {
  const st = PAD_STYLE[type];
  return canvasTex(256, 256, (ctx, w, h) => {
    roundRect(ctx, 12, 12, w - 24, h - 24, 36);
    ctx.fillStyle = st.fill; ctx.fill();
    ctx.setLineDash([26, 16]); ctx.lineWidth = 12; ctx.strokeStyle = st.line; ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = st.iconColor; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 6;
    const cx = w / 2, cy = h / 2;
    if (st.icon === 'down' || st.icon === 'up') {
      const dir = st.icon === 'down' ? 1 : -1;
      for (let i = 0; i < 2; i++) {
        const y0 = cy - 30 * dir + i * 44 * dir;
        ctx.beginPath(); ctx.moveTo(cx - 52, y0 - 20 * dir); ctx.lineTo(cx, y0 + 24 * dir); ctx.lineTo(cx + 52, y0 - 20 * dir);
        ctx.lineTo(cx + 52, y0 - 2 * dir); ctx.lineTo(cx, y0 + 42 * dir); ctx.lineTo(cx - 52, y0 - 2 * dir); ctx.closePath();
        ctx.fill();
      }
    } else if (st.icon === 'coin') {
      ctx.beginPath(); ctx.arc(cx, cy, 56, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8d6e00'; ctx.font = `800 80px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', cx, cy + 6);
    } else if (['cow', 'hen', 'sheep', 'hive'].includes(st.icon)) {
      // "+" ve hayvan adı
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 10, cy - 70, 20, 64); ctx.fillRect(cx - 32, cy - 48, 64, 20);
      ctx.font = `800 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText({ cow: 'İNEK', hen: 'TAVUK', sheep: 'KOYUN', hive: 'KOVAN' }[st.icon], cx, cy + 42);
    } else if (st.icon === 'worker') {
      // baretli işçi logosu + "İŞÇİ" yazısı
      ctx.beginPath(); ctx.arc(cx, cy - 34, 26, 0, Math.PI * 2); ctx.fillStyle = '#ffe0c2'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy - 40, 30, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#ffc400'; ctx.fill();
      ctx.fillRect(cx - 38, cy - 42, 76, 8);
      ctx.beginPath(); ctx.moveTo(cx - 52, cy + 40); ctx.quadraticCurveTo(cx, cy - 18, cx + 52, cy + 40); ctx.closePath(); ctx.fillStyle = '#ff7043'; ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = `800 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('İŞÇİ', cx, cy + 74);
    } else if (st.icon === 'upgrade') {
      // yukarı ok + "GELİŞTİR" yazısı
      ctx.beginPath(); ctx.moveTo(cx, cy - 78); ctx.lineTo(cx + 54, cy - 22); ctx.lineTo(cx + 22, cy - 22); ctx.lineTo(cx + 22, cy + 20);
      ctx.lineTo(cx - 22, cy + 20); ctx.lineTo(cx - 22, cy - 22); ctx.lineTo(cx - 54, cy - 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `800 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('GELİŞTİR', cx, cy + 66);
    } else if (st.icon === 'hammer') {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.6);
      ctx.fillRect(-8, -20, 16, 90); ctx.fillRect(-40, -46, 80, 30); ctx.restore();
    }
  }, 'pad_' + type);
}

/** Tabela / yazı dokusu */
export function labelTexture(text, opts = {}) {
  const key = 'lbl_' + text + JSON.stringify(opts);
  return canvasTex(opts.w ?? 512, opts.h ?? 128, (ctx, w, h) => {
    roundRect(ctx, 6, 6, w - 12, h - 12, 22);
    ctx.fillStyle = opts.bg ?? '#5d4037'; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = opts.border ?? '#3e2723'; ctx.stroke();
    ctx.fillStyle = opts.color ?? '#fff8e1'; ctx.font = `800 ${opts.size ?? 58}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
  }, key);
}

/** Konveyör bandı dokusu (kaydırılarak hareket hissi verilir) */
export function beltTexture() {
  const t = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#37474f'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#263238';
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 16, w, 6);
    ctx.fillStyle = '#546e7a'; ctx.fillRect(0, 0, 4, h); ctx.fillRect(w - 4, 0, 4, h);
  }, null);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Yol dokusu */
export function roadTexture() {
  const t = canvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5f6368'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    ctx.fillStyle = '#fafafa'; ctx.fillRect(w / 2 - 3, 20, 6, 90); ctx.fillRect(w / 2 - 3, 148, 6, 90);
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(4, 0, 5, h); ctx.fillRect(w - 9, 0, 5, h);
  }, 'road');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Kilitli bölge örtüsü (çapraz çizgili) */
export function lockTexture() {
  const t = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(30,40,30,0.38)'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke();
  }, 'lock');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Yumuşak yuvarlak gölge / parıltı */
export function glowTexture(color = '255,255,255') {
  return canvasTex(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, `rgba(${color},1)`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 'glow' + color);
}
