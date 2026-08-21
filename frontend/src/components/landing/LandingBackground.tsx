export default function LandingBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--vault-brand)_0%,var(--vault-navy)_45%,var(--vault-brand)_100%)]" />

      <div className="absolute -top-40 left-[-10%] h-[38rem] w-[38rem] rounded-full bg-vault-blue/35 blur-[130px]" />
      <div className="absolute top-[28%] right-[-14%] h-[34rem] w-[34rem] rounded-full bg-vault-sky/25 blur-[140px]" />
      <div className="absolute bottom-[-16%] left-[22%] h-[32rem] w-[32rem] rounded-full bg-vault-blue-dark/60 blur-[120px]" />

      <div className="bg-grid absolute inset-0" />
    </div>
  );
}
