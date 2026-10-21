import type { ReactNode } from 'react';

/** X84: şerit simgeleri. 24 × 24, 1,75 px çizgi, renk yazıdan gelir. */
export type IconName =
  | 'smart'
  | 'brush'
  | 'erase'
  | 'smooth'
  | 'bucket'
  | 'line'
  | 'seam'
  | 'suggest'
  | 'socket'
  | 'keys'
  | 'fast'
  | 'pin'
  | 'split'
  | 'repair'
  | 'refine'
  | 'printSize'
  | 'explode'
  | 'xray'
  | 'orbit'
  | 'pan'
  | 'zoom'
  | 'fitAll'
  | 'fitSelected'
  | 'home'
  | 'views'
  | 'bed'
  | 'settings'
  | 'open'
  | 'trash'
  | 'start'
  | 'coupon'
  | 'parts';

const PATHS: Record<IconName, ReactNode> = {
  // tıklanan çıkıntı ve çevresindeki seçim
  smart: (
    <>
      <path d="M4 20l9-9" />
      <path d="M15 3v3M15 12v3M10 7.5h2.5M17.5 7.5H20M11.5 4l1.5 1.5M18.5 11l-1.5-1.5M18.5 4L17 5.5" />
    </>
  ),
  brush: (
    <>
      <path d="M20 4l-9 9" />
      <path d="M11 13c-3 0-5 2-5 4.5 0 1-.7 2-2 2.5 4 1 8-.5 8.5-4" />
    </>
  ),
  erase: (
    <>
      <path d="M8 20h12" />
      <path d="M4.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L10 20H8.5z" />
      <path d="M9 11l5 5" />
    </>
  ),
  smooth: (
    <>
      <path d="M3 9c3-3 5 3 9 0s6 3 9 0" strokeDasharray="2 2" />
      <path d="M3 15c3-2 6-2 9 0s6 2 9 0" />
    </>
  ),
  bucket: (
    <>
      <path d="M5 11l6-6 7 7-6 6a1.5 1.5 0 0 1-2 0l-5-5a1.5 1.5 0 0 1 0-2z" />
      <path d="M5 11h13" />
      <path d="M20 15c0 1.5 1 2.5 1 3.5a1 1 0 0 1-2 0c0-1 1-2 1-3.5z" />
    </>
  ),
  line: (
    <>
      <path d="M4 18l5-9 6 5 5-9" />
      <circle cx="4" cy="18" r="1.5" />
      <circle cx="9" cy="9" r="1.5" />
      <circle cx="15" cy="14" r="1.5" />
      <circle cx="20" cy="5" r="1.5" />
    </>
  ),
  seam: (
    <>
      <ellipse cx="12" cy="12" rx="8" ry="5" strokeDasharray="3 2.5" />
      <path d="M12 3v4M12 17v4" />
    </>
  ),
  suggest: (
    <>
      <path d="M3 19c3 0 4-6 9-6s6 6 9 6" />
      <path d="M12 3v3M8 5l1.5 1.5M16 5l-1.5 1.5" />
    </>
  ),
  // gövdedeki yuvaya giren tapa
  socket: (
    <>
      <path d="M3 13h5v6h8v-6h5v7H3z" />
      <path d="M9 5h6v9H9z" />
      <path d="M12 2v1.5" />
    </>
  ),
  // iki yarım ve aralarındaki pim
  keys: (
    <>
      <path d="M3 4h18v6H3zM3 14h18v6H3z" />
      <path d="M10.5 7v10h3V7z" />
    </>
  ),
  // düz kesilip yapıştırılan iki yarım
  fast: (
    <>
      <path d="M3 4h18v6H3zM3 14h18v6H3z" />
      <path d="M7 12h10" strokeDasharray="2 2" />
    </>
  ),
  pin: (
    <>
      <ellipse cx="12" cy="5.5" rx="3.5" ry="1.5" />
      <path d="M8.5 5.5v13c0 .8 1.6 1.5 3.5 1.5s3.5-.7 3.5-1.5v-13" />
    </>
  ),
  split: (
    <>
      <path d="M3 8l4-4 4 4-4 4z" />
      <path d="M13 16l4-4 4 4-4 4z" />
      <path d="M10 14l-2 2M16 8l-2 2" strokeDasharray="1.5 1.5" />
    </>
  ),
  // kapanan delik
  repair: (
    <>
      <path d="M4 7l8-4 8 4v10l-8 4-8-4z" />
      <path d="M9 11.5l2 2 4-4" />
    </>
  ),
  refine: (
    <>
      <path d="M12 3l9 17H3z" />
      <path d="M7.5 11.5h9M12 20l-4.5-8.5M12 20l4.5-8.5" />
    </>
  ),
  printSize: (
    <>
      <path d="M3 8h18v8H3z" />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </>
  ),
  explode: (
    <>
      <path d="M9 9h6v6H9z" />
      <path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3" />
    </>
  ),
  xray: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" fillOpacity="0.35" />
    </>
  ),
  orbit: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="4" />
      <path d="M17 6.5l2.5 1.8-2.8 1" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  pan: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </>
  ),
  zoom: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6" />
    </>
  ),
  fitAll: (
    <>
      <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
      <path d="M8 8h8v8H8z" />
    </>
  ),
  fitSelected: (
    <>
      <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" fillOpacity="0.35" />
    </>
  ),
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 9.5V20h12V9.5" />
    </>
  ),
  views: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  bed: (
    <>
      <path d="M2 16l5-6h15l-5 6z" />
      <path d="M8.5 13h10M7 10l-2.5 6M12 10l-2.5 6M17 10l-2.5 6" strokeWidth="1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  open: (
    <>
      <path d="M3 6h6l2 2h10v11H3z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13" />
    </>
  ),
  start: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </>
  ),
  coupon: (
    <>
      <path d="M3 14h18v5H3z" />
      <path d="M6 14V9h2v5M11 14V8h2v6M16 14V7h2v7" />
    </>
  ),
  parts: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
};

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
