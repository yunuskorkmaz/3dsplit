import { useEffect, useRef, useState } from 'react';
import { updatePin } from '../state/actions';
import { set, useStore } from '../state/store';
import { valueTagPositions, watchCamera } from './ViewportHost';

function fmt(v: number): string {
  return v.toLocaleString('tr-TR', { maximumFractionDigits: v < 10 ? 1 : 0 });
}

/** Tıklanınca yazılan küçük değer kutusu. Enter ya da odak kaybı uygular, Esc vazgeçer. */
function EditableTag(props: {
  className: string;
  at: { x: number; y: number };
  label: string;
  title: string;
  fields: { name: string; value: number; min: number; max: number; apply: (v: number) => void }[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) first.current?.select();
  }, [editing]);
  const commit = () => {
    props.fields.forEach((f, i) => {
      const v = Number((draft[i] ?? '').replace(',', '.'));
      if (Number.isFinite(v) && v !== f.value) f.apply(Math.min(f.max, Math.max(f.min, v)));
    });
    setEditing(false);
  };
  return (
    <div
      className={`value-tag ${props.className}`}
      style={{ left: props.at.x, top: props.at.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
          }}
        >
          {props.fields.map((f, i) => (
            <label key={f.name}>
              <span>{f.name}</span>
              <input
                ref={i === 0 ? first : undefined}
                aria-label={f.name}
                inputMode="decimal"
                value={draft[i] ?? ''}
                onChange={(e) => setDraft(draft.map((d, j) => (j === i ? e.target.value : d)))}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
            </label>
          ))}
          <button type="submit" hidden />
        </form>
      ) : (
        <button
          type="button"
          title={props.title}
          onClick={() => {
            setDraft(props.fields.map((f) => fmt(f.value)));
            setEditing(true);
          }}
        >
          {props.label}
        </button>
      )}
    </div>
  );
}

/** Fırça çapı değişince imleç yanında 1 sn görünür. */
function BrushTag() {
  const radius = useStore((s) => s.brushRadius);
  const tool = useStore((s) => s.tool);
  const [shown, setShown] = useState<{ x: number; y: number } | null>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const first = useRef(true);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  useEffect(() => {
    void radius;
    if (first.current) {
      first.current = false;
      return;
    }
    if (tool !== 'brush' && tool !== 'erase' && tool !== 'smooth') return;
    setShown({ ...mouse.current });
    const t = window.setTimeout(() => setShown(null), 1000);
    return () => window.clearTimeout(t);
  }, [radius, tool]);
  if (!shown) return null;
  return (
    <div className="value-tag brush-tag" style={{ left: shown.x + 18, top: shown.y + 18 }}>
      Ø {fmt(radius * 2)} mm
    </div>
  );
}

/**
 * X89: değer model üstünde. Tapa önizlemesinde yön okunun dibinde derinlik, seçili pimin
 * yanında çap ve boy; ikisi de tıklanınca yazılır. Fırça çapı değişince imleç yanında görünür.
 */
export function ValueTags() {
  const [, setTick] = useState(0);
  const cut = useStore((s) => s.cut);
  const preview = useStore((s) => s.preview);
  const pins = useStore((s) => s.pins);
  const selectedPin = useStore((s) => s.selectedPin);
  const layout = useStore((s) => s.pinLayout);
  const tool = useStore((s) => s.tool);
  const directionGizmo = useStore((s) => s.directionGizmo);
  const paintVersion = useStore((s) => s.paintVersion);
  // Viewport kendi efektinde güncellenir: konum bir kare sonra okunur
  useEffect(() => {
    void [cut, preview, pins, selectedPin, layout, tool, directionGizmo, paintVersion];
    const f = requestAnimationFrame(() => setTick((t) => t + 1));
    return () => cancelAnimationFrame(f);
  }, [cut, preview, pins, selectedPin, layout, tool, directionGizmo, paintVersion]);
  useEffect(() => watchCamera(() => setTick((t) => t + 1)), []);
  const at = valueTagPositions();
  const pin = pins[selectedPin];
  const auto = layout[selectedPin];
  const radius = pin?.radius ?? auto?.radius ?? cut.pinRadius;
  const length = pin?.length ?? auto?.length ?? cut.pinLength;
  return (
    <>
      {cut.mode === 'socket' && at.depth && (
        <EditableTag
          className="depth-tag"
          at={at.depth}
          label={`${fmt(cut.depth)} mm`}
          title="Tapa derinliği: tıklayıp yazın, Enter"
          fields={[
            {
              name: 'Derinlik',
              value: cut.depth,
              min: 0.4,
              max: 30,
              apply: (v) => set((s) => ({ cut: { ...s.cut, depth: v } })),
            },
          ]}
        />
      )}
      {cut.mode === 'keys' && pin && at.pin && (
        <EditableTag
          className="pin-tag"
          at={at.pin}
          label={`Ø ${fmt(radius * 2)} · ${fmt(length)} mm`}
          title="Pim çapı ve boyu: tıklayıp yazın, Enter"
          fields={[
            {
              name: 'Ø',
              value: radius * 2,
              min: 1,
              max: 40,
              apply: (v) => updatePin(selectedPin, { radius: v / 2 }, 'Pim yarıçapı'),
            },
            {
              name: 'Boy',
              value: length,
              min: 1,
              max: 60,
              apply: (v) => updatePin(selectedPin, { length: v }, 'Pim boyu'),
            },
          ]}
        />
      )}
      <BrushTag />
    </>
  );
}
