import { describe, expect, it } from 'vitest';
import { useStore } from '../src/state/store';
import { cancelGeometry, GeometryAbort, limitCall } from '../src/worker/client';

describe('iş iptali', () => {
  it('iptal modeli ve geri alma yığınını olduğu gibi bırakır', async () => {
    const mesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      labels: new Uint16Array([0]),
    };
    const part = {
      id: 'p',
      name: 'parça',
      mesh,
      visible: true,
      badge: null,
      colorSlot: 0,
      manifold: true,
    };
    const undo = [{ kind: 'parts' as const, before: [], after: [part], label: 'kes' }];
    useStore.setState({ parts: [part], undoStack: undo, redoStack: [], busy: 'Kesiliyor…' });
    const pending = limitCall(new Promise(() => {})).finally(() => {
      useStore.setState({ busy: null });
    });
    cancelGeometry();
    await expect(pending).rejects.toBeInstanceOf(GeometryAbort);
    await expect(pending).rejects.toThrow('İşlem iptal edildi. Model değişmedi.');
    const s = useStore.getState();
    expect(s.busy).toBeNull();
    expect(s.parts).toEqual([part]);
    expect(s.undoStack).toEqual(undo);
    expect(s.redoStack).toEqual([]);
  });

  it('süre dolunca Türkçe hata verir, geç gelen sonucu uygulamaz', async () => {
    let applied = false;
    const pending = limitCall(
      new Promise<number>((resolve) => {
        setTimeout(() => resolve(1), 40);
      }),
      15,
    ).then(() => {
      applied = true;
    });
    await expect(pending).rejects.toThrow(/^İşlem \d+ saniyede bitmedi\. Model değişmedi\.$/);
    expect(applied).toBe(false);
  });
});
