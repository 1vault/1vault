/**
 * Line-art illustrations for the "Build with 1Vault" cards. Drawn with
 * currentColor plus the accent token so they inherit card hover states.
 */

export function LicenceLockArt() {
  return (
    <svg
      viewBox="0 0 320 180"
      fill="none"
      aria-hidden="true"
      className="h-full w-full text-white"
    >
      <g className="spin-slow" style={{ transformOrigin: "160px 90px" }}>
        <circle
          cx="160"
          cy="90"
          r="72"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeDasharray="2 7"
        />
      </g>

      <circle
        cx="160"
        cy="90"
        r="62"
        stroke="currentColor"
        strokeOpacity="0.12"
      />

      {/* Vault shell — the hexagonal mark from the 1Vault logo. */}
      <path
        d="M160 36 206.8 63v54L160 144l-46.8-27V63Z"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.25"
      />
      <path
        d="M160 50 194.6 70v40L160 130l-34.6-20V70Z"
        stroke="var(--accent)"
        strokeOpacity="0.7"
        strokeWidth="1.25"
      />

      {/* Padlock: shackle, body, keyhole. */}
      <path
        d="M151 86v-9a9 9 0 0 1 18 0v9"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="145"
        y="86"
        width="30"
        height="24"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="rgba(0,0,0,0.6)"
      />
      <circle cx="160" cy="96" r="3" fill="var(--accent-bright)" />
      <path
        d="M160 99v6"
        stroke="var(--accent-bright)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Locked stake stacked under the vault. */}
      {[0, 1, 2].map((row) => (
        <g key={row} opacity={0.75 - row * 0.2}>
          <ellipse
            cx="160"
            cy={150 + row * 7}
            rx="26"
            ry="5"
            stroke="var(--accent)"
            strokeOpacity="0.6"
          />
        </g>
      ))}

      {/* Technical crosshair ticks. */}
      {[
        [24, 24],
        [296, 24],
        [24, 156],
        [296, 156],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`} stroke="currentColor" strokeOpacity="0.3">
          <path d={`M${x - 5} ${y}h10`} />
          <path d={`M${x} ${y - 5}v10`} />
        </g>
      ))}
    </svg>
  );
}

export function FeeAccrualArt() {
  const bars = [
    { x: 60, height: 22 },
    { x: 92, height: 34 },
    { x: 124, height: 30 },
    { x: 156, height: 48 },
    { x: 188, height: 58 },
    { x: 220, height: 54 },
    { x: 252, height: 80 },
  ];
  const baseline = 140;
  const navPoints = bars
    .map((bar) => `${bar.x + 8},${baseline - bar.height}`)
    .join(" ");

  return (
    <svg
      viewBox="0 0 320 180"
      fill="none"
      aria-hidden="true"
      className="h-full w-full text-white"
    >
      {/* High-water mark the accrual is measured against. */}
      <path
        d="M40 60h240"
        stroke="var(--accent)"
        strokeOpacity="0.45"
        strokeDasharray="4 5"
      />
      <path d={`M40 ${baseline}h240`} stroke="currentColor" strokeOpacity="0.3" />

      {bars.map((bar) => {
        const feeHeight = Math.round(bar.height * 0.26);
        return (
          <g key={bar.x}>
            <rect
              x={bar.x}
              y={baseline - bar.height}
              width="16"
              height={bar.height}
              stroke="currentColor"
              strokeOpacity="0.35"
              fill="rgba(255,255,255,0.04)"
            />
            <rect
              x={bar.x}
              y={baseline - bar.height}
              width="16"
              height={feeHeight}
              fill="var(--accent)"
              fillOpacity="0.75"
            />
          </g>
        );
      })}

      {/* NAV path across the accrual periods. */}
      <polyline
        points={navPoints}
        stroke="var(--accent-bright)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {bars.map((bar) => (
        <circle
          key={`dot-${bar.x}`}
          cx={bar.x + 8}
          cy={baseline - bar.height}
          r="2.5"
          fill="#000"
          stroke="var(--accent-bright)"
          strokeWidth="1.25"
        />
      ))}

      {/* Claim marker on the latest period. */}
      <g>
        <path
          d="M260 44v14"
          stroke="var(--accent-bright)"
          strokeOpacity="0.7"
          strokeDasharray="3 3"
        />
        <path
          d="M254 44h12l-6 8Z"
          fill="var(--accent-bright)"
          fillOpacity="0.85"
        />
      </g>
    </svg>
  );
}

export function XGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`h-3.5 w-3.5 ${className}`}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.63l-5.196-6.79-5.943 6.79H1.75l7.49-8.56L1.084 2.25h6.79l4.826 6.38 5.544-6.38Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

export function LockGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`h-4 w-4 ${className}`}
    >
      <rect
        x="4"
        y="8.5"
        width="12"
        height="8.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M6.75 8.5V6a3.25 3.25 0 0 1 6.5 0v2.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="10" cy="12.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function AccrualGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`h-4 w-4 ${className}`}
    >
      <path d="M3 17h14" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.5 17v-4M9 17V9m3.5 8V6M16 17V3"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}
