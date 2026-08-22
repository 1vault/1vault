import type { CSSProperties } from "react";
import { ArrowIcon, CtaButton, Section, SectionLabel } from "./ui";

const VAULTS = [
  { name: "Momentum Book", tag: "SOL Perps", tvl: "412 SOL", state: "Open" },
  { name: "Majors Only", tag: "Spot Rotation", tvl: "1,208 SOL", state: "Open" },
  { name: "Launchpad Sniper", tag: "Allowlist", tvl: "96 SOL", state: "Open" },
  { name: "Range Farmer", tag: "LP + Hedge", tvl: "540 SOL", state: "Open" },
  { name: "Basis Carry", tag: "Funding", tvl: "874 SOL", state: "Queue" },
  { name: "Copy Desk", tag: "Follow", tvl: "233 SOL", state: "Open" },
];

export function Ecosystem() {
  return (
    <Section id="ecosystem">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <h2
          className="display text-3xl font-semibold leading-tight md:text-4xl lg:text-[44px]"
          data-reveal
        >
          1Vault turns one shared book into something retail can actually hold —
          transparent, share-weighted, and settled on-chain.
        </h2>
        <div
          className="lg:justify-self-end"
          data-reveal
          style={{ "--reveal-delay": "140ms" } as CSSProperties}
        >
          <CtaButton href="#whitelist">Join Whitelist</CtaButton>
        </div>
      </div>

      <div className="mt-24 flex flex-col gap-6 border-t border-line pt-10 md:flex-row md:items-end md:justify-between">
        <div data-reveal>
          <SectionLabel>Ecosystem</SectionLabel>
          <h3 className="display mt-6 max-w-2xl text-3xl font-semibold md:text-4xl">
            The sharpest strategists are opening books on 1Vault
          </h3>
        </div>
        <a
          href="#whitelist"
          className="group mono-label inline-flex items-center gap-2 text-dim transition-colors hover:text-white"
          data-reveal
        >
          Explore all vaults
          <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      </div>

      <div className="mt-12 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
        {VAULTS.map((vault, index) => (
          <a
            key={vault.name}
            href="#whitelist"
            className="group flex flex-col justify-between gap-12 bg-ink p-8 transition-colors duration-500 hover:bg-ink-card"
            data-reveal
            style={{ "--reveal-delay": `${(index % 3) * 110}ms` } as CSSProperties}
          >
            <div className="flex items-start justify-between">
              <span className="mono-label text-faint">{vault.tag}</span>
              <span
                className={`mono-label ${
                  vault.state === "Open" ? "text-accent" : "text-faint"
                }`}
              >
                {vault.state}
              </span>
            </div>

            <div>
              <h4 className="display text-2xl font-medium">{vault.name}</h4>
              <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                <span className="mono-label text-dim">TVL {vault.tvl}</span>
                <ArrowIcon className="text-faint transition-all duration-300 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>
          </a>
        ))}
      </div>
    </Section>
  );
}
