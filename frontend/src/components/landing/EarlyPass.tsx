"use client";

import { useEffect, useState } from "react";
import { XGlyph } from "./artwork";
import { ArrowIcon } from "./ui";
import { api } from "@/lib/api";
import { X_HANDLE } from "@/lib/social";

type PassState =
  | { kind: "loading" }
  | { kind: "ready"; token: string }
  | { kind: "error"; message: string };

type EarlyPassProps = {
  accessToken: string;
  handle?: string;
};

const TWEET_TEXT = [
  `Just claimed my Early Access Pass for @${X_HANDLE}.`,
  "",
  "One vault. One book. Settle by shares.",
].join("\n");

export function EarlyPass({ accessToken, handle }: EarlyPassProps) {
  const [state, setState] = useState<PassState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { token } = await api<{ token: string }>("/api/pass/token", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (active) setState({ kind: "ready", token });
      } catch (error) {
        if (active) {
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not generate your pass.",
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken]);

  const imageUrl = state.kind === "ready" ? `/api/pass?t=${state.token}` : "";

  async function fetchPassFile(): Promise<File | null> {
    if (!imageUrl) return null;
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], `1vault-early-pass-${handle ?? "member"}.png`, {
      type: "image/png",
    });
  }

  async function downloadPass() {
    setBusy(true);
    try {
      const file = await fetchPassFile();
      if (!file) return;
      const href = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = href;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch {
      /* keep the UI quiet; the preview is still on screen */
    } finally {
      setBusy(false);
    }
  }

  async function shareOnX() {
    if (state.kind !== "ready") return;
    setBusy(true);

    try {
      // On mobile the native sheet can hand the actual PNG to the X app, which
      // is the only path that attaches media directly.
      const file = await fetchPassFile();
      if (file && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: TWEET_TEXT });
          return;
        } catch {
          // Cancelled or unsupported in practice — fall through to the link.
        }
      }

      // Desktop: post a link to the share page, which X unfurls into a large
      // image card, and save the file so it can be attached manually too.
      if (file) {
        const href = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = href;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(href);
      }

      const intent = new URL("https://x.com/intent/tweet");
      intent.searchParams.set("text", TWEET_TEXT);
      intent.searchParams.set(
        "url",
        `${window.location.origin}/pass/${state.token}`,
      );
      window.open(intent.toString(), "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pass">
      <p className="pass-title">Your Early Pass</p>

      <div className="pass-frame">
        {state.kind === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="1Vault Early Pass" className="pass-img" />
        ) : state.kind === "error" ? (
          <p className="pass-fallback">{state.message}</p>
        ) : (
          <div className="pass-loading" />
        )}
      </div>

      <div className="pass-actions">
        <button
          type="button"
          onClick={shareOnX}
          disabled={state.kind !== "ready" || busy}
          className="wf-submit pass-btn group/btn"
        >
          <span className="wf-sweep" aria-hidden="true" />
          <XGlyph />
          Share on X
          <ArrowIcon className="transition-transform duration-500 group-hover/btn:translate-x-1" />
        </button>

        <button
          type="button"
          onClick={downloadPass}
          disabled={state.kind !== "ready" || busy}
          className="pass-btn pass-btn--ghost"
        >
          {busy ? "Working…" : "Download PNG"}
        </button>
      </div>

      <p className="wf-note">
        Your post links to the pass so X shows it as a preview card
      </p>
    </div>
  );
}
