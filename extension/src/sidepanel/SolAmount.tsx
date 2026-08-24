import { IconSolana } from "./icons";

const ICON_W = { display: 15, md: 11, sm: 10 } as const;

type SolAmountProps = {
  value: string;
  unit?: string;
  size?: keyof typeof ICON_W;
  className?: string;
};

export function SolAmount({ value, unit, size = "md", className = "" }: SolAmountProps) {
  const iconW = ICON_W[size];

  return (
    <span className={`sol-amount sol-amount--${size} ${className}`.trim()}>
      <IconSolana className="sol-amount__icon" width={iconW} />
      <span className="sol-amount__value">{value}</span>
      {unit ? <span className="sol-amount__unit">{unit}</span> : null}
    </span>
  );
}
