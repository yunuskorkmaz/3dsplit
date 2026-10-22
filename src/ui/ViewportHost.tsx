import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  beginSmoothStroke,
  beginStroke,
  brushAt,
  bucketAt,
  commitPinHandle,
  endSmoothStroke,
  endStroke,
  lineClick,
  linePreview,
  mirrorOffset,
  pinClick,
  regionFrame,
  setGeometryChangedHook,
  setLabelsChangedHook,
  setSmartAngle,
  setSocketDirection,
  smartFillAt,
  smoothAt,
  updatePin,
} from '../state/actions';
import { get, notify, type Part, set, useStore } from '../state/store';
import { type Hit, Viewport } from '../viewport/Viewport';

const DIMMED = new THREE.Color('#2a2a2a');
/** X81: seçme tıkından sonra bu süre içindeki ikinci tık çift tık sayılır, ms. */
const DOUBLE_CLICK_MS = 400;

/**
 * Bütün renkler tam görünür (X77). "Seçili rengi öne çıkar" açıksa aktif slot dışındaki
 * boyalar solar; taban seçiliyken yine hepsi görünür.
 */
function slotColor(label: number): THREE.Color {
  const { slots, activeSlot, dimOthers, hiddenSlots } = get();
  // X85: gizlenen rengin boyası taban rengiyle çizilir
  const shown = hiddenSlots.includes(label) ? 0 : label;
  const slot = slots.find((s) => s.id === shown);
  const color = new THREE.Color(slot?.color ?? '#ff00ff');
  if (dimOthers && label !== 0 && activeSlot !== 0 && label !== activeSlot)
    color.lerp(DIMMED, 0.78);
  return color;
}

/**
 * X98: parçanın renk işlevi. Seçimsiz (taban) üçgenler gövdenin rengiyle çizilir:
 * kesimden çıkan gövde, kesilen seçim setinin rengini taşır.
 */
function colorsFor(partId: string): (label: number) => THREE.Color {
  const part = get().parts.find((p) => p.id === partId);
  const base = part?.colorSlot ?? 0;
  if (!base) return slotColor;
  const bodyColor = new THREE.Color(get().slots.find((s) => s.id === base)?.color ?? '#b0b0b0');
  return (label) => (label === 0 ? bodyColor : slotColor(label));
}

let activeViewport: Viewport | null = null;

/**
 * Sahneye gidecek parçalar. X96: gizli kaynak parça (kesimden önceki hal) sahneye
 * konmaz: büyük modelde her kesim GPU'da bir kopya daha tutuyordu. Gösterilince kurulur.
 */
function partViews(parts: Part[], selectedPartId: string | null) {
  return parts
    .filter((p) => p.visible || p.badge !== 'source')
    .map((p) => ({
      id: p.id,
      mesh: p.mesh,
      visible: p.visible,
      selected: p.id === selectedPartId,
    }));
}

/** Görünümü sığdır (araç çubuğu, Home tuşu). */
export function fitView(): void {
  activeViewport?.fitView();
}

/** X89: model üstündeki değer kutularının ekran konumları; görünmüyorsa null. */
export function valueTagPositions(): {
  depth: { x: number; y: number } | null;
  pin: { x: number; y: number } | null;
} {
  const vp = activeViewport;
  if (!vp) return { depth: null, pin: null };
  const d = vp.depthTagAnchor();
  const p = vp.pinTagAnchor();
  return {
    depth: d ? vp.screenPoint(d, true) : null,
    // pim modelin içinde ama üstte çizilir: örtülme denetlenmez
    pin: p ? vp.screenPoint(p, false) : null,
  };
}

/** X87: bakış yönü korunur, görünür parçaların hepsi sığar. */
export function fitAll(): void {
  activeViewport?.fitAll();
}

/** Parçayı sığdırır, dönüş merkezini ona alır. */
export function fitPart(partId: string): void {
  activeViewport?.fitPart(partId);
}

export const VIEWS = [
  ['front', 'Ön'],
  ['back', 'Arka'],
  ['left', 'Sol'],
  ['right', 'Sağ'],
  ['top', 'Üst'],
  ['bottom', 'Alt'],
] as const;

/** Kamerayı seçili parçanın bu yanına çevirir. */
export function viewFrom(side: (typeof VIEWS)[number][0]): void {
  activeViewport?.viewFrom(side);
}

/** Köşe bakışı. İşaretler: sağ +X, arka +Y, üst +Z. */
export function viewToward(x: number, y: number, z: number): void {
  activeViewport?.viewToward(new THREE.Vector3(x, y, z));
}

/** Görünüş küpünün o anki dönüşü. */
export function cameraCssMatrix(): string {
  return activeViewport?.cssViewMatrix() ?? 'none';
}

/** Kamera kıpırdayınca çağrılır. Viewport yoksa abonelik kurulmaz. */
export function watchCamera(fn: () => void): () => void {
  return activeViewport?.watchCamera(fn) ?? (() => {});
}

/** Hedeften kameraya bakan yön; Socket yönünü "kameradan al" için. */
export function cameraDirection(): [number, number, number] | null {
  return activeViewport ? activeViewport.viewDirection() : null;
}

/** Viewport'u React ağacına bağlar; araç olaylarını aksiyonlara çevirir. */
export function ViewportHost() {
  const ref = useRef<HTMLDivElement>(null);
  const vpRef = useRef<Viewport | null>(null);
  const parts = useStore((s) => s.parts);
  const selectedPartId = useStore((s) => s.selectedPartId);
  const slots = useStore((s) => s.slots);
  const preview = useStore((s) => s.preview);
  const pins = useStore((s) => s.pins);
  const selectedPin = useStore((s) => s.selectedPin);
  const tool = useStore((s) => s.tool);

  useEffect(() => {
    if (!ref.current) return;
    // sürükleme türü: boya/sil fırçası, yumuşatma fırçası, pim taşıma
    let drag: 'paint' | 'smooth' | 'pin' | null = null;
    let eraseStroke = false;
    // son darbe noktası: hızlı sürüklemede aradaki boşluğu doldurmak için
    let last: { x: number; y: number; point: [number, number, number] } | null = null;
    let strokePart = '';
    let draggingPin = -1;
    let selectClick: { partId: string; time: number } | null = null;

    const cursor = (hit: Hit | null) => {
      const { tool, brushRadius, activeSlot, slots } = get();
      if (tool === 'brush')
        vp.setBrushCursor(hit, brushRadius, slots.find((x) => x.id === activeSlot)?.color);
      else if (tool === 'erase') vp.setBrushCursor(hit, brushRadius, '#ff5050');
      else if (tool === 'smooth') vp.setBrushCursor(hit, brushRadius, '#ffffff');
      else vp.setBrushCursor(null, brushRadius);
    };
    const dab = (h: Hit) => {
      if (drag === 'paint') brushAt(h.partId, h.tri, h.point, eraseStroke);
      else if (drag === 'smooth') smoothAt(h.point, h.tri);
    };

    const pinsShown = () => {
      const { cut, preview, pinLayout } = get();
      return cut.mode === 'keys' && preview !== null && pinLayout.length > 0;
    };
    // ekrandaki pimler: elle pim varsa onların, yoksa otomatik yerleşimin yüzey noktaları
    const pinPoints = () => {
      const { pins: list, pinLayout: layout } = get();
      return list.length
        ? list.map((p, i) => layout[i]?.surface ?? p.point)
        : layout.map((l) => l.surface);
    };

    const vp = new Viewport(ref.current, {
      onDown(hit: Hit, e: PointerEvent) {
        const { tool, selectedPartId: sel } = get();
        // X79: seçili olmayan parçaya tık yalnız onu seçer; araç seçili parçada çalışır
        if (hit.partId !== sel) {
          set({ selectedPartId: hit.partId });
          selectClick = { partId: hit.partId, time: e.timeStamp };
          return true;
        }
        // X81: seçme tıkının hemen ardından ikinci tık (çift tık): parçayı sığdır, araç çalışmaz
        if (
          selectClick?.partId === hit.partId &&
          e.timeStamp - selectClick.time < DOUBLE_CLICK_MS
        ) {
          selectClick = null;
          vp.fitPart(hit.partId);
          return true;
        }
        selectClick = null;
        // X74: önizlemedeki pin her araçta tutulup taşınır (boş yere tıklamak araca kalır)
        if (tool !== 'pin' && pinsShown()) {
          const index = vp.pickScreenPoint(e, pinPoints(), 18);
          if (index >= 0) {
            const picked = pinClick(index, hit.point, e.shiftKey);
            if (picked >= 0) {
              draggingPin = picked;
              drag = 'pin';
            }
            return true;
          }
        }
        if (tool === 'smart') smartFillAt(hit.partId, hit.tri, e.shiftKey);
        else if (tool === 'bucket') bucketAt(hit.partId, hit.tri, e.shiftKey);
        else if (tool === 'line' || tool === 'seam') lineClick(hit.partId, hit.tri, hit.point);
        else if (tool === 'pin') {
          // ekranda pimin üstüne tıklama: seç (sürükleyince yüzeyde taşınır); Shift ile sil.
          // pim seçiliyken boşluğa tıklama seçimi bırakır, seçili pim yokken yeni pim ekler
          const index = vp.pickScreenPoint(e, pinPoints(), 18);
          const picked = pinClick(index, hit.point, e.shiftKey);
          if (picked >= 0) {
            draggingPin = picked;
            drag = 'pin';
            return true;
          }
        } else if (tool === 'brush' || tool === 'erase') {
          // silgi aracında Shift boyar, fırçada Shift siler
          eraseStroke = (tool === 'erase') !== e.shiftKey;
          drag = 'paint';
          beginStroke(hit.partId, eraseStroke ? 'Silgi' : 'Fırça');
        } else if (tool === 'smooth') {
          if (!beginSmoothStroke(hit.partId)) return false;
          drag = 'smooth';
        }
        if (drag === 'paint' || drag === 'smooth') {
          strokePart = hit.partId;
          last = { x: e.clientX, y: e.clientY, point: hit.point };
          dab(hit);
          return true;
        }
        return false;
      },
      onMove(hit, e) {
        cursor(hit);
        if (drag === 'pin' && hit) {
          const i = draggingPin;
          updatePin(i, { point: hit.point }, 'Pim taşı');
          return;
        }
        // darbe başladığı parçada kalır
        if ((drag !== 'paint' && drag !== 'smooth') || !hit || hit.partId !== strokePart) return;
        const radius = get().brushRadius;
        // yumuşatma darbeleri daha seyrek: her darbe bir bölgeyi zaten yumuşatıyor
        const spacing = radius * (drag === 'smooth' ? 0.35 : 0.5);
        if (last) {
          const dist = Math.hypot(
            hit.point[0] - last.point[0],
            hit.point[1] - last.point[1],
            hit.point[2] - last.point[2],
          );
          if (drag === 'smooth' && dist < spacing) return;
          const steps = Math.min(64, Math.floor(dist / spacing));
          for (let i = 1; i < steps; i++) {
            const f = i / steps;
            const mid = vp.pick({
              clientX: last.x + (e.clientX - last.x) * f,
              clientY: last.y + (e.clientY - last.y) * f,
            });
            if (mid && mid.partId === strokePart) dab(mid);
          }
        }
        dab(hit);
        last = { x: e.clientX, y: e.clientY, point: hit.point };
      },
      onUp() {
        if (drag === 'paint') endStroke();
        else if (drag === 'smooth') endSmoothStroke();
        drag = null;
        draggingPin = -1;
        last = null;
      },
      onThresholdDrag(dx) {
        setSmartAngle(get().smartAngle + dx * 0.25);
      },
      onHover(hit) {
        cursor(hit);
      },
      onContextLost() {
        notify(
          'error',
          'Grafik bağlamı kayboldu (büyük ihtimalle bellek). Model yeniden çiziliyor; olmazsa projeyi kaydedip sayfayı yenileyin.',
        );
      },
      onContextRestored() {
        notify('info', 'Grafik bağlamı geri geldi, model yeniden çizildi.');
        const st = get();
        vp.sync(partViews(st.parts, st.selectedPartId), colorsFor);
      },
      onBrushResize(deltaY) {
        set((s) => ({
          brushRadius:
            Math.round(
              Math.min(50, Math.max(0.2, s.brushRadius * (deltaY > 0 ? 1 / 1.1 : 1.1))) * 100,
            ) / 100,
        }));
      },
    });
    vpRef.current = vp;
    activeViewport = vp;
    setLabelsChangedHook((partId, tris) => vp.recolor(partId, colorsFor(partId), tris));
    setGeometryChangedHook((partId, tris) => vp.updateTriangles(partId, tris, colorsFor(partId)));
    (window as unknown as { viewport: Viewport }).viewport = vp;
    return () => {
      setLabelsChangedHook(null);
      setGeometryChangedHook(null);
      vp.dispose();
      vpRef.current = null;
      activeViewport = null;
    };
  }, []);

  useEffect(() => {
    vpRef.current?.sync(partViews(parts, selectedPartId), colorsFor);
  }, [parts, selectedPartId, slots]);

  // X80: boş sahneye açılan dosyanın bütün parçaları gelince görünüm yeniden sığdırılır
  // (ilk sığdırma ilk parçaya göre yapılıyor; çok parçalı dosyada diğerleri dışarıda kalıyordu)
  const busy = useStore((s) => s.busy);
  const loadingIntoEmpty = useRef(false);
  useEffect(() => {
    if (busy) {
      if (!get().parts.length) loadingIntoEmpty.current = true;
    } else if (loadingIntoEmpty.current) {
      loadingIntoEmpty.current = false;
      if (get().parts.length > 1) vpRef.current?.fitView();
    }
  }, [busy]);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    if (preview) vp.setPreview(preview.volumes, preview.pins, preview.thin, preview.ringMarkers);
    else vp.clearOverlay();
  }, [preview]);

  // Yön oku + döndürme gizmosu: Socket yönü (önizlemede veya "Döndür" açıkken)
  // ya da Keys'te pim aracında seçili pimin ekseni
  const cutMode = useStore((s) => s.cut.mode);
  const direction = useStore((s) => s.cut.direction);
  const directionGizmo = useStore((s) => s.directionGizmo);
  const activeSlot = useStore((s) => s.activeSlot);
  const paintVersion = useStore((s) => s.paintVersion);
  const dimOthers = useStore((s) => s.dimOthers);
  const hiddenSlots = useStore((s) => s.hiddenSlots);
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    for (const p of get().parts) vp.recolor(p.id, colorsFor(p.id));
    const slot = get().slots.find((s) => s.id === activeSlot);
    vp.showSlotFocus(selectedPartId, activeSlot, slot?.color ?? '#ffffff', slot?.name ?? '');
  }, [activeSlot, selectedPartId, paintVersion, parts, dimOthers, hiddenSlots]);
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const show = cutMode === 'socket' && (directionGizmo || preview !== null);
    const frame = show ? regionFrame() : null;
    vp.showDirection(
      frame?.center ?? null,
      direction ?? frame?.normal ?? [0, 0, 1],
      directionGizmo,
      (d) => setSocketDirection(d),
    );
  }, [
    cutMode,
    direction,
    directionGizmo,
    preview,
    activeSlot,
    selectedPartId,
    paintVersion,
    tool,
    pins,
    selectedPin,
  ]);

  // D5: kesim hatasının sorunlu halkaları
  const errorLoops = useStore((s) => s.errorLoops);
  useEffect(() => {
    vpRef.current?.setErrorLoops(errorLoops);
  }, [errorLoops]);

  // X36: çizgi aracının yolu
  const line = useStore((s) => s.line);
  useEffect(() => {
    const { path, anchors, size } = linePreview();
    vpRef.current?.setLinePath(path, anchors, size);
  }, [line]);

  // X27: patlatılmış görünüm
  const explode = useStore((s) => s.explode);
  useEffect(() => {
    vpRef.current?.setExplode(explode);
  }, [explode]);

  // B7: X-ray
  const xray = useStore((s) => s.xray);
  useEffect(() => {
    vpRef.current?.setUserXray(xray);
  }, [xray, parts]);

  // E1: kamera düzeni
  const camera = useStore((s) => s.camera);
  useEffect(() => {
    vpRef.current?.setCameraMode(camera.mode, camera.invertZoom);
    vpRef.current?.setBed(camera.bed);
  }, [camera]);

  // X87: gezinme kipi; araç seçilince kip biter
  const navMode = useStore((s) => s.navMode);
  useEffect(() => {
    vpRef.current?.setNavMode(navMode);
  }, [navMode]);
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.tool !== prev.tool && s.navMode) set({ navMode: null });
      }),
    [],
  );

  // ayna düzlemi
  const mirror = useStore((s) => s.mirror);
  useEffect(() => {
    const paintTool =
      tool === 'smart' ||
      tool === 'brush' ||
      tool === 'erase' ||
      tool === 'smooth' ||
      tool === 'bucket' ||
      tool === 'line';
    vpRef.current?.setMirrorPlane(
      mirror.enabled && paintTool ? { axis: mirror.axis, offset: mirrorOffset() } : null,
    );
  }, [mirror, tool, parts, selectedPartId]);

  // pimler: gerçek boyutlu görüntü + seçili pimde taşı/döndür tutamağı
  const pinLayout = useStore((s) => s.pinLayout);
  const pinGizmo = useStore((s) => s.pinGizmo);
  useEffect(() => {
    const show = cutMode === 'keys' && (tool === 'pin' || preview !== null);
    vpRef.current?.setPins(
      show ? pinLayout : [],
      (tool === 'pin' || preview !== null) && pins.length ? selectedPin : -1,
      pinGizmo,
      commitPinHandle,
    );
  }, [pinLayout, pinGizmo, selectedPin, tool, cutMode, preview, pins.length]);

  return <div ref={ref} className="viewport" />;
}
