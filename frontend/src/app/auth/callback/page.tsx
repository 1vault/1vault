"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { completeCallbackLogin } from "@/lib/auth";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string>();

  useEffect(() => {
    void (async () => {
      try {
        await completeCallbackLogin();
        window.location.replace("/#waitlist");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      {error ? (
        <>
          <h1 className="display text-3xl font-semibold">X sign-in failed</h1>
          <p className="mono-label mt-4 max-w-md text-red-400">{error}</p>
          <Link
            href="/"
            className="mono-label mt-8 border border-line-strong px-5 py-3 text-dim transition-colors hover:border-white hover:text-white"
          >
            Back to home
          </Link>
        </>
      ) : (
        <>
          <h1 className="display text-3xl font-semibold">Signing you in…</h1>
          <p className="mono-label mt-4 text-dim">
            Completing X login and saving your waitlist spot.
          </p>
        </>
      )}
    </main>
  );
}
