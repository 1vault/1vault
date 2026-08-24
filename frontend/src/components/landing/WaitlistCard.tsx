"use client";

import { useEffect, useState } from "react";
import { XGlyph } from "./artwork";
import { ArrowIcon, SectionLabel } from "./ui";
import {
  fetchWaitlistMe,
  formatXHandle,
  loadCachedWaitlist,
  loadStoredSession,
  startTwitterLogin,
  type WaitlistStatus,
} from "@/lib/auth";
import { X_HANDLE, X_URL } from "@/lib/social";

type CardState =
  | { kind: "loading" }
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "error"; message: string }
  | { kind: "joined"; waitlist: WaitlistStatus };

export function WaitlistCard() {
  const [state, setState] = useState<CardState>({ kind: "loading" });

  useEffect(() => {
    void (async () => {
      const cached = loadCachedWaitlist();
      if (cached?.joined) {
        setState({ kind: "joined", waitlist: cached });
        return;
      }

      const session = loadStoredSession();
      if (!session?.accessToken) {
        setState({ kind: "idle" });
        return;
      }

      try {
        const waitlist = await fetchWaitlistMe(session.accessToken);
        if (waitlist.joined) {
          setState({ kind: "joined", waitlist });
        } else {
          setState({ kind: "idle" });
        }
      } catch {
        setState({ kind: "idle" });
      }
    })();
  }, []);

  async function onSignIn() {
    if (state.kind === "signing") return;
    setState({ kind: "signing" });
    try {
      startTwitterLogin();
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not start X sign-in. Check Vercel env vars.",
      });
    }
  }

  return (
    <div
      id="waitlist"
      className="relative overflow-hidden border border-line bg-ink-raised/80 backdrop-blur-sm"
      data-reveal
      style={{ "--reveal-delay": "220ms" } as React.CSSProperties}
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(58,168,240,0.22),transparent_70%)] blur-[60px]" />
      <div className="grid-faint pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative p-6 md:p-8">
        <SectionLabel>Early access</SectionLabel>
        <h2 className="display mt-5 text-2xl font-semibold md:text-3xl">
          Join the waitlist
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-dim md:text-[0.95rem]">
          Sign in with X to reserve your spot. Devnet vault seats roll out in
          batches — we notify waitlist members first.
        </p>

        <div className="mono-label mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-faint">
          <span className="flex items-center gap-2">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            Devnet opening soon
          </span>
          <span>No wallet required</span>
        </div>

        <div className="mt-8">
          {state.kind === "loading" ? (
            <p className="mono-label text-faint">Checking your spot…</p>
          ) : null}

          {state.kind === "joined" ? (
            <div className="border border-accent/35 bg-accent/5 px-5 py-5">
              <p className="mono-label text-accent-bright">
                {state.waitlist.status === "existing"
                  ? "You are already on the list"
                  : "You are on the waitlist"}
              </p>
              <p className="mt-2 text-sm text-dim">
                {formatXHandle(state.waitlist)} — spot #
                {state.waitlist.position}. Follow{" "}
                <a
                  href={X_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white transition-colors hover:text-accent"
                >
                  @{X_HANDLE}
                </a>{" "}
                for launch updates.
              </p>
            </div>
          ) : null}

          {state.kind === "idle" || state.kind === "error" || state.kind === "signing" ? (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => void onSignIn()}
                disabled={state.kind === "signing"}
                className="group inline-flex w-full items-center justify-center gap-3 bg-white px-6 py-4 mono-label text-ink transition-colors duration-300 hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-60"
              >
                <XGlyph />
                {state.kind === "signing" ? "Redirecting to X…" : "Sign in with X"}
                <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>

              <p className="mono-label text-[0.68rem] leading-relaxed text-faint">
                We only use your public X profile to verify identity and save
                your waitlist spot.
              </p>

              {state.kind === "error" ? (
                <p className="mono-label text-[0.7rem] text-red-400">
                  {state.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
