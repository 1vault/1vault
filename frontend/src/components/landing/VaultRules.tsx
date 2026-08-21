import Glass from "@/components/ui/Glass";

const rules = [
  {
    title: "One vault, one pooled book",
    body: "Non-custodial. Locked wSOL is inventory the degen spends on a DEX, not a per-wallet copy of their trades.",
  },
  {
    title: "Park and redeem are free",
    body: "No platform fee on deposit, no flat fee on redeem. You keep what the vault pays you.",
  },
  {
    title: "Close pays by share weight",
    body: "Degen 2 + retail 8 with 9 SOL leftover pays about 1.8 and 7.2. Never an equal split.",
  },
  {
    title: "Fee only on eligible profit",
    body: "A 20% performance fee against the vault high-water mark goes to the degen fee wallet.",
  },
];

export default function VaultRules() {
  return (
    <section id="rules" className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
      <Glass
        className="rounded-[2rem]"
        contentClassName="grid gap-10 p-10 sm:p-14 md:grid-cols-2"
      >
        <div className="md:col-span-2">
          <p className="text-sm font-medium tracking-[0.2em] text-vault-blue uppercase">
            Vault rules
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-vault-sky sm:text-4xl">
            Close pays by share weight.
          </h2>
        </div>

        {rules.map((rule) => (
          <div key={rule.title} className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold tracking-tight text-vault-sky">
              {rule.title}
            </h3>
            <p className="text-base leading-7 text-muted">{rule.body}</p>
          </div>
        ))}
      </Glass>
    </section>
  );
}
