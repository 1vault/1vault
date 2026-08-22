import type { CSSProperties, ReactNode } from "react";
import {
  AccrualGlyph,
  FeeAccrualArt,
  LicenceLockArt,
  LockGlyph,
} from "./artwork";
import { CtaButton, Section, SectionLabel } from "./ui";

const CARDS: {
  title: string;
  body: string;
  meta: string;
  art: string;
  glyph: ReactNode;
  illustration: ReactNode;
}[] = [
  {
    title: "Licence-Locked Vaults",
    body: "create_vault locks 1,000,000 1VL into the vault_license PDA until Close Vault. A vault cannot open a book without a licence, so inventory is always backed by a locked stake.",
    meta: "1,000,000 1VL — vault_license PDA",
    art: "from-accent/35 via-accent-deep/25",
    glyph: <LockGlyph />,
    illustration: <LicenceLockArt />,
  },
  {
    title: "Performance Fee Accrual",
    body: "Fees accrue on realised performance and are claimable by the degen wallet. Keeper NAV refresh keeps the accrual honest between trades, with upgrades gated by multisig.",
    meta: "Keeper NAV refresh — multisig gated",
    art: "from-accent-bright/25 via-vault-brand/40",
    glyph: <AccrualGlyph />,
    illustration: <FeeAccrualArt />,
  },
];

export function BuildSection() {
  return (
    <Section id="build">
      <SectionLabel>Build with 1Vault</SectionLabel>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div data-reveal>
          <h2 className="display text-4xl font-semibold md:text-5xl lg:text-[56px]">
            Engineered for pooled capital.
          </h2>
        </div>

        <div
          className="flex flex-col items-start gap-8"
          data-reveal
          style={{ "--reveal-delay": "140ms" } as CSSProperties}
        >
          <p className="text-base leading-relaxed text-dim md:text-lg">
            Engineered for pooled capital. With 1Vault, builders get a program,
            an SDK, and an indexer that already model park, trade, follow, and
            share-weight close — so you ship vault products instead of
            re-deriving the accounting yourself.
          </p>
          <CtaButton href="#get-started" variant="ghost">
            Learn more
          </CtaButton>
        </div>
      </div>

      <div className="mt-20 grid gap-px bg-line lg:grid-cols-2">
        {CARDS.map((card, index) => (
          <article
            key={card.title}
            className="group bg-ink p-8 lg:p-10"
            data-reveal
            style={{ "--reveal-delay": `${index * 140}ms` } as CSSProperties}
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden border border-line">
              <div
                className={`absolute inset-0 bg-gradient-to-br ${card.art} to-ink`}
              />
              <div className="grid-faint absolute inset-0 opacity-70" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(0,0,0,0.55),transparent_65%)]" />
              <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.04]">
                {card.illustration}
              </div>
              <p className="mono-label absolute inset-x-0 bottom-0 flex items-center gap-2 px-4 pb-3 text-[0.625rem] text-white/45">
                <span className="h-px w-6 bg-accent/60" />
                {card.meta}
              </p>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line text-accent transition-colors duration-500 group-hover:border-accent/60">
                {card.glyph}
              </span>
              <h3 className="display text-2xl font-medium lg:text-3xl">
                {card.title}
              </h3>
            </div>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-dim">
              {card.body}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}
