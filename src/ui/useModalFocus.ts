import { type KeyboardEvent, type RefObject, useEffect } from 'react';

const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * X118: modal pencerede odak: açılınca içeri girer, Tab içeride döner, kapanınca
 * açan öğeye döner. Dönen işleyici pencerenin `onKeyDownCapture`'ına verilir.
 */
export function useModalFocus(
  open: boolean,
  box: RefObject<HTMLElement | null>,
): (e: KeyboardEvent) => void {
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const el = box.current;
      if (el && !el.contains(document.activeElement))
        el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (before?.isConnected) before.focus();
    };
  }, [open, box]);
  return (e) => {
    if (e.key !== 'Tab' || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
    e.preventDefault();
    e.stopPropagation();
    items[next].focus();
  };
}
