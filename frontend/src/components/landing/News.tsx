import type { CSSProperties } from "react";
import { ArrowIcon, DOUBLE_SLASH, Section, SectionLabel } from "./ui";

const POSTS = [
  {
    tag: "Announcement",
    title:
      "1Vault Litepaper: Pooled Trading Vaults With Share-Weight Settlement On Solana",
  },
  {
    tag: "Announcement",
    title:
      "Devnet MVP Is Live: Licence Lock, Free Park And Redeem, Trade With TP / SL",
  },
  {
    tag: "Engineering",
    title:
      "Why Close Vault Is Never 50/50 — Inside The Share-Weight Payout Math",
  },
];

export function News() {
  return (
    <Section id="news">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div data-reveal>
          <SectionLabel>Latest news</SectionLabel>
          <h2 className="display mt-6 text-3xl font-semibold md:text-4xl">
            Latest news
          </h2>
        </div>
        <a
          href="#top"
          className="group mono-label inline-flex items-center gap-2 text-dim transition-colors hover:text-white"
          data-reveal
        >
          Explore the blog
          <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      </div>

      <div className="mt-14 border-t border-line">
        {POSTS.map((post, index) => (
          <a
            key={post.title}
            href="#top"
            className="group flex flex-col gap-5 border-b border-line px-1 py-8 transition-colors duration-500 hover:bg-ink-card lg:flex-row lg:items-center lg:gap-12 lg:px-4"
            data-reveal
            style={{ "--reveal-delay": `${index * 110}ms` } as CSSProperties}
          >
            <p className="mono-label shrink-0 text-faint">
              <span className="text-accent/50">[</span> 0{index + 1}{" "}
              <span className="text-accent/50">{DOUBLE_SLASH}</span> {post.tag}{" "}
              <span className="text-accent/50">]</span>
            </p>
            <h3 className="display flex-1 text-xl font-medium leading-snug transition-colors duration-500 group-hover:text-accent-bright md:text-2xl">
              {post.title}
            </h3>
            <ArrowIcon className="shrink-0 text-faint transition-all duration-300 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        ))}
      </div>
    </Section>
  );
}
