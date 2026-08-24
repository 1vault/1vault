"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { X_HANDLE, X_URL } from "@/lib/social";
import { XGlyph } from "./artwork";
import { WaitlistForm } from "./WaitlistForm";

function delay(ms: number): CSSProperties {
  return { "--d": `${ms}ms` } as CSSProperties;
}

export function Hero() {
  const [mounted, setMounted] = useState(false);

  // Two frames: the first lets the browser paint the pre-animation state so
  // the transition actually has a starting value to interpolate from.
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setMounted(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  return (
    <section id="top" className="hero">
      <HeroBackdrop />
      <HeroDome mounted={mounted} />
      <div className="hero-scrim" aria-hidden="true" />

      <div className={`shell hero-center ${mounted ? "hero-center--in" : ""}`}>
        <h1 className="hero-title hero-item" style={delay(0)}>
          <span className="hero-title-gradient">
            One vault. One book.
            <br className="hero-br" />{" "}
            Settle by shares.
          </span>
        </h1>

        <p className="hero-sub hero-item" style={delay(100)}>
          Strategists and investors share the same pooled book on Solana. The
          strategist signs, the vault pays, and close settles by share weight.
        </p>

        <div className="hero-form hero-item" style={delay(200)}>
          <WaitlistForm />
        </div>

        <a
          href={X_URL}
          target="_blank"
          rel="noreferrer"
          className="hero-badge hero-item"
          style={delay(320)}
        >
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          Mainnet in progress
          <span className="hero-badge-sep" />
          <XGlyph />@{X_HANDLE}
        </a>
      </div>
    </section>
  );
}

/**
 * The half-circle horizon behind the copy: concentric arcs rising from the
 * bottom edge, with one dashed ring slowly rotating inside them.
 */
function HeroDome({ mounted }: { mounted: boolean }) {
  return (
    <div
      className={`hero-dome ${mounted ? "hero-dome--in" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMax meet">
        <defs>
          <radialGradient id="domeFill" cx="50%" cy="100%" r="70%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.26" />
            <stop
              offset="55%"
              stopColor="var(--accent-deep)"
              stopOpacity="0.1"
            />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="domeEdge" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
            <stop
              offset="48%"
              stopColor="var(--accent-bright)"
              stopOpacity="0.9"
            />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <circle cx="500" cy="500" r="470" fill="url(#domeFill)" />

        <circle
          className="dome-ring"
          cx="500"
          cy="500"
          r="352"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.22"
        />

        <g className="dome-spin" style={{ transformOrigin: "500px 500px" }}>
          <circle
            cx="500"
            cy="500"
            r="248"
            fill="none"
            stroke="var(--accent-bright)"
            strokeOpacity="0.3"
            strokeDasharray="2 14"
          />
        </g>

        <circle
          className="dome-edge"
          cx="500"
          cy="500"
          r="470"
          fill="none"
          stroke="url(#domeEdge)"
          strokeWidth="1.5"
        />

        <line
          x1="0"
          y1="500"
          x2="1000"
          y2="500"
          stroke="#fff"
          strokeOpacity="0.1"
        />
      </svg>
    </div>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-ink" />

      <div className="aurora absolute left-1/2 top-[8%] h-[60vh] w-[70vw] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(58,168,240,0.34),transparent_66%)] blur-[110px]" />
      <div className="aurora absolute left-[-8%] top-[30%] h-[46vh] w-[46vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(11,95,158,0.34),transparent_68%)] blur-[120px] [animation-delay:-6s]" />
      <div className="aurora absolute right-[-8%] top-[24%] h-[46vh] w-[46vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(127,228,255,0.16),transparent_68%)] blur-[130px] [animation-delay:-11s]" />

      <div className="absolute inset-x-0 bottom-0 h-[46vh] overflow-hidden">
        <div className="grid-floor absolute inset-x-[-40%] bottom-0 h-[130%]" />
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(to_top,#000_1%,transparent_42%)]" />
    </div>
  );
}
