import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', () => this.requestRender());

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
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
  setPreview(volumes: MeshData[], pins: MeshData[]): void {
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
    this.requestRender();
  }

  setPinMarkers(points: Vec3[]): void {
    this.overlay.children.filter((c) => c.userData.marker).forEach((c) => this.overlay.remove(c));
    const size = this.sceneSize() / 150;
    for (const p of points) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshBasicMaterial({ color: '#2f80ff' }));
      m.position.set(...p);
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

  /** Önizlemede iç hacimler görünsün diye parçalar yarı saydam çizilir. */
  private setXray(on: boolean): void {
    for (const p of this.parts.values()) {
      const m = p.mesh.material;
      m.transparent = on;
      m.opacity = on ? 0.3 : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
  }

  setBrushCursor(hit: Hit | null, radius: number): void {
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

  private sceneSize(): number {
    const box = new THREE.Box3();
    for (const p of this.parts.values()) box.expandByObject(p.mesh);
    return box.isEmpty() ? 100 : box.getSize(new THREE.Vector3()).length();
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
