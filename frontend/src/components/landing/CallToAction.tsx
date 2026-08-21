import JoinWaitlist from "@/components/landing/JoinWaitlist";
import Glass from "@/components/ui/Glass";

export default function CallToAction() {
  return (
    <section
      id="launch"
      className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28"
    >
      <Glass
        className="rounded-[2rem]"
        contentClassName="flex flex-col items-center gap-6 px-8 py-14 text-center sm:px-14"
      >
        <h2 className="text-4xl font-semibold tracking-tight text-vault-sky sm:text-5xl">
          Park. They trade. You ride.
        </h2>
        <p className="max-w-xl text-base leading-7 text-muted">
          Close pays by share weight. Not an equal split. Live on Solana Devnet
          today.
        </p>

        <JoinWaitlist />

        <a
          href="#devnet"
          className="text-sm text-vault-sky/70 underline decoration-vault-sky/30 underline-offset-4 transition-colors duration-200 hover:text-vault-sky"
        >
          View on Devnet
        </a>
      </Glass>
    </section>
  );
}
