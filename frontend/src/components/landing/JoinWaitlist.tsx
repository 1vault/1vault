"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type Status = "idle" | "error" | "success";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function JoinWaitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!EMAIL_PATTERN.test(email.trim())) {
      setStatus("error");
      return;
    }

    // TODO: no persistence yet. Post the address to the waitlist backend here.
    setStatus("success");
    setEmail("");
  };

  if (status === "success") {
    return (
      <p
        role="status"
        className="mt-2 text-base font-medium text-vault-sky sm:text-lg"
      >
        You are on the list. We will reach out when vaults open.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-2 flex w-full max-w-md flex-col gap-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <input
          id="waitlist-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@wallet.xyz"
          value={email}
          aria-invalid={status === "error"}
          aria-describedby={status === "error" ? "waitlist-error" : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status === "error") setStatus("idle");
          }}
          className="flex-1 rounded-full border border-vault-sky/30 bg-vault-navy/40 px-5 py-3 text-sm text-vault-sky placeholder:text-vault-sky/45 focus:border-vault-sky/70 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full bg-vault-sky px-6 py-3 text-sm font-semibold text-vault-brand transition-colors duration-200 hover:bg-white"
        >
          Join waitlist
        </button>
      </div>

      {status === "error" ? (
        <p
          id="waitlist-error"
          role="alert"
          className="text-sm text-vault-sky/80"
        >
          Enter a valid email address.
        </p>
      ) : null}
    </form>
  );
}
