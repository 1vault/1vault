import { X_HANDLE, X_URL } from "@/lib/social";
import { XGlyph } from "./artwork";
import { CtaButton, KickerRule } from "./ui";
import { WaitlistCard } from "./WaitlistCard";

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-svh flex-col justify-center overflow-hidden px-6 pb-16 pt-28 md:px-10 md:pb-20"
    >
      <HeroBackdrop />

      <div className="relative mx-auto grid w-full max-w-[1240px] gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16">
        <div>
          <div data-reveal>
            <KickerRule>Solana pooled vaults</KickerRule>
            <h1 className="display mt-6 max-w-4xl text-[11vw] font-semibold leading-[0.94] sm:text-5xl md:text-6xl lg:text-[72px]">
              Park SOL. Let the degen trade. Settle by shares.
            </h1>
          </div>

          <div
            className="mt-7 max-w-xl space-y-4"
            data-reveal
            style={{ "--reveal-delay": "120ms" } as React.CSSProperties}
          >
            <p className="text-base leading-relaxed text-dim md:text-lg">
              1Vault is the pooled trading vault layer for Solana — one book,
              one strategist, many retail wallets parking into the same vault.
            </p>
            <p className="text-sm leading-relaxed text-faint md:text-base">
              The degen signs. The vault pays. When the book closes, leftover
              SOL settles by share weight — never a flat split.
            </p>
          </div>

          <div
            className="mt-8 flex flex-wrap items-center gap-3"
            data-reveal
            style={{ "--reveal-delay": "200ms" } as React.CSSProperties}
          >
            <CtaButton href="#waitlist">Join waitlist</CtaButton>
            <CtaButton
              href={X_URL}
              variant="ghost"
              external
              icon={<XGlyph />}
            >
              Follow @{X_HANDLE}
            </CtaButton>
          </div>
        </div>

        <WaitlistCard />
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-ink" />

      <div className="aurora absolute -left-[10%] top-[6%] h-[70vh] w-[80vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(58,168,240,0.55),rgba(11,95,158,0.28)_38%,transparent_68%)] blur-[90px]" />
      <div className="aurora absolute -right-[6%] top-[26%] h-[52vh] w-[52vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(127,228,255,0.32),transparent_66%)] blur-[110px] [animation-delay:-6s]" />
      <div className="absolute bottom-[-8%] left-1/3 h-[38vh] w-[46vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(9,60,93,0.85),transparent_70%)] blur-[80px]" />

      <div className="absolute inset-x-0 bottom-0 h-[52vh] overflow-hidden">
        <div className="grid-floor absolute inset-x-[-40%] bottom-0 h-[130%]" />
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(to_top,#000_2%,transparent_46%)]" />
    </div>
  );
}
