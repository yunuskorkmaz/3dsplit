import { useRef } from 'react';

/**
 * C6: tapa alt halkasının 8 yönlü profili. Tutamaçlar sürüklenerek o yönde
 * ayak genişletilir (+) veya daraltılır (−), mm. 1 numara önizlemedeki kırmızı işarete denk gelir.
 */
export function RingEditor(props: { value: number[]; onChange: (v: number[]) => void; range?: number }) {
  const range = props.range ?? 3;
  const size = 150;
  const c = size / 2;
  const base = 40; // 0 mm'nin çizim yarıçapı
  const perMm = 10; // mm başına piksel
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number>(-1);
  const pts = props.value.map((d, i) => {
    const a = (i * Math.PI) / 4;
    const r = base + d * perMm;
    // SVG'de y aşağı: açı saat yönünün tersi görünsün diye y eksi
    return { x: c + Math.cos(a) * r, y: c - Math.sin(a) * r, a };
  });
  const onMove = (e: React.PointerEvent) => {
    const i = dragging.current;
    if (i < 0 || !svg.current) return;
    const rect = svg.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * size - c;
    const y = -(((e.clientY - rect.top) / rect.height) * size - c);
    const a = pts[i].a;
    // sadece kendi yönündeki (radyal) bileşen
    const r = x * Math.cos(a) + y * Math.sin(a);
    const d = Math.max(-range, Math.min(range, Math.round(((r - base) / perMm) * 10) / 10));
    props.onChange(props.value.map((v, j) => (j === i ? d : v)));
  };
  return (
    <div className="ring-editor">
      <svg
        ref={svg}
        viewBox={`0 0 ${size} ${size}`}
        onPointerMove={onMove}
        onPointerUp={() => {
          dragging.current = -1;
        }}
      >
        <circle cx={c} cy={c} r={base} className="ring-base" />
        <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="ring-shape" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={6}
              className={i === 0 ? 'ring-handle first' : 'ring-handle'}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture(e.pointerId);
                dragging.current = i;
              }}
            />
            <text x={c + Math.cos(p.a) * (base + range * perMm + 8)} y={c - Math.sin(p.a) * (base + range * perMm + 8) + 3}>
              {props.value[i] ? props.value[i].toFixed(1) : i + 1}
            </text>
          </g>
        ))}
      </svg>
      <button type="button" disabled={props.value.every((v) => v === 0)} onClick={() => props.onChange(props.value.map(() => 0))}>
        Sıfırla
      </button>
    </div>
  );
}
