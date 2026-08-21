import Image from "next/image";
import Button from "@/components/ui/Button";
import Glass from "@/components/ui/Glass";

const stats = [
  { value: "20%", label: "Performance fee on eligible profit" },
  { value: "0", label: "Fee to park and to redeem" },
  { value: "1,000,000 1VL", label: "License locked per vault" },
];

export default function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-20 pb-24 text-center sm:pt-28">
      <Image
        src="/1vault-logo-stacked.png"
        alt="1Vault"
        width={445}
        height={412}
        className="h-auto w-[132px]"
        priority
      />

      <h1 className="mt-10 text-5xl font-semibold tracking-tight text-vault-sky sm:text-7xl">
        Capital in Motion
      </h1>

      <p className="mt-5 text-lg font-medium text-vault-sky/90 sm:text-xl">
        Same vault. Degen signs. Vault pays.
      </p>

      <p className="mt-4 max-w-xl text-base leading-7 text-muted">
        Pooled trading vaults on Solana. Park SOL, set take-profit and
        stop-loss, and ride the book a degen signs.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Button href="#launch">Park SOL</Button>
        <Button href="#how-it-works" variant="ghost">
          How it works
        </Button>
      </div>

      <Glass
        className="mt-16 w-full rounded-3xl"
        contentClassName="grid gap-px overflow-hidden sm:grid-cols-3"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="px-6 py-7 text-center sm:border-l sm:border-vault-sky/12 sm:first:border-l-0"
          >
            <p className="text-2xl font-semibold tracking-tight text-vault-sky">
              {stat.value}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">{stat.label}</p>
          </div>
        ))}
      </Glass>
    </section>
  );
}
