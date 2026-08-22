import Image from "next/image";
import { X_URL } from "@/lib/social";
import { SLASHES } from "./ui";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Vaults", href: "#ecosystem" },
      { label: "Join Whitelist", href: "#whitelist" },
      { label: "Fees", href: "#token" },
      { label: "Status", href: "#top" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "#build" },
      { label: "SDK Reference", href: "#build" },
      { label: "Indexer API", href: "#build" },
      { label: "GitHub", href: "#build" },
    ],
  },
  {
    title: "1VL Token",
    links: [
      { label: "About 1VL", href: "#token" },
      { label: "Licence Lock", href: "#build" },
      { label: "Performance Fee", href: "#build" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "X (Twitter)", href: X_URL },
      { label: "Discord", href: "#whitelist" },
      { label: "Telegram", href: "#whitelist" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Blog", href: "#news" },
      { label: "Brand Kit", href: "#top" },
      { label: "About 1Vault", href: "#features" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line px-6 pt-24 md:px-10">
      <div className="pointer-events-none absolute -bottom-40 left-1/2 h-[42vh] w-[70vw] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(58,168,240,0.22),transparent_70%)] blur-[90px]" />

      <div className="relative mx-auto w-full max-w-[1240px]">
        <div className="grid gap-16 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Image
              src="/1vault-logo.png"
              alt="1Vault"
              width={168}
              height={48}
              className="h-9 w-auto"
            />
            <p className="mt-8 max-w-sm text-sm leading-relaxed text-dim">
              1Vault is a pooled Solana trading vault protocol. Same vault, the
              degen signs, the vault pays, and close settles leftover SOL by
              share weight.
            </p>
            <p className="mono-label mt-8 text-faint">
              Devnet program{" "}
              <span className="block break-all pt-2 text-dim normal-case tracking-normal">
                2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-6">
            {COLUMNS.map((column) => (
              <nav key={column.title}>
                <p className="mono-label text-white">{column.title}</p>
                <ul className="mt-5 space-y-3">
                  {column.links.map((link) => {
                    const external = link.href.startsWith("http");
                    return (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          target={external ? "_blank" : undefined}
                          rel={external ? "noreferrer" : undefined}
                          className="text-sm text-dim transition-colors duration-300 hover:text-white"
                        >
                          {link.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-24 flex flex-col gap-4 border-t border-line py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="mono-label text-faint">
            © 2026 1Vault. All rights reserved.
          </p>
          <p className="mono-label text-faint">
            <span className="text-accent">{SLASHES}</span> Capital in motion
          </p>
        </div>
      </div>
    </footer>
  );
}
