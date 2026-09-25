import { useRef } from 'react';

/**
 * Sayı alanı: etiketi sağa-sola sürükleyerek değiştirilir (Shift: ince ayar),
 * değer kutusuna yazılabilir. `log`: değer oranla değişir (yarıçap gibi
 * geniş aralıklı değerler için).
 */
export function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  log?: boolean;
  title?: string;
  onChange: (v: number) => void;
}) {
  const drag = useRef<{ x: number; value: number } | null>(null);
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));
  const round = (v: number) => Math.round(v / props.step) * props.step;
  const decimals = Math.max(0, -Math.floor(Math.log10(props.step)));
  return (
    <label className="scrub" title={props.title}>
      <span
        className="scrub-label"
        title="Sürükle: değiştir · Shift: ince ayar"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, value: props.value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const fine = e.shiftKey ? 0.2 : 1;
          const v = props.log
            ? drag.current.value * Math.exp(dx * 0.01 * fine)
            : drag.current.value + dx * props.step * fine;
          props.onChange(clamp(round(v)));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        {props.label}
      </span>
      <input
        type="number"
        className="num"
        min={props.min}
        max={props.max}
        step={props.step}
        value={Number(props.value.toFixed(decimals))}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) props.onChange(clamp(v));
        }}
      />
      {props.unit && <span className="unit">{props.unit}</span>}
    </label>
  );
}

export function Toggle(props: {
  label: string;
  checked: boolean;
  title?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle" title={props.title}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}
