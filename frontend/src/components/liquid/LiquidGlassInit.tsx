"use client";

import { useEffect } from "react";
import type { LiquidGLLens } from "liquid-gl";

const REVEAL_TIMEOUT_MS = 5000;
const HOVER_MS = 260;

const REST = { refraction: 0.045, bevelDepth: 0.12, magnify: 1.02 };
const HOVER = { refraction: 0.09, bevelDepth: 0.2, magnify: 1.06 };

const isLens = (value: unknown): value is LiquidGLLens =>
  typeof value === "object" &&
  value !== null &&
  "options" in value &&
  "el" in value;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/* Drives the lens uniforms between REST and HOVER while the pointer is over a
 * pane. The pane itself is pointer-events: none once the lens mounts, so hover
 * has to be observed on the content layer. */
function bindHover(lens: LiquidGLLens) {
  const content = lens.el.querySelector<HTMLElement>(".glass-content");
  if (!content) return () => {};

  let frame = 0;
  let lastTime = 0;
  let progress = 0;
  let target = 0;

  const step = (now: number) => {
    const delta = lastTime ? now - lastTime : 16;
    lastTime = now;

    const direction = target > progress ? 1 : -1;
    const next = progress + direction * (delta / HOVER_MS);
    progress = Math.min(1, Math.max(0, next));

    const eased = progress * progress * (3 - 2 * progress);
    lens.options.refraction = lerp(REST.refraction, HOVER.refraction, eased);
    lens.options.bevelDepth = lerp(REST.bevelDepth, HOVER.bevelDepth, eased);
    lens.options.magnify = lerp(REST.magnify, HOVER.magnify, eased);

    if (progress === target) {
      frame = 0;
      lastTime = 0;
      return;
    }
    frame = requestAnimationFrame(step);
  };

  const setTarget = (value: number) => {
    target = value;
    if (frame) return;
    lastTime = 0;
    frame = requestAnimationFrame(step);
  };

  const onEnter = () => setTarget(1);
  const onLeave = () => setTarget(0);

  content.addEventListener("pointerenter", onEnter);
  content.addEventListener("pointerleave", onLeave);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    content.removeEventListener("pointerenter", onEnter);
    content.removeEventListener("pointerleave", onLeave);
  };
}

export default function LiquidGlassInit() {
  useEffect(() => {
    let cancelled = false;
    let revealTimeout: number | undefined;
    let unbindHover: (() => void)[] = [];

    const start = async () => {
      // The snapshot must see final text metrics, so wait for webfonts first.
      if (document.fonts?.status !== "loaded") {
        await document.fonts.ready;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (cancelled) return;

      const { default: liquidGL } = await import("liquid-gl");
      if (cancelled) return;

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const isMobile = window.matchMedia("(max-width: 768px)").matches;

      const result = liquidGL({
        snapshot: "body",
        target: ".liquidGL",
        resolution: isMobile ? 1.5 : 2,
        aberration: 0.06,
        bevelWidth: 0.18,
        frost: 2,
        shadow: true,
        specular: !reducedMotion,
        reveal: "fade",
        /*
         * Tilt is off on purpose: it adds a viewport-sized fixed canvas per pane,
         * clipped to the pane's measured rect. On a scrolling page that rect goes
         * stale and the clip smears the pane over unrelated content.
         */
        tilt: false,
        ...REST,
        on: {
          init() {
            document.documentElement.dataset.liquidGlass = "ready";
          },
        },
      });

      if (!reducedMotion) {
        const lenses = (Array.isArray(result) ? result : [result]).filter(
          isLens,
        );
        unbindHover = lenses.map(bindHover);
      }

      // Panes are held at opacity 0 until the snapshot resolves. If capture
      // stalls, unhide them so the page is never left blank.
      revealTimeout = window.setTimeout(() => {
        if (document.documentElement.dataset.liquidGlass === "ready") return;
        document.querySelectorAll<HTMLElement>(".liquidGL").forEach((pane) => {
          pane.style.opacity = "1";
        });
      }, REVEAL_TIMEOUT_MS);
    };

    void start();

    return () => {
      cancelled = true;
      window.clearTimeout(revealTimeout);
      unbindHover.forEach((unbind) => unbind());
    };
  }, []);

  return null;
}
