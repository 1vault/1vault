-- Liveness for npm run dev (poller) and npm run api (REST)
CREATE TABLE IF NOT EXISTS indexer_heartbeat (
    role TEXT PRIMARY KEY CHECK (role IN ('poller', 'api')),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
