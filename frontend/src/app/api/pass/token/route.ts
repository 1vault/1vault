import { after } from "next/server";
import { bearerToken, verifySession } from "@/lib/server/jwt";
import { fail, ok } from "@/lib/server/http";
import { warmPassImage } from "@/lib/server/passImage";
import { signPassToken } from "@/lib/server/passToken";
import { getUserById, getWaitlistForUser } from "@/lib/server/waitlist";

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return fail("Missing Bearer access token", 401, "UNAUTHORIZED");
  }

  const claims = await verifySession(token);
  if (!claims) {
    return fail("Invalid or expired access token", 401, "UNAUTHORIZED");
  }

  const user = await getUserById(claims.sub);
  if (!user) {
    return fail("User not found", 404, "USER_NOT_FOUND");
  }

  const waitlist = await getWaitlistForUser(user.id);
  if (!waitlist) {
    return fail("Not on the waitlist yet", 404, "NOT_ON_WAITLIST");
  }

  const passToken = await signPassToken({
    handle: user.handle,
    name: user.display_name ?? user.handle,
    // X serves a 48px thumbnail by default; the pass needs the large variant.
    avatar: (user.avatar_url ?? "").replace("_normal.", "_400x400."),
    position: waitlist.position,
    joinedAt: waitlist.joinedAt,
  });

  // Covers members who joined before the card was generated on join.
  after(() => warmPassImage(user.handle));

  return ok({ token: passToken });
}
