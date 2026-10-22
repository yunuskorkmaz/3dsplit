/**
 * X97: uzun işin hangi aşamada olduğu. Worker çağrı başında bir dinleyici kurar;
 * çekirdek yalnız aşama adını bildirir (DOM ya da mesajlaşma bilmez).
 */
let reporter: ((stage: string) => void) | null = null;

export function setStageReporter(fn: ((stage: string) => void) | null): void {
  reporter = fn;
}

export function stage(name: string): void {
  reporter?.(name);
}
