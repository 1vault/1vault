import type { NextRequest } from "next/server";
import { handleTwitterCallback } from "@/lib/server/twitter-callback";

export async function GET(request: NextRequest) {
  return handleTwitterCallback(request);
}
