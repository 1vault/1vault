import type { ReactNode } from "react";

type Props = { className?: string; width?: number; height?: number };

function I({
  className,
  width = 20,
  height = 20,
  children,
  strokeWidth = 2,
}: Props & { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    >
      {children}
    </svg>
  );
}

export function IconSend(p: Props) {
  return (
    <I {...p}>
      <path d="M7 17L17 7M17 7H9M17 7v8" strokeLinecap="round" strokeLinejoin="round" />
    </I>
  );
}

export function IconPark(p: Props) {
  return (
    <I {...p} strokeWidth={2.1}>
      <path d="M12 4v10" strokeLinecap="round" />
      <path d="M8 10l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 18h12" strokeLinecap="round" />
    </I>
  );
}

export function IconTrade(p: Props) {
  return (
    <I {...p} strokeWidth={2.1}>
      <path d="M4 8h13l-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16H7l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </I>
  );
}

export function IconClose(p: Props) {
  return (
    <I {...p} strokeWidth={2.1}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
    </I>
  );
}

export function IconCreate(p: Props) {
  return (
    <I {...p} strokeWidth={2.1}>
      <path
        d="M8 4h5l5 5v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        strokeLinejoin="round"
      />
      <path d="M13 4v5h5" strokeLinejoin="round" />
      <path d="M9.5 14h5M12 11.5v5" strokeLinecap="round" />
    </I>
  );
}

export function IconHome(p: Props) {
  return (
    <I {...p}>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"
        strokeLinejoin="round"
      />
    </I>
  );
}

export function IconExplore(p: Props) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5l-2 5-5 2 2-5 5-2z" strokeLinejoin="round" />
    </I>
  );
}

export function IconActivity(p: Props) {
  return (
    <I {...p}>
      <path d="M3 12h4l2-5 4 10 2-5h6" strokeLinecap="round" strokeLinejoin="round" />
    </I>
  );
}

export function IconVault(p: Props) {
  return (
    <I {...p}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9v-2" strokeLinecap="round" />
    </I>
  );
}

export function IconLink(p: Props) {
  return (
    <I width={p.width ?? 16} height={p.height ?? 16} className={p.className} strokeWidth={2.2}>
      <path
        d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 5"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13 19"
        strokeLinecap="round"
      />
    </I>
  );
}

export function IconDown(p: Props) {
  return (
    <I width={p.width ?? 16} height={p.height ?? 16} className={p.className} strokeWidth={2.4}>
      <path d="M12 5v12M7 13l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </I>
  );
}

export function IconCheck(p: Props) {
  return (
    <I width={p.width ?? 10} height={p.height ?? 10} className={p.className} strokeWidth={3}>
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </I>
  );
}
