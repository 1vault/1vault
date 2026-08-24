import { verifyPassToken } from "@/lib/server/passToken";
import { renderPassImage, type PassCardData } from "@/lib/server/passImage";
import { getPassByHandle } from "@/lib/server/waitlist";

/**
 * Renders the Early Access Pass. `?t=` is the signed token used by the logged-in
 * preview; `?h=` is the public handle used as the OG image source for /:handle
 * whenever Blob storage is unavailable.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  let card: PassCardData | null = null;

  const token = params.get("t");
  if (token) {
    const pass = await verifyPassToken(token);
    if (!pass) {
      return new Response("Invalid or expired pass token", { status: 401 });
    }
    card = pass;
  } else {
    const handle = params.get("h");
    if (!handle) {
      return new Response("Missing pass token or handle", { status: 400 });
    }
    card = await getPassByHandle(handle);
    if (!card) {
      return new Response("No pass for that handle", { status: 404 });
    }
  }

  return renderPassImage(card);
}
