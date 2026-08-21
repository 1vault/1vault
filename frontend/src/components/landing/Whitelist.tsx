"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { X_HANDLE, X_URL } from "@/lib/social";
import { XGlyph } from "./artwork";
import { ArrowIcon, Section, SectionLabel } from "./ui";

type FormState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "done"; handle: string; position: number; existing: boolean };

export function Whitelist() {
  const [handle, setHandle] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "sending") return;

    setState({ kind: "sending" });

    try {
      const response = await fetch("/api/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const data = (await response.json()) as {
        error?: string;
        handle?: string;
        position?: number;
        status?: "joined" | "existing";
      };

      if (!response.ok || !data.handle || typeof data.position !== "number") {
        setState({
          kind: "error",
          message: data.error ?? "Could not save your spot. Try again.",
        });
        return;
      }

      setState({
        kind: "done",
        handle: data.handle,
        position: data.position,
        existing: data.status === "existing",
      });
      setHandle("");
    } catch {
      setState({
        kind: "error",
        message: "Network error. Check your connection and try again.",
      });
    }
  }

  return (
    <Section id="whitelist">
      <div className="relative overflow-hidden border border-line bg-ink-raised">
        <div className="pointer-events-none absolute -left-24 -top-32 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(58,168,240,0.28),transparent_70%)] blur-[70px]" />
        <div className="grid-faint pointer-events-none absolute inset-0 opacity-60" />

        <div className="relative grid gap-14 p-8 md:p-12 lg:grid-cols-[1fr_1fr] lg:gap-20 lg:p-16">
          <div data-reveal>
            <SectionLabel>Whitelist</SectionLabel>
            <h2 className="display mt-8 text-4xl font-semibold md:text-5xl">
              Get on the 1Vault whitelist.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-dim">
              Devnet seats are handed out in batches. Follow{" "}
              <span className="text-white">@{X_HANDLE}</span> on X, drop your
              handle, and we DM you when a vault seat opens.
            </p>

            <div className="mono-label mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-faint">
              <span className="flex items-center gap-2">
                <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Devnet open
              </span>
              <span>No wallet connect required</span>
            </div>
          </div>

          <div className="flex flex-col gap-10" data-reveal>
            <Step
              index="01"
              title="Follow on X"
              body="We announce every whitelist batch and vault opening there first."
            >
              <a
                href={X_URL}
                target="_blank"
                rel="noreferrer"
                className="group mono-label inline-flex items-center gap-2.5 border border-line-strong px-5 py-3 transition-colors duration-300 hover:border-white hover:bg-white/5"
              >
                <XGlyph />
                Follow @{X_HANDLE}
                <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </Step>

            <Step
              index="02"
              title="Drop your handle"
              body="One handle per seat. We match it against your follow before the invite goes out."
            >
              {state.kind === "done" ? (
                <div className="border border-accent/40 bg-accent/5 px-5 py-4">
                  <p className="mono-label text-accent-bright">
                    {state.existing
                      ? "Already on the list"
                      : "You are on the list"}
                  </p>
                  <p className="mt-2 text-sm text-dim">
                    @{state.handle} — seat #{state.position}. Keep notifications
                    on for @{X_HANDLE}.
                  </p>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="w-full">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="flex flex-1 items-center border border-line-strong bg-black/40 px-4 transition-colors focus-within:border-accent">
                      <span className="mono-label text-faint">@</span>
                      <input
                        name="handle"
                        value={handle}
                        onChange={(event) => {
                          setHandle(event.target.value);
                          if (state.kind === "error") setState({ kind: "idle" });
                        }}
                        placeholder="your_x_handle"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Your X handle"
                        className="mono-label w-full bg-transparent px-2 py-3.5 text-white placeholder:text-white/25 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={state.kind === "sending"}
                      className="group mono-label inline-flex items-center justify-center gap-2.5 bg-white px-6 py-3.5 text-ink transition-colors duration-300 hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {state.kind === "sending" ? "Joining" : "Join Whitelist"}
                      <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </button>
                  </div>

                  {state.kind === "error" ? (
                    <p className="mono-label mt-3 text-[0.7rem] text-red-400">
                      {state.message}
                    </p>
                  ) : null}
                </form>
              )}
            </Step>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Step({
  index,
  title,
  body,
  children,
}: {
  index: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line pt-6">
      <div className="flex items-baseline gap-4">
        <span className="mono-label text-accent">{index}</span>
        <div>
          <h3 className="display text-xl font-medium">{title}</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-dim">
            {body}
          </p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
