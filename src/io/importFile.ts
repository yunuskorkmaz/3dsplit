import * as THREE from 'three';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { parse3mf } from './threeMf';

export interface ImportedObject {
  name: string;
  /** Dünya koordinatında köşe konumları. */
  positions: Float32Array;
  /** Yoksa positions üçgen çorbasıdır. */
  indices?: Uint32Array;
  /** Boyalı 3MF: üçgen başına filament numarası (0: boyasız). */
  labels?: Uint16Array;
  /** Boyalı 3MF: filament renkleri (filament 1 = [0]). */
  filamentColors?: string[];
}

export const ACCEPTED_EXTENSIONS = '.stl,.obj,.3mf,.3dsplit';

/** STL, OBJ veya 3MF dosyasını ham geometriye çevirir. 3MF'teki her nesne ayrı döner. */
export async function importFile(file: File): Promise<ImportedObject[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, '');
  if (ext === 'stl') {
    const geom = new STLLoader().parse(await file.arrayBuffer());
    return [fromGeometry(base, geom)];
  }
  if (ext === 'obj') {
    const group = new OBJLoader().parse(await file.text());
    return [mergeGroup(base, group)];
  }
  if (ext === '3mf') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      // kendi okuyucumuz: Bambu/Orca bileşenleri ve boya
      const parsed = parse3mf(bytes);
      return parsed.objects.map((o) => ({
        name: o.name,
        positions: o.positions,
        indices: o.indices,
        labels: o.paint,
        filamentColors: parsed.filamentColors,
      }));
    } catch (e) {
      console.warn('3MF okuyucu başarısız, three.js yükleyicisi deneniyor', e);
    }
    const group = new ThreeMFLoader().parse(bytes.buffer as ArrayBuffer);
    group.updateMatrixWorld(true);
    const out: ImportedObject[] = [];
    let i = 0;
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        i++;
        out.push(fromGeometry(obj.name || `${base} ${i}`, obj.geometry, obj.matrixWorld));
      }
    });
    if (!out.length) throw new Error('3MF dosyasında mesh bulunamadı.');
    return out;
  }
  throw new Error(`Desteklenmeyen dosya türü: .${ext}`);
}

function fromGeometry(
  name: string,
  geom: THREE.BufferGeometry,
  matrix?: THREE.Matrix4,
): ImportedObject {
  const g = matrix ? geom.clone().applyMatrix4(matrix) : geom;
  const pos = g.getAttribute('position');
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    positions[3 * i] = pos.getX(i);
    positions[3 * i + 1] = pos.getY(i);
    positions[3 * i + 2] = pos.getZ(i);
  }
  const index = g.getIndex();
  return { name, positions, indices: index ? Uint32Array.from(index.array) : undefined };
}

function mergeGroup(name: string, group: THREE.Object3D): ImportedObject {
  group.updateMatrixWorld(true);
  const parts: Float32Array[] = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const g = (obj.geometry as THREE.BufferGeometry).clone().applyMatrix4(obj.matrixWorld);
      const soup = g.index ? g.toNonIndexed() : g;
      parts.push(new Float32Array(soup.getAttribute('position').array));
    }
  });
  const total = parts.reduce((n, p) => n + p.length, 0);
  const positions = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    positions.set(p, off);
    off += p.length;
  }
  return { name, positions };
}
