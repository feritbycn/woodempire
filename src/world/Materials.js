import * as THREE from 'three';

/** Paylaşılan malzemeler: aynı renkler için tek malzeme (draw-call ve bellek tasarrufu) */
const cache = new Map();

export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, flatShading: true, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0.0,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
  });
  cache.set(key, m);
  return m;
}

/** Vertex-color malzemesi (birleştirilmiş modeller için tek çizim çağrısı) */
export const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
export const vcMatMetal = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45, metalness: 0.35 });

/** Ağaç yaprakları için rüzgar salınımı eklenmiş malzeme */
export const windUniforms = { uTime: { value: 0 } };
export const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
leafMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = windUniforms.uTime;
  shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     #ifdef USE_INSTANCING
       vec3 wp = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
     #else
       vec3 wp = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
     #endif
     float sway = max(position.y - 1.2, 0.0) * 0.035;
     transformed.x += sin(uTime * 1.6 + wp.x * 0.35 + wp.z * 0.21) * sway;
     transformed.z += cos(uTime * 1.3 + wp.z * 0.33) * sway * 0.6;`
  );
};

/** Çim (instanced) için rüzgar */
export const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
grassMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = windUniforms.uTime;
  shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     vec3 gp = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
     float k = position.y * 0.28;
     transformed.x += sin(uTime * 2.2 + gp.x * 0.7 + gp.z * 0.4) * k;`
  );
};

export function colorGeometry(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Yükseklik boyunca renk geçişi (gölgelendirme hissi için) */
export function gradientGeometry(geo, bottom, top) {
  geo.computeBoundingBox();
  const b = geo.boundingBox; const h = b.max.y - b.min.y || 1;
  const c0 = new THREE.Color(bottom), c1 = new THREE.Color(top), c = new THREE.Color();
  const pos = geo.attributes.position; const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    c.copy(c0).lerp(c1, (pos.getY(i) - b.min.y) / h);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
