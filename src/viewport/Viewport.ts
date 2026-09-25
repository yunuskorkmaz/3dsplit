import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
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

interface PartObject {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  source: LabeledMesh;
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

  constructor(
    private container: HTMLElement,
    private handlers: PointerHandlers,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#2b2d31');

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#444444', 1.2));
    const key = new THREE.DirectionalLight('#ffffff', 1.5);
    key.position.set(1, 2, 3);
    this.camera.add(key);
    this.scene.add(this.camera);
    this.scene.add(this.overlay);
    this.scene.add(this.errorLines);

    this.brushCursor = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1, 48),
      new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, depthTest: false, transparent: true }),
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
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.addEventListener('change', () => this.requestRender());

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // bağlam düşerse varsayılan davranışı engelle ki tarayıcı geri getirebilsin
    el.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.handlers.onContextLost();
    });
    el.addEventListener('webglcontextrestored', () => {
      // GPU kaynakları gitti: parçalar bir sonraki sync'te baştan kurulur
      this.parts.forEach((p) => this.scene.remove(p.mesh));
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

    this.dirArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 10, 0xff9900);
    this.dirHandle.add(this.dirArrow);
    this.dirHandle.visible = false;
    this.scene.add(this.dirHandle);
    this.gizmo = new TransformControls(this.camera, el);
    this.gizmo.setMode('rotate');
    this.gizmo.setSpace('local');
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
    });
    this.gizmo.addEventListener('change', () => this.requestRender());
    this.gizmo.addEventListener('objectChange', () => {
      const d = new THREE.Vector3(0, 0, 1).applyQuaternion(this.dirHandle.quaternion).normalize();
      this.onDirectionChange?.(d.toArray() as Vec3);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.gizmo.detach();
    this.gizmo.dispose();
    this.controls.dispose();
    for (const p of this.parts.values()) p.mesh.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Parça listesini sahneyle eşitler. Mesh değişmişse geometri yeniden kurulur. */
  sync(views: PartView[], colors: (label: number) => THREE.Color): void {
    const ids = new Set(views.map((v) => v.id));
    for (const [id, obj] of this.parts) {
      if (!ids.has(id)) {
        this.scene.remove(obj.mesh);
        obj.mesh.geometry.dispose();
        this.parts.delete(id);
      }
    }
    for (const v of views) {
      let obj = this.parts.get(v.id);
      if (!obj || obj.source !== v.mesh) {
        if (obj) {
          this.scene.remove(obj.mesh);
          obj.mesh.geometry.dispose();
        }
        obj = { mesh: buildMesh(v.mesh), source: v.mesh };
        obj.mesh.userData.partId = v.id;
        this.parts.set(v.id, obj);
        this.scene.add(obj.mesh);
      }
      obj.mesh.visible = v.visible;
      obj.mesh.material.emissive.set(v.selected ? '#202020' : '#000000');
      this.recolor(v.id, colors);
    }
    if (!this.fitted && views.length) {
      this.fitView();
      this.fitted = true;
    }
    this.requestRender();
  }

  /** Etiketlerden köşe renklerini yeniden yazar. */
  recolor(partId: string, colors: (label: number) => THREE.Color, tris?: ArrayLike<number>): void {
    const obj = this.parts.get(partId);
    if (!obj) return;
    const attr = obj.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = attr.array as Uint8Array;
    const labels = obj.source.labels;
    const write = (t: number) => {
      const c = colors(labels[t]);
      const r = Math.round(c.r * 255);
      const g = Math.round(c.g * 255);
      const b = Math.round(c.b * 255);
      for (let k = 0; k < 3; k++) {
        arr[9 * t + 3 * k] = r;
        arr[9 * t + 3 * k + 1] = g;
        arr[9 * t + 3 * k + 2] = b;
      }
    };
    if (tris) for (let i = 0; i < tris.length; i++) write(tris[i]);
    else for (let t = 0; t < labels.length; t++) write(t);
    attr.needsUpdate = true;
    this.requestRender();
  }

  /**
   * Konumu veya etiketi değişen üçgenleri yerinde günceller (yumuşatma
   * fırçası). `tris` null ise darbe bitti: seçim ağacı yeniden oturtulur.
   */
  updateTriangles(partId: string, tris: ArrayLike<number> | null, colors: (label: number) => THREE.Color): void {
    const obj = this.parts.get(partId);
    if (!obj) return;
    const g = obj.mesh.geometry;
    if (tris === null) {
      g.boundsTree?.refit();
      g.computeBoundingSphere();
      this.requestRender();
      return;
    }
    const src = obj.source;
    const posAttr = g.getAttribute('position') as THREE.BufferAttribute;
    const nrmAttr = g.getAttribute('normal') as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const nrm = nrmAttr.array as Float32Array;
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      for (let k = 0; k < 3; k++) {
        const v = src.indices[3 * t + k];
        pos[9 * t + 3 * k] = src.positions[3 * v];
        pos[9 * t + 3 * k + 1] = src.positions[3 * v + 1];
        pos[9 * t + 3 * k + 2] = src.positions[3 * v + 2];
      }
      const ux = pos[9 * t + 3] - pos[9 * t];
      const uy = pos[9 * t + 4] - pos[9 * t + 1];
      const uz = pos[9 * t + 5] - pos[9 * t + 2];
      const vx = pos[9 * t + 6] - pos[9 * t];
      const vy = pos[9 * t + 7] - pos[9 * t + 1];
      const vz = pos[9 * t + 8] - pos[9 * t + 2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      for (let k = 0; k < 3; k++) {
        nrm[9 * t + 3 * k] = nx;
        nrm[9 * t + 3 * k + 1] = ny;
        nrm[9 * t + 3 * k + 2] = nz;
      }
    }
    posAttr.needsUpdate = true;
    nrmAttr.needsUpdate = true;
    this.recolor(partId, colors, tris);
  }

  fitView(): void {
    const box = new THREE.Box3();
    for (const p of this.parts.values()) if (p.mesh.visible) box.expandByObject(p.mesh);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(0, -1, 0.6).normalize().multiplyScalar(size * 1.4));
    this.camera.near = size / 1000;
    this.camera.far = size * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  /** Önizleme (Space): tapa hacimleri/kapaklar yarı saydam, pimler mavi. */
  setPreview(volumes: MeshData[], pins: MeshData[], thin: MeshData[] = []): void {
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
    // ince duvar: modelin dışına taşan kısım, her şeyin üstünde kırmızı
    const thinMat = new THREE.MeshBasicMaterial({ color: '#ff2020', depthTest: false, transparent: true, opacity: 0.85 });
    for (const t of thin) {
      const m = new THREE.Mesh(toGeometry(t), thinMat);
      m.renderOrder = 6;
      this.overlay.add(m);
    }
    this.requestRender();
  }

  /** Keys pim işaretleri: yüzeyde tıklanan noktalar, pim yarıçapında; seçili pim turuncu. */
  setPinMarkers(pins: { point: Vec3; radius: number; selected: boolean }[]): void {
    this.overlay.children
      .filter((c) => c.userData.marker)
      .forEach((c) => {
        this.overlay.remove(c);
        if (c instanceof THREE.Mesh) c.geometry.dispose();
      });
    for (const p of pins) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(p.radius, 16, 12),
        new THREE.MeshBasicMaterial({ color: p.selected ? '#ff9900' : '#2f80ff', transparent: true, opacity: 0.7, depthTest: false }),
      );
      m.renderOrder = 5;
      m.position.set(...p.point);
      m.userData.marker = true;
      this.overlay.add(m);
    }
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
  showDirection(center: Vec3 | null, dir: Vec3, editable: boolean, onChange: (dir: Vec3) => void): void {
    this.onDirectionChange = onChange;
    if (!center) {
      this.dirHandle.visible = false;
      this.gizmo.detach();
      this.requestRender();
      return;
    }
    this.dirHandle.visible = true;
    this.dirHandle.position.set(...center);
    // sürükleme sırasında store'dan dönen yön tutamağı geri çevirmesin
    if (!this.gizmo.dragging) {
      this.dirHandle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize());
    }
    const size = this.sceneDiagonal() * 0.15;
    this.dirArrow.setLength(size, size * 0.25, size * 0.12);
    if (editable) {
      if (this.gizmo.object !== this.dirHandle) this.gizmo.attach(this.dirHandle);
      this.gizmo.size = 0.8;
    } else {
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
    // OrbitControls yakınlaştırma çarpanı zoomSpeed üssüyle hesaplanıyor: eksi işaret yönü çevirir
    this.controls.zoomSpeed = invertZoom ? -1 : 1;
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
      this.scene.remove(this.mirrorPlane);
      this.mirrorPlane.geometry.dispose();
      this.mirrorPlane = null;
    }
    if (plane) {
      const box = new THREE.Box3();
      for (const p of this.parts.values()) if (p.mesh.visible) box.expandByObject(p.mesh);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const other = [0, 1, 2].filter((k) => k !== plane.axis);
      const g = new THREE.PlaneGeometry(size.getComponent(other[0]) * 1.2, size.getComponent(other[1]) * 1.2);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({ color: '#8fd3ff', transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }),
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
      this.scene.add(m);
    }
    this.requestRender();
  }

  /** Kameradan hedefe değil, hedeften kameraya bakan birim yön (Socket "kameradan"). */
  viewDirection(): Vec3 {
    const d = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
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
    this.brushCursor.position.set(...hit.point);
    this.brushCursor.scale.setScalar(radius);
    this.brushCursor.lookAt(new THREE.Vector3(...hit.point).add(new THREE.Vector3(...hit.normal)));
    this.requestRender();
  }

  pick(e: { clientX: number; clientY: number }): Hit | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.firstHitOnly = true;
    const targets = [...this.parts.values()].filter((p) => p.mesh.visible).map((p) => p.mesh);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit || !hit.face) return null;
    return {
      partId: hit.object.userData.partId,
      // geometri indekssiz: köşe 3t+k, BVH'nin yeniden sıraladığı indeksten bağımsız
      tri: Math.floor(hit.face.a / 3),
      point: hit.point.toArray() as Vec3,
      normal: hit.face.normal.toArray() as Vec3,
    };
  }

  requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
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
    // Alt basılıyken veya boşlukta sol tık: kamera döner
    if (e.button !== 0 || e.altKey) {
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
  };

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
function buildMesh(m: LabeledMesh): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const triCount = m.indices.length / 3;
  const pos = new Float32Array(triCount * 9);
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const v = m.indices[3 * t + k];
      pos[9 * t + 3 * k] = m.positions[3 * v];
      pos[9 * t + 3 * k + 1] = m.positions[3 * v + 1];
      pos[9 * t + 3 * k + 2] = m.positions[3 * v + 2];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(triCount * 9), 3, true));
  g.computeVertexNormals();
  g.boundsTree = new MeshBVH(g);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0 });
  return new THREE.Mesh(g, mat);
}
