import type { Vec3 } from './types';

/**
 * Üçgen ağırlık merkezleri için düzenli ızgara: bir noktaya en yakın üçgeni
 * bulur (ayna boyamada karşı taraftaki üçgen). Hücreler CSR düzeninde.
 */
export class TriangleGrid {
  private min: Vec3;
  private cell: number;
  private dims: [number, number, number];
  private start: Uint32Array;
  private items: Uint32Array;

  constructor(
    private centroids: Float32Array,
    cellSize: number,
  ) {
    const n = centroids.length / 3;
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let t = 0; t < n; t++) {
      for (let k = 0; k < 3; k++) {
        const v = centroids[3 * t + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
    // çok büyük ızgaradan kaçın: kenar başına en fazla 256 hücre
    const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-6);
    this.cell = Math.max(cellSize, extent / 256);
    this.min = min;
    this.dims = [0, 1, 2].map((k) => Math.max(1, Math.ceil((max[k] - min[k]) / this.cell) + 1)) as [number, number, number];
    const cellOf = new Uint32Array(n);
    const count = new Uint32Array(this.dims[0] * this.dims[1] * this.dims[2] + 1);
    for (let t = 0; t < n; t++) {
      const c = this.index(centroids[3 * t], centroids[3 * t + 1], centroids[3 * t + 2]);
      cellOf[t] = c;
      count[c + 1]++;
    }
    for (let i = 1; i < count.length; i++) count[i] += count[i - 1];
    this.start = count;
    const fill = count.slice(0, count.length - 1);
    this.items = new Uint32Array(n);
    for (let t = 0; t < n; t++) this.items[fill[cellOf[t]]++] = t;
  }

  private coord(v: number, k: number): number {
    return Math.min(this.dims[k] - 1, Math.max(0, Math.floor((v - this.min[k]) / this.cell)));
  }

  private index(x: number, y: number, z: number): number {
    return this.coord(x, 0) + this.dims[0] * (this.coord(y, 1) + this.dims[1] * this.coord(z, 2));
  }

  /** `p`'ye en yakın üçgen; `maxDist` içinde yoksa -1. */
  nearest(p: Vec3, maxDist = Infinity): number {
    const c = this.centroids;
    const cx = this.coord(p[0], 0);
    const cy = this.coord(p[1], 1);
    const cz = this.coord(p[2], 2);
    let best = -1;
    let bestD2 = maxDist * maxDist;
    const maxRing = Math.max(...this.dims);
    for (let r = 0; r <= maxRing; r++) {
      // bu halkadaki en yakın hücre bile daha uzaksa dur
      const ringDist = (r - 1) * this.cell;
      if (ringDist > 0 && ringDist * ringDist > bestD2) break;
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || x >= this.dims[0]) continue;
        for (let y = cy - r; y <= cy + r; y++) {
          if (y < 0 || y >= this.dims[1]) continue;
          for (let z = cz - r; z <= cz + r; z++) {
            if (z < 0 || z >= this.dims[2]) continue;
            // sadece halkanın kabuğu
            if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== r) continue;
            const cell = x + this.dims[0] * (y + this.dims[1] * z);
            for (let i = this.start[cell]; i < this.start[cell + 1]; i++) {
              const t = this.items[i];
              const dx = c[3 * t] - p[0];
              const dy = c[3 * t + 1] - p[1];
              const dz = c[3 * t + 2] - p[2];
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < bestD2) {
                bestD2 = d2;
                best = t;
              }
            }
          }
        }
      }
    }
    return best;
  }
}

/** `axis` eksenine dik, `offset` konumundaki düzleme göre ayna görüntüsü. */
export function mirrorPoint(p: Vec3, axis: 0 | 1 | 2, offset: number): Vec3 {
  const q: Vec3 = [p[0], p[1], p[2]];
  q[axis] = 2 * offset - p[axis];
  return q;
}
