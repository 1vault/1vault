"use client";

import { useEffect, useState } from "react";
import { XGlyph } from "./artwork";
import { ArrowIcon } from "./ui";
import { api } from "@/lib/api";
import { X_HANDLE } from "@/lib/social";

type PassState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

type EarlyPassProps = {
  accessToken: string;
  handle?: string;
};

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
        if (active) {
          setState({ kind: "ready", url: `/api/pass?t=${token}` });
        }
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

  async function downloadPass(): Promise<boolean> {
    if (state.kind !== "ready") return false;
    setBusy(true);
    try {
      const res = await fetch(state.url);
      if (!res.ok) throw new Error("Pass image failed to render");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `1vault-early-pass-${handle ?? "member"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function shareOnX() {
    // X's compose intent cannot carry an image, so the file is saved first and
    // the composer opens ready for the user to attach it.
    await downloadPass();

    const text = [
      `Just claimed my Early Access Pass for @${X_HANDLE}.`,
      "",
      "One vault. One book. Settle by shares.",
      "Mainnet waitlist is open:",
    ].join("\n");

    const url = new URL("https://x.com/intent/tweet");
    url.searchParams.set("text", text);
    url.searchParams.set("url", "https://1vaults.xyz");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="pass">
      <p className="pass-title">Your Early Pass</p>

      <div className="pass-frame">
        {state.kind === "ready" ? (
          <img src={state.url} alt="1Vault Early Pass" className="pass-img" />
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
          {busy ? "Saving…" : "Download PNG"}
        </button>
      </div>

      <p className="wf-note">
        The image is saved to your device — attach it to the post on X
      </p>
    </div>
  );
}
