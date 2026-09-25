/**
 * Üç tamsayılık anahtar -> tamsayı değer hash tablosu (açık adresleme,
 * doğrusal yoklama). Milyonlarca kenar/köşe için `Map<string, …>`'ten
 * kat kat hızlı ve belleği tipli dizilerde tutar.
 */
export class IntTripleTable {
  private k0: Int32Array;
  private k1: Int32Array;
  private k2: Int32Array;
  private used: Uint8Array;
  readonly values: Int32Array;
  private mask: number;
  size = 0;

  constructor(expected: number) {
    let cap = 16;
    while (cap < expected * 2) cap <<= 1;
    this.k0 = new Int32Array(cap);
    this.k1 = new Int32Array(cap);
    this.k2 = new Int32Array(cap);
    this.used = new Uint8Array(cap);
    this.values = new Int32Array(cap);
    this.mask = cap - 1;
  }

  /**
   * Anahtarın yuvasını döndürür; yoksa ekler ve `value` yazar. `inserted`
   * son çağrıda yeni eklenip eklenmediğini söyler.
   */
  inserted = false;
  slot(a: number, b: number, c: number, value: number): number {
    let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77) ^ Math.imul(c, 0xc2b2ae3d)) >>> 0;
    h = (h ^ (h >>> 15)) & this.mask;
    while (this.used[h]) {
      if (this.k0[h] === a && this.k1[h] === b && this.k2[h] === c) {
        this.inserted = false;
        return h;
      }
      h = (h + 1) & this.mask;
    }
    this.used[h] = 1;
    this.k0[h] = a;
    this.k1[h] = b;
    this.k2[h] = c;
    this.values[h] = value;
    this.size++;
    this.inserted = true;
    return h;
  }
}
