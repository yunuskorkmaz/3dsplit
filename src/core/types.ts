/** İndeksli üçgen mesh. Üçgenler dışarıdan bakınca saat yönünün tersine (CCW). */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

/** Her üçgenin bir slot kimliği taşıdığı mesh. */
export interface LabeledMesh extends MeshData {
  labels: Uint16Array;
  /**
   * Kesimle oluşan yeni yüz (kapak, tapa, delik). 1 ise gölge bu yüzü
   * heykel yüzeyiyle birleştirmez. Yoksa bütün üçgenler heykel yüzeyidir.
   */
  cut?: Uint8Array;
}

/** Boyanmamış üçgenlerin slotu. */
export const BASE_SLOT = 0;

export type Vec3 = [number, number, number];

export function triangleCount(mesh: MeshData): number {
  return mesh.indices.length / 3;
}

export function vertexCount(mesh: MeshData): number {
  return mesh.positions.length / 3;
}
