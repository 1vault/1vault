import { joinWhitelist, normalizeHandle } from "@/lib/whitelist";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawHandle =
    typeof payload === "object" && payload !== null
      ? (payload as { handle?: unknown }).handle
      : undefined;

  if (typeof rawHandle !== "string" || rawHandle.trim().length === 0) {
    return Response.json({ error: "X handle is required." }, { status: 400 });
  }

  const handle = normalizeHandle(rawHandle);

  if (!handle) {
    return Response.json(
      {
        error:
          "That is not a valid X handle. Use up to 15 letters, numbers or underscores.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await joinWhitelist(handle);
    return Response.json(result, {
      status: result.status === "joined" ? 201 : 200,
    });
  } catch {
    return Response.json(
      { error: "Could not save your spot right now. Try again shortly." },
      { status: 500 },
    );
  }
}
