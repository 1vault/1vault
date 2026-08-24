import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteUrl } from "@/lib/server/config";
import { ensureStoredPassImage } from "@/lib/server/passImage";
import { getPassByHandle, type PublicPass } from "@/lib/server/waitlist";
import { X_HANDLE, X_URL } from "@/lib/social";

type Props = {
  params: Promise<{ handle: string }>;
};

/** X handles are 1-15 word characters, so anything else cannot be a pass. */
const HANDLE_PATTERN = /^\w{1,15}$/;

async function loadPass(raw: string): Promise<PublicPass | null> {
  const handle = raw.replace(/^@/, "");
  if (!HANDLE_PATTERN.test(handle)) return null;
  return getPassByHandle(handle);
}

/**
 * Resolves the image for the card. Blob gives a permanent CDN URL; without it
 * (local dev, or a failed upload) the renderer serves the same PNG live.
 */
async function passImageUrl(pass: PublicPass): Promise<string> {
  const stored = await ensureStoredPassImage(pass);
  return (
    stored ?? `${siteUrl()}/api/pass?h=${encodeURIComponent(pass.handle)}`
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const pass = await loadPass(handle);

  if (!pass) {
    return { title: "1Vault — Early Access Pass" };
  }

  const image = await passImageUrl(pass);
  const title = `@${pass.handle} · 1Vault Early Access Pass`;
  const description =
    "One vault. One book. Settle by shares. Join the 1Vault mainnet waitlist for early access.";

  return {
    title,
    description,
    alternates: { canonical: `/${pass.handle}` },
    openGraph: {
      title,
      description,
      url: `${siteUrl()}/${pass.handle}`,
      images: [{ url: image, width: 1200, height: 675 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PassPage({ params }: Props) {
  const { handle } = await params;
  const pass = await loadPass(handle);
  if (!pass) notFound();

  const image = await passImageUrl(pass);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-3xl">
        {/* Rendered server-side as a PNG, so a plain img is correct here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={`1Vault Early Access Pass for @${pass.handle}`}
          width={1200}
          height={675}
          className="w-full border border-line"
        />

        <div className="mt-10 text-center">
          <h1 className="display text-2xl font-semibold md:text-3xl">
            @{pass.handle} is on the 1Vault waitlist
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-dim">
            1Vault is being built for mainnet. Strategists and investors share
            the same pooled book — the strategist signs, the vault pays, and
            close settles by share weight.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="/#waitlist" className="wf-submit">
              Claim your pass
            </a>
            <a
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              className="pass-btn--ghost"
            >
              Follow @{X_HANDLE}
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
