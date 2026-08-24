import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/server/config";
import { signSession } from "@/lib/server/jwt";
import { exchangeTwitterCode, fetchTwitterMe } from "@/lib/server/twitter";
import { joinWaitlist, upsertTwitterUser } from "@/lib/server/waitlist";

export async function handleTwitterCallback(
  request: NextRequest,
): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${siteUrl()}/auth/callback?error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${siteUrl()}/auth/callback?error=${encodeURIComponent("Missing OAuth code or state")}`,
    );
  }

  const jar = await cookies();
  const savedState = jar.get("x_oauth_state")?.value;
  const verifier = jar.get("x_oauth_verifier")?.value;
  jar.delete("x_oauth_state");
  jar.delete("x_oauth_verifier");

  if (!savedState || !verifier || savedState !== state) {
    return NextResponse.redirect(
      `${siteUrl()}/auth/callback?error=${encodeURIComponent("OAuth state expired or invalid")}`,
    );
  }

  try {
    const twitterToken = await exchangeTwitterCode(code, verifier);
    const me = await fetchTwitterMe(twitterToken);
    const user = await upsertTwitterUser(me);
    const waitlist = await joinWaitlist(user);
    const sessionToken = await signSession({
      sub: user.id,
      twitterId: user.twitter_id,
      handle: user.handle,
    });

    const hash = new URLSearchParams({
      accessToken: sessionToken,
      refreshToken: sessionToken,
      waitlistStatus: waitlist.status,
      waitlistPosition: String(waitlist.position),
      waitlistHandle: waitlist.handle,
      displayName: user.display_name ?? me.name,
      avatarUrl: user.avatar_url ?? me.profile_image_url ?? "",
    });

    return NextResponse.redirect(`${siteUrl()}/auth/callback#${hash.toString()}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "X sign-in failed";
    return NextResponse.redirect(
      `${siteUrl()}/auth/callback?error=${encodeURIComponent(message)}`,
    );
  }
}
