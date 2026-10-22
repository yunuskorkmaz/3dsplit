/**
 * X100: kesim kapağının iç üçgenlemesi. Halkadan örülen kapak ince uzun üçgenlerden
 * oluşur; gölgede çizgi bırakır. Burada kapağın düzlemdeki (2B) üçgenlemesi iç
 * kenarları bölünerek sıklaştırılır, Delaunay çevirmesiyle üçgenler dolgunlaşır,
 * iç noktaların yüksekliği halkadan Laplace ile (zar gibi) yumuşak dağıtılır.
 * Sınır köşeleri ve sınır kenarları değişmez: kapak, gövdeyle aynı halkaya oturur.
 */

export interface CapMesh {
  /** 2B köşeler (x, y çiftleri). İlk `boundary` köşe halkadır. */
  xy: number[];
  /** Köşe başına düzleme dik yükseklik. */
  h: number[];
  /** Üçgenler (köşe numarası üçlüleri), saat yönünün tersine. */
  tris: number[];
}

const key = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a);

function edgeMap(tris: number[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let t = 0; t < tris.length / 3; t++) {
    for (let e = 0; e < 3; e++) {
      const a = tris[3 * t + e];
      const b = tris[3 * t + ((e + 1) % 3)];
      const k = key(a, b);
      const list = m.get(k);
      if (list) list.push(t);
      else m.set(k, [t]);
    }
  }
  return m;
}

function area2(xy: number[], a: number, b: number, c: number): number {
  return (
    (xy[2 * b] - xy[2 * a]) * (xy[2 * c + 1] - xy[2 * a + 1]) -
    (xy[2 * c] - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1])
  );
}

function len(xy: number[], a: number, b: number): number {
  return Math.hypot(xy[2 * a] - xy[2 * b], xy[2 * a + 1] - xy[2 * b + 1]);
}

/** Üçgende `a` ve `b`'nin karşısındaki köşe. */
function opposite(tris: number[], t: number, a: number, b: number): number {
  for (let e = 0; e < 3; e++) {
    const v = tris[3 * t + e];
    if (v !== a && v !== b) return v;
  }
  return -1;
}

/** `a`dan `b`ye yönlü kenarı içeren üçgen mi (saat yönünün tersine sırada). */
function hasDirected(tris: number[], t: number, a: number, b: number): boolean {
  for (let e = 0; e < 3; e++)
    if (tris[3 * t + e] === a && tris[3 * t + ((e + 1) % 3)] === b) return true;
  return false;
}

/** Uzun iç kenarları ortadan böler; bir turda bir üçgene en çok bir bölme. */
function splitPass(cap: CapMesh, target: number, maxVerts: number): boolean {
  const { xy, h, tris } = cap;
  const edges = edgeMap(tris);
  const long: { a: number; b: number; l: number }[] = [];
  for (const [k, ts] of edges) {
    if (ts.length !== 2) continue;
    const a = Math.floor(k / 4194304);
    const b = k % 4194304;
    const l = len(xy, a, b);
    if (l > target) long.push({ a, b, l });
  }
  if (!long.length) return false;
  long.sort((p, q) => q.l - p.l);
  const touched = new Uint8Array(tris.length / 3);
  let changed = false;
  for (const { a, b } of long) {
    if (xy.length / 2 >= maxVerts) break;
    const [t1, t2] = edges.get(key(a, b)) as number[];
    if (touched[t1] || touched[t2]) continue;
    touched[t1] = touched[t2] = 1;
    // t1: a→b yönlü kenarı taşıyan, t2: b→a
    const [ta, tb] = hasDirected(tris, t1, a, b) ? [t1, t2] : [t2, t1];
    const c = opposite(tris, ta, a, b);
    const d = opposite(tris, tb, a, b);
    const m = xy.length / 2;
    xy.push((xy[2 * a] + xy[2 * b]) / 2, (xy[2 * a + 1] + xy[2 * b + 1]) / 2);
    h.push((h[a] + h[b]) / 2);
    // (a,b,c) → (a,m,c) + (m,b,c); (b,a,d) → (b,m,d) + (m,a,d)
    tris.splice(3 * ta, 3, a, m, c);
    tris.push(m, b, c);
    tris.splice(3 * tb, 3, b, m, d);
    tris.push(m, a, d);
    changed = true;
  }
  return changed;
}

/** Delaunay çevirmesi: karşı açılar toplamı 180°'yi aşan iç kenar çevrilir. */
function flipPass(cap: CapMesh, boundary: number): boolean {
  const { xy, tris } = cap;
  const edges = edgeMap(tris);
  let changed = false;
  const done = new Uint8Array(tris.length / 3);
  for (const [k, ts] of edges) {
    if (ts.length !== 2) continue;
    const [t1, t2] = ts;
    if (done[t1] || done[t2]) continue;
    const a = Math.floor(k / 4194304);
    const b = k % 4194304;
    // halka kenarı (ardışık sınır köşeleri) çevrilmez
    if (a < boundary && b < boundary && (Math.abs(a - b) === 1 || Math.abs(a - b) === boundary - 1))
      continue;
    const [ta, tb] = hasDirected(tris, t1, a, b) ? [t1, t2] : [t2, t1];
    const c = opposite(tris, ta, a, b);
    const d = opposite(tris, tb, a, b);
    const angle = (p: number, q: number, r: number) => {
      const ux = xy[2 * q] - xy[2 * p];
      const uy = xy[2 * q + 1] - xy[2 * p + 1];
      const vx = xy[2 * r] - xy[2 * p];
      const vy = xy[2 * r + 1] - xy[2 * p + 1];
      return Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy);
    };
    if (angle(c, a, b) + angle(d, a, b) <= Math.PI + 1e-9) continue;
    // yeni üçgenler (c,d,b) ve (d,c,a) ters dönmemeli
    if (area2(xy, c, d, b) <= 0 || area2(xy, d, c, a) <= 0) continue;
    tris.splice(3 * ta, 3, c, d, b);
    tris.splice(3 * tb, 3, d, c, a);
    done[t1] = done[t2] = 1;
    changed = true;
  }
  return changed;
}

/** İç köşelerin yüksekliği: komşu ortalaması (Jacobi), sınır sabit. */
function relaxHeights(cap: CapMesh, boundary: number, iterations: number): void {
  const n = cap.h.length;
  if (n === boundary) return;
  const nb: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < cap.tris.length; i += 3)
    for (let e = 0; e < 3; e++) {
      const a = cap.tris[i + e];
      const b = cap.tris[i + ((e + 1) % 3)];
      nb[a].push(b);
      nb[b].push(a);
    }
  let h = cap.h.slice();
  for (let it = 0; it < iterations; it++) {
    const next = h.slice();
    for (let v = boundary; v < n; v++) {
      let s = 0;
      for (const w of nb[v]) s += h[w];
      next[v] = nb[v].length ? s / nb[v].length : h[v];
    }
    h = next;
  }
  cap.h = h;
}

/**
 * Halkadan örülmüş kapağı sıklaştırır. `target`: hedef kenar uzunluğu (2B),
 * genelde halkanın ortalama kenarı. Ters ya da çökük üçgen varsa (izdüşümde
 * üst üste düşen köşeler) dokunmadan döner.
 */
export function refineCap(cap: CapMesh, target: number, maxVerts = 20000): CapMesh {
  const boundary = cap.h.length;
  for (let i = 0; i < cap.tris.length; i += 3)
    if (area2(cap.xy, cap.tris[i], cap.tris[i + 1], cap.tris[i + 2]) <= 1e-12) return cap;
  const out: CapMesh = { xy: cap.xy.slice(), h: cap.h.slice(), tris: cap.tris.slice() };
  for (let pass = 0; pass < 16; pass++) {
    const split = splitPass(out, target, maxVerts);
    for (let f = 0; f < 4 && flipPass(out, boundary); f++);
    if (!split) break;
  }
  relaxHeights(out, boundary, 200);
  return out;
}

/** Üçgenlerin en küçük iç açısı, derece (test ve ölçüm için). */
export function minAngle(cap: CapMesh): number {
  let worst = 180;
  const { xy, tris } = cap;
  for (let i = 0; i < tris.length; i += 3) {
    const v = [tris[i], tris[i + 1], tris[i + 2]];
    for (let e = 0; e < 3; e++) {
      const p = v[e];
      const q = v[(e + 1) % 3];
      const r = v[(e + 2) % 3];
      const ux = xy[2 * q] - xy[2 * p];
      const uy = xy[2 * q + 1] - xy[2 * p + 1];
      const wx = xy[2 * r] - xy[2 * p];
      const wy = xy[2 * r + 1] - xy[2 * p + 1];
      const a = Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy);
      worst = Math.min(worst, (a * 180) / Math.PI);
    }
  }
  return worst;
}
