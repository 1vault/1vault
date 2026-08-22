-- OAuth return URL (simulator-v2 / multi-frontend) stored per PKCE state
ALTER TABLE auth_states ADD COLUMN IF NOT EXISTS return_to TEXT;
