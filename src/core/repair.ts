import { signedVolume } from './geometry';
import { boundaryLoops, buildAdjacency, connectedComponents, NON_MANIFOLD } from './topology';
import type { MeshData } from './types';
import { weldVertices } from './weld';

export interface RepairReport {
  inputTriangles: number;
  outputTriangles: number;
  removedDegenerate: number;
  removedDuplicate: number;
  flippedTriangles: number;
  filledHoles: number;
  nonManifoldEdges: number;
}

/**
 * Yüklemede çalışan temel onarım: köşe kaynaştırma, dejenere ve tekrarlı
 * üçgen silme, yönelim düzeltme, delik kapama. Manifold garantisi vermez;
 * sonuç yine de kernel'de doğrulanmalı.
 */
export function repairMesh(positions: Float32Array, indices?: Uint32Array): { mesh: MeshData; report: RepairReport } {
  const inputTriangles = (indices ? indices.length : positions.length / 3) / 3;
  const welded = weldVertices(positions, indices);
  const cleaned = removeBadTriangles(welded);
  const oriented = orientConsistently(cleaned.mesh);
  const filled = fillHoles(oriented.mesh);
  const adj = buildAdjacency(filled.mesh);
  let nonManifoldEdges = 0;
  for (let i = 0; i < adj.length; i++) if (adj[i] === NON_MANIFOLD) nonManifoldEdges++;
  return {
    mesh: filled.mesh,
    report: {
      inputTriangles,
      outputTriangles: filled.mesh.indices.length / 3,
      removedDegenerate: cleaned.degenerate,
      removedDuplicate: cleaned.duplicate,
      flippedTriangles: oriented.flipped,
      filledHoles: filled.holes,
      nonManifoldEdges,
    },
  };
}

function removeBadTriangles(mesh: MeshData): { mesh: MeshData; degenerate: number; duplicate: number } {
  const { positions: p, indices: idx } = mesh;
  const keep: number[] = [];
  const seen = new Set<string>();
  let degenerate = 0;
  let duplicate = 0;
  for (let t = 0; t < idx.length / 3; t++) {
    const a = idx[3 * t];
    const b = idx[3 * t + 1];
    const c = idx[3 * t + 2];
    if (a === b || b === c || a === c) {
      degenerate++;
      continue;
    }
    const ux = p[3 * b] - p[3 * a];
    const uy = p[3 * b + 1] - p[3 * a + 1];
    const uz = p[3 * b + 2] - p[3 * a + 2];
    const vx = p[3 * c] - p[3 * a];
    const vy = p[3 * c + 1] - p[3 * a + 1];
    const vz = p[3 * c + 2] - p[3 * a + 2];
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area2 === 0) {
      degenerate++;
      continue;
    }
    const sorted = [a, b, c].sort((x, y) => x - y);
    const key = `${sorted[0]},${sorted[1]},${sorted[2]}`;
    if (seen.has(key)) {
      duplicate++;
      continue;
    }
    seen.add(key);
    keep.push(a, b, c);
  }
  return { mesh: { positions: p, indices: new Uint32Array(keep) }, degenerate, duplicate };
}

function edgeDirection(idx: Uint32Array, t: number, a: number, b: number): number {
  // t üçgeninde a->b kenarı varsa 1, b->a varsa -1, yoksa 0
  for (let e = 0; e < 3; e++) {
    const x = idx[3 * t + e];
    const y = idx[3 * t + ((e + 1) % 3)];
    if (x === a && y === b) return 1;
    if (x === b && y === a) return -1;
  }
  return 0;
}

function flipTriangle(idx: Uint32Array, t: number): void {
  const tmp = idx[3 * t + 1];
  idx[3 * t + 1] = idx[3 * t + 2];
  idx[3 * t + 2] = tmp;
}

/** Komşu üçgenlerin yönelimini BFS ile eşitler, sonra her bileşeni dışa baktırır. */
function orientConsistently(mesh: MeshData): { mesh: MeshData; flipped: number } {
  const idx = new Uint32Array(mesh.indices);
  const out: MeshData = { positions: mesh.positions, indices: idx };
  const adj = buildAdjacency(out);
  const triCount = idx.length / 3;
  const visited = new Uint8Array(triCount);
  const flippedFlag = new Uint8Array(triCount);
  const stack: number[] = [];
  for (let s = 0; s < triCount; s++) {
    if (visited[s]) continue;
    visited[s] = 1;
    stack.push(s);
    while (stack.length) {
      const t = stack.pop() as number;
      for (let e = 0; e < 3; e++) {
        const n = adj[3 * t + e];
        if (n < 0 || visited[n]) continue;
        const a = idx[3 * t + e];
        const b = idx[3 * t + ((e + 1) % 3)];
        if (edgeDirection(idx, n, a, b) === 1) {
          flipTriangle(idx, n);
          flippedFlag[n] ^= 1;
        }
        visited[n] = 1;
        stack.push(n);
      }
    }
  }
  const { component, count } = connectedComponents(triCount, adj);
  const groups: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < triCount; t++) groups[component[t]].push(t);
  for (const tris of groups) {
    if (signedVolume(out, tris) < 0) {
      for (const t of tris) {
        flipTriangle(idx, t);
        flippedFlag[t] ^= 1;
      }
    }
  }
  let flipped = 0;
  for (let t = 0; t < triCount; t++) flipped += flippedFlag[t];
  return { mesh: out, flipped };
}

/** Açık sınır halkalarını merkez noktasından yelpaze üçgenlerle kapatır. */
function fillHoles(mesh: MeshData): { mesh: MeshData; holes: number } {
  const adj = buildAdjacency(mesh);
  const triCount = mesh.indices.length / 3;
  // non-manifold kenarlar delik değil: onları "komşusu var" gibi göster (tüm üçgenler maskede)
  for (let i = 0; i < adj.length; i++) if (adj[i] === NON_MANIFOLD) adj[i] = 0;
  const openLoops = boundaryLoops(mesh, adj, new Uint8Array(triCount).fill(1));
  if (openLoops.length === 0) return { mesh, holes: 0 };
  const positions = Array.from(mesh.positions);
  const indices = Array.from(mesh.indices);
  for (const loop of openLoops) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const v of loop) {
      cx += positions[3 * v];
      cy += positions[3 * v + 1];
      cz += positions[3 * v + 2];
    }
    const c = positions.length / 3;
    positions.push(cx / loop.length, cy / loop.length, cz / loop.length);
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      indices.push(b, a, c);
    }
  }
  return {
    mesh: { positions: new Float32Array(positions), indices: new Uint32Array(indices) },
    holes: openLoops.length,
  };
}
