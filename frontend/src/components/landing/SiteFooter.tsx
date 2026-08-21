import Image from "next/image";

const PROGRAM_ID = "2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP";

export default function SiteFooter() {
  return (
    <footer id="devnet" className="mt-8 border-t border-vault-sky/12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Image
          src="/1vault-logo.png"
          alt="1Vault"
          width={699}
          height={214}
          className="h-auto w-24"
        />

        <div className="flex flex-col gap-1 text-sm text-muted sm:items-end">
          <span className="text-vault-sky/70">Devnet program</span>
          <a
            href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs break-all transition-colors duration-200 hover:text-vault-sky"
          >
            {PROGRAM_ID}
          </a>
        </div>
      </div>
    </footer>
  );
}
