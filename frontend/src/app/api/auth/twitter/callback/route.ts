import type { NextRequest } from "next/server";
import { handleTwitterCallback } from "@/lib/server/twitter-callback";

/** Legacy alias — production uses /callback per X Developer Portal */
export async function GET(request: NextRequest) {
  return handleTwitterCallback(request);
}
