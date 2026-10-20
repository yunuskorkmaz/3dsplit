import { describe, expect, it } from 'vitest';
import { readProject, writeProject } from '../src/io/project';
import { labelWhere, subdividedCube } from './fixtures';

describe('proje dosyası', () => {
  it('parçaları, etiketleri ve slotları kaybetmeden geri okur', () => {
    const mesh = labelWhere(subdividedCube(20, 3), 2, (_x, _y, z) => z > 5);
    const data = {
      parts: [
        { id: 'p1', name: 'kafa', visible: true, badge: null, colorSlot: 0, manifold: true, mesh },
        {
          id: 'p2',
          name: 'eski',
          visible: false,
          badge: 'source' as const,
          colorSlot: 2,
          manifold: true,
          mesh,
        },
      ],
      slots: [
        { id: 0, name: 'Taban', color: '#b0b0b0' },
        { id: 2, name: 'Göz', color: '#3498db' },
      ],
      activeSlot: 2,
      selectedPartId: 'p1',
    };
    const back = readProject(writeProject(data));
    expect(back.slots).toEqual(data.slots);
    expect(back.activeSlot).toBe(2);
    expect(back.selectedPartId).toBe('p1');
    expect(back.parts.map((p) => [p.id, p.name, p.visible, p.badge, p.colorSlot])).toEqual(
      data.parts.map((p) => [p.id, p.name, p.visible, p.badge, p.colorSlot]),
    );
    expect(Array.from(back.parts[0].mesh.positions)).toEqual(Array.from(mesh.positions));
    expect(Array.from(back.parts[0].mesh.indices)).toEqual(Array.from(mesh.indices));
    expect(Array.from(back.parts[0].mesh.labels)).toEqual(Array.from(mesh.labels));
    expect(back.parts[0].mesh.cut).toBeUndefined();
  });

  it('kesim yüzünü de saklar', () => {
    const mesh = labelWhere(subdividedCube(20, 2), 1, () => false);
    mesh.cut = new Uint8Array(mesh.labels.length);
    mesh.cut[0] = 1;
    mesh.cut[3] = 1;
    const data = {
      parts: [
        { id: 'p1', name: 'kapak', visible: true, badge: null, colorSlot: 0, manifold: true, mesh },
      ],
      slots: [{ id: 0, name: 'Taban', color: '#b0b0b0' }],
      activeSlot: 0,
      selectedPartId: 'p1',
    };
    const back = readProject(writeProject(data));
    expect(Array.from(back.parts[0].mesh.cut ?? [])).toEqual(Array.from(mesh.cut));
  });

  it('başka zip dosyasını reddeder', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    expect(() => readProject(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/project.json/);
  });
});
