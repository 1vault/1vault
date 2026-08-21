import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export type WhitelistEntry = {
  handle: string;
  joinedAt: string;
};

export type JoinResult = {
  status: "joined" | "existing";
  handle: string;
  position: number;
};

const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

const STORE_PATH =
  process.env.WHITELIST_FILE ??
  path.join(process.cwd(), ".data", "whitelist.jsonl");

const PROFILE_URL_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})\/?(?:[?#].*)?$/i;

/**
 * Accepts `@handle`, `handle`, or a full x.com / twitter.com profile URL and
 * returns the bare handle, or null when the whole input is not a valid handle.
 */
export function normalizeHandle(input: string): string | null {
  const trimmed = input.trim();

  const fromUrl = trimmed.match(PROFILE_URL_PATTERN);
  if (fromUrl) return fromUrl[1];

  const bare = trimmed.replace(/^@/, "");
  return HANDLE_PATTERN.test(bare) ? bare : null;
}

async function readEntries(): Promise<WhitelistEntry[]> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as WhitelistEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function joinWhitelist(handle: string): Promise<JoinResult> {
  const entries = await readEntries();
  const existingIndex = entries.findIndex(
    (entry) => entry.handle.toLowerCase() === handle.toLowerCase(),
  );

  if (existingIndex !== -1) {
    return {
      status: "existing",
      handle: entries[existingIndex].handle,
      position: existingIndex + 1,
    };
  }

  const entry: WhitelistEntry = {
    handle,
    joinedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await appendFile(STORE_PATH, `${JSON.stringify(entry)}\n`, "utf8");

  return { status: "joined", handle, position: entries.length + 1 };
}
