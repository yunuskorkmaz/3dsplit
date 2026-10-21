import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import type { LabeledMesh, MeshData, Vec3 } from '../core/types';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

export interface Hit {
  partId: string;
  tri: number;
  point: Vec3;
  normal: Vec3;
}

export interface PartView {
  id: string;
  mesh: LabeledMesh;
  visible: boolean;
  selected: boolean;
}

export interface PointerHandlers {
  /** Sol tuşla mesh üzerinde basıldı; true dönerse sürükleme araca ait olur. */
  onDown(hit: Hit, e: PointerEvent): boolean;
  onMove(hit: Hit | null, e: PointerEvent): void;
  onUp(e: PointerEvent): void;
  /** Shift + sağ tık sürükleme (Smart Fill eşiği). */
  onThresholdDrag(dx: number): void;
  onHover(hit: Hit | null): void;
  /** Alt + tekerlek: fırça boyutu (deltaY > 0 küçült). */
  onBrushResize(deltaY: number): void;
  /** Grafik bağlamı düştü / geri geldi (bellek yetmezliği vb.). */
  onContextLost(): void;
  onContextRestored(): void;
}

type PartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

interface PartObject {
  mesh: PartMesh;
  source: LabeledMesh;
  /** Son eşitlemedeki indeks dizisi: üçgen bölme mesh'i yerinde değiştirince fark buradan bulunur. */
  indices: Uint32Array;
  /** Ana geometrideki üçgen sayısı. */
  baseTris: number;
  /**
   * X38: bölmeyle sona eklenen üçgenler (numara ≥ baseTris) ayrı küçük mesh'te.
   * Büyük modelde her darbede ana geometriyi ve seçim ağacını baştan kurmak
   * saniyeler sürüyordu; ana geometri yerinde güncellenir, sadece yama kurulur.
   */
  patch: PartMesh | null;
  /** Son seçim ağacı güncellemesinden beri konumu değişen üçgenlerin (eski ve yeni) kutusu. */
  dirty: THREE.Box3 | null;
  /** Yumuşak gölge: köşe komşuluğu ve yüz normalleri. Bağlantı değişince sıfırlanır. */
  shade: Shade | null;
}

/** Three.js sahnesi. React'ten bağımsız; durum store'dan `sync` ile gelir. */
export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
  readonly controls: OrbitControls;
  private parts = new Map<string, PartObject>();
  private overlay = new THREE.Group();
  private brushCursor: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private dragging: 'tool' | 'threshold' | null = null;
  private lastX = 0;
  private fitted = false;
  private frame = 0;
  private resizeObserver: ResizeObserver;
  /** Socket yönü: ok + döndürme gizmosu (C4). Ok, tutamağın yerel +Z ekseni boyunca. */
  private dirHandle = new THREE.Object3D();
  private dirArrow: THREE.ArrowHelper;
  private gizmo: TransformControls;
  private onDirectionChange: ((dir: Vec3) => void) | null = null;
  private mirrorPlane: THREE.Mesh | null = null;
  private errorLines = new THREE.Group();
  /** Seçili rengin sınır çizgisi ve adı. Parça mesh'inin çocuğu, patlatılmış görünümle kayar. */
  private focusRoot: THREE.Group | null = null;
  /** Keys pimlerinin gerçek boyutlu yarı saydam görüntüleri; seçili pim tutamağın çocuğu. */
  private pinGhosts = new THREE.Group();
  /** Seçili pimin tutamağı: konum = kesim yüzeyindeki nokta, yerel +Z = pim ekseni. */
  private pinHandle = new THREE.Object3D();
  private onPinCommit: ((point: Vec3, axis: Vec3) => void) | null = null;
  /** X36: çizgi aracının yolu ve noktaları. */
  private lineGroup = new THREE.Group();
  /**
   * Seçili parçaya bağlı yardımcılar (önizleme, pimler, yön oku, ayna, hata
   * halkaları). Patlatılmış görünümde parçayla birlikte kayar.
   */
  private anchor = new THREE.Group();
  /** X27: patlatılmış görünüm çarpanı (0: kapalı). */
  private explode = 0;
  private selectedId: string | null = null;
  /** X79: fare üstündeki parça (seçili değilse ince çizgiyle gösterilir). */
  private hoveredId: string | null = null;
  /** X82: baskı tablası; modelin en alt noktasının hizasında, ortası modelin altında. */
  private bed = buildBed();
  private bedEnabled = true;
  /** X81: son parça sığdırma anı (olay zaman damgasıyla aynı saat). */
  private partFitAt = -Infinity;
  /** X79: birden çok görünür parça varken seçili ve fare üstündeki parçanın dış çizgisi. */
  private composer: EffectComposer;
  private selectOutline: OutlinePass;
  private hoverOutline: OutlinePass;

  constructor(
    private container: HTMLElement,
    private handlers: PointerHandlers,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#1a1d24');
    this.composer = new EffectComposer(
      this.renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
    );
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.selectOutline = outlinePass(this.scene, this.camera, '#ff5a00', 5, 4);
    this.hoverOutline = outlinePass(this.scene, this.camera, '#d8dde6', 2, 1);
    this.composer.addPass(this.selectOutline);
    this.composer.addPass(this.hoverOutline);
    this.composer.addPass(new OutputPass());

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#444444', 1.2));
    const key = new THREE.DirectionalLight('#ffffff', 1.5);
    key.position.set(1, 2, 3);
    this.camera.add(key);
    this.scene.add(this.camera);
    this.scene.add(this.anchor);
    this.scene.add(this.bed);
    this.anchor.add(this.overlay);
    this.anchor.add(this.errorLines);
    this.anchor.add(this.lineGroup);

    this.brushCursor = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1, 48),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: true,
      }),
    );
    this.brushCursor.visible = false;
    this.brushCursor.renderOrder = 10;
    this.scene.add(this.brushCursor);

    this.camera.position.set(0, -150, 100);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    // sol: boşlukta döndür (model üstünde araç), sağ: her yerde döndür,
    // orta veya Ctrl/Cmd+sağ: kaydır, tekerlek: yakınlaştır
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    // X81: tekerlek imlecin altındaki noktaya yakınlaştırır
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('start', () => this.beginPivot());
    this.controls.addEventListener('end', () => {
      this.pivot = null;
    });
    this.controls.addEventListener('change', () => {
      this.applyPivot();
      this.updateClipping();
      this.requestRender();
      this.notifyCamera();
    });

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // boşluğa çift tık: görünümü sığdır; Alt + parçaya çift tık: o parçayı sığdır
    // (Alt'sız çift tık ViewportHost'ta: seçili olmayan parçada seçer ve sığdırır)
    el.addEventListener('dblclick', (e) => {
      // çift tıkın ikinci tıkı parçayı zaten sığdırdı; kamera değişti, imleç boşlukta kalabilir
      if (e.timeStamp - this.partFitAt < 500) return;
      const hit = this.pick(e);
      if (!hit) this.fitView();
      else if (e.altKey) this.fitPart(hit.partId);
    });
    // bağlam düşerse varsayılan davranışı engelle ki tarayıcı geri getirebilsin
    el.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.handlers.onContextLost();
    });
    el.addEventListener('webglcontextrestored', () => {
      // GPU kaynakları gitti: parçalar bir sonraki sync'te baştan kurulur
      for (const p of this.parts.values()) this.scene.remove(p.mesh);
      this.parts.clear();
      this.handlers.onContextRestored();
    });
    // Alt + tekerlek fırça boyutunu değiştirir; yakınlaştırmaya gitmesin
    el.addEventListener(
      'wheel',
      (e) => {
        if (!e.altKey) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.handlers.onBrushResize(e.deltaY);
      },
      { capture: true, passive: false },
    );

    this.dirArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(),
      10,
      0xff9900,
    );
    this.dirHandle.add(this.dirArrow);
    this.dirHandle.visible = false;
    this.anchor.add(this.dirHandle);
    this.anchor.add(this.pinGhosts);
    this.anchor.add(this.pinHandle);
    this.gizmo = new TransformControls(this.camera, el);
    this.gizmo.setMode('rotate');
    this.gizmo.setSpace('local');
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
      // pim: sürükleme bitince tek seferde kaydet (sürüklerken pim görüntüsü tutamakla anlık hareket eder)
      if (!e.value && this.gizmo.object === this.pinHandle) {
        const axis = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(this.pinHandle.quaternion)
          .normalize();
        this.onPinCommit?.(this.pinHandle.position.toArray() as Vec3, axis.toArray() as Vec3);
      }
    });
    this.gizmo.addEventListener('change', () => this.requestRender());
    this.gizmo.addEventListener('objectChange', () => {
      if (this.gizmo.object !== this.dirHandle) return;
      const d = new THREE.Vector3(0, 0, 1).applyQuaternion(this.dirHandle.quaternion).normalize();
      this.onDirectionChange?.(d.toArray() as Vec3);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  dispose(): void {
    this.clearSlotFocus();
    this.resizeObserver.disconnect();
    this.gizmo.detach();
    this.gizmo.dispose();
    this.controls.dispose();
    for (const p of this.parts.values()) disposePart(p);
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Parça listesini sahneyle eşitler. Mesh değişmişse geometri yeniden kurulur. */
  sync(views: PartView[], colors: (label: number) => THREE.Color): void {
    const ids = new Set(views.map((v) => v.id));
    for (const [id, obj] of this.parts) {
      if (!ids.has(id)) {
        this.scene.remove(obj.mesh);
        disposePart(obj);
        this.parts.delete(id);
      }
    }
    for (const v of views) {
      let obj = this.parts.get(v.id);
      const inPlace =
        obj && obj.source === v.mesh && obj.indices !== v.mesh.indices && this.patchPart(obj);
      if (!inPlace && (!obj || obj.source !== v.mesh || obj.indices !== v.mesh.indices)) {
        if (obj) {
          this.scene.remove(obj.mesh);
          disposePart(obj);
        }
        const shade = buildShade(v.mesh);
        const mesh = new THREE.Mesh(
          buildGeometry(v.mesh, 0, v.mesh.labels.length, shade),
          newMaterial(),
        );
        obj = {
          mesh,
          source: v.mesh,
          indices: v.mesh.indices,
          baseTris: v.mesh.labels.length,
          patch: null,
          dirty: null,
          shade,
        };
        obj.mesh.userData.partId = v.id;
        this.parts.set(v.id, obj);
        this.scene.add(obj.mesh);
      }
      if (!obj) continue;
      obj.mesh.visible = v.visible;
      this.recolor(v.id, colors);
    }
    this.selectedId = views.find((v) => v.selected)?.id ?? null;
    this.applyExplode();
    if (!this.fitted && views.length) {
      this.fitView();
      this.fitted = true;
    }
    this.requestRender();
  }

  /**
   * Mesh üçgen bölmeyle yerinde değişti: eski numaralı üçgenlerden değişenler
   * ana geometride yazılır, sona eklenenler yamada kurulur. Ekleme çok
   * büyükse ya da üçgen sayısı ana geometrinin altına indiyse false (baştan kur).
   */
  private patchPart(obj: PartObject): boolean {
    const m = obj.source;
    const count = m.labels.length;
    const extra = count - obj.baseTris;
    if (extra < 0 || extra > Math.max(20000, obj.baseTris * 0.05)) return false;
    const changed: number[] = [];
    const oldIdx = obj.indices;
    for (let t = 0; t < obj.baseTris; t++) {
      if (
        oldIdx[3 * t] !== m.indices[3 * t] ||
        oldIdx[3 * t + 1] !== m.indices[3 * t + 1] ||
        oldIdx[3 * t + 2] !== m.indices[3 * t + 2]
      )
        changed.push(t);
    }
    obj.indices = m.indices;
    obj.shade = null;
    const shade = this.shadeOf(obj);
    const touched = expandTriangles(m, changed, shade);
    fillFaceNormals(m, touched, shade);
    const mainTouched = touched.filter((t) => t < obj.baseTris);
    this.markDirty(obj, changed);
    writeTriangles(obj.mesh.geometry, m, mainTouched, 0, shade);
    this.markDirty(obj, changed);
    this.refitMain(obj);
    if (obj.patch) {
      obj.mesh.remove(obj.patch);
      obj.patch.geometry.dispose();
      obj.patch = null;
    }
    if (extra > 0) {
      const patch = new THREE.Mesh(buildGeometry(m, obj.baseTris, count, shade), obj.mesh.material);
      patch.userData.partId = obj.mesh.userData.partId;
      patch.userData.triOffset = obj.baseTris;
      obj.mesh.add(patch);
      obj.patch = patch;
    }
    return true;
  }

  /** Ana geometride `tris`in şu anki konumlarını kirli kutuya katar. */
  private markDirty(obj: PartObject, tris: ArrayLike<number>): void {
    if (!tris.length) return;
    const pos = (obj.mesh.geometry.getAttribute('position') as THREE.BufferAttribute)
      .array as Float32Array;
    const box = obj.dirty ?? new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < tris.length; i++) {
      const j = 9 * tris[i];
      for (let k = 0; k < 9; k += 3)
        box.expandByPoint(v.set(pos[j + k], pos[j + k + 1], pos[j + k + 2]));
    }
    obj.dirty = box;
  }

  /**
   * X38: seçim ağacında sadece kirli kutuya değen düğümler yeniden oturtulur
   * (1.9M üçgende tüm ağacı oturtmak ~0.4 s). Sınır küresi kutuyu da
   * kapsayacak kadar büyütülür.
   */
  private refitMain(obj: PartObject): void {
    const g = obj.mesh.geometry;
    const box = obj.dirty;
    obj.dirty = null;
    if (!box || !g.boundsTree) return;
    const nodes = new Set<number>();
    g.boundsTree.shapecast({
      intersectsBounds: (b, _leaf, _score, _depth, nodeIndex) => {
        if (!b.intersectsBox(box)) return false;
        nodes.add(nodeIndex);
        return true;
      },
    });
    g.boundsTree.refit(nodes);
    if (!g.boundingSphere) g.computeBoundingSphere();
    else {
      g.boundingSphere.expandByPoint(box.min);
      g.boundingSphere.expandByPoint(box.max);
    }
  }

  /** Üçgenin çizildiği geometri (ana ya da yama) ve oradaki numarası. */
  private locate(obj: PartObject, t: number): [THREE.BufferGeometry, number] | null {
    if (t < obj.baseTris) return [obj.mesh.geometry, t];
    return obj.patch ? [obj.patch.geometry, t - obj.baseTris] : null;
  }

  /** Etiketlerden köşe renklerini yeniden yazar. */
  recolor(partId: string, colors: (label: number) => THREE.Color, tris?: ArrayLike<number>): void {
    const obj = this.parts.get(partId);
    if (!obj) return;
    const labels = obj.source.labels;
    const touched = new Set<THREE.BufferAttribute>();
    // etiket başına renk bir kez hesaplanır (renk fonksiyonu 1.9M üçgende ~0.25 s sürüyordu)
    const rgb = new Map<number, [number, number, number]>();
    const write = (t: number) => {
      const at = this.locate(obj, t);
      if (!at) return;
      const attr = at[0].getAttribute('color') as THREE.BufferAttribute;
      touched.add(attr);
      const arr = attr.array as Uint8Array;
      const i = at[1];
      let col = rgb.get(labels[t]);
      if (!col) {
        const c = colors(labels[t]);
        col = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
        rgb.set(labels[t], col);
      }
      const [r, g, b] = col;
      for (let k = 0; k < 3; k++) {
        arr[9 * i + 3 * k] = r;
        arr[9 * i + 3 * k + 1] = g;
        arr[9 * i + 3 * k + 2] = b;
      }
    };
    if (tris) for (let i = 0; i < tris.length; i++) write(tris[i]);
    else for (let t = 0; t < labels.length; t++) write(t);
    for (const a of touched) a.needsUpdate = true;
    this.requestRender();
  }

  /**
   * Konumu veya etiketi değişen üçgenleri yerinde günceller (yumuşatma
   * fırçası). `tris` null ise darbe bitti: seçim ağacı yeniden oturtulur.
   */
  updateTriangles(
    partId: string,
    tris: ArrayLike<number> | null,
    colors: (label: number) => THREE.Color,
  ): void {
    const obj = this.parts.get(partId);
    if (!obj) return;
    if (tris === null) {
      this.refitMain(obj);
      if (obj.patch) {
        obj.patch.geometry.boundsTree?.refit();
        obj.patch.geometry.computeBoundingSphere();
      }
      for (const m of obj.patch ? [obj.mesh, obj.patch] : [obj.mesh]) {
        // geçersiz sınır küresi modeli görünüm dışı sayar ve model sessizce kaybolur: kaydet
        if (!Number.isFinite(m.geometry.boundingSphere?.radius ?? Number.NaN))
          console.error('Parça geometrisi geçersiz sınır küresi üretti', partId);
      }
      this.requestRender();
      return;
    }
    const shade = this.shadeOf(obj);
    const touched = expandTriangles(obj.source, tris, shade);
    fillFaceNormals(obj.source, touched, shade);
    const main: number[] = [];
    const extra: number[] = [];
    for (let i = 0; i < touched.length; i++)
      (touched[i] < obj.baseTris ? main : extra).push(touched[i]);
    const moved: number[] = [];
    for (let i = 0; i < tris.length; i++) if (tris[i] < obj.baseTris) moved.push(tris[i]);
    this.markDirty(obj, moved);
    writeTriangles(obj.mesh.geometry, obj.source, main, 0, shade);
    this.markDirty(obj, moved);
    if (obj.patch && extra.length)
      writeTriangles(obj.patch.geometry, obj.source, extra, obj.baseTris, shade);
    this.recolor(partId, colors, tris);
  }

  /**
   * X27: patlatılmış görünüm. Her görünür parça, merkezinin tüm görünür
   * parçaların merkezinden uzaklığı `factor` ile çarpılarak dışarı kaydırılır.
   * Sadece görüntü: mesh verisi değişmez, araçlar yerel koordinatla çalışır.
   */
  setExplode(factor: number): void {
    this.explode = factor;
    this.applyExplode();
  }

  private applyExplode(): void {
    const centers = new Map<string, THREE.Vector3>();
    const all = new THREE.Box3();
    for (const [id, p] of this.parts) {
      if (!p.mesh.geometry.boundingBox) p.mesh.geometry.computeBoundingBox();
      const b = p.mesh.geometry.boundingBox as THREE.Box3;
      centers.set(id, b.getCenter(new THREE.Vector3()));
      if (p.mesh.visible) all.union(b);
    }
    const mid = all.isEmpty() ? new THREE.Vector3() : all.getCenter(new THREE.Vector3());
    for (const [id, p] of this.parts) {
      if (this.explode > 0)
        p.mesh.position
          .copy(centers.get(id) as THREE.Vector3)
          .sub(mid)
          .multiplyScalar(this.explode);
      else p.mesh.position.set(0, 0, 0);
      p.mesh.updateMatrixWorld();
    }
    const sel = this.selectedId ? this.parts.get(this.selectedId) : undefined;
    this.anchor.position.copy(sel ? sel.mesh.position : new THREE.Vector3());
    this.anchor.updateMatrixWorld();
    this.updateBed();
    this.requestRender();
  }

  /** X82: tablayı aç/kapat. */
  setBed(on: boolean): void {
    this.bedEnabled = on;
    this.updateBed();
    this.requestRender();
  }

  /** Tabla görünür parçaların altına taşınır; sığmazsa kenarı sarı. */
  private updateBed(): void {
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    for (const p of this.parts.values()) {
      if (!p.mesh.visible) continue;
      const g = p.mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      box.union(part.copy(g.boundingBox as THREE.Box3).applyMatrix4(p.mesh.matrixWorld));
    }
    this.bed.visible = this.bedEnabled && !box.isEmpty();
    if (!this.bed.visible) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // en alt noktanın biraz altında: alt yüzle aynı derinlikte titremesin
    this.bed.position.set(center.x, center.y, box.min.z - Math.max(0.05, size.z * 0.001));
    this.bed.updateMatrixWorld();
    const fits = Math.max(size.x, size.y, size.z) <= BED_SIZE;
    (this.bed.userData.border as THREE.LineBasicMaterial).color.set(fits ? '#5a6272' : '#f5c542');
    this.bed.userData.fits = fits;
  }

  private offsetOf(partId: string): THREE.Vector3 {
    return this.parts.get(partId)?.mesh.position ?? new THREE.Vector3();
  }

  /**
   * X54: kamerayı hedefin bu yanına koyar. Hedef, görünür seçili parçanın
   * kutusu; yoksa görünenlerin kutusu. Üst ve alt tam Z kutbunda durmaz.
   */
  viewFrom(side: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'): void {
    const dir = {
      front: new THREE.Vector3(0, -1, 0.6),
      back: new THREE.Vector3(0, 1, 0.6),
      left: new THREE.Vector3(-1, 0, 0.6),
      right: new THREE.Vector3(1, 0, 0.6),
      top: new THREE.Vector3(0, -0.2, 1),
      bottom: new THREE.Vector3(0, -0.2, -1),
    }[side];
    this.viewToward(dir);
  }

  /** Köşe bakışı: işaretler dünyada sağ (+X), arka (+Y), üst (+Z). */
  viewToward(dir: THREE.Vector3): void {
    const box = this.subjectBox();
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    this.placeView(center, size, dir);
  }

  private cameraWatchers = new Set<() => void>();

  /** Görünüş küpü kamerayla birlikte dönsün diye. */
  watchCamera(fn: () => void): () => void {
    this.cameraWatchers.add(fn);
    return () => this.cameraWatchers.delete(fn);
  }

  private notifyCamera(): void {
    for (const fn of this.cameraWatchers) fn();
  }

  /**
   * Dünya eksenli küpü, kameranın gördüğü yöne çeviren CSS matrisi.
   * Three.js kamerasında +Y yukarı, +Z geriye bakar; CSS'te +Y aşağı, +Z izleyiciye gelir.
   */
  cssViewMatrix(): string {
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorldInverse.elements;
    const r = [e[0], -e[1], e[2], 0, e[4], -e[5], e[6], 0, e[8], -e[9], e[10], 0, 0, 0, 0, 1];
    return `matrix3d(${r.join(',')})`;
  }

  /** Seçili parça görünürse onun dünya kutusu, değilse görünen parçalar. */
  private subjectBox(): THREE.Box3 {
    const box = new THREE.Box3();
    const sel = this.selectedId ? this.parts.get(this.selectedId) : undefined;
    const chosen = sel?.mesh.visible
      ? [sel]
      : [...this.parts.values()].filter((p) => p.mesh.visible);
    for (const p of chosen) box.expandByObject(p.mesh);
    if (box.isEmpty()) for (const p of this.parts.values()) box.expandByObject(p.mesh);
    return box;
  }

  /** Görünür parçaları ekrana sığdırır; kamera sınırlarını modelin boyutuna göre ayarlar. */
  fitView(): void {
    const box = new THREE.Box3();
    for (const p of this.parts.values()) if (p.mesh.visible) box.expandByObject(p.mesh);
    if (box.isEmpty()) for (const p of this.parts.values()) box.expandByObject(p.mesh);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    this.placeView(center, size, new THREE.Vector3(0, -1, 0.6));
  }

  /** X81: tek parçayı bakış yönünü koruyarak sığdırır; dönüş merkezi o parça olur. */
  fitPart(partId: string): void {
    const obj = this.parts.get(partId);
    if (!obj) return;
    this.partFitAt = performance.now();
    const box = new THREE.Box3().expandByObject(obj.mesh);
    if (box.isEmpty()) return;
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-12) dir.set(0, -1, 0.6);
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    // kesme düzlemleri ve uzaklık sınırları bütün sahneye göre kalır
    const scene = this.sceneSize;
    this.placeView(box.getCenter(new THREE.Vector3()), size, dir);
    this.sceneSize = scene;
    this.controls.minDistance = Math.min(this.controls.minDistance, size * 0.02);
    this.controls.maxDistance = Math.max(this.controls.maxDistance, scene * 10);
    this.updateClipping();
  }

  /** X81: kullanıcı kamerayı tutarken dönüş merkezi (seçili parçanın kutu ortası). */
  private pivot: THREE.Vector3 | null = null;
  private pivotQuat = new THREE.Quaternion();

  /** Sürükleme başında: seçili görünür parça varsa dönüş merkezi onun kutu ortası. */
  private beginPivot(): void {
    const obj = this.selectedId ? this.parts.get(this.selectedId) : undefined;
    const box = obj?.mesh.visible ? new THREE.Box3().expandByObject(obj.mesh) : null;
    this.pivot = box && !box.isEmpty() ? box.getCenter(new THREE.Vector3()) : null;
    this.pivotQuat.copy(this.camera.quaternion);
  }

  /**
   * OrbitControls hedef etrafında döndürür. Aynı dönüşü merkez etrafında yapmak için kamera
   * ve hedef (I − R)(merkez − hedef) kadar kaydırılır: merkez ekranda yerinde kalır, başta
   * görüntü zıplamaz. Kaydırma ve yakınlaştırma yönü değiştirmediği için onlara dokunulmaz.
   */
  private applyPivot(): void {
    if (!this.pivot) return;
    const q = this.camera.quaternion;
    if (q.angleTo(this.pivotQuat) < 1e-9) return;
    const r = q.clone().multiply(this.pivotQuat.clone().invert());
    this.pivotQuat.copy(q);
    const rel = this.pivot.clone().sub(this.controls.target);
    const shift = rel.clone().sub(rel.clone().applyQuaternion(r));
    this.controls.target.add(shift);
    this.camera.position.add(shift);
  }

  /** Modeli, şerit ve yan kartların bıraktığı açıklığa sığdırır. */
  private placeView(center: THREE.Vector3, size: number, dir: THREE.Vector3): void {
    this.sceneSize = size;
    this.controls.minDistance = size * 0.02;
    this.controls.maxDistance = size * 10;
    const dist = size * 1.28;
    this.controls.target.copy(center);
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(center).add(dir.clone().normalize().multiplyScalar(dist));
    this.controls.update();
    const el = this.renderer.domElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w >= 480 && h >= 320) {
      const left = 310;
      const right = 300;
      const top = 16;
      const bottom = 64;
      const cx = left + Math.max(0, w - left - right) / 2;
      const cy = top + Math.max(0, h - top - bottom) / 2;
      const nx = (cx / w) * 2 - 1;
      const ny = -((cy / h) * 2 - 1);
      const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const viewX = nx * dist * tan * (w / h);
      const viewY = ny * dist * tan;
      this.camera.updateMatrixWorld();
      const shift = new THREE.Vector3()
        .setFromMatrixColumn(this.camera.matrixWorld, 0)
        .multiplyScalar(-viewX)
        .add(
          new THREE.Vector3()
            .setFromMatrixColumn(this.camera.matrixWorld, 1)
            .multiplyScalar(-viewY),
        );
      this.controls.target.add(shift);
      this.camera.position.add(shift);
      this.controls.update();
    }
    this.updateClipping();
    this.requestRender();
  }

  private sceneSize = 100;

  /** Yakın/uzak kesme düzlemleri kamera uzaklığına göre: yakında ayrıntı kırpılmaz, uzakta model kesilmez. */
  private updateClipping(): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const near = Math.max(this.sceneSize / 10000, dist / 500);
    const far = dist + this.sceneSize * 20;
    if (Math.abs(this.camera.near - near) / near > 0.05 || this.camera.far !== far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Önizleme (Space): tapa hacimleri/kapaklar yarı saydam, pimler mavi. */
  setPreview(
    volumes: MeshData[],
    pins: MeshData[],
    thin: MeshData[] = [],
    ringMarkers: Vec3[] = [],
  ): void {
    this.clearOverlay();
    this.setXray(true);
    const volMat = new THREE.MeshStandardMaterial({
      color: '#ffcc00',
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pinMat = new THREE.MeshStandardMaterial({ color: '#2f80ff' });
    for (const v of volumes) this.overlay.add(new THREE.Mesh(toGeometry(v), volMat));
    for (const p of pins) this.overlay.add(new THREE.Mesh(toGeometry(p), pinMat));
    // C6: halka kontrol noktaları (1 numara kırmızı)
    const size = this.sceneSize / 150;
    ringMarkers.forEach((p, i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(size, 10, 8),
        new THREE.MeshBasicMaterial({ color: i === 0 ? '#ff2020' : '#ff9900', depthTest: false }),
      );
      m.position.set(...p);
      m.renderOrder = 8;
      this.overlay.add(m);
    });
    // ince duvar: modelin dışına taşan kısım, her şeyin üstünde kırmızı
    const thinMat = new THREE.MeshBasicMaterial({
      color: '#ff2020',
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    for (const t of thin) {
      const m = new THREE.Mesh(toGeometry(t), thinMat);
      m.renderOrder = 6;
      this.overlay.add(m);
    }
    this.requestRender();
  }

  /**
   * Keys pimleri: her pim gerçek boyutunda yarı saydam gösterilir. Seçili
   * pimde Fusion 360 benzeri tutamak: `translate` kesim düzleminde iki okla
   * taşır, `rotate` ekseni halkalarla döndürür. Pim görüntüsü tutamağın
   * çocuğu olduğu için sürüklerken anlık döner/kayar; bırakınca `onCommit`.
   */
  setPins(
    pins: {
      surface: Vec3;
      center: Vec3;
      axis: Vec3;
      radius: number;
      length: number;
      shape: string;
    }[],
    selected: number,
    mode: 'translate' | 'rotate',
    onCommit: (point: Vec3, axis: Vec3) => void,
  ): void {
    this.onPinCommit = onCommit;
    for (const c of [...this.pinGhosts.children, ...this.pinHandle.children]) {
      c.parent?.remove(c);
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
    const z = new THREE.Vector3(0, 0, 1);
    pins.forEach((p, i) => {
      const segments = p.shape === 'octagon' ? 8 : p.shape === 'cube' ? 4 : 24;
      const g = new THREE.CylinderGeometry(p.radius, p.radius, p.length, segments);
      g.rotateX(Math.PI / 2); // Three silindiri Y boyunca: Z'ye çevir
      if (p.shape === 'cube') g.rotateZ(Math.PI / 4);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color: i === selected ? '#ff9900' : '#4da3ff',
          transparent: true,
          opacity: i === selected ? 0.55 : 0.35,
          depthTest: false,
        }),
      );
      m.renderOrder = 6;
      m.raycast = () => {}; // model seçimini engellemesin
      const axis = new THREE.Vector3(...p.axis).normalize();
      const shift = new THREE.Vector3(...p.center).sub(new THREE.Vector3(...p.surface)).dot(axis);
      if (i === selected) {
        // sürükleme sürerken store'dan gelen eski değer tutamağı geri almasın
        if (!this.gizmo.dragging) {
          this.pinHandle.position.set(...p.surface);
          this.pinHandle.quaternion.setFromUnitVectors(z, axis);
        }
        m.position.set(0, 0, shift);
        this.pinHandle.add(m);
      } else {
        m.position.set(...p.center);
        m.quaternion.setFromUnitVectors(z, axis);
        this.pinGhosts.add(m);
      }
    });
    if (selected >= 0 && selected < pins.length) {
      if (this.gizmo.object !== this.pinHandle) this.gizmo.attach(this.pinHandle);
      this.gizmo.setMode(mode);
      this.gizmo.setSpace('local');
      // taşıma kesim düzleminde (yerel X/Y), eksen boyunca değil
      this.gizmo.showX = true;
      this.gizmo.showY = true;
      this.gizmo.showZ = mode === 'rotate';
      this.gizmo.size = 0.7;
    } else if (this.gizmo.object === this.pinHandle) {
      this.gizmo.detach();
    }
    this.requestRender();
  }

  /** Ekranda `px` piksel içindeki en yakın nokta (parçanın yerel koordinatında verilir); yoksa -1. */
  pickScreenPoint(e: { clientX: number; clientY: number }, points: Vec3[], px = 16): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    let best = -1;
    let bestD = px;
    const v = new THREE.Vector3();
    points.forEach((p, i) => {
      v.set(...p)
        .add(this.anchor.position)
        .project(this.camera);
      if (v.z > 1) return;
      const x = rect.left + ((v.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - v.y) / 2) * rect.height;
      const d = Math.hypot(x - e.clientX, y - e.clientY);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** X36: çizgi aracının yüzeydeki yolu (sarı) ve tıklanan noktalar. */
  setLinePath(path: Vec3[], anchors: Vec3[], markerSize: number): void {
    for (const c of [...this.lineGroup.children]) {
      this.lineGroup.remove(c);
      if (c instanceof THREE.Line || c instanceof THREE.Mesh) c.geometry.dispose();
    }
    if (path.length > 1) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(path.map((p) => new THREE.Vector3(...p))),
        new THREE.LineBasicMaterial({ color: '#ffd400', depthTest: false }),
      );
      line.renderOrder = 8;
      this.lineGroup.add(line);
    }
    anchors.forEach((p, i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(markerSize, 12, 8),
        new THREE.MeshBasicMaterial({ color: i === 0 ? '#ff9900' : '#ffd400', depthTest: false }),
      );
      m.position.set(...p);
      m.renderOrder = 9;
      this.lineGroup.add(m);
    });
    this.requestRender();
  }

  clearOverlay(): void {
    this.setXray(false);
    for (const c of [...this.overlay.children]) {
      if (c.userData.marker) continue;
      this.overlay.remove(c);
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
    this.requestRender();
  }

  /**
   * Socket yön okunu gösterir. `editable` ise döndürme gizmosu bağlanır;
   * değişiklik `onChange` ile bildirilir. `center` null ise gizlenir.
   */
  showDirection(
    center: Vec3 | null,
    dir: Vec3,
    editable: boolean,
    onChange: (dir: Vec3) => void,
  ): void {
    this.onDirectionChange = onChange;
    if (!center) {
      this.dirHandle.visible = false;
      if (this.gizmo.object === this.dirHandle) this.gizmo.detach();
      this.requestRender();
      return;
    }
    this.dirHandle.visible = true;
    this.dirHandle.position.set(...center);
    // sürükleme sırasında store'dan dönen yön tutamağı geri çevirmesin
    if (!this.gizmo.dragging) {
      this.dirHandle.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(...dir).normalize(),
      );
    }
    const size = this.sceneDiagonal() * 0.15;
    this.dirArrow.setLength(size, size * 0.25, size * 0.12);
    if (editable) {
      if (this.gizmo.object !== this.dirHandle) this.gizmo.attach(this.dirHandle);
      this.gizmo.setMode('rotate');
      this.gizmo.showX = this.gizmo.showY = this.gizmo.showZ = true;
      this.gizmo.size = 0.8;
    } else if (this.gizmo.object === this.dirHandle) {
      this.gizmo.detach();
    }
    this.requestRender();
  }

  /**
   * E1: kamera düzeni. `default`: sağ sürükle döndür, orta kaydır.
   * `blender`: orta sürükle döndür (Shift+orta kaydır), sağ kaydır.
   * Sol tuş her iki düzende de boşlukta döndürür, model üstünde araca gider.
   */
  setCameraMode(mode: 'default' | 'blender', invertZoom: boolean): void {
    this.controls.mouseButtons =
      mode === 'blender'
        ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }
        : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.setNavMode(this.navMode);
    // OrbitControls yakınlaştırma çarpanı zoomSpeed üssüyle hesaplanıyor: eksi işaret yönü çevirir
    this.controls.zoomSpeed = invertZoom ? -1 : 1;
  }

  /** X87: gezinme çubuğundan seçilen kip; sol tuş araç yerine kamerayı döndürür, kaydırır ya da yakınlaştırır. */
  private navMode: 'orbit' | 'pan' | 'zoom' | null = null;

  setNavMode(mode: 'orbit' | 'pan' | 'zoom' | null): void {
    this.navMode = mode;
    this.controls.mouseButtons.LEFT =
      mode === 'pan' ? THREE.MOUSE.PAN : mode === 'zoom' ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
    this.renderer.domElement.style.cursor =
      mode === 'pan' ? 'move' : mode === 'zoom' ? 'zoom-in' : mode === 'orbit' ? 'grab' : '';
  }

  /** X87: bakış yönünü koruyarak görünür parçaların hepsini sığdırır. */
  fitAll(): void {
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-12) dir.set(0, -1, 0.6);
    const box = new THREE.Box3();
    for (const p of this.parts.values()) if (p.mesh.visible) box.expandByObject(p.mesh);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    this.placeView(box.getCenter(new THREE.Vector3()), size, dir);
  }

  /** Seçili rengin sınırını ve adını modelin üstünde gösterir. Slot 0 veya boya yoksa gizler. */
  showSlotFocus(partId: string | null, slot: number, color: string, name: string): void {
    this.clearSlotFocus();
    const obj = partId ? this.parts.get(partId) : undefined;
    if (!obj || slot === 0) {
      this.requestRender();
      return;
    }
    const mesh = obj.source;
    const idx = mesh.indices;
    const pos = mesh.positions;
    const labels = mesh.labels;
    // her boyalı slotun sınır kenarları: kenar o slotun üçgenlerinde bir kez geçiyorsa sınırdır
    const edges = new Map<string, { n: number; a: number; b: number; own: boolean }>();
    let ntri = 0;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let t = 0; t < labels.length; t++) {
      const label = labels[t];
      if (label === 0) continue;
      const own = label === slot;
      const a = idx[3 * t] ?? 0;
      const b = idx[3 * t + 1] ?? 0;
      const c = idx[3 * t + 2] ?? 0;
      if (own) {
        ntri++;
        for (const v of [a, b, c]) {
          const x = pos[3 * v] ?? 0;
          const y = pos[3 * v + 1] ?? 0;
          const z = pos[3 * v + 2] ?? 0;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          minZ = Math.min(minZ, z);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          maxZ = Math.max(maxZ, z);
        }
      }
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        const key = u < v ? `${label}_${u}_${v}` : `${label}_${v}_${u}`;
        const prev = edges.get(key);
        if (prev) prev.n++;
        else edges.set(key, { n: 1, a: u, b: v, own });
      }
    }
    if (!ntri) {
      this.requestRender();
      return;
    }
    const ownPos: number[] = [];
    const otherPos: number[] = [];
    for (const e of edges.values()) {
      if (e.n !== 1) continue;
      (e.own ? ownPos : otherPos).push(
        pos[3 * e.a] ?? 0,
        pos[3 * e.a + 1] ?? 0,
        pos[3 * e.a + 2] ?? 0,
        pos[3 * e.b] ?? 0,
        pos[3 * e.b + 1] ?? 0,
        pos[3 * e.b + 2] ?? 0,
      );
    }
    const group = new THREE.Group();
    if (otherPos.length) {
      // diğer renklerin sınırı: ince, soluk, modelin arkasında kalınca görünmez
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(otherPos, 3));
      const line = new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({
          color: '#000000',
          transparent: true,
          opacity: 0.25,
          depthFunc: THREE.LessEqualDepth,
        }),
      );
      line.renderOrder = 5;
      line.raycast = () => {};
      group.add(line);
    }
    if (ownPos.length) {
      // seçili rengin sınırı: kalın, rengin zıddı (açık renkte koyu, koyu renkte açık)
      const geom = new LineSegmentsGeometry();
      geom.setPositions(ownPos);
      const mat = new LineMaterial({
        color: contrastColor(color),
        linewidth: SLOT_FOCUS_WIDTH,
        depthTest: false,
      });
      mat.resolution.set(this.container.clientWidth, this.container.clientHeight);
      const line = new LineSegments2(geom, mat);
      line.renderOrder = 6;
      line.raycast = () => {};
      group.add(line);
    }
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 4);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 96);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(8, 16, 496, 64, 32);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = '600 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 256, 48);
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthTest: false,
        transparent: true,
      }),
    );
    const width = Math.max(6, Math.min(this.sceneSize * 0.09, span * 0.55));
    sprite.position.set((minX + maxX) / 2, (minY + maxY) / 2, maxZ + width * 0.45);
    sprite.scale.set(width, width * 0.22, 1);
    sprite.renderOrder = 7;
    sprite.raycast = () => {};
    group.add(sprite);
    obj.mesh.add(group);
    this.focusRoot = group;
    this.requestRender();
  }

  private clearSlotFocus(): void {
    const root = this.focusRoot;
    this.focusRoot = null;
    if (!root) return;
    root.removeFromParent();
    root.traverse((o) => {
      if (
        o instanceof THREE.LineSegments ||
        o instanceof LineSegments2 ||
        o instanceof THREE.Sprite
      ) {
        o.geometry?.dispose();
        const mat = o.material;
        if (mat instanceof THREE.SpriteMaterial) mat.map?.dispose();
        if (!Array.isArray(mat)) mat.dispose();
      }
    });
  }

  /** D5: kesim hatasında sorunlu sınır halkaları, her şeyin üstünde kırmızı. */
  setErrorLoops(loops: Vec3[][] | null): void {
    for (const c of [...this.errorLines.children]) {
      this.errorLines.remove(c);
      if (c instanceof THREE.Line) c.geometry.dispose();
    }
    const mat = new THREE.LineBasicMaterial({ color: '#ff3030', depthTest: false });
    for (const loop of loops ?? []) {
      const g = new THREE.BufferGeometry().setFromPoints(loop.map((p) => new THREE.Vector3(...p)));
      const line = new THREE.LineLoop(g, mat);
      line.renderOrder = 7;
      this.errorLines.add(line);
    }
    this.requestRender();
  }

  /** Ayna düzlemi (B8): `axis` eksenine dik, `offset` konumunda; null gizler. */
  setMirrorPlane(plane: { axis: 0 | 1 | 2; offset: number } | null): void {
    if (this.mirrorPlane) {
      this.anchor.remove(this.mirrorPlane);
      this.mirrorPlane.geometry.dispose();
      this.mirrorPlane = null;
    }
    if (plane) {
      // parçanın kendi (yerel) sınır kutusu: düzlem, patlatılmış görünümde parçayla kayar
      const box = new THREE.Box3();
      const sel = this.selectedId ? this.parts.get(this.selectedId) : undefined;
      for (const p of sel ? [sel] : this.parts.values()) {
        if (!p.mesh.visible) continue;
        if (!p.mesh.geometry.boundingBox) p.mesh.geometry.computeBoundingBox();
        box.union(p.mesh.geometry.boundingBox as THREE.Box3);
      }
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const other = [0, 1, 2].filter((k) => k !== plane.axis);
      const g = new THREE.PlaneGeometry(
        size.getComponent(other[0]) * 1.2,
        size.getComponent(other[1]) * 1.2,
      );
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color: '#8fd3ff',
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      // düzlemin normali (varsayılan +Z) ayna eksenine çevrilir
      const n = new THREE.Vector3();
      n.setComponent(plane.axis, 1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      m.position.copy(center);
      m.position.setComponent(plane.axis, plane.offset);
      m.renderOrder = 3;
      m.raycast = () => {}; // seçimi engellemesin
      this.mirrorPlane = m;
      this.anchor.add(m);
    }
    this.requestRender();
  }

  /** Kameradan hedefe değil, hedeften kameraya bakan birim yön (Socket "kameradan"). */
  viewDirection(): Vec3 {
    const d = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();
    return d.toArray() as Vec3;
  }

  private sceneDiagonal(): number {
    const box = new THREE.Box3();
    for (const p of this.parts.values()) if (p.mesh.visible) box.expandByObject(p.mesh);
    return box.isEmpty() ? 100 : box.getSize(new THREE.Vector3()).length();
  }

  private userXray = false;

  /** B7: kullanıcının açtığı X-ray (önizlemedeki yarı saydamlıktan bağımsız). */
  setUserXray(on: boolean): void {
    this.userXray = on;
    this.setXray(on);
    this.requestRender();
  }

  /** Önizlemede iç hacimler görünsün diye parçalar yarı saydam çizilir. */
  private setXray(on: boolean): void {
    on = on || this.userXray;
    for (const p of this.parts.values()) {
      const m = p.mesh.material;
      m.transparent = on;
      m.opacity = on ? 0.3 : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
  }

  setBrushCursor(hit: Hit | null, radius: number, color = '#ffffff'): void {
    (this.brushCursor.material as THREE.MeshBasicMaterial).color.set(color);
    if (!hit) {
      if (this.brushCursor.visible) {
        this.brushCursor.visible = false;
        this.requestRender();
      }
      return;
    }
    this.brushCursor.visible = true;
    const world = new THREE.Vector3(...hit.point).add(this.offsetOf(hit.partId));
    this.brushCursor.position.copy(world);
    this.brushCursor.scale.setScalar(radius);
    this.brushCursor.lookAt(world.clone().add(new THREE.Vector3(...hit.normal)));
    this.requestRender();
  }

  /** X89: Tapa derinlik kutusunun yeri: yön okunun dibi, ok yönünde biraz dışarıda (dünya). */
  depthTagAnchor(): THREE.Vector3 | null {
    if (!this.dirHandle.visible) return null;
    const base = this.dirHandle.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.dirHandle.quaternion).normalize();
    return base.addScaledVector(dir, this.sceneDiagonal() * 0.03);
  }

  /** X89: seçili pimin kutusunun yeri (dünya); seçili pim yoksa null. */
  pinTagAnchor(): THREE.Vector3 | null {
    if (this.gizmo.object !== this.pinHandle) return null;
    return this.pinHandle.getWorldPosition(new THREE.Vector3());
  }

  /**
   * Dünya noktasının ekran (client) konumu. `occlusion` açıksa model noktayı örtüyorsa null:
   * kameradan noktaya ışın, noktadan önce bir yüzeye çarparsa nokta arkada kalmıştır.
   */
  screenPoint(p: THREE.Vector3, occlusion: boolean): { x: number; y: number } | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    if (occlusion) {
      const origin = this.camera.position.clone();
      const toPoint = p.clone().sub(origin);
      const dist = toPoint.length();
      this.raycaster.set(origin, toPoint.normalize());
      this.raycaster.firstHitOnly = true;
      const targets = [...this.parts.values()].filter((q) => q.mesh.visible).map((q) => q.mesh);
      const hit = this.raycaster.intersectObjects(targets, false)[0];
      if (hit && hit.distance < dist * 0.98) return null;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  }

  pick(e: { clientX: number; clientY: number }): Hit | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.firstHitOnly = true;
    const targets = [...this.parts.values()]
      .filter((p) => p.mesh.visible)
      .flatMap((p) => (p.patch ? [p.mesh, p.patch] : [p.mesh]));
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit?.face) return null;
    return {
      partId: hit.object.userData.partId,
      // geometri indekssiz: köşe 3t+k, BVH'nin yeniden sıraladığı indeksten bağımsız; yamada ofset eklenir
      tri: Math.floor(hit.face.a / 3) + (hit.object.userData.triOffset ?? 0),
      // patlatılmış görünümde parça kaydırılmış olabilir: araçlar mesh'in kendi koordinatını ister
      point: hit.object.worldToLocal(hit.point.clone()).toArray() as Vec3,
      normal: hit.face.normal.toArray() as Vec3,
    };
  }

  requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.updateOutlines()) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    });
  }

  /** Dış çizgi gerekiyorsa geçişlere nesneleri verir; tek görünür parçada çizgi yok. */
  private updateOutlines(): boolean {
    let shown = 0;
    for (const o of this.parts.values()) if (o.mesh.visible) shown++;
    if (shown < 2) return false;
    const sel = this.selectedId ? this.parts.get(this.selectedId) : undefined;
    const hov =
      this.hoveredId && this.hoveredId !== this.selectedId
        ? this.parts.get(this.hoveredId)
        : undefined;
    this.selectOutline.selectedObjects = sel?.mesh.visible ? [sel.mesh] : [];
    this.hoverOutline.selectedObjects = hov?.mesh.visible ? [hov.mesh] : [];
    return true;
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(window.devicePixelRatio);
    this.composer.setSize(w, h);
    this.focusRoot?.traverse((o) => {
      if (o instanceof LineSegments2) o.material.resolution.set(w, h);
    });
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.lastX = e.clientX;
    // gizmo ekseninin üstündeyse olay gizmoya kalır
    if (this.gizmo.object && this.gizmo.axis !== null) {
      this.controls.enabled = false;
      return;
    }
    if (e.button === 2 && e.shiftKey) {
      this.dragging = 'threshold';
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    // Alt basılıyken veya boşlukta sol tık: kamera döner; X87 gezinme kipinde sol tuş hep kamerada
    if (e.button !== 0 || e.altKey || this.navMode) {
      this.controls.enabled = true;
      return;
    }
    const hit = this.pick(e);
    if (hit && this.handlers.onDown(hit, e)) {
      this.dragging = 'tool';
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } else {
      this.controls.enabled = true;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.dragging === 'threshold') {
      this.handlers.onThresholdDrag(e.clientX - this.lastX);
      this.lastX = e.clientX;
      return;
    }
    const hit = this.pick(e);
    if (this.dragging === 'tool') this.handlers.onMove(hit, e);
    else this.handlers.onHover(hit);
    const hovered = this.dragging ? null : (hit?.partId ?? null);
    if (hovered !== this.hoveredId) {
      this.hoveredId = hovered;
      this.requestRender();
    }
  };

  private shadeOf(obj: PartObject): Shade {
    const m = obj.source;
    const s = obj.shade;
    if (s && s.indices === m.indices && s.faceN.length === m.labels.length * 3) return s;
    obj.shade = buildShade(m);
    return obj.shade;
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (this.dragging === 'tool') this.handlers.onUp(e);
    this.dragging = null;
    this.controls.enabled = true;
  };
}

function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  return g;
}

/** İndekssiz geometri: üçgen başına düz renk için her üçgenin kendi 3 köşesi var. */
/** Üçgen [from, to) aralığının indekssiz geometrisi (renkler sonra yazılır) ve seçim ağacı. */
/** 60° üstü kırılımda komşu yüzler aynı normali paylaşmaz; küp kenarı yuvarlak görünmez. */
const CREASE = Math.cos((60 * Math.PI) / 180);

interface Shade {
  indices: Uint32Array;
  head: Uint32Array;
  faces: Uint32Array;
  /** Üçgen başına alan ağırlıklı (birim olmayan) normal. */
  faceN: Float32Array;
  /** Kesim yüzü. Yoksa hepsi heykel yüzeyi. */
  cut: Uint8Array | null;
  seen: Int32Array;
  stamp: number;
}

function buildShade(mesh: LabeledMesh): Shade {
  const triCount = mesh.labels.length;
  const vertCount = mesh.positions.length / 3;
  const counts = new Uint32Array(vertCount);
  const idx = mesh.indices;
  for (let i = 0; i < idx.length; i++) counts[idx[i]]++;
  const head = new Uint32Array(vertCount + 1);
  for (let v = 0; v < vertCount; v++) head[v + 1] = head[v] + counts[v];
  const cursor = head.slice();
  const faces = new Uint32Array(idx.length);
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) faces[cursor[idx[3 * t + k]]++] = t;
  }
  const shade: Shade = {
    indices: idx,
    head,
    faces,
    faceN: new Float32Array(triCount * 3),
    cut: mesh.cut && mesh.cut.length === triCount ? mesh.cut : null,
    seen: new Int32Array(triCount),
    stamp: 1,
  };
  const all = new Uint32Array(triCount);
  for (let t = 0; t < triCount; t++) all[t] = t;
  fillFaceNormals(mesh, all, shade);
  return shade;
}

function fillFaceNormals(mesh: LabeledMesh, tris: ArrayLike<number>, shade: Shade): void {
  const p = mesh.positions;
  const idx = mesh.indices;
  const n = shade.faceN;
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    const a = idx[3 * t];
    const b = idx[3 * t + 1];
    const c = idx[3 * t + 2];
    const ux = p[3 * b] - p[3 * a];
    const uy = p[3 * b + 1] - p[3 * a + 1];
    const uz = p[3 * b + 2] - p[3 * a + 2];
    const vx = p[3 * c] - p[3 * a];
    const vy = p[3 * c + 1] - p[3 * a + 1];
    const vz = p[3 * c + 2] - p[3 * a + 2];
    n[3 * t] = uy * vz - uz * vy;
    n[3 * t + 1] = uz * vx - ux * vz;
    n[3 * t + 2] = ux * vy - uy * vx;
  }
}

/** Değişen üçgenler ve onların köşelerine değen komşular. Normal komşuda da güncellenir. */
function expandTriangles(mesh: LabeledMesh, tris: ArrayLike<number>, shade: Shade): number[] {
  const stamp = ++shade.stamp;
  if (stamp === 0x7fffffff) {
    shade.seen.fill(0);
    shade.stamp = 1;
  }
  const mark = shade.stamp;
  const out: number[] = [];
  const idx = mesh.indices;
  const add = (t: number) => {
    if (t < 0 || t >= shade.seen.length || shade.seen[t] === mark) return;
    shade.seen[t] = mark;
    out.push(t);
  };
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    add(t);
    if (t < 0 || t >= shade.seen.length) continue;
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k];
      for (let e = shade.head[v]; e < shade.head[v + 1]; e++) add(shade.faces[e]);
    }
  }
  return out;
}

function buildGeometry(
  m: LabeledMesh,
  from: number,
  to: number,
  shade: Shade,
): THREE.BufferGeometry {
  const n = to - from;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 9), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 9), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(n * 9), 3, true));
  const all: number[] = [];
  for (let t = from; t < to; t++) all.push(t);
  writeTriangles(g, m, all, from, shade);
  g.computeBoundingSphere();
  g.boundsTree = new MeshBVH(g);
  return g;
}

/** `tris` üçgenlerinin konumunu ve yumuşak köşe normalini yazar (geometrideki numara = t − offset). */
function writeTriangles(
  g: THREE.BufferGeometry,
  src: LabeledMesh,
  tris: ArrayLike<number>,
  offset: number,
  shade: Shade,
): void {
  const posAttr = g.getAttribute('position') as THREE.BufferAttribute;
  const nrmAttr = g.getAttribute('normal') as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;
  const nrm = nrmAttr.array as Float32Array;
  const fn = shade.faceN;
  const idx = src.indices;
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    const j = t - offset;
    if (j < 0) continue;
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k];
      pos[9 * j + 3 * k] = src.positions[3 * v];
      pos[9 * j + 3 * k + 1] = src.positions[3 * v + 1];
      pos[9 * j + 3 * k + 2] = src.positions[3 * v + 2];
    }
    const fx = fn[3 * t];
    const fy = fn[3 * t + 1];
    const fz = fn[3 * t + 2];
    const fl = Math.hypot(fx, fy, fz) || 1;
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k];
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let e = shade.head[v]; e < shade.head[v + 1]; e++) {
        const f = shade.faces[e];
        const ax = fn[3 * f];
        const ay = fn[3 * f + 1];
        const az = fn[3 * f + 2];
        const al = Math.hypot(ax, ay, az);
        if (al < 1e-12) continue;
        if (shade.cut && shade.cut[f] !== shade.cut[t]) continue;
        if ((ax * fx + ay * fy + az * fz) / (al * fl) < CREASE) continue;
        sx += ax;
        sy += ay;
        sz += az;
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      nrm[9 * j + 3 * k] = sx / l;
      nrm[9 * j + 3 * k + 1] = sy / l;
      nrm[9 * j + 3 * k + 2] = sz / l;
    }
  }
  posAttr.needsUpdate = true;
  nrmAttr.needsUpdate = true;
}

/** X82: tabla kenarı, mm (Bambu X1/P1). */
const BED_SIZE = 256;

/** 10 mm'de ince, 50 mm'de kalın çizgili tabla; tıklanamaz. */
function buildBed(): THREE.Group {
  const half = BED_SIZE / 2;
  const thin: number[] = [];
  const thick: number[] = [];
  for (let v = -half + (half % 10); v < half; v += 10) {
    const list = Math.round(v) % 50 === 0 ? thick : thin;
    list.push(v, -half, 0, v, half, 0, -half, v, 0, half, v, 0);
  }
  const group = new THREE.Group();
  const lines = (pos: number[], color: string) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color });
    const l = new THREE.LineSegments(g, mat);
    l.raycast = () => {};
    group.add(l);
    return mat;
  };
  lines(thin, '#2a2f38');
  lines(thick, '#3c4350');
  group.userData.border = lines(
    [
      -half,
      -half,
      0,
      half,
      -half,
      0,
      half,
      -half,
      0,
      half,
      half,
      0,
      half,
      half,
      0,
      -half,
      half,
      0,
      -half,
      half,
      0,
      -half,
      -half,
      0,
    ],
    '#5a6272',
  );
  group.name = 'bed';
  return group;
}

/** X79: dış çizgi geçişi; kalınlık ekranda yaklaşık px. Arkada kalan kısım daha soluk. */
function outlinePass(
  scene: THREE.Scene,
  camera: THREE.Camera,
  color: string,
  strength: number,
  thickness: number,
): OutlinePass {
  const pass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  pass.downSampleRatio = 1;
  pass.edgeStrength = strength;
  pass.edgeThickness = thickness;
  pass.edgeGlow = 0;
  pass.visibleEdgeColor.set(color);
  pass.hiddenEdgeColor.set(color).multiplyScalar(0.35);
  return pass;
}

/** X77: seçili renk sınırının ekrandaki kalınlığı, px. */
const SLOT_FOCUS_WIDTH = 3;

/** Açık renge koyu, koyu renge açık çizgi. */
function contrastColor(color: string): string {
  const c = new THREE.Color(color).convertLinearToSRGB();
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.5 ? '#111111' : '#ffffff';
}

function newMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
    roughness: 0.8,
    metalness: 0,
  });
}

function disposePart(obj: PartObject): void {
  obj.mesh.geometry.dispose();
  obj.patch?.geometry.dispose();
  obj.mesh.material.dispose();
}
