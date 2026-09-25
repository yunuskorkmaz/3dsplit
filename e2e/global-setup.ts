import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Test modeli repoda yok; yoksa üretilir. */
export default function globalSetup(): void {
  if (!existsSync('samples/figure.stl')) execSync('node samples/make-figure.mjs', { stdio: 'inherit' });
}
