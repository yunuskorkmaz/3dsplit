import { strFromU8, unzipSync } from 'fflate';

/** 3MF'ten okunan nesne: dünya koordinatında indeksli mesh + üçgen başına boya durumu. */
export interface ThreeMfObject {
  name: string;
  positions: Float32Array;
  indices: Uint32Array;
  /** Üçgen başına filament numarası (0: boyasız). Boya yoksa undefined. */
  paint?: Uint16Array;
  /** X109: Bambu/Orca nesne filamenti (1'den); boyasız yüzey bununla basılır. */
  filament?: number;
  /** X121: Bambu plakası (1'den) ve adı. */
  plate?: { id: number; name: string };
}

/** X121: yan yana dizilen plakaların arasındaki boşluk, mm. */
export const PLATE_GAP = 20;

/**
 * X121: Bambu plakaları dünyada ızgara halinde durur (2. sütun, alt satır…). Çok
 * plakalı dosyada her plaka kendi yerleşimini korur, plakalar X'te yan yana
 * `PLATE_GAP` arayla dizilir, Y'de ilk plakaya hizalanır. Ad plakayı taşır.
 */
function placePlatesSideBySide(objects: ThreeMfObject[]): void {
  const ids = [...new Set(objects.map((o) => o.plate?.id ?? 0))].sort((a, b) => a - b);
  if (ids.length < 2) return;
  let cursor = 0;
  let baseY = 0;
  ids.forEach((id, i) => {
    const group = objects.filter((o) => (o.plate?.id ?? 0) === id);
    const min = [Infinity, Infinity];
    const max = [-Infinity, -Infinity];
    for (const o of group)
      for (let k = 0; k < o.positions.length; k += 3)
        for (let a = 0; a < 2; a++) {
          const v = o.positions[k + a];
          if (v < min[a]) min[a] = v;
          if (v > max[a]) max[a] = v;
        }
    if (i === 0) {
      cursor = min[0];
      baseY = min[1];
    }
    const dx = cursor - min[0];
    const dy = baseY - min[1];
    for (const o of group) {
      for (let k = 0; k < o.positions.length; k += 3) {
        o.positions[k] += dx;
        o.positions[k + 1] += dy;
      }
      const label = o.plate ? o.plate.name || `Plaka ${o.plate.id}` : 'Plakasız';
      o.name = `${label} · ${o.name}`;
    }
    cursor = max[0] + dx + PLATE_GAP;
  });
}

export interface ThreeMfFile {
  objects: ThreeMfObject[];
  /** Bambu/Orca proje ayarlarındaki filament renkleri (filament 1 = [0]). */
  filamentColors: string[];
}

interface RawMesh {
  positions: number[];
  indices: number[];
  paint: number[];
  painted: boolean;
}

interface RawObject {
  name: string;
  mesh?: RawMesh;
  components: { path: string | null; objectId: string; transform: number[] }[];
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

/**
 * 3MF okuyucu (A1, X9). Çekirdek 3MF ve Bambu/Orca'nın production uzantısını
 * (`3D/Objects/*.model` bileşenleri) destekler. Bambu `paint_color` ve Prusa
 * `slic3rpe:mmu_segmentation` boyası üçgen başına filament numarasına çevrilir;
 * alt bölmeli boyada alan olarak baskın renk alınır.
 */
export function parse3mf(bytes: Uint8Array): ThreeMfFile {
  const files = unzipSync(bytes);
  const text = (path: string) => {
    const f = files[path.replace(/^\//, '')];
    return f ? strFromU8(f) : null;
  };
  const rootPath = '3D/3dmodel.model';
  const rootXml = text(rootPath);
  if (!rootXml) throw new Error('3MF içinde 3D/3dmodel.model yok.');

  // dosya yolu -> (nesne kimliği -> nesne)
  const parsed = new Map<string, Map<string, RawObject>>();
  const objectsOf = (path: string): Map<string, RawObject> => {
    let m = parsed.get(path);
    if (!m) {
      const xml = path === rootPath ? rootXml : text(path);
      m = xml ? parseObjects(xml) : new Map();
      parsed.set(path, m);
    }
    return m;
  };

  // Bambu/Orca nesne adları ve nesne filamenti model_settings.config'te
  const settingsNames = new Map<string, string>();
  const settingsFilaments = new Map<string, number>();
  const modelSettings = text('Metadata/model_settings.config');
  if (modelSettings) {
    for (const m of modelSettings.matchAll(/<object id="([^"]+)">([\s\S]*?)<\/object>/g)) {
      // nesne düzeyi: ilk <part'tan önceki metadata (parça düzeyi ayrı)
      const head = m[2].split('<part')[0];
      const name = /<metadata key="name" value="([^"]*)"/.exec(head);
      if (name) settingsNames.set(m[1], unescapeXml(name[1]));
      const extruder = Number(/<metadata key="extruder" value="(\d+)"/.exec(head)?.[1]);
      if (extruder > 0) settingsFilaments.set(m[1], extruder);
    }
  }
  // X121: Bambu plakaları: nesne kimliği -> plaka
  const plateOf = new Map<string, { id: number; name: string }>();
  if (modelSettings) {
    for (const m of modelSettings.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
      const id = Number(/<metadata key="plater_id" value="(\d+)"/.exec(m[1])?.[1]);
      if (!(id > 0)) continue;
      const name = unescapeXml(/<metadata key="plater_name" value="([^"]*)"/.exec(m[1])?.[1] ?? '');
      for (const o of m[1].matchAll(/<metadata key="object_id" value="([^"]+)"/g))
        plateOf.set(o[1], { id, name });
    }
  }

  const out: ThreeMfObject[] = [];
  for (const item of tags(rootXml, 'item')) {
    const id = attr(item, 'objectid');
    if (!id) continue;
    const collected: RawMesh = { positions: [], indices: [], paint: [], painted: false };
    let name = '';
    const visit = (path: string, objectId: string, transform: number[], depth: number) => {
      const obj = objectsOf(path).get(objectId);
      if (!obj || depth > 16) return;
      if (!name && obj.name) name = obj.name;
      if (obj.mesh) appendMesh(collected, obj.mesh, transform);
      for (const c of obj.components)
        visit(c.path ?? path, c.objectId, compose(c.transform, transform), depth + 1);
    };
    visit(rootPath, id, parseTransform(attr(item, 'transform')), 0);
    name = settingsNames.get(id) ?? name;
    if (!collected.indices.length) continue;
    out.push({
      name: name || `Nesne ${out.length + 1}`,
      positions: new Float32Array(collected.positions),
      indices: new Uint32Array(collected.indices),
      paint: collected.painted ? Uint16Array.from(collected.paint) : undefined,
      filament: settingsFilaments.get(id),
      plate: plateOf.get(id),
    });
  }
  if (!out.length) throw new Error('3MF dosyasında mesh bulunamadı.');
  placePlatesSideBySide(out);

  let filamentColors: string[] = [];
  const settings = text('Metadata/project_settings.config');
  if (settings) {
    try {
      const json = JSON.parse(settings);
      if (Array.isArray(json.filament_colour))
        filamentColors = json.filament_colour.map((c: unknown) => normalizeHex(String(c)));
    } catch {
      // ayar dosyası okunamadı: renkler varsayılan
    }
  }
  return { objects: out, filamentColors };
}

/**
 * Bambu renkleri `#RRGGBBAA` olabiliyor; Three.js ve renk kutusu yalnız `#rrggbb` okur.
 * Tanınmayan biçim olduğu gibi döner.
 */
function normalizeHex(c: string): string {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c.trim());
  return m ? `#${m[1].toLowerCase()}` : c;
}

function parseObjects(xml: string): Map<string, RawObject> {
  const result = new Map<string, RawObject>();
  let pos = 0;
  for (;;) {
    const start = xml.indexOf('<object', pos);
    if (start < 0) break;
    const headEnd = xml.indexOf('>', start);
    const head = xml.slice(start, headEnd + 1);
    const selfClosing = head.endsWith('/>');
    const end = selfClosing ? headEnd + 1 : xml.indexOf('</object>', headEnd);
    const body = selfClosing ? '' : xml.slice(headEnd + 1, end);
    pos = end + 1;
    const id = attr(head, 'id');
    if (!id) continue;
    const obj: RawObject = { name: unescapeXml(attr(head, 'name') ?? ''), components: [] };
    if (body.includes('<mesh')) obj.mesh = parseMesh(body);
    for (const c of tags(body, 'component')) {
      const oid = attr(c, 'objectid');
      if (oid)
        obj.components.push({
          path: attr(c, 'p:path'),
          objectId: oid,
          transform: parseTransform(attr(c, 'transform')),
        });
    }
    result.set(id, obj);
  }
  return result;
}

function parseMesh(xml: string): RawMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const paint: number[] = [];
  let painted = false;
  for (const v of tags(xml, 'vertex')) {
    positions.push(Number(attr(v, 'x')), Number(attr(v, 'y')), Number(attr(v, 'z')));
  }
  for (const t of tags(xml, 'triangle')) {
    indices.push(Number(attr(t, 'v1')), Number(attr(t, 'v2')), Number(attr(t, 'v3')));
    const code = attr(t, 'paint_color') ?? attr(t, 'slic3rpe:mmu_segmentation');
    if (code) {
      painted = true;
      paint.push(decodePaint(code));
    } else {
      paint.push(0);
    }
  }
  return { positions, indices, paint, painted };
}

function appendMesh(into: RawMesh, mesh: RawMesh, m: number[]): void {
  const base = into.positions.length / 3;
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i];
    const y = p[i + 1];
    const z = p[i + 2];
    // 3MF dönüşümü: satır vektörü × 3x4 (son satır öteleme)
    into.positions.push(
      x * m[0] + y * m[3] + z * m[6] + m[9],
      x * m[1] + y * m[4] + z * m[7] + m[10],
      x * m[2] + y * m[5] + z * m[8] + m[11],
    );
  }
  for (const i of mesh.indices) into.indices.push(i + base);
  for (const s of mesh.paint) into.paint.push(s);
  if (mesh.painted) into.painted = true;
}

function parseTransform(s: string | null): number[] {
  if (!s) return IDENTITY;
  const v = s.trim().split(/\s+/).map(Number);
  return v.length === 12 && v.every(Number.isFinite) ? v : IDENTITY;
}

/** Önce `a`, sonra `b` uygulanır. */
function compose(a: number[], b: number[]): number[] {
  const r = new Array(12);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      r[row * 3 + col] =
        a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  for (let col = 0; col < 3; col++)
    r[9 + col] = a[9] * b[col] + a[10] * b[3 + col] + a[11] * b[6 + col] + b[9 + col];
  return r;
}

/** `<name ...>` etiketlerinin başlık metinleri (hızlı tarama; tam XML ayrıştırıcı değil). */
function* tags(xml: string, name: string): Generator<string> {
  const open = `<${name}`;
  let pos = 0;
  for (;;) {
    const start = xml.indexOf(open, pos);
    if (start < 0) return;
    const next = xml.charCodeAt(start + open.length);
    // <vertex ile <vertices'i karıştırma: ardından boşluk, / veya > gelmeli
    if (next !== 32 && next !== 47 && next !== 62 && next !== 9 && next !== 10 && next !== 13) {
      pos = start + open.length;
      continue;
    }
    const end = xml.indexOf('>', start);
    yield xml.slice(start, end + 1);
    pos = end + 1;
  }
}

function attr(tag: string, name: string): string | null {
  const key = ` ${name}="`;
  let i = tag.indexOf(key);
  if (i < 0) {
    // sekme/satır başıyla ayrılmış öznitelikler
    const m = tag.match(new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`));
    return m ? m[1] : null;
  }
  i += key.length;
  return tag.slice(i, tag.indexOf('"', i));
}

/**
 * Bambu/Prusa üçgen boya kodu (TriangleSelector): onaltılık dizi sağdan sola
 * 4 bitlik parçalar olarak okunur. Parça: alt 2 bit bölünen kenar sayısı
 * (0 = yaprak, n = n+1 çocuk); yaprakta üst 2 bit durum (3 ise durum = sonraki
 * parça + 3). Alt bölmeli üçgende çocuk alanları eşit kabul edilir ve en çok
 * alan kaplayan durum döner.
 */
export function decodePaint(code: string): number {
  let i = code.length - 1;
  const next = () => {
    if (i < 0) return 0;
    const v = Number.parseInt(code[i--], 16);
    return Number.isNaN(v) ? 0 : v;
  };
  const weight = new Map<number, number>();
  const visit = (w: number, depth: number) => {
    const c = next();
    const split = c & 0b11;
    if (split === 0 || depth > 32) {
      let state = c >> 2;
      if (state === 3) state = next() + 3;
      weight.set(state, (weight.get(state) ?? 0) + w);
      return;
    }
    const children = split + 1;
    for (let k = 0; k < children; k++) visit(w / children, depth + 1);
  };
  visit(1, 0);
  let best = 0;
  let bestW = -1;
  for (const [s, w] of weight) {
    if (w > bestW) {
      best = s;
      bestW = w;
    }
  }
  return best;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
