import { bearerToken, verifySession } from "@/lib/server/jwt";
import { fail, ok } from "@/lib/server/http";
import { getUserById, joinWaitlist } from "@/lib/server/waitlist";

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

  const waitlist = await joinWaitlist(user);
  return ok(waitlist, waitlist.status === "joined" ? 201 : 200);
}
