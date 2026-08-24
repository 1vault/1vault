-- Waitlist signups (X OAuth users from marketing site)
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  twitter_id TEXT NOT NULL,
  handle TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS waitlist_joined_at_idx ON waitlist(joined_at);
CREATE INDEX IF NOT EXISTS waitlist_twitter_id_idx ON waitlist(twitter_id);
