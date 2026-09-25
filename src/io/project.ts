import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { LabeledMesh } from '../core/types';

/** Proje dosyası uzantısı. İçerik: project.json + parça başına ikili mesh. */
export const PROJECT_EXTENSION = '.3dsplit';
const FORMAT_VERSION = 1;

export interface ProjectPart {
  id: string;
  name: string;
  visible: boolean;
  badge: 'source' | 'new' | null;
  colorSlot: number;
  manifold: boolean;
  mesh: LabeledMesh;
}

export interface ProjectSlot {
  id: number;
  name: string;
  color: string;
}

export interface ProjectData {
  parts: ProjectPart[];
  slots: ProjectSlot[];
  activeSlot: number;
  selectedPartId: string | null;
}

interface ProjectJson {
  format: '3dsplit';
  version: number;
  slots: ProjectSlot[];
  activeSlot: number;
  selectedPartId: string | null;
  parts: (Omit<ProjectPart, 'mesh'> & { file: string; vertices: number; triangles: number })[];
}

/** İkili düzen: positions (float32) | indices (uint32) | labels (uint16), little-endian. */
function packMesh(m: LabeledMesh): Uint8Array {
  const out = new Uint8Array(m.positions.byteLength + m.indices.byteLength + m.labels.byteLength);
  out.set(new Uint8Array(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength), 0);
  out.set(
    new Uint8Array(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength),
    m.positions.byteLength,
  );
  out.set(
    new Uint8Array(m.labels.buffer, m.labels.byteOffset, m.labels.byteLength),
    m.positions.byteLength + m.indices.byteLength,
  );
  return out;
}

function unpackMesh(bytes: Uint8Array, vertices: number, triangles: number): LabeledMesh {
  // hizalı kopyalar: zip çıktısının ofseti tipli dizi hizasına uymayabilir
  const posBytes = vertices * 12;
  const idxBytes = triangles * 12;
  const labBytes = triangles * 2;
  if (bytes.byteLength !== posBytes + idxBytes + labBytes)
    throw new Error('Proje dosyasında parça verisi bozuk.');
  const positions = new Float32Array(bytes.slice(0, posBytes).buffer);
  const indices = new Uint32Array(bytes.slice(posBytes, posBytes + idxBytes).buffer);
  const labels = new Uint16Array(bytes.slice(posBytes + idxBytes).buffer);
  return { positions, indices, labels };
}

export function writeProject(data: ProjectData): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const json: ProjectJson = {
    format: '3dsplit',
    version: FORMAT_VERSION,
    slots: data.slots,
    activeSlot: data.activeSlot,
    selectedPartId: data.selectedPartId,
    parts: data.parts.map(({ mesh, ...rest }) => {
      const file = `parts/${rest.id}.bin`;
      files[file] = packMesh(mesh);
      return { ...rest, file, vertices: mesh.positions.length / 3, triangles: mesh.labels.length };
    }),
  };
  files['project.json'] = strToU8(JSON.stringify(json, null, 2));
  // mesh verisi zaten yoğun; hafif sıkıştırma yeterli
  return zipSync(files, { level: 1 });
}

export function readProject(bytes: Uint8Array): ProjectData {
  const files = unzipSync(bytes);
  const raw = files['project.json'];
  if (!raw) throw new Error('Geçerli bir 3dsplit proje dosyası değil (project.json yok).');
  const json = JSON.parse(strFromU8(raw)) as ProjectJson;
  if (json.format !== '3dsplit') throw new Error('Geçerli bir 3dsplit proje dosyası değil.');
  if (json.version > FORMAT_VERSION)
    throw new Error(`Proje daha yeni bir sürümle kaydedilmiş (v${json.version}).`);
  return {
    slots: json.slots,
    activeSlot: json.activeSlot,
    selectedPartId: json.selectedPartId,
    parts: json.parts.map(({ file, vertices, triangles, ...rest }) => {
      const bin = files[file];
      if (!bin) throw new Error(`Proje dosyasında ${file} eksik.`);
      return { ...rest, mesh: unpackMesh(bin, vertices, triangles) };
    }),
  };
}
