import type { ComponentPropsWithoutRef } from "react";

type ButtonProps = ComponentPropsWithoutRef<"a"> & {
  variant?: "primary" | "ghost";
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold tracking-tight transition-colors duration-200";

const variants = {
  primary:
    "bg-vault-blue text-vault-navy shadow-[0_10px_30px_-12px_var(--vault-blue)] hover:bg-vault-sky",
  ghost:
    "border border-vault-sky/35 text-vault-sky hover:border-vault-sky/70 hover:bg-vault-sky/10",
} as const;

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <a className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}
