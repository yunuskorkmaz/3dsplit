import type { LabeledMesh, MeshData } from '../src/core/types';

/** Merkezi orijinde, kenarı `size` olan, her yüzü n x n kareye bölünmüş kapalı küp. */
export function subdividedCube(size: number, n: number): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  const key = new Map<string, number>();
  const vert = (x: number, y: number, z: number) => {
    const k = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    let i = key.get(k);
    if (i === undefined) {
      i = positions.length / 3;
      key.set(k, i);
      positions.push(x, y, z);
    }
    return i;
  };
  const h = size / 2;
  // her yüz: merkez, u, v (u x v dışa bakar)
  const faces: [number[], number[], number[]][] = [
    [
      [h, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-h, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ],
    [
      [0, h, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    [
      [0, -h, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, 0, h],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -h],
      [0, 1, 0],
      [1, 0, 0],
    ],
  ];
  for (const [c, u, v] of faces) {
    const p = (i: number, j: number) => {
      const s = -h + (size * i) / n;
      const t = -h + (size * j) / n;
      return vert(
        c[0] + u[0] * s + v[0] * t,
        c[1] + u[1] * s + v[1] * t,
        c[2] + u[2] * s + v[2] * t,
      );
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = p(i, j);
        const b = p(i + 1, j);
        const cc = p(i + 1, j + 1);
        const d = p(i, j + 1);
        indices.push(a, b, cc, a, cc, d);
      }
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Merkezi, dış normali verilen düzlemin üstündeki (z > limit) üst yüz üçgenlerini `slot` ile etiketler. */
export function labelWhere(
  mesh: MeshData,
  slot: number,
  pred: (cx: number, cy: number, cz: number) => boolean,
): LabeledMesh {
  const labels = new Uint16Array(mesh.indices.length / 3);
  const p = mesh.positions;
  for (let t = 0; t < labels.length; t++) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[3 * t + k];
      cx += p[3 * v] / 3;
      cy += p[3 * v + 1] / 3;
      cz += p[3 * v + 2] / 3;
    }
    if (pred(cx, cy, cz)) labels[t] = slot;
  }
  return { ...mesh, labels };
}

/** Üçgen çorbasına çevirir (STL gibi). */
export function toSoup(mesh: MeshData): Float32Array {
  const out = new Float32Array(mesh.indices.length * 3);
  for (let i = 0; i < mesh.indices.length; i++) {
    const v = mesh.indices[i];
    out[3 * i] = mesh.positions[3 * v];
    out[3 * i + 1] = mesh.positions[3 * v + 1];
    out[3 * i + 2] = mesh.positions[3 * v + 2];
  }
  return out;
}
