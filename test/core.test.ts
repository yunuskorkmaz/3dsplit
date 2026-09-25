import { beforeAll, describe, expect, it } from 'vitest';
import { cutRegion, previewCut, splitComponents, type CutOptions } from '../src/core/cut';
import { faceNormalsAndAreas, signedVolume } from '../src/core/geometry';
import { initKernel, toManifold } from '../src/core/kernel';
import { bucketFill, gapFill, smartFill } from '../src/core/paint';
import { repairMesh } from '../src/core/repair';
import { boundaryLoops, buildAdjacency } from '../src/core/topology';
import type { LabeledMesh } from '../src/core/types';
import { labelWhere, subdividedCube, toSoup } from './fixtures';

const baseOpts: CutOptions = {
  mode: 'fast',
  slot: 1,
  depth: 3,
  clearance: 0.2,
  pin: { shape: 'cylinder', radius: 2, length: 6, onPart: true },
};

function volume(m: LabeledMesh): number {
  return signedVolume(m);
}

beforeAll(async () => {
  await initKernel();
});

describe('onarım', () => {
  it('STL çorbasını kaynaştırıp kapalı mesh üretir', () => {
    const cube = subdividedCube(20, 4);
    const { mesh, report } = repairMesh(toSoup(cube));
    expect(mesh.positions.length).toBe(cube.positions.length);
    expect(report.nonManifoldEdges).toBe(0);
    expect(signedVolume(mesh)).toBeCloseTo(8000, 1);
    expect(() => toManifold(mesh).delete()).not.toThrow();
  });

  it('ters normalleri düzeltir ve delik kapatır', () => {
    const cube = subdividedCube(20, 4);
    const idx = new Uint32Array(cube.indices);
    // tüm yönelimi ters çevir, bir üçgeni sil
    for (let t = 0; t < idx.length / 3; t++) [idx[3 * t + 1], idx[3 * t + 2]] = [idx[3 * t + 2], idx[3 * t + 1]];
    const holed = idx.slice(3);
    const { mesh, report } = repairMesh(cube.positions, holed);
    expect(report.filledHoles).toBe(1);
    expect(signedVolume(mesh)).toBeCloseTo(8000, 0);
  });
});

describe('boyama', () => {
  const cube = subdividedCube(20, 4);
  const adj = buildAdjacency(cube);
  const { normals, areas } = faceNormalsAndAreas(cube);

  it('smart fill tek yüzde durur', () => {
    expect(smartFill(adj, normals, 0, 30).length).toBe(32);
    expect(smartFill(adj, normals, 0, 95).length).toBe(192);
  });

  it('bucket fill aynı etiketli bölgeyi doldurur', () => {
    const m = labelWhere(cube, 1, (_x, _y, z) => z > 9.99);
    const top = m.labels.findIndex((l) => l === 1);
    expect(bucketFill(adj, m.labels, top).length).toBe(32);
  });

  it('gap fill küçük adaları komşu renge çevirir', () => {
    const m = labelWhere(cube, 1, (_x, _y, z) => z > 9.99);
    // üst yüzde, tüm komşuları boyalı tek bir üçgeni boşalt
    let top = -1;
    for (let t = 0; t < m.labels.length && top < 0; t++) {
      if (m.labels[t] === 1 && [0, 1, 2].every((e) => m.labels[adj[3 * t + e]] === 1)) top = t;
    }
    m.labels[top] = 0;
    const { tris, newLabels } = gapFill(m, adj, m.labels, areas, 20);
    expect(Array.from(tris)).toEqual([top]);
    expect(newLabels[0]).toBe(1);
  });

  it('sınır halkası çıkarır', () => {
    const m = labelWhere(cube, 1, (_x, _y, z) => z > 9.99);
    const mask = Uint8Array.from(m.labels);
    const loops = boundaryLoops(cube, adj, mask);
    expect(loops.length).toBe(1);
    expect(loops[0].length).toBe(16);
  });
});

describe('kesim', () => {
  const cube = subdividedCube(20, 10);
  // üst kapak: z > 5 olan tüm yüzey (üst yüz + yanların üst çeyreği)
  const capRegion = labelWhere(cube, 1, (_x, _y, z) => z > 5);
  // üst yüzün ortasında 10x10 yama
  const patch = labelWhere(cube, 1, (x, y, z) => z > 9.99 && Math.abs(x) < 4 && Math.abs(y) < 4);

  it('Fast: düz kapakla ayırır', () => {
    const r = cutRegion(capRegion, { ...baseOpts, mode: 'fast' });
    expect(r.parts.length).toBe(1);
    // sınır z=4..6 arasında zikzak; kapak ortalama z=5 civarında
    expect(Math.abs(volume(r.parts[0]) - 2000)).toBeLessThan(80);
    expect(volume(r.parts[0]) + volume(r.body)).toBeCloseTo(8000, 1);
    expect(r.warnings).toEqual([]);
  });

  it('Keys: pim parçaya eklenir, yuva gövdeden çıkarılır', () => {
    const fast = cutRegion(capRegion, { ...baseOpts, mode: 'fast' });
    const r = cutRegion(capRegion, { ...baseOpts, mode: 'keys' });
    const partBase = volume(fast.parts[0]);
    const bodyBase = volume(fast.body);
    const pinVol = Math.PI * 4 * 6;
    expect(volume(r.parts[0])).toBeGreaterThan(partBase + pinVol * 0.4);
    expect(volume(r.parts[0])).toBeLessThan(partBase + pinVol * 0.6);
    const holeVol = Math.PI * 2.2 * 2.2 * 3.2;
    expect(volume(r.body)).toBeGreaterThan(bodyBase - holeVol * 1.2);
    expect(volume(r.body)).toBeLessThan(bodyBase - holeVol * 0.8);
    expect(r.warnings).toEqual([]);
  });

  it('Keys: pim ince duvara taşarsa uyarır', () => {
    const r = cutRegion(capRegion, { ...baseOpts, mode: 'keys', pin: { ...baseOpts.pin, length: 14 } });
    expect(r.warnings.length).toBe(1);
  });

  it('Socket: tapa derinlik kadar, yuva clearance kadar büyük', () => {
    const r = cutRegion(patch, { ...baseOpts, mode: 'socket' });
    expect(r.parts.length).toBe(1);
    expect(volume(r.parts[0])).toBeCloseTo(192, 0);
    const bodyVol = volume(r.body);
    expect(bodyVol).toBeLessThan(8000 - 192 - 10);
    expect(bodyVol).toBeGreaterThan(8000 - 8.4 * 8.4 * 3.2 - 1);
    // gövde etiketleri: tapa bölgesi kalmamalı
    expect(r.body.labels.includes(1)).toBe(false);
    expect(r.parts[0].labels.every((l) => l === 1)).toBe(true);
  });

  it('Socket: yükseklik alanı olmayan bölgede yedek yöntem', () => {
    const r = cutRegion(capRegion, { ...baseOpts, mode: 'socket', direction: [0, 0, 1] });
    expect(r.warnings.length).toBe(1);
    expect(volume(r.parts[0])).toBeCloseTo(1200, 0);
  });

  it('önizleme hacim ve pim döndürür', () => {
    const p = previewCut(capRegion, { ...baseOpts, mode: 'keys' });
    expect(p.volumes.length).toBe(1);
    expect(p.pins.length).toBe(1);
    const s = previewCut(patch, { ...baseOpts, mode: 'socket' });
    expect(s.volumes.length).toBe(1);
  });

  it('boş slot hata verir', () => {
    expect(() => cutRegion(capRegion, { ...baseOpts, slot: 5 })).toThrow();
  });

  it('Split kopuk parçaları ayırır', () => {
    const r = cutRegion(labelWhere(cube, 1, (_x, _y, z) => Math.abs(z) < 2), { ...baseOpts, mode: 'fast' });
    const pieces = splitComponents(r.body);
    expect(pieces.length).toBe(2);
  });
});
