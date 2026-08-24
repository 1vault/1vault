-- Cached Early Access Pass image (Vercel Blob URL) + case-insensitive handle
-- lookup for the public /:handle pass pages.
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS pass_image_url TEXT;

CREATE INDEX IF NOT EXISTS users_handle_lower_idx ON users (lower(handle));
