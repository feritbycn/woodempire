// Wood Empire — özgün ses efektleri ve müzik sentezleyici.
// Tüm sesler bu betikle sıfırdan üretilir (lisans sorunu yok).
// Kullanım: node scripts/gen-audio.mjs  (ffmpeg gerekli; mp3'e çevirir)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SR = 44100;
const OUT = path.resolve('public/audio');
const TMP = path.resolve('scripts/.audio-tmp');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const TAU = Math.PI * 2;

function lowpass(x, cut) { const rc = 1 / (TAU * cut), dt = 1 / SR, a = dt / (rc + dt); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; }
function highpass(x, cut) { const rc = 1 / (TAU * cut), dt = 1 / SR, a = rc / (rc + dt); let px = 0, y = 0; for (let i = 0; i < x.length; i++) { y = a * (y + x[i] - px); px = x[i]; x[i] = y; } return x; }
function norm(x, peak = 0.85) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m; return x; }
function fadeEdges(x, ms = 4) { const n = Math.floor((ms / 1000) * SR); for (let i = 0; i < n && i < x.length; i++) { x[i] *= i / n; x[x.length - 1 - i] *= i / n; } return x; }
function mix(dst, src, at = 0, g = 1) { const o = Math.floor(at * SR); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g; return dst; }
function bell(freq, dur, g = 1) {
  const x = buf(dur);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = g * env(t, 0.003, dur / 4) * (Math.sin(TAU * freq * t) + 0.4 * Math.sin(TAU * freq * 2.01 * t) * Math.exp(-t * 6) + 0.2 * Math.sin(TAU * freq * 3.02 * t) * Math.exp(-t * 10));
  }
  return x;
}
function pluck(freq, dur, g = 1, bright = 0.5) {
  // Karplus-Strong
  const x = buf(dur); const N = Math.max(2, Math.round(SR / freq)); const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = rnd() * (0.5 + bright * 0.5);
  let idx = 0;
  for (let i = 0; i < x.length; i++) {
    const a = line[idx], b = line[(idx + 1) % N];
    const v = (a + b) * 0.5 * 0.996;
    line[idx] = v; x[i] = a * g; idx = (idx + 1) % N;
  }
  return lowpass(x, 3500);
}
function noise(dur) { const x = buf(dur); for (let i = 0; i < x.length; i++) x[i] = rnd(); return x; }
function sweep(f0, f1, dur, type = 'sine', g = 1, a = 0.005, d = 0.1) {
  const x = buf(dur); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, f = f0 * Math.pow(f1 / f0, t / dur); ph += TAU * f / SR;
    const w = type === 'sine' ? Math.sin(ph) : type === 'square' ? Math.sign(Math.sin(ph)) * 0.6 : type === 'saw' ? ((ph / TAU) % 1) * 2 - 1 : Math.asin(Math.sin(ph)) * 0.63;
    x[i] = w * g * env(t, a, d);
  }
  return x;
}
function reverb(x, wet = 0.25, sec = 1.2) {
  const out = new Float32Array(x.length + Math.floor(sec * SR));
  out.set(x);
  const taps = [[0.029, 0.5], [0.037, 0.45], [0.041, 0.4], [0.053, 0.35]];
  for (const [d, fb] of taps) {
    const n = Math.floor(d * SR); const line = new Float32Array(n); let k = 0;
    for (let i = 0; i < out.length; i++) {
      const y = line[k]; line[k] = (i < x.length ? x[i] : 0) + y * (fb + 0.4);
      out[i] += y * wet * 0.5; k = (k + 1) % n;
    }
  }
  return lowpass(out, 6000);
}

const sounds = {
  chop: () => { const x = buf(0.22); const n = lowpass(noise(0.22), 1800); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = n[i] * env(t, 0.001, 0.03) * 0.9 + Math.sin(TAU * 140 * t * (1 - t)) * env(t, 0.001, 0.05) + Math.sin(TAU * 420 * t) * env(t, 0.001, 0.015) * 0.4; } return x; },
  creak: () => { const x = buf(1.0); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; const f = 90 + Math.sin(t * 9) * 25 + t * 40; ph += TAU * f / SR; x[i] = (((ph / TAU) % 1) * 2 - 1) * env(t, 0.15, 0.5) * (0.6 + 0.4 * Math.sin(t * 60)); } return lowpass(x, 1400); },
  thud: () => { const x = buf(0.9); const n = lowpass(noise(0.9), 500); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(TAU * (55 - t * 20) * t) * env(t, 0.002, 0.18) * 1.2 + n[i] * env(t, 0.002, 0.25) * 1.5; } return mix(x, lowpass(noise(0.5), 3000).map((v, i) => v * env(i / SR, 0.05, 0.12) * 0.25), 0.05); },
  woodDrop: () => { const x = buf(0.16); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (Math.sin(TAU * 380 * t) + 0.6 * Math.sin(TAU * 610 * t) + 0.3 * Math.sin(TAU * 980 * t)) * env(t, 0.001, 0.03); } return x; },
  pickup: () => sweep(520, 980, 0.09, 'sine', 1, 0.002, 0.04),
  drop: () => sweep(760, 420, 0.09, 'tri', 1, 0.002, 0.04),
  cash: () => { const x = buf(0.9); mix(x, bell(1318.5, 0.6, 0.7)); mix(x, bell(1760, 0.7, 0.8), 0.08); mix(x, lowpass(noise(0.15), 7000).map((v, i) => v * env(i / SR, 0.001, 0.03) * 0.3)); return x; },
  mission: () => { const x = buf(1.3); [523.3, 659.3, 784, 1046.5].forEach((f, i) => mix(x, bell(f, 0.8, 0.7), i * 0.09)); return reverb(x, 0.3, 0.6); },
  levelup: () => { const x = buf(2.0); [392, 523.3, 659.3, 784, 1046.5].forEach((f, i) => mix(x, bell(f, 0.9, 0.6), i * 0.08)); [523.3, 659.3, 784].forEach((f) => mix(x, bell(f, 1.4, 0.5), 0.5)); return reverb(x, 0.35, 1); },
  upgrade: () => { const x = buf(0.6); mix(x, sweep(300, 1200, 0.35, 'tri', 0.6, 0.01, 0.2)); [880, 1174.7, 1568].forEach((f, i) => mix(x, bell(f, 0.3, 0.4), 0.12 + i * 0.06)); return x; },
  build: () => { const x = buf(1.0); for (let k = 0; k < 3; k++) { const h = buf(0.12); for (let i = 0; i < h.length; i++) { const t = i / SR; h[i] = (Math.sin(TAU * 900 * t) * 0.5 + rnd() * 0.6) * env(t, 0.001, 0.02); } mix(x, h, k * 0.16); } mix(x, bell(784, 0.5, 0.5), 0.5); mix(x, bell(1046.5, 0.5, 0.5), 0.58); return x; },
  unlock: () => { const x = buf(1.6); [659.3, 784, 987.8, 1318.5, 1568].forEach((f, i) => mix(x, bell(f, 1.0, 0.5), i * 0.07)); mix(x, sweep(200, 2000, 0.6, 'sine', 0.2, 0.2, 0.3)); return reverb(x, 0.4, 1); },
  horn: () => { const x = buf(0.7); const a = sweep(330, 330, 0.65, 'square', 0.5, 0.02, 0.3), b = sweep(415, 415, 0.65, 'square', 0.4, 0.02, 0.3); mix(x, a); mix(x, b); return lowpass(x, 2200); },
  brake: () => { const n = highpass(noise(0.5), 2500); for (let i = 0; i < n.length; i++) n[i] *= env(i / SR, 0.03, 0.12) * 0.6; return n; },
  load: () => { const x = buf(0.12); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (Math.sin(TAU * 220 * t) + rnd() * 0.3) * env(t, 0.001, 0.025); } return lowpass(x, 2000); },
  produce: () => { const x = buf(0.18); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (Math.sign(Math.sin(TAU * 160 * t)) * 0.4 + rnd() * 0.5) * env(t, 0.001, 0.03); } return lowpass(x, 3000); },
  step: () => { const n = lowpass(noise(0.06), 900); for (let i = 0; i < n.length; i++) n[i] *= env(i / SR, 0.002, 0.012); return n; },
  whoosh: () => { const n = noise(0.45); const x = buf(0.45); let y = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; const c = 0.02 + 0.2 * Math.sin(Math.PI * t / 0.45); y += c * (n[i] - y); x[i] = y * Math.sin(Math.PI * t / 0.45); } return x; },
  magnet: () => { const x = buf(0.6); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; ph += TAU * (300 + Math.sin(t * 40) * 80 + t * 400) / SR; x[i] = Math.sin(ph) * env(t, 0.02, 0.25); } return x; },
  error: () => { const x = sweep(180, 140, 0.25, 'square', 0.6, 0.005, 0.12); return lowpass(x, 1500); },
  click: () => { const x = buf(0.04); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(TAU * 1500 * t) * env(t, 0.0005, 0.006); } return x; },
  hire: () => { const x = buf(0.7); mix(x, sweep(900, 1500, 0.18, 'sine', 0.6, 0.01, 0.1)); mix(x, sweep(1100, 1900, 0.25, 'sine', 0.6, 0.01, 0.15), 0.22); return x; },
  boost: () => { const x = buf(0.8); mix(x, sweep(200, 1600, 0.6, 'saw', 0.35, 0.02, 0.4)); mix(x, bell(1568, 0.4, 0.5), 0.45); return lowpass(x, 5000); },
  engine: () => { const x = buf(1.2); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; const f = 40 + Math.min(1, t * 2) * 35; ph += TAU * f / SR; x[i] = (((ph / TAU) % 1) * 2 - 1) * env(t, 0.1, 0.6) * (0.7 + 0.3 * Math.sin(t * 80)); } return lowpass(x, 700); },
  // döngüler (ek yerinde kesinti olmaması için tam periyot)
  saw_loop: () => { const d = 1.0; const x = buf(d); for (let i = 0; i < x.length; i++) { const t = i / SR; const f = 180; x[i] = (((f * t) % 1) * 2 - 1) * 0.5 + Math.sin(TAU * 360 * t) * 0.25 + Math.sin(TAU * 2 * t) * 0.1 * Math.sin(TAU * 540 * t); } lowpass(x, 2500); return x; },
  engine_loop: () => { const d = 1.0; const x = buf(d); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (((50 * t) % 1) * 2 - 1) * (0.7 + 0.3 * Math.sin(TAU * 8 * t)) + Math.sin(TAU * 100 * t) * 0.3; } lowpass(x, 600); return x; },
};

/** Rahatlatıcı müzik: pentatonik akustik gitar + yumuşak pad, 84 BPM, ~46 sn döngü */
function music() {
  const bpm = 84, beat = 60 / bpm, bars = 16, dur = bars * 4 * beat;
  const x = buf(dur + 2);
  const prog = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]]; // C Am F G
  const scale = [523.3, 587.3, 659.3, 784, 880, 1046.5];
  seed = 777;
  for (let bar = 0; bar < bars; bar++) {
    const ch = prog[bar % 4];
    const t0 = bar * 4 * beat;
    // pad
    const pad = buf(4 * beat + 0.5);
    for (let i = 0; i < pad.length; i++) { const t = i / SR; let v = 0; for (const f of ch) v += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t + 1); pad[i] = v * 0.05 * Math.min(1, t / 0.6) * Math.min(1, (pad.length / SR - t) / 0.6); }
    mix(x, pad, t0);
    // bas
    mix(x, pluck(ch[0] / 2, 2.0, 0.55, 0.2), t0);
    mix(x, pluck(ch[0] / 2, 1.5, 0.4, 0.2), t0 + 2 * beat);
    // arpej
    for (let k = 0; k < 8; k++) {
      const f = ch[[0, 1, 2, 1, 0, 2, 1, 2][k]] * (k % 4 === 3 ? 2 : 1);
      mix(x, pluck(f, 1.2, 0.22, 0.4), t0 + k * beat / 2);
    }
    // melodi (her iki ölçüde bir cümle)
    if (bar % 2 === 0 && bar > 1) {
      for (let k = 0; k < 5; k++) {
        const r = (rnd() + 1) / 2;
        const f = scale[Math.floor(r * scale.length)];
        mix(x, pluck(f, 1.6, 0.3, 0.7), t0 + k * beat * 0.75 + beat * 0.5);
      }
    }
  }
  const out = reverb(x, 0.3, 1.5).slice(0, Math.floor(dur * SR));
  // döngü geçişi
  const fade = Math.floor(0.25 * SR); for (let i = 0; i < fade; i++) { out[i] *= i / fade; out[out.length - 1 - i] *= i / fade; }
  return out;
}

function writeWav(file, data) {
  const n = data.length; const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-1, Math.min(1, data[i])) * 32767 | 0, 44 + i * 2);
  fs.writeFileSync(file, b);
}

const list = { ...Object.fromEntries(Object.entries(sounds).map(([k, f]) => [k, () => { const x = f(); if (!k.endsWith('_loop')) fadeEdges(x); return norm(x, k.endsWith('_loop') ? 0.6 : 0.85); }])), music: () => norm(music(), 0.7) };
for (const [name, fn] of Object.entries(list)) {
  const wav = path.join(TMP, name + '.wav');
  writeWav(wav, fn());
  const isLoop = name.endsWith('_loop');
  // döngüler için ogg (mp3 baş/son boşluğu döngüde tık sesi yapar), diğerleri mp3
  const out = path.join(OUT, name + (isLoop ? '.ogg' : '.mp3'));
  const args = isLoop ? ['-y', '-v', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', out] : ['-y', '-v', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', name === 'music' ? '112k' : '96k', out];
  execFileSync('ffmpeg', args);
  console.log('✓', path.basename(out), (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
}
fs.rmSync(TMP, { recursive: true, force: true });
