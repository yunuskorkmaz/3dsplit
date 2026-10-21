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
  | 'xray';

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
