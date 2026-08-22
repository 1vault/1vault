import { Marquee, SLASHES, TRIPLE_SLASH } from "./ui";

const ROWS = [
  {
    items: ["Same vault", "Degen signs", "Vault pays", "One pooled book"],
    duration: 44,
    reverse: false,
  },
  {
    items: [
      "Share weight, never 50/50",
      "Free park and redeem",
      "Take-profit and stop-loss only",
      "Licence locked until close",
    ],
    duration: 58,
    reverse: true,
  },
];

export function PrincipleBand() {
  return (
    <section className="relative border-t border-line py-20 lg:py-24">
      <p className="mono-label px-6 text-center text-faint md:px-10">
        <span className="text-accent">{TRIPLE_SLASH}</span> Locked product
      </p>

      <div className="mt-12 flex flex-col gap-6">
        {ROWS.map((row) => (
          <Marquee
            key={row.items[0]}
            duration={row.duration}
            reverse={row.reverse}
          >
            {row.items.map((item) => (
              <span key={item} className="flex items-center">
                <span className="display mx-6 whitespace-nowrap text-3xl font-medium text-white/30 transition-colors duration-500 hover:text-white/75 md:mx-8 md:text-4xl">
                  {item}
                </span>
                <span className="mono-label text-accent/35">{SLASHES}</span>
              </span>
            ))}
          </Marquee>
        ))}
      </div>
    </section>
  );
}
