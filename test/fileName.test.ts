import { describe, expect, it } from 'vitest';
import { fileSafeName } from '../src/io/exportFile';

describe('X126: dosya adı temizleme', () => {
  it('Türkçe harf, boşluk, parantez ve virgül korunur', () => {
    expect(fileSafeName('Tolerans plakası (0,1 - 0,2 - 0,3 mm)')).toBe(
      'Tolerans plakası (0,1 - 0,2 - 0,3 mm)',
    );
    expect(fileSafeName('Göz kapağı ğüşıöç')).toBe('Göz kapağı ğüşıöç');
  });

  it('dosya sisteminde geçersiz karakterler - olur', () => {
    expect(fileSafeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(fileSafeName('satır\nsonu')).toBe('satır-sonu');
  });

  it('boş ya da yalnız noktadan oluşan ad yedek adı alır', () => {
    expect(fileSafeName('   ')).toBe('parçalar');
    expect(fileSafeName('..', 'parça')).toBe('parça');
    expect(fileSafeName('.gizli')).toBe('gizli');
  });
});
