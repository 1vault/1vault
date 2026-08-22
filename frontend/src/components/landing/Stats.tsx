import type { CSSProperties } from "react";
import { Section } from "./ui";

const STATS = [
  { value: "1", unit: "M 1VL", label: "Licence Locked Per Vault" },
  { value: "0", unit: "%", label: "Park & Redeem Fee" },
  { value: "100", unit: "%", label: "Share-Weight Settlement" },
];

export function Stats() {
  return (
    <Section bordered={false} className="py-16 lg:py-20">
      <div className="grid gap-px bg-line md:grid-cols-3">
        {STATS.map((stat, index) => (
          <div
            key={stat.label}
            className="bg-ink px-6 py-10 md:px-8"
            data-reveal
            style={{ "--reveal-delay": `${index * 110}ms` } as CSSProperties}
          >
            <div className="flex items-baseline gap-2">
              <span className="display text-6xl font-semibold lg:text-7xl">
                {stat.value}
              </span>
              <span className="mono-label pb-2 text-accent">{stat.unit}</span>
            </div>
            <p className="mono-label mt-5 text-dim">{stat.label}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
