import type { CSSProperties, ReactNode } from "react";

export const SLASHES = "/////";
export const BACKSLASHES = "\\\\\\\\\\";
export const TRIPLE_SLASH = "///";
export const DOUBLE_SLASH = "//";

export function Section({
  id,
  bordered = true,
  className = "",
  children,
}: {
  id?: string;
  bordered?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`relative px-6 py-24 md:px-10 lg:py-32 ${
        bordered ? "border-t border-line" : ""
      } ${className}`}
    >
      <div className="mx-auto w-full max-w-[1240px]">{children}</div>
    </section>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mono-label flex items-center gap-3 text-faint">
      <span className="text-accent">{TRIPLE_SLASH}</span>
      <span>{children}</span>
    </p>
  );
}

export function KickerRule({ children }: { children: ReactNode }) {
  return (
    <p className="mono-label text-accent/70">
      <span className="text-accent/40">{SLASHES}</span> {children}{" "}
      <span className="text-accent/40">{BACKSLASHES}</span>
    </p>
  );
}

export function Marquee({
  duration = 40,
  reverse = false,
  className = "",
  children,
}: {
  duration?: number;
  reverse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`marquee-mask overflow-hidden ${className}`}>
      <div
        className={`marquee-track ${reverse ? "marquee-track-reverse" : ""}`}
        style={{ "--marquee-duration": `${duration}s` } as CSSProperties}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`h-3.5 w-3.5 ${className}`}
    >
      <path
        d="M3 13 13 3M13 3H6M13 3v7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

type ButtonProps = {
  href: string;
  variant?: "primary" | "ghost";
  external?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function CtaButton({
  href,
  variant = "primary",
  external = false,
  icon,
  className = "",
  children,
}: ButtonProps) {
  const base =
    "group inline-flex items-center gap-2.5 px-6 py-3.5 mono-label transition-colors duration-300";
  const styles =
    variant === "primary"
      ? "bg-white text-ink hover:bg-accent-bright"
      : "border border-line-strong text-white hover:border-white hover:bg-white/5";

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`${base} ${styles} ${className}`}
    >
      {icon}
      {children}
      <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  );
}
