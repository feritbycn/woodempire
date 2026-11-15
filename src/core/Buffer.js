/** Ürün kaydı: [tür, ağaç, depo etiketi, köken bölgesi]. Köken (o) = ürünün üretildiği bölge (0 = ana bölge). */
export function packItem(i) { return i.o != null ? [i.kind, i.wood, i.dep || 0, i.o] : i.dep ? [i.kind, i.wood, i.dep] : [i.kind, i.wood]; }
export function unpackItem([kind, wood, dep, o]) { const it = { kind, wood }; if (dep) it.dep = dep; if (o != null) it.o = o; return it; }
/** Ürün bu bölgeye ait mi? (eski kayıtlarda kökeni olmayan ürün her yere girebilir) */
export function sameOrigin(it, zone) { return it.o == null || it.o === (zone ?? 0); }

/**
 * Buffer: depo, makine girişi/çıkışı, kamyon hazırlık alanı gibi her türlü ürün haznesi.
 * item = { kind, wood }
 */
export class Buffer {
  constructor(capacity, accepts = null) {
    this.items = [];
    this.capacity = capacity;
    this.accepts = accepts; // null => hepsi
    this.hold = 0;          // uçuş halindeki (henüz görsel olarak gelmemiş) ürün sayısı
  }
  get count() { return this.items.length; }
  get free() { return this.capacity - this.items.length; }
  isFull() { return this.items.length >= this.capacity; }
  acceptsKind(kind) { return !this.accepts || this.accepts.includes(kind); }
  canAccept(item) { return this.items.length < this.capacity && this.acceptsKind(item.kind); }
  push(item) { if (!this.canAccept(item)) return false; this.items.push(item); return true; }
  pop(kinds = null) {
    if (!kinds) return this.items.pop() || null;
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (kinds.includes(this.items[i].kind)) return this.items.splice(i, 1)[0];
    }
    return null;
  }
  popMatching(acceptFn) { for (let i = this.items.length - 1; i >= 0; i--) if (acceptFn(this.items[i])) return this.items.splice(i, 1)[0]; return null; }
  /** En değerli ürünü alır (satış için) */
  countKind(kind) { let n = 0; for (const it of this.items) if (it.kind === kind) n++; return n; }
  serialize() { return this.items.map(packItem); }
  load(arr) {
    this.items = [];
    if (!Array.isArray(arr)) return;
    for (const r of arr) { if (this.items.length < this.capacity && (!this.accepts || this.accepts.includes(r[0]))) this.items.push(unpackItem(r)); }
  }
}

/** Taşıyıcı istifi (oyuncu, işçi, forklift) */
export class Stack {
  constructor(capacity) { this.items = []; this.capacity = capacity; this.hold = 0; }
  get count() { return this.items.length; }
  get free() { return Math.max(0, this.capacity - this.items.length); }
  isFull() { return this.items.length >= this.capacity; }
  isEmpty() { return this.items.length === 0; }
  push(item) { if (this.isFull()) return false; this.items.push(item); return true; }
  /** üstten itibaren kabul edilen türdeki ilk ürünü çıkarır */
  popMatching(acceptFn) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (acceptFn(this.items[i])) return this.items.splice(i, 1)[0];
    }
    return null;
  }
  has(kind) { return this.items.some((i) => i.kind === kind); }
  serialize() { return this.items.map(packItem); }
  load(arr) { this.items = (arr || []).map(unpackItem); }
}
