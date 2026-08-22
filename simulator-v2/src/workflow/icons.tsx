import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const ICONS: Record<string, (p: IconProps) => React.ReactNode> = {
  degen: () => (
    <Svg>
      <path d="M13 2 4 14h7l-1 8 10-14h-7l0-6z" />
    </Svg>
  ),
  retail: () => (
    <Svg>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c.8-3.4 3.4-5 7-5s6.2 1.6 7 5" />
    </Svg>
  ),
  protocol: () => (
    <Svg>
      <path d="M12 3 5 6.5v5.2c0 4 3 6.8 7 8.3 4-1.5 7-4.3 7-8.3V6.5L12 3z" />
    </Svg>
  ),
  license: () => (
    <Svg>
      <rect x="6" y="3" width="12" height="16" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Svg>
  ),
  vault: () => (
    <Svg>
      <rect x="4" y="6" width="16" height="13" rx="2" />
      <path d="M8 6V5a4 4 0 0 1 8 0v1" />
      <circle cx="12" cy="13" r="2" />
    </Svg>
  ),
  settings: () => (
    <Svg>
      <path d="M4 7h16M4 12h10M4 17h13" />
      <circle cx="9" cy="7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="14" cy="17" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  ),
  deposit: () => (
    <Svg>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8 8V7a4 4 0 0 1 8 0v1M12 12v4M10 14h4" />
    </Svg>
  ),
  ata: () => (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10.5c.6-1 1.5-1.5 2.5-1.5s2 .6 2.5 1.5c.6 1 .6 2.5 0 3.5-.5.9-1.5 1.5-2.5 1.5s-2-.6-2.5-1.5" />
    </Svg>
  ),
  request: () => (
    <Svg>
      <path d="M5 12h12M13 7l4 5-4 5" />
    </Svg>
  ),
  execute: () => (
    <Svg>
      <path d="M8 6v12l10-6-10-6z" />
    </Svg>
  ),
  openPos: () => (
    <Svg>
      <path d="M4 12h10M10 8l4 4-4 4" />
      <path d="M16 6v12" />
    </Svg>
  ),
  mirror: () => (
    <Svg>
      <circle cx="8" cy="8" r="2.4" />
      <circle cx="16" cy="8" r="2.4" />
      <path d="M4 18c.6-2.4 2.2-3.6 4-3.6s3.4 1.2 4 3.6M12 18c.6-2.4 2.2-3.6 4-3.6s3.4 1.2 4 3.6" />
    </Svg>
  ),
  mark: () => (
    <Svg>
      <path d="M4 16l4-4 3 3 7-8" />
      <path d="M4 20h16" />
    </Svg>
  ),
  closePos: () => (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.5 11 15l4.5-5" />
    </Svg>
  ),
  withdraw: () => (
    <Svg>
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M12 4v8M9 9l3 3 3-3" />
    </Svg>
  ),
  toWallet: () => (
    <Svg>
      <path d="M12 4v10M8 10l4 4 4-4" />
      <path d="M5 18h14" />
    </Svg>
  ),
  accrue: () => (
    <Svg>
      <path d="M8 7h2.8a2.6 2.6 0 0 1 0 5.2H8V7zM8 12.2h3.2A2.8 2.8 0 0 1 14 17H8v-4.8z" />
      <path d="M16 6l2 12" />
    </Svg>
  ),
  claim: () => (
    <Svg>
      <rect x="3" y="7" width="12" height="11" rx="2" />
      <path d="M15 12h6M18 9l3 3-3 3" />
    </Svg>
  ),
  degenFee: () => (
    <Svg>
      <circle cx="9" cy="12" r="5" />
      <circle cx="16" cy="10" r="5" />
    </Svg>
  ),
  platform: () => (
    <Svg>
      <path d="M4 19h16M6 19V10l6-5 6 5v9M10 19v-5h4v5" />
    </Svg>
  ),
};

export function NodeIcon({ name }: { name: string }) {
  const render = ICONS[name] ?? ICONS.protocol;
  return <span className="nv-icon">{render({})}</span>;
}
