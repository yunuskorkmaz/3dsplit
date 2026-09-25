import { MinHeap, vertexNeighbors } from './paint';
import type { MeshData } from './types';

/**
 * X36: yüzeyde iki köşe arasındaki en kısa kenar yolu (Dijkstra, kenar
 * uzunluğu ağırlıklı). Yol `from` ile başlar, `to` ile biter. Bağlı değilse
 * boş dizi. Kenar yolu üçgen boyunda zikzak yapar; düzleştirme sonradan
 * sınır yumuşatmayla (X34) yapılır.
 */
export function surfacePath(mesh: MeshData, nbr: { start: Uint32Array; list: Uint32Array }, from: number, to: number): number[] {
  if (from === to) return [from];
  const p = mesh.positions;
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, number>();
  const heap = new MinHeap();
  heap.push(0, from);
  // hedefe düz uzaklık: A* sezgisi (kenar yolu hiçbir zaman düz çizgiden kısa değil)
  const h = (v: number) => Math.hypot(p[3 * v] - p[3 * to], p[3 * v + 1] - p[3 * to + 1], p[3 * v + 2] - p[3 * to + 2]);
  while (heap.size) {
    const [, v] = heap.pop();
    if (v === to) break;
    const dv = dist.get(v) as number;
    for (let i = nbr.start[v]; i < nbr.start[v + 1]; i++) {
      const w = nbr.list[i];
      const d = dv + Math.hypot(p[3 * v] - p[3 * w], p[3 * v + 1] - p[3 * w + 1], p[3 * v + 2] - p[3 * w + 2]);
      if (d < (dist.get(w) ?? Infinity)) {
        dist.set(w, d);
        prev.set(w, v);
        heap.push(d + h(w), w);
      }
    }
  }
  if (!prev.has(to)) return [];
  const path = [to];
  while (path[path.length - 1] !== from) path.push(prev.get(path[path.length - 1]) as number);
  return path.reverse();
}

export { vertexNeighbors };

/**
 * Kapalı köşe halkasının ayırdığı bölge: halka kenarlarından geçmeden
 * yayılan üçgen bileşenleri bulunur, alanı en küçük olan döner (çizilen
 * halkanın içi). Halka yüzeyi ayırmıyorsa null.
 */
export function regionInsideLoop(mesh: MeshData, adj: Int32Array, areas: Float32Array, loop: number[]): Uint8Array | null {
  const idx = mesh.indices;
  const triCount = idx.length / 3;
  const vCount = mesh.positions.length / 3;
  const cut = new Set<number>();
  const key = (a: number, b: number) => (a < b ? a * vCount + b : b * vCount + a);
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    if (a !== b) cut.add(key(a, b));
  }
  const comp = new Int32Array(triCount).fill(-1);
  const compArea: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < triCount; s++) {
    if (comp[s] >= 0) continue;
    const c = compArea.length;
    compArea.push(0);
    comp[s] = c;
    stack.push(s);
    while (stack.length) {
      const t = stack.pop() as number;
      compArea[c] += areas[t];
      for (let e = 0; e < 3; e++) {
        const n = adj[3 * t + e];
        if (n < 0 || comp[n] >= 0) continue;
        if (cut.has(key(idx[3 * t + e], idx[3 * t + ((e + 1) % 3)]))) continue;
        comp[n] = c;
        stack.push(n);
      }
    }
  }
  if (compArea.length < 2) return null;
  // halkaya değen bileşenler arasından en küçüğü (modelin başka kopuk parçası seçilmesin)
  const touching = new Set<number>();
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      if (cut.has(key(idx[3 * t + e], idx[3 * t + ((e + 1) % 3)]))) touching.add(comp[t]);
    }
  }
  let best = -1;
  for (const c of touching) if (best < 0 || compArea[c] < compArea[best]) best = c;
  if (best < 0 || touching.size < 2) return null;
  return Uint8Array.from(comp, (c) => (c === best ? 1 : 0));
}
