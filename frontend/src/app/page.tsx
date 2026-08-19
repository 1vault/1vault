import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-vault-blue/30 bg-vault-blue-dark/40 px-6 py-4">
        <Image
          src="/1vault-logo.png"
          alt="1Vault"
          width={140}
          height={32}
          priority
        />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <Image
          src="/1vault-logo-stacked.png"
          alt="1Vault"
          width={180}
          height={180}
          priority
        />

        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-vault-sky sm:text-4xl">
            Pooled Solana trading vaults
          </h1>
          <p className="mx-auto max-w-lg text-lg leading-8 text-muted">
            One vault, one pooled book. Degen signs trades; retail parks SOL
            with take-profit and stop-loss.
          </p>
        </div>
      </main>
    </div>
  );
}
