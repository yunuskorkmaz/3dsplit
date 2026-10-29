/**
 * X117: arayüzdeki sayılar tek biçimde: Türkçe ondalık virgül ve binlik nokta
 * (0,2 mm; 12.131 üçgen). `digits` en çok ondalık basamak.
 */
export function formatNumber(v: number, digits = 1): string {
  return v.toLocaleString('tr-TR', { maximumFractionDigits: digits });
}
