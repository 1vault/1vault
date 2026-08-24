"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X_URL } from "@/lib/social";
import { XGlyph } from "./artwork";
// import { ArrowIcon, Marquee, SLASHES } from "./ui";

// const NAV_LINKS = [
//   { label: "Product", href: "#features" },
//   { label: "Developers", href: "#build" },
//   { label: "1VL Token", href: "#token" },
//   { label: "Vaults", href: "#ecosystem" },
//   { label: "Whitelist", href: "#whitelist" },
// ];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* <a
        href="#news"
        className="block border-b border-line bg-ink/90 py-2.5 backdrop-blur-md"
      >
        <Marquee duration={38}>
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={index}
              className="mono-label whitespace-nowrap px-3 text-dim"
            >
              Read the 1Vault litepaper{" "}
              <span className="text-accent">{SLASHES}</span>
            </span>
          ))}
        </Marquee>
      </a> */}

      <nav
        className={`border-b transition-colors duration-500 ${
          scrolled
            ? "border-line bg-ink/85 backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-[68px] w-full max-w-[1240px] items-center justify-between px-6 md:px-10">
          <a href="#top" className="flex items-center gap-3">
            <Image
              src="/1vault-icon.png"
              alt="1Vault"
              width={28}
              height={28}
              priority
              className="h-7 w-7"
            />
            <span className="display text-lg font-semibold tracking-tight">
              1Vault
            </span>
          </a>

          {/* <div className="hidden items-center gap-8 lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="mono-label text-dim transition-colors duration-300 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div> */}

          <div className="flex items-center gap-3">
            <a
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="1Vault on X"
              className="flex h-10 w-10 items-center justify-center border border-line-strong text-dim transition-colors duration-300 hover:border-white hover:text-white"
            >
              <XGlyph />
            </a>
            {/* <a
              href="#whitelist"
              className="group hidden items-center gap-2 bg-white px-5 py-2.5 mono-label text-ink transition-colors duration-300 hover:bg-accent-bright sm:inline-flex"
            >
              Join Whitelist
              <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a> */}
          </div>
        </div>
      </nav>
    </header>
  );
}
