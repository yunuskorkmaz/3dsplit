import { describe, expect, it } from 'vitest';
import { get, notify } from '../src/state/store';

describe('X114: ileti tekrarı', () => {
  it('aynı metinli ileti ekranda varsa yenisi eklenmez', () => {
    notify('error', 'Önizleme: aynı hata');
    notify('error', 'Önizleme: aynı hata');
    notify('warn', 'Önizleme: aynı hata');
    const texts = get().messages.map((m) => `${m.kind}:${m.text}`);
    expect(texts).toEqual(['error:Önizleme: aynı hata', 'warn:Önizleme: aynı hata']);
  });
});
