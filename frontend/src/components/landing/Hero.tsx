import { X_HANDLE, X_URL } from "@/lib/social";
import { XGlyph } from "./artwork";
import { CtaButton, TRIPLE_SLASH } from "./ui";

const DISCOVER_LINKS = [
  { label: "Key features", href: "#features" },
  { label: "Build with 1Vault", href: "#build" },
  { label: "Getting started", href: "#get-started" },
  { label: "Whitelist", href: "#whitelist" },
];

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden px-6 pb-10 pt-40 md:px-10"
    >
      <HeroBackdrop />

      <div className="relative mx-auto w-full max-w-[1240px]">
        <div data-reveal>
          <h1 className="display max-w-5xl text-[13vw] font-semibold leading-[0.92] sm:text-6xl md:text-7xl lg:text-[86px]">
            The Pooled Trading Vault Layer for Solana
          </h1>
        </div>

        <div
          className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"
          data-reveal
          style={{ "--reveal-delay": "140ms" } as React.CSSProperties}
        >
          <p className="max-w-xl text-base leading-relaxed text-dim md:text-lg">
            1Vault lets a degen and retail park SOL into the same vault. The
            degen signs the trades, the vault pays, and Close Vault settles
            leftover SOL by share weight — never an equal split.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <CtaButton href="#whitelist">Join Whitelist</CtaButton>
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

        <div
          className="mt-16 flex flex-col gap-5 border-t border-line pt-6 lg:flex-row lg:items-center lg:justify-between"
          data-reveal
          style={{ "--reveal-delay": "260ms" } as React.CSSProperties}
        >
          <p className="mono-label flex items-center gap-3 text-faint">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="text-accent">{TRIPLE_SLASH}</span> Discover 1Vault
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {DISCOVER_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="mono-label text-dim transition-colors duration-300 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
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
