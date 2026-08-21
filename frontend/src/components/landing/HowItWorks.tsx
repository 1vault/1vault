import Glass from "@/components/ui/Glass";

const steps = [
  {
    step: "01",
    title: "Park",
    body: "Retail parks SOL into the vault and sets take-profit and stop-loss. Nothing else to pick.",
  },
  {
    step: "02",
    title: "Sign",
    body: "The degen parks first, then signs trades on Jupiter, Pump.fun and PumpSwap. The vault pays the swap.",
  },
  {
    step: "03",
    title: "Ride",
    body: "Your shares track vault NAV. Redeem to your wallet any time, free of fees.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28"
    >
      <p className="text-sm font-medium tracking-[0.2em] text-vault-blue uppercase">
        How it works
      </p>
      <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-vault-sky sm:text-4xl">
        Park. They trade. You ride.
      </h2>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {steps.map((item) => (
          <Glass
            key={item.step}
            className="rounded-3xl"
            contentClassName="flex h-full flex-col gap-4 p-8"
          >
            <span className="font-mono text-sm text-vault-blue">
              {item.step}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-vault-sky">
              {item.title}
            </h3>
            <p className="text-base leading-7 text-muted">{item.body}</p>
          </Glass>
        ))}
      </div>
    </section>
  );
}
