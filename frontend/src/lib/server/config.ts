function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function siteUrl(): string {
  return optional("SITE_URL", "http://localhost:3000").replace(/\/$/, "");
}

export function twitterClientId(): string {
  return required("TWITTER_CLIENT_ID");
}

export function twitterClientSecret(): string {
  return required("TWITTER_CLIENT_SECRET");
}

export function twitterCallbackUrl(): string {
  return optional("TWITTER_CALLBACK_URL") || `${siteUrl()}/callback`;
}

export function databaseUrl(): string {
  return required("DATABASE_URL");
}

export function jwtSecret(): string {
  return required("JWT_SECRET");
}

export function twitterConfigured(): boolean {
  return Boolean(
    process.env.TWITTER_CLIENT_ID?.trim() &&
      process.env.TWITTER_CLIENT_SECRET?.trim(),
  );
}
