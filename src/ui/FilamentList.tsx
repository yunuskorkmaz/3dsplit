import type { ExportFilament } from '../state/exportReport';

/** X110: Bambu 3MF filament eşlemesi: numara, set rengi ve adı, gövdeler. */
export function FilamentList({ filaments }: { filaments: ExportFilament[] }) {
  return (
    <ul className="filament-list">
      {filaments.map((f) => (
        <li key={f.filament}>
          <span className="filament-swatch" style={{ background: f.color }} />
          <b>Filament {f.filament}</b> — {f.setName}: {f.parts.join(', ')}
        </li>
      ))}
    </ul>
  );
}
