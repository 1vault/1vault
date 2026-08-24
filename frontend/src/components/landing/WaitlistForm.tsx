"use client";

import { useEffect, useState } from "react";
import { XGlyph } from "./artwork";
import { EarlyPass } from "./EarlyPass";
import { ArrowIcon } from "./ui";
import {
  fetchWaitlistMe,
  formatXHandle,
  loadCachedWaitlist,
  loadStoredSession,
  startTwitterLogin,
  type WaitlistStatus,
} from "@/lib/auth";

type FormState =
  | { kind: "loading" }
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "error"; message: string }
  | { kind: "joined"; waitlist: WaitlistStatus };

export function WaitlistForm() {
  const [state, setState] = useState<FormState>({ kind: "loading" });
  const [accessToken, setAccessToken] = useState("");

  useEffect(() => {
    void (async () => {
      const session = loadStoredSession();
      if (session?.accessToken) setAccessToken(session.accessToken);

      const cached = loadCachedWaitlist();
      if (cached?.joined) {
        setState({ kind: "joined", waitlist: cached });
        return;
      }

      if (!session?.accessToken) {
        setState({ kind: "idle" });
        return;
      }

      try {
        const waitlist = await fetchWaitlistMe(session.accessToken);
        setState(
          waitlist.joined ? { kind: "joined", waitlist } : { kind: "idle" },
        );
      } catch {
        setState({ kind: "idle" });
      }
    })();
  }, []);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
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
            : "Could not start X sign-in. Check env configuration.",
      });
    }
  }

  if (state.kind === "joined") {
    return (
      <div id="waitlist" className="wf-shell">
        <span className="wf-aura" aria-hidden="true" />
        <div className="wf-bar wf-bar--done">
          <span className="wf-shine" aria-hidden="true" />
          <span className="wf-avatar" aria-hidden="true">
            <XGlyph />
          </span>
          <span className="wf-text">
            <span className="wf-label">You&apos;re on the list</span>
            <span className="wf-value">
              {formatXHandle(state.waitlist)} · #{state.waitlist.position}
            </span>
          </span>
          <span className="wf-done-mark" aria-hidden="true">
            ✓
          </span>
        </div>
        <p className="wf-note">
          We&apos;ll reach out on X when mainnet access opens.
        </p>

        {accessToken && state.waitlist.handle ? (
          <EarlyPass accessToken={accessToken} handle={state.waitlist.handle} />
        ) : null}
      </div>
    );
  }

  const busy = state.kind === "signing";

  return (
    <div id="waitlist" className="wf-shell">
      <span className="wf-aura" aria-hidden="true" />

      <form onSubmit={onSubmit} className="wf-bar group">
        <span className="wf-shine" aria-hidden="true" />

        <span className="wf-avatar" aria-hidden="true">
          <XGlyph />
        </span>

        <span className="wf-text">
          <span className="wf-label">Reserve early access</span>
          <span className="wf-value wf-value--muted">
            Verified with your X account
          </span>
        </span>

        <button type="submit" disabled={busy} className="wf-submit">
          <span className="wf-sweep" aria-hidden="true" />
          {busy ? "Redirecting…" : "Join waitlist"}
          <ArrowIcon className="transition-transform duration-500 group-hover:translate-x-1" />
        </button>
      </form>

      {state.kind === "loading" ? (
        <p className="wf-note">Checking your spot…</p>
      ) : state.kind === "error" ? (
        <p className="wf-note wf-note--error">{state.message}</p>
      ) : (
        <p className="wf-note">
          Public profile only · No wallet needed · We never post for you
        </p>
      )}
    </div>
  );
}
