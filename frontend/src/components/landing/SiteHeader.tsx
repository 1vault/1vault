import Image from "next/image";
import Glass from "@/components/ui/Glass";

const links = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Rules", href: "#rules" },
  { label: "Devnet", href: "#devnet" },
];

export default function SiteHeader() {
  return (
    // Ignored by the snapshot so the sticky nav does not ghost into other panes.
    <div
      data-liquid-ignore
      className="sticky top-4 z-20 mx-auto w-full max-w-6xl px-6"
    >
      <Glass
        as="header"
        className="rounded-full"
        contentClassName="flex items-center justify-between gap-6 px-5 py-3"
      >
        <Image
          src="/1vault-logo.png"
          alt="1Vault"
          width={699}
          height={214}
          className="h-auto w-[112px]"
          priority
        />

        <nav className="hidden items-center gap-8 text-sm text-vault-sky/80 sm:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors duration-200 hover:text-vault-sky"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href="#launch"
          className="rounded-full bg-vault-sky px-5 py-2 text-sm font-semibold text-vault-brand transition-colors duration-200 hover:bg-white"
        >
          Launch app
        </a>
      </Glass>
    </div>
  );
}
