import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  beginSmoothStroke,
  beginStroke,
  brushAt,
  bucketAt,
  endSmoothStroke,
  endStroke,
  mirrorOffset,
  regionFrame,
  removePin,
  setSocketDirection,
  setGeometryChangedHook,
  setLabelsChangedHook,
  setSmartAngle,
  smartFillAt,
  smoothAt,
  updatePin,
} from '../state/actions';
import { get, notify, set, useStore } from '../state/store';
import { type Hit, Viewport } from '../viewport/Viewport';

function slotColor(label: number): THREE.Color {
  const slot = get().slots.find((s) => s.id === label);
  return new THREE.Color(slot?.color ?? '#ff00ff');
}

function nearestPin(pins: [number, number, number][], p: [number, number, number], maxDist: number): number {
  let best = -1;
  let bestD = maxDist;
  pins.forEach((q, i) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

let activeViewport: Viewport | null = null;

/** Görünümü sığdır (araç çubuğu, Home tuşu). */
export function fitView(): void {
  activeViewport?.fitView();
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

    const cursor = (hit: Hit | null) => {
      const { tool, brushRadius, activeSlot, slots } = get();
      if (tool === 'brush') vp.setBrushCursor(hit, brushRadius, slots.find((x) => x.id === activeSlot)?.color);
      else if (tool === 'erase') vp.setBrushCursor(hit, brushRadius, '#ff5050');
      else if (tool === 'smooth') vp.setBrushCursor(hit, brushRadius, '#ffffff');
      else vp.setBrushCursor(null, brushRadius);
    };
    const dab = (h: Hit) => {
      if (drag === 'paint') brushAt(h.partId, h.tri, h.point, eraseStroke);
      else if (drag === 'smooth') smoothAt(h.point);
    };

    const vp = new Viewport(ref.current, {
      onDown(hit: Hit, e: PointerEvent) {
        const { tool, selectedPartId: sel } = get();
        if (hit.partId !== sel) set({ selectedPartId: hit.partId, preview: null });
        if (tool === 'smart') smartFillAt(hit.partId, hit.tri, e.shiftKey);
        else if (tool === 'bucket') bucketAt(hit.partId, hit.tri, e.shiftKey);
        else if (tool === 'pin') {
          // pime yakın tıklama: seç ve sürükleyerek taşı; Shift ile sil. Boşluğa tıklama: yeni pim
          const { pins: list, cut } = get();
          const near = nearestPin(
            list.map((p) => p.point),
            hit.point,
            Math.max(1.5, (cut.pinRadius) * 1.5),
          );
          if (near >= 0 && e.shiftKey) {
            removePin(near);
          } else if (near >= 0) {
            set({ selectedPin: near });
            draggingPin = near;
            drag = 'pin';
            return true;
          } else if (!e.shiftKey) {
            set({ pins: [...list, { point: hit.point }], selectedPin: list.length, preview: null });
          }
        } else if (tool === 'brush' || tool === 'erase') {
          // silgi aracında Shift boyar, fırçada Shift siler
          eraseStroke = (tool === 'erase') !== e.shiftKey;
          drag = 'paint';
          beginStroke(hit.partId);
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
          updatePin(i, { point: hit.point });
          return;
        }
        // darbe başladığı parçada kalır
        if ((drag !== 'paint' && drag !== 'smooth') || !hit || hit.partId !== strokePart) return;
        const radius = get().brushRadius;
        // yumuşatma darbeleri daha seyrek: her darbe bir bölgeyi zaten yumuşatıyor
        const spacing = radius * (drag === 'smooth' ? 0.35 : 0.5);
        if (last) {
          const dist = Math.hypot(hit.point[0] - last.point[0], hit.point[1] - last.point[1], hit.point[2] - last.point[2]);
          if (drag === 'smooth' && dist < spacing) return;
          const steps = Math.min(64, Math.floor(dist / spacing));
          for (let i = 1; i < steps; i++) {
            const f = i / steps;
            const mid = vp.pick({ clientX: last.x + (e.clientX - last.x) * f, clientY: last.y + (e.clientY - last.y) * f });
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
        notify('error', 'Grafik bağlamı kayboldu (büyük ihtimalle bellek). Model yeniden çiziliyor; olmazsa projeyi kaydedip sayfayı yenileyin.');
      },
      onContextRestored() {
        notify('info', 'Grafik bağlamı geri geldi, model yeniden çizildi.');
        const st = get();
        vp.sync(
          st.parts.map((p) => ({ id: p.id, mesh: p.mesh, visible: p.visible, selected: p.id === st.selectedPartId })),
          slotColor,
        );
      },
      onBrushResize(deltaY) {
        set((s) => ({ brushRadius: Math.round(Math.min(50, Math.max(0.2, s.brushRadius * (deltaY > 0 ? 1 / 1.1 : 1.1))) * 100) / 100 }));
      },
    });
    vpRef.current = vp;
    activeViewport = vp;
    setLabelsChangedHook((partId, tris) => vp.recolor(partId, slotColor, tris));
    setGeometryChangedHook((partId, tris) => vp.updateTriangles(partId, tris, slotColor));
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
    vpRef.current?.sync(
      parts.map((p) => ({ id: p.id, mesh: p.mesh, visible: p.visible, selected: p.id === selectedPartId })),
      slotColor,
    );
  }, [parts, selectedPartId, slots]);

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
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const pin = cutMode === 'keys' && tool === 'pin' ? pins[selectedPin] : undefined;
    if (pin) {
      const frame = regionFrame();
      // varsayılan eksen: bölgeden gövdeye doğru
      const axis = pin.axis ?? (frame ? (frame.normal.map((x) => -x) as [number, number, number]) : [0, 0, -1]);
      vp.showDirection(pin.point, axis, true, (d) => updatePin(selectedPin, { axis: d }));
      return;
    }
    const show = cutMode === 'socket' && (directionGizmo || preview !== null);
    const frame = show ? regionFrame() : null;
    vp.showDirection(frame?.center ?? null, direction ?? frame?.normal ?? [0, 0, 1], directionGizmo, (d) => setSocketDirection(d));
  }, [cutMode, direction, directionGizmo, preview, activeSlot, selectedPartId, paintVersion, tool, pins, selectedPin]);

  // D5: kesim hatasının sorunlu halkaları
  const errorLoops = useStore((s) => s.errorLoops);
  useEffect(() => {
    vpRef.current?.setErrorLoops(errorLoops);
  }, [errorLoops]);

  // B7: X-ray
  const xray = useStore((s) => s.xray);
  useEffect(() => {
    vpRef.current?.setUserXray(xray);
  }, [xray, parts]);

  // E1: kamera düzeni
  const camera = useStore((s) => s.camera);
  useEffect(() => {
    vpRef.current?.setCameraMode(camera.mode, camera.invertZoom);
  }, [camera]);

  // ayna düzlemi
  const mirror = useStore((s) => s.mirror);
  useEffect(() => {
    const paintTool = tool === 'smart' || tool === 'brush' || tool === 'erase' || tool === 'smooth' || tool === 'bucket';
    vpRef.current?.setMirrorPlane(mirror.enabled && paintTool ? { axis: mirror.axis, offset: mirrorOffset() } : null);
  }, [mirror, tool, parts, selectedPartId]);

  const pinRadius = useStore((s) => s.cut.pinRadius);
  useEffect(() => {
    vpRef.current?.setPinMarkers(
      pins.map((p, i) => ({ point: p.point, radius: p.radius ?? pinRadius, selected: tool === 'pin' && i === selectedPin })),
    );
  }, [pins, pinRadius, selectedPin, tool]);

  return <div ref={ref} className="viewport" />;
}
