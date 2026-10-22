import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { LabeledMesh } from '../core/types';

/** Proje dosyası uzantısı. İçerik: project.json + parça başına ikili mesh. */
export const PROJECT_EXTENSION = '.3dsplit';
const FORMAT_VERSION = 2;

export interface ProjectPart {
  id: string;
  name: string;
  visible: boolean;
  badge: 'source' | 'new' | null;
  colorSlot: number;
  manifold: boolean;
  /** X98: parçayı üreten işlem. */
  origin?: { feature: string; detail: string };
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
  parts: (Omit<ProjectPart, 'mesh'> & {
    file: string;
    vertices: number;
    triangles: number;
    /** v2: dosyanın sonunda üçgen başına kesim yüzü bayrağı. */
    cut?: boolean;
  })[];
}

/** İkili düzen: positions (float32) | indices (uint32) | labels (uint16), little-endian. v2 kesim bayrağı sonda. */
function packMesh(m: LabeledMesh): { bytes: Uint8Array; cut: boolean } {
  const cut = !!(m.cut && m.cut.length === m.labels.length);
  const out = new Uint8Array(
    m.positions.byteLength +
      m.indices.byteLength +
      m.labels.byteLength +
      (cut ? m.labels.length : 0),
  );
  out.set(new Uint8Array(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength), 0);
  out.set(
    new Uint8Array(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength),
    m.positions.byteLength,
  );
  out.set(
    new Uint8Array(m.labels.buffer, m.labels.byteOffset, m.labels.byteLength),
    m.positions.byteLength + m.indices.byteLength,
  );
  if (cut && m.cut)
    out.set(m.cut, m.positions.byteLength + m.indices.byteLength + m.labels.byteLength);
  return { bytes: out, cut };
}

function unpackMesh(
  bytes: Uint8Array,
  vertices: number,
  triangles: number,
  cut: boolean,
): LabeledMesh {
  // hizalı kopyalar: zip çıktısının ofseti tipli dizi hizasına uymayabilir
  const posBytes = vertices * 12;
  const idxBytes = triangles * 12;
  const labBytes = triangles * 2;
  const cutBytes = cut ? triangles : 0;
  if (bytes.byteLength !== posBytes + idxBytes + labBytes + cutBytes)
    throw new Error('Proje dosyasında parça verisi bozuk.');
  const positions = new Float32Array(bytes.slice(0, posBytes).buffer);
  const indices = new Uint32Array(bytes.slice(posBytes, posBytes + idxBytes).buffer);
  const labels = new Uint16Array(
    bytes.slice(posBytes + idxBytes, posBytes + idxBytes + labBytes).buffer,
  );
  if (!cut) return { positions, indices, labels };
  const flags = new Uint8Array(bytes.slice(posBytes + idxBytes + labBytes).buffer);
  return { positions, indices, labels, cut: flags };
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
      const packed = packMesh(mesh);
      files[file] = packed.bytes;
      return {
        ...rest,
        file,
        vertices: mesh.positions.length / 3,
        triangles: mesh.labels.length,
        ...(packed.cut ? { cut: true } : {}),
      };
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
    parts: json.parts.map(({ file, vertices, triangles, cut, ...rest }) => {
      const bin = files[file];
      if (!bin) throw new Error(`Proje dosyasında ${file} eksik.`);
      return { ...rest, mesh: unpackMesh(bin, vertices, triangles, !!cut) };
    }),
  };
}
