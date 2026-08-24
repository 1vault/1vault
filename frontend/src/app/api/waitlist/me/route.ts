import { bearerToken, verifySession } from "@/lib/server/jwt";
import { fail, ok } from "@/lib/server/http";
import { getWaitlistForUser } from "@/lib/server/waitlist";

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return fail("Missing Bearer access token", 401, "UNAUTHORIZED");
  }

  const claims = await verifySession(token);
  if (!claims) {
    return fail("Invalid or expired access token", 401, "UNAUTHORIZED");
  }

  const waitlist = await getWaitlistForUser(claims.sub);
  if (!waitlist) {
    return ok({ joined: false });
  }

  return ok({
    joined: true,
    handle: waitlist.handle,
    position: waitlist.position,
    joinedAt: waitlist.joinedAt,
    status: waitlist.status,
  });
}
