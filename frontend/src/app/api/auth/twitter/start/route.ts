import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { twitterConfigured } from "@/lib/server/config";
import { fail } from "@/lib/server/http";
import { pkcePair, randomUrl } from "@/lib/server/pkce";
import { buildTwitterAuthUrl } from "@/lib/server/twitter";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 600,
  path: "/",
};

export async function GET() {
  if (!twitterConfigured()) {
    return fail(
      "X sign-in is not configured. Set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET in Vercel env.",
      503,
      "TWITTER_NOT_CONFIGURED",
    );
  }

  const state = randomUrl(24);
  const { verifier, challenge } = pkcePair();
  const jar = await cookies();
  jar.set("x_oauth_state", state, COOKIE_OPTS);
  jar.set("x_oauth_verifier", verifier, COOKIE_OPTS);

  return NextResponse.redirect(buildTwitterAuthUrl(state, challenge));
}
