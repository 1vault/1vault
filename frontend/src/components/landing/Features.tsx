import type { CSSProperties } from "react";
import { KickerRule, Section, SectionLabel } from "./ui";

const FEATURES = [
  {
    title: "One Vault, One Pooled Book",
    kicker: "Shared Inventory",
    body: "Locked wSOL is inventory the degen spends on a DEX. Retail and strategist sit in the same book, so every fill lands in one position.",
  },
  {
    title: "Share-Weight Settlement",
    kicker: "No Equal Splits",
    body: "Close Vault pays leftover SOL by share weight. Degen 2 plus retail 8 on a leftover of 9 settles ~1.8 and ~7.2.",
  },
  {
    title: "Free Park and Redeem",
    kicker: "Zero Friction",
    body: "No flat withdraw fee on-chain. Park SOL, redeem whenever your take-profit or stop-loss is not in flight.",
  },
  {
    title: "Strategist Must Park",
    kicker: "Skin In The Game",
    body: "The degen has to park shares before request_trade. No parked stake means no signing rights over the pooled book.",
  },
  {
    title: "TP / SL Guardrails",
    kicker: "Retail Control",
    body: "Retail sets park amount plus take-profit and stop-loss only. Closing the vault position closes every retail book with it.",
  },
  {
    title: "Keeper NAV Refresh",
    kicker: "Live Accounting",
    body: "Deposits are recorded off-chain first, then on-chain. Chain is the source of truth after confirm, with keepers refreshing NAV between trades.",
  },
];

export function Features() {
  return (
    <Section id="features">
      <SectionLabel>Key features</SectionLabel>

      <p
        className="mt-10 max-w-4xl text-xl leading-relaxed text-white/85 md:text-2xl md:leading-[1.45]"
        data-reveal
      >
        1Vault is a pooled trading vault protocol on Solana. A degen strategist
        signs trades from the shared book while retail keeps only two levers:
        take-profit and stop-loss. Every vault locks{" "}
        <span className="text-accent">1,000,000 1VL</span> into its licence PDA
        until close, and settlement follows share weight on-chain.
      </p>

      <div className="mt-16 grid gap-px bg-line md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <article
            key={feature.title}
            className="group relative overflow-hidden bg-ink p-8 transition-colors duration-500 hover:bg-ink-card lg:p-10"
            data-reveal
            style={{ "--reveal-delay": `${(index % 3) * 110}ms` } as CSSProperties}
          >
            <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(58,168,240,0.4),transparent_70%)] opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />

            <span className="mono-label text-faint">
              0{index + 1}
            </span>

            <h3 className="display mt-10 text-2xl font-medium lg:text-[28px]">
              {feature.title}
            </h3>

            <div className="mt-4">
              <KickerRule>{feature.kicker}</KickerRule>
            </div>

            <p className="mt-6 text-sm leading-relaxed text-dim">
              {feature.body}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}
