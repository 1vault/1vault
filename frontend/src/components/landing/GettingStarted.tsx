import type { CSSProperties } from "react";
import { X_HANDLE } from "@/lib/social";
import { CtaButton, Section, SectionLabel } from "./ui";

const STEPS = [
  {
    title: "Claim your seat",
    body: `Follow @${X_HANDLE} on X and drop your handle on the whitelist. Devnet seats go out in batches, newest handles last.`,
    cta: "Join Whitelist",
    href: "#whitelist",
  },
  {
    title: "Park into a vault",
    body: "Pick a book, set your park amount, then set take-profit and stop-loss. That is the whole retail surface — no order tickets.",
    cta: "Browse vaults",
    href: "#ecosystem",
  },
  {
    title: "Track and close",
    body: "Watch NAV as the degen works the book. Close Vault settles leftover SOL by share weight straight to your wallet.",
    cta: "See the rules",
    href: "#features",
  },
];

export function GettingStarted() {
  return (
    <Section id="get-started">
      <SectionLabel>Getting started</SectionLabel>

      <div className="mt-12 grid gap-px bg-line lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <article
            key={step.title}
            className="flex flex-col justify-between gap-14 bg-ink p-8 lg:p-10"
            data-reveal
            style={{ "--reveal-delay": `${index * 140}ms` } as CSSProperties}
          >
            <p className="flex items-baseline gap-1">
              <span className="display text-5xl font-semibold lg:text-6xl">
                0{index + 1}
              </span>
              <span className="mono-label text-faint">/0{STEPS.length}</span>
            </p>

            <div>
              <h3 className="display text-2xl font-medium lg:text-[28px]">
                {step.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-dim">
                {step.body}
              </p>
              <div className="mt-8">
                <CtaButton href={step.href} variant="ghost">
                  {step.cta}
                </CtaButton>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
