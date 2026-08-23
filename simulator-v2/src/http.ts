/**
 * API base for production (Railway). Empty in local Vite so `/v1` uses the
 * dev proxy (`vite.config.ts` → VITE_BACKEND_URL).
 *
 * On Railway set build-time: VITE_BACKEND_URL=https://<backend>.up.railway.app
 * and add the simulator origin to backend CORS_ORIGINS.
 */
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) return path;
  const base = String(import.meta.env.VITE_BACKEND_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

/** Parse JSON; fail clearly when the host returned SPA HTML instead of the API. */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const start = text.trimStart().slice(0, 15).toLowerCase();
  if (start.startsWith("<!doctype") || start.startsWith("<html")) {
    throw new Error(
      "API returned HTML (not JSON). On Railway set VITE_BACKEND_URL to the Go backend URL (build variable) and add this site to CORS_ORIGINS."
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from API (HTTP ${res.status})`);
  }
}
