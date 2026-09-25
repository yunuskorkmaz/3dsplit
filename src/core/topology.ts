import { IntTripleTable } from './hashTable';
import type { MeshData } from './types';

/** Kenarın komşusu yok (açık sınır). */
export const NO_NEIGHBOR = -1;
/** Kenar ikiden fazla üçgen tarafından paylaşılıyor. */
export const NON_MANIFOLD = -2;

/**
 * Üçgen komşuluk tablosu. `adj[3t + e]`, t üçgeninin e kenarını
 * (v[e] -> v[(e+1)%3]) paylaşan üçgen.
 */
export function buildAdjacency(mesh: MeshData): Int32Array {
  const idx = mesh.indices;
  const heCount = idx.length;
  const adj = new Int32Array(heCount).fill(NO_NEIGHBOR);
  // kenar (küçük, büyük köşe) -> ilk yarım kenar; tipli dizili hash tablosu
  const table = new IntTripleTable(heCount / 2 + 1);
  const slotOf = new Int32Array(heCount);
  const count = new Uint8Array(table.values.length);
  for (let he = 0; he < heCount; he++) {
    const t = (he / 3) | 0;
    const a = idx[he];
    const b = idx[3 * t + ((he - 3 * t + 1) % 3)];
    const h = a < b ? table.slot(a, b, 0, he) : table.slot(b, a, 0, he);
    slotOf[he] = h;
    if (count[h] < 3) count[h]++;
    if (count[h] === 2) {
      const first = table.values[h];
      adj[first] = t;
      adj[he] = (first / 3) | 0;
    }
  }
  // ikiden fazla üçgenin paylaştığı kenarlar
  for (let he = 0; he < heCount; he++) if (count[slotOf[he]] > 2) adj[he] = NON_MANIFOLD;
  return adj;
}

/**
 * Bağlı bileşenler. `mask` verilirse sadece maskede olan üçgenler dolaşılır;
 * maske dışındakiler -1 alır.
 */
export function connectedComponents(
  triCount: number,
  adj: Int32Array,
  mask?: Uint8Array,
): { component: Int32Array; count: number } {
  const component = new Int32Array(triCount).fill(-1);
  const stack: number[] = [];
  let count = 0;
  for (let s = 0; s < triCount; s++) {
    if (component[s] >= 0 || (mask && !mask[s])) continue;
    component[s] = count;
    stack.push(s);
    while (stack.length) {
      const t = stack.pop() as number;
      for (let e = 0; e < 3; e++) {
        const n = adj[3 * t + e];
        if (n < 0 || component[n] >= 0 || (mask && !mask[n])) continue;
        component[n] = count;
        stack.push(n);
      }
    }
    count++;
  }
  return { component, count };
}

/**
 * Maskedeki üçgen kümesinin sınır halkaları. Her halka, bölge üçgenlerindeki
 * yönüyle (a -> b) sıralı köşe listesi. Dışarıdan bakınca bölge halkanın solunda kalır.
 */
export function boundaryLoops(mesh: MeshData, adj: Int32Array, mask: Uint8Array): number[][] {
  const idx = mesh.indices;
  const triCount = idx.length / 3;
  // başlangıç köşesi -> çıkan sınır kenarlarının bitiş köşeleri
  const next = new Map<number, number[]>();
  let edgeCount = 0;
  for (let t = 0; t < triCount; t++) {
    if (!mask[t]) continue;
    for (let e = 0; e < 3; e++) {
      const n = adj[3 * t + e];
      if (n >= 0 && mask[n]) continue;
      const a = idx[3 * t + e];
      const b = idx[3 * t + ((e + 1) % 3)];
      const list = next.get(a);
      if (list) list.push(b);
      else next.set(a, [b]);
      edgeCount++;
    }
  }
  const loops: number[][] = [];
  let used = 0;
  while (used < edgeCount) {
    let start = -1;
    for (const [a, list] of next) {
      if (list.length) {
        start = a;
        break;
      }
    }
    if (start < 0) break;
    const loop: number[] = [];
    let cur = start;
    while (true) {
      const list = next.get(cur);
      if (!list || list.length === 0) break;
      const nb = list.pop() as number;
      used++;
      loop.push(cur);
      cur = nb;
      if (cur === start) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Üçgen listesinden yeni, sıkıştırılmış bir mesh çıkarır. */
export function extractTriangles(
  mesh: MeshData,
  tris: ArrayLike<number>,
): { mesh: MeshData; vertexMap: Int32Array } {
  const vertexMap = new Int32Array(mesh.positions.length / 3).fill(-1);
  const indices = new Uint32Array(tris.length * 3);
  let vCount = 0;
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[3 * t + k];
      if (vertexMap[v] < 0) vertexMap[v] = vCount++;
      indices[3 * i + k] = vertexMap[v];
    }
  }
  const positions = new Float32Array(vCount * 3);
  for (let v = 0; v < vertexMap.length; v++) {
    const m = vertexMap[v];
    if (m < 0) continue;
    positions[3 * m] = mesh.positions[3 * v];
    positions[3 * m + 1] = mesh.positions[3 * v + 1];
    positions[3 * m + 2] = mesh.positions[3 * v + 2];
  }
  return { mesh: { positions, indices }, vertexMap };
}
