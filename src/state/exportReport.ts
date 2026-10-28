import { BASE_SLOT } from '../core/types';

/** X110: dışa aktarma raporunun okuduğu parça ve set alanları. */
interface ReportPart {
  id: string;
  name: string;
  visible: boolean;
  badge: string | null;
  colorSlot: number;
  mesh: { labels: Uint16Array };
}
interface ReportSlot {
  id: number;
  name: string;
  color: string;
}

/** Görünen gövdede kesilmemiş boyalı setler: dosyada gövde tek renk olur. */
export interface UncutColors {
  partId: string;
  partName: string;
  /** Set kimlikleri, küçükten büyüğe. */
  slots: number[];
}

/**
 * Dışa aktarılacak gövdelerdeki kesilmemiş renkler. Gövdenin kendi rengindeki boya
 * (aynı set ya da aynı renk) kaybolmaz, sayılmaz.
 */
export function uncutColors(parts: ReportPart[], slots: ReportSlot[]): UncutColors[] {
  const out: UncutColors[] = [];
  for (const p of parts) {
    if (!p.visible || p.badge === 'source') continue;
    const body = slots.find((s) => s.id === p.colorSlot)?.color.toUpperCase();
    const seen = new Set<number>();
    for (const l of p.mesh.labels) if (l !== BASE_SLOT) seen.add(l);
    const lost = [...seen]
      .filter((id) => id !== p.colorSlot)
      .filter((id) => {
        const s = slots.find((x) => x.id === id);
        return s && s.color.toUpperCase() !== body;
      })
      .sort((a, b) => a - b);
    if (lost.length) out.push({ partId: p.id, partName: p.name, slots: lost });
  }
  return out;
}

/** Dosyaya girmeyecek gizli gövdeler; kaynak rozetli eski haller sayılmaz. */
export function hiddenBodies(parts: ReportPart[]): number {
  return parts.filter((p) => !p.visible && p.badge !== 'source').length;
}

/** Bambu 3MF'te bir filament: hangi set, hangi gövdeler. */
export interface ExportFilament {
  filament: number;
  color: string;
  setName: string;
  parts: string[];
}

/** Filament numarasına göre gruplanmış eşleme; `filamentOf[i]` i. nesnenin numarası. */
export function filamentReport(
  objects: { name: string; color: string }[],
  filamentOf: number[],
  slots: (ReportSlot & { filament?: number })[],
): ExportFilament[] {
  const byNumber = new Map<number, ExportFilament>();
  objects.forEach((o, i) => {
    const n = filamentOf[i];
    let f = byNumber.get(n);
    if (!f) {
      const same = slots.filter((s) => s.color.toUpperCase() === o.color.toUpperCase());
      const slot = same.find((s) => s.filament === n) ?? same[0];
      f = { filament: n, color: o.color, setName: slot?.name ?? o.color, parts: [] };
      byNumber.set(n, f);
    }
    f.parts.push(o.name);
  });
  return [...byNumber.values()].sort((a, b) => a.filament - b.filament);
}
