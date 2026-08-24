import { useId, type ReactNode } from "react";

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

/* Quick-action glyphs share one geometry: 16px optical box, rounded 2.2 stroke,
   so the four tiles read as a set at 20px. */

export function IconPark(p: Props) {
  return (
    <I {...p} strokeWidth={2.2}>
      <path d="M12 4v11" strokeLinecap="round" />
      <path d="M7.5 10.5 12 15l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" strokeLinecap="round" />
    </I>
  );
}

export function IconTrade(p: Props) {
  return (
    <I {...p} strokeWidth={2.2}>
      <path d="M4 8.5h14" strokeLinecap="round" />
      <path d="M14.5 5 18 8.5 14.5 12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 15.5H6" strokeLinecap="round" />
      <path d="M9.5 12 6 15.5 9.5 19" strokeLinecap="round" strokeLinejoin="round" />
    </I>
  );
}

export function IconClose(p: Props) {
  return (
    <I {...p} strokeWidth={2.2}>
      <path d="M12 4v7.5" strokeLinecap="round" />
      <path d="M6.7 7.4a7.5 7.5 0 1 0 10.6 0" strokeLinecap="round" />
    </I>
  );
}

export function IconCreate(p: Props) {
  return (
    <I {...p} strokeWidth={2.2}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </I>
  );
}

export function IconInfo(p: Props) {
  return (
    <I {...p} strokeWidth={2.4}>
      <path d="M12 8v5" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="9" />
    </I>
  );
}

/* Bottom-nav glyphs. One stroke weight and one optical size across the four so
   the bar reads as a set; each silhouette is distinct enough to identify with
   the labels hidden on a narrow panel. */
const NAV_STROKE = 1.9;

export function IconHome(p: Props) {
  return (
    <I {...p} strokeWidth={NAV_STROKE}>
      <path
        d="M3.8 10.3 12 4l8.2 6.3v8.3a1.9 1.9 0 0 1-1.9 1.9h-3.4v-5.6H9.1v5.6H5.7a1.9 1.9 0 0 1-1.9-1.9v-8.3z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </I>
  );
}

export function IconMarket(p: Props) {
  return (
    <I {...p} strokeWidth={NAV_STROKE}>
      <path d="M8 3.6v2.5M8 17.9v2.5" strokeLinecap="round" />
      <rect x="5.3" y="6.1" width="5.4" height="11.8" rx="1.7" />
      <path d="M16 5.1v2.5M16 16.4v2.5" strokeLinecap="round" />
      <rect x="13.3" y="7.6" width="5.4" height="8.8" rx="1.7" />
    </I>
  );
}

export function IconActivity(p: Props) {
  return (
    <I {...p} strokeWidth={NAV_STROKE}>
      <path
        d="M3 12.2h3.3l2.2-5.6 3.4 10.8 2.2-5.2H21"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </I>
  );
}

export function IconVault(p: Props) {
  return (
    <I {...p} strokeWidth={NAV_STROKE}>
      <rect x="3.2" y="4.9" width="17.6" height="14.2" rx="3.4" />
      <circle cx="10.3" cy="12" r="2.9" />
      <path d="M16.7 10.2v3.6" strokeLinecap="round" />
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

/** Official Solana mark — gradient id is scoped per instance. */
export function IconSolana({ className, width = 14, height }: Props) {
  const gradId = useId().replace(/:/g, "");
  const w = width ?? 14;
  const h = height ?? Math.round(w * (88 / 101));

  return (
    <svg
      className={className}
      width={w}
      height={h}
      viewBox="0 0 101 88"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient
          id={`sol-grad-${gradId}`}
          x1="8.52558"
          y1="90.0973"
          x2="88.9933"
          y2="-3.01622"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.08" stopColor="#9945FF" />
          <stop offset="0.3" stopColor="#8752F3" />
          <stop offset="0.5" stopColor="#5497D5" />
          <stop offset="0.6" stopColor="#43B4CA" />
          <stop offset="0.72" stopColor="#28E0B9" />
          <stop offset="0.97" stopColor="#19FB9B" />
        </linearGradient>
      </defs>
      <path
        d="M100.48 69.3817L83.8068 86.8015C83.4444 87.1799 83.0058 87.4816 82.5185 87.6878C82.0312 87.894 81.5055 88.0003 80.9743 88H1.93563C1.55849 88 1.18957 87.8926 0.874202 87.6912C0.558829 87.4897 0.31074 87.2029 0.160416 86.8659C0.0100923 86.529 -0.0359181 86.1566 0.0280382 85.7945C0.0919944 85.4324 0.263131 85.0964 0.520422 84.8278L17.2061 67.408C17.5676 67.0306 18.0047 66.7295 18.4904 66.5234C18.9762 66.3172 19.5002 66.2104 20.0301 66.2095H99.0644C99.4415 66.2095 99.8104 66.3169 100.126 66.5183C100.441 66.7198 100.689 67.0067 100.84 67.3436C100.99 67.6806 101.036 68.0529 100.972 68.415C100.908 68.7771 100.737 69.1131 100.48 69.3817ZM83.8068 34.3032C83.4444 33.9248 83.0058 33.6231 82.5185 33.4169C82.0312 33.2108 81.5055 33.1045 80.9743 33.1048H1.93563C1.55849 33.1048 1.18957 33.2121 0.874202 33.4136C0.558829 33.6151 0.31074 33.9019 0.160416 34.2388C0.0100923 34.5758 -0.0359181 34.9482 0.0280382 35.3103C0.0919944 35.6723 0.263131 36.0083 0.520422 36.277L17.2061 53.6968C17.5676 54.0742 18.0047 54.3752 18.4904 54.5814C18.9762 54.7875 19.5002 54.8944 20.0301 54.8952H99.0644C99.4415 54.8952 99.8104 54.7879 100.126 54.5864C100.441 54.3849 100.689 54.0981 100.84 53.7612C100.99 53.4242 101.036 53.0518 100.972 52.6897C100.908 52.3277 100.737 51.9917 100.48 51.723L83.8068 34.3032ZM1.93563 21.7905H80.9743C81.5055 21.7907 82.0312 21.6845 82.5185 21.4783C83.0058 21.2721 83.4444 20.9704 83.8068 20.592L100.48 3.17219C100.737 2.90357 100.908 2.56758 100.972 2.2055C101.036 1.84342 100.99 1.47103 100.84 1.13408C100.689 0.79713 100.441 0.510296 100.126 0.308823C99.8104 0.107349 99.4415 1.24074e-05 99.0644 0L20.0301 0C19.5002 0.000878397 18.9762 0.107699 18.4904 0.313848C18.0047 0.519998 17.5676 0.821087 17.2061 1.19848L0.524723 18.6183C0.267681 18.8866 0.0966198 19.2223 0.0325185 19.5839C-0.0315829 19.9456 0.0140624 20.3177 0.163856 20.6545C0.31365 20.9913 0.561081 21.2781 0.875804 21.4799C1.19053 21.6817 1.55886 21.7896 1.93563 21.7905Z"
        fill={`url(#sol-grad-${gradId})`}
      />
    </svg>
  );
}
