import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  beginStroke,
  brushAt,
  bucketAt,
  endStroke,
  setLabelsChangedHook,
  setSmartAngle,
  smartFillAt,
} from '../state/actions';
import { get, set, useStore } from '../state/store';
import { type Hit, Viewport } from '../viewport/Viewport';

function slotColor(label: number): THREE.Color {
  const slot = get().slots.find((s) => s.id === label);
  return new THREE.Color(slot?.color ?? '#ff00ff');
}

/** Viewport'u React ağacına bağlar; araç olaylarını aksiyonlara çevirir. */
export function ViewportHost() {
  const ref = useRef<HTMLDivElement>(null);
  const vpRef = useRef<Viewport | null>(null);
  const parts = useStore((s) => s.parts);
  const selectedPartId = useStore((s) => s.selectedPartId);
  const slots = useStore((s) => s.slots);
  const preview = useStore((s) => s.preview);
  const pinPoints = useStore((s) => s.pinPoints);

  useEffect(() => {
    if (!ref.current) return;
    let brushing = false;
    // son fırça noktası: hızlı sürüklemede aradaki boşluğu doldurmak için
    let last: { x: number; y: number; point: [number, number, number] } | null = null;
    let strokePart = '';
    const vp = new Viewport(ref.current, {
      onDown(hit: Hit, e: PointerEvent) {
        const { tool, selectedPartId: sel } = get();
        if (hit.partId !== sel) set({ selectedPartId: hit.partId, preview: null });
        const erase = e.shiftKey;
        if (tool === 'smart') smartFillAt(hit.partId, hit.tri, erase);
        else if (tool === 'bucket') bucketAt(hit.partId, hit.tri, erase);
        else if (tool === 'pin') set((s) => ({ pinPoints: [...s.pinPoints, hit.point], preview: null }));
        else if (tool === 'brush') {
          beginStroke(hit.partId);
          brushAt(hit.partId, hit.tri, hit.point, erase);
          brushing = true;
          strokePart = hit.partId;
          last = { x: e.clientX, y: e.clientY, point: hit.point };
          return true;
        }
        return false;
      },
      onMove(hit, e) {
        vp.setBrushCursor(get().tool === 'brush' ? hit : null, get().brushRadius);
        // darbe başladığı parçada kalır
        if (!brushing || !hit || hit.partId !== strokePart) return;
        const radius = get().brushRadius;
        if (last) {
          const dist = Math.hypot(hit.point[0] - last.point[0], hit.point[1] - last.point[1], hit.point[2] - last.point[2]);
          const steps = Math.min(64, Math.floor(dist / (radius * 0.5)));
          for (let i = 1; i < steps; i++) {
            const f = i / steps;
            const mid = vp.pick({ clientX: last.x + (e.clientX - last.x) * f, clientY: last.y + (e.clientY - last.y) * f });
            if (mid && mid.partId === strokePart) brushAt(mid.partId, mid.tri, mid.point, e.shiftKey);
          }
        }
        brushAt(hit.partId, hit.tri, hit.point, e.shiftKey);
        last = { x: e.clientX, y: e.clientY, point: hit.point };
      },
      onUp() {
        if (brushing) endStroke();
        brushing = false;
        last = null;
      },
      onThresholdDrag(dx) {
        setSmartAngle(get().smartAngle + dx * 0.25);
      },
      onHover(hit) {
        vp.setBrushCursor(get().tool === 'brush' ? hit : null, get().brushRadius);
      },
    });
    vpRef.current = vp;
    setLabelsChangedHook((partId, tris) => vp.recolor(partId, slotColor, tris));
    (window as unknown as { viewport: Viewport }).viewport = vp;
    return () => {
      setLabelsChangedHook(null);
      vp.dispose();
      vpRef.current = null;
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
    if (preview) vp.setPreview(preview.volumes, preview.pins);
    else vp.clearOverlay();
  }, [preview]);

  useEffect(() => {
    vpRef.current?.setPinMarkers(pinPoints);
  }, [pinPoints]);

  return <div ref={ref} className="viewport" />;
}
