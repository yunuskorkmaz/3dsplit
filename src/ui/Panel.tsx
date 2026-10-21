import { type ReactNode, useState } from 'react';

const STORAGE_KEY = '3dsplit.panels';

function loadState(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Katlanır panel; açık/kapalı durumu tarayıcıda hatırlanır. */
export function Panel(props: {
  id: string;
  title: ReactNode;
  extra?: ReactNode;
  grow?: boolean;
  defaultOpen?: boolean;
  /** X83: model yokken soluk ve kapalı; açılmaz. */
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => loadState()[props.id] ?? props.defaultOpen ?? true);
  const shown = open && !props.disabled;
  const toggle = () => {
    if (props.disabled) return;
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadState(), [props.id]: next }));
    } catch {
      // depolama kapalı: sadece bu oturum
    }
  };
  return (
    <section
      className={`panel${props.grow && shown ? ' grow' : ''}${props.disabled ? ' disabled' : ''}`}
    >
      <header className="panel-head">
        <h3 onClick={toggle}>
          <span className="caret">{shown ? '▾' : '▸'}</span>
          {props.title}
        </h3>
        {props.extra && <div className="panel-extra">{props.extra}</div>}
      </header>
      {shown && <div className="panel-body">{props.children}</div>}
    </section>
  );
}

/** Panel içinde başlıklı alt grup. */
export function Group(props: { title: string; children: ReactNode }) {
  return (
    <div className="group">
      <div className="group-title">{props.title}</div>
      {props.children}
    </div>
  );
}
