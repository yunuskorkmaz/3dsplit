import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatNumber } from '../src/core/format';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(p) ? [p] : [];
  });
}

/** Yorum satırları atılır; kalan kodda Türkçe metin içindeki eski adlar aranır. */
const FORBIDDEN = [
  /\bslot(u|a|ta|tan|un|lar|ları|ların|lara)\b/i,
  /\bslot seç/i,
  /Smart Fill/,
  // bileşen adı <Keys /> değil, metindeki "Keys"
  /(?<!<)\bKeys\b(?! *[:=(])/,
  /\bSocket\b/,
  /'Fast'|"Fast"|\bFast mod/,
];

describe('X117: metin birliği', () => {
  it('arayüz metinlerinde slot, Smart Fill, Keys, Socket, Fast geçmez', () => {
    const hits: string[] = [];
    for (const f of [...files('src/ui'), ...files('src/state'), ...files('src/core')]) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.trim();
          if (/^(\/\/|\*|\/\*)/.test(code)) return;
          const text = code.replace(/\/\/.*$/, '');
          if (FORBIDDEN.some((re) => re.test(text))) hits.push(`${f}:${i + 1}: ${code}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('sayılar ondalık virgül ve binlik noktayla', () => {
    expect(formatNumber(0.2)).toBe('0,2');
    expect(formatNumber(12131)).toBe('12.131');
    expect(formatNumber(17.46)).toBe('17,5');
    expect(formatNumber(0.125, 2)).toBe('0,13');
  });
});
