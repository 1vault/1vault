import type { Metadata } from "next";
import { siteUrl } from "@/lib/server/config";
import { verifyPassToken } from "@/lib/server/passToken";
import { X_HANDLE, X_URL } from "@/lib/social";

type Props = {
  params: Promise<{ token: string }>;
};

/**
 * X cannot attach media through the tweet intent, so the post carries a link to
 * this page instead and X unfurls the card from these tags.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const pass = await verifyPassToken(token);

  if (!pass) {
    return { title: "1Vault — Early Access Pass" };
  }

  const image = `${siteUrl()}/api/pass?t=${token}`;
  const title = `@${pass.handle} · 1Vault Early Access Pass`;
  const description =
    "One vault. One book. Settle by shares. Join the 1Vault mainnet waitlist for early access.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
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
  const { token } = await params;
  const pass = await verifyPassToken(token);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-3xl">
        {pass ? (
          <>
            {/* Rendered server-side as a PNG, so a plain img is correct here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/pass?t=${token}`}
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
                1Vault is being built for mainnet. Strategists and investors
                share the same pooled book — the strategist signs, the vault
                pays, and close settles by share weight.
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
          </>
        ) : (
          <div className="text-center">
            <h1 className="display text-2xl font-semibold">
              This pass link is no longer valid
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-dim">
              Sign in with X on the home page to generate your own Early Access
              Pass.
            </p>
            <div className="mt-8 flex justify-center">
              <a href="/#waitlist" className="wf-submit">
                Join the waitlist
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
