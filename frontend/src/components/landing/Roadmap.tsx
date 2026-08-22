import type { CSSProperties } from "react";
import { Section, SectionLabel } from "./ui";

const PHASES = [
  {
    period: "Now — Devnet",
    title: "MVP Program Live",
    body: "Licence lock, park and free withdraw, trade with TP / SL and launchpad allowlist, follow and copy, performance fee accrue and claim, keeper NAV refresh, upgrade multisig.",
  },
  {
    period: "Next — V2",
    title: "Mainnet Hardening",
    body: "Retail early-exit fee, platform 0.1% trade fee, and per-investor high-water mark, plus the risk engine and referral surfaces stripped from the MVP build.",
  },
];

export function Roadmap() {
  return (
    <Section id="token">
      <SectionLabel>Rollout</SectionLabel>

      <div className="mt-12 grid gap-px bg-line lg:grid-cols-2">
        {PHASES.map((phase, index) => (
          <article
            key={phase.period}
            className="relative overflow-hidden bg-ink p-8 lg:p-12"
            data-reveal
            style={{ "--reveal-delay": `${index * 140}ms` } as CSSProperties}
          >
            <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(58,168,240,0.22),transparent_70%)] blur-2xl" />
            <p className="mono-label relative text-accent">{phase.period}</p>
            <h3 className="display relative mt-8 text-3xl font-semibold md:text-4xl">
              {phase.title}
            </h3>
            <p className="relative mt-6 max-w-lg text-sm leading-relaxed text-dim">
              {phase.body}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}
