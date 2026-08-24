export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string };
};

export function apiUrl(path: string): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  return base;
}

export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  const json = await readJson<ApiEnvelope<T>>(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}
