-- 1Vault Phase 4 analytics schema (PostgreSQL)
-- Blockchain remains source of truth; this is index/cache/analytics only.

CREATE TABLE IF NOT EXISTS vaults (
    pubkey TEXT PRIMARY KEY,
    strategist TEXT NOT NULL,
    vault_id BIGINT NOT NULL,
    name TEXT,
    base_mint TEXT NOT NULL,
    performance_fee_bps INT NOT NULL DEFAULT 0,
    total_shares NUMERIC(40, 0) DEFAULT 0,
    nav NUMERIC(40, 0) DEFAULT 0,
    active_followers INT DEFAULT 0,
    estimated_follower_capital NUMERIC(40, 0) DEFAULT 0,
    circuit_breaker_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategists (
    pubkey TEXT PRIMARY KEY,
    vault_count INT DEFAULT 0,
    active_vault_count INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    signature TEXT PRIMARY KEY,
    slot BIGINT NOT NULL,
    block_time TIMESTAMPTZ,
    instruction TEXT,
    vault TEXT,
    actor TEXT,
    raw_event TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    vault TEXT NOT NULL REFERENCES vaults(pubkey) ON DELETE CASCADE,
    trade_id BIGINT NOT NULL,
    action SMALLINT,
    input_mint TEXT,
    output_mint TEXT,
    amount NUMERIC(40, 0),
    received NUMERIC(40, 0),
    dex_program TEXT,
    status TEXT DEFAULT 'requested',
    signature TEXT,
    block_time TIMESTAMPTZ,
    UNIQUE (vault, trade_id)
);

CREATE TABLE IF NOT EXISTS position_events (
    id SERIAL PRIMARY KEY,
    vault TEXT NOT NULL,
    position_id BIGINT NOT NULL,
    event_type TEXT NOT NULL,
    entry_value NUMERIC(40, 0),
    current_value NUMERIC(40, 0),
    proceeds NUMERIC(40, 0),
    trigger_type SMALLINT,
    signature TEXT,
    block_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deposits (
    id SERIAL PRIMARY KEY,
    vault TEXT NOT NULL,
    investor TEXT NOT NULL,
    amount NUMERIC(40, 0) NOT NULL,
    shares_minted NUMERIC(40, 0) NOT NULL,
    nav NUMERIC(40, 0),
    signature TEXT,
    block_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS withdrawals (
    id SERIAL PRIMARY KEY,
    vault TEXT NOT NULL,
    investor TEXT NOT NULL,
    shares_burned NUMERIC(40, 0) NOT NULL,
    gross_amount NUMERIC(40, 0) NOT NULL,
    net_amount NUMERIC(40, 0) NOT NULL,
    fee_amount NUMERIC(40, 0) NOT NULL,
    signature TEXT,
    block_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS referral_rewards (
    id SERIAL PRIMARY KEY,
    user_pubkey TEXT NOT NULL,
    referrer TEXT NOT NULL,
    amount NUMERIC(40, 0) NOT NULL,
    signature TEXT,
    block_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS staking_events (
    id SERIAL PRIMARY KEY,
    owner TEXT NOT NULL,
    event_type TEXT NOT NULL,
    amount NUMERIC(40, 0) NOT NULL,
    tier SMALLINT,
    signature TEXT,
    block_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pnl_snapshots (
    id SERIAL PRIMARY KEY,
    vault TEXT NOT NULL,
    share_price NUMERIC(40, 6) NOT NULL,
    nav NUMERIC(40, 0) NOT NULL,
    total_shares NUMERIC(40, 0) NOT NULL,
    snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_vault ON trades(vault);
CREATE INDEX IF NOT EXISTS idx_deposits_vault ON deposits(vault);
CREATE INDEX IF NOT EXISTS idx_withdrawals_vault ON withdrawals(vault);
CREATE INDEX IF NOT EXISTS idx_position_events_vault ON position_events(vault);
CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_vault ON pnl_snapshots(vault, snapshot_at DESC);

-- Leaderboard view: vault performance by latest snapshot vs first
CREATE OR REPLACE VIEW vault_leaderboard AS
SELECT
    v.pubkey,
    v.name,
    v.strategist,
    v.active_followers,
    v.estimated_follower_capital,
    first_snap.share_price AS start_price,
    last_snap.share_price AS current_price,
    CASE WHEN first_snap.share_price > 0 THEN
        ROUND(((last_snap.share_price - first_snap.share_price)::NUMERIC / first_snap.share_price) * 100, 2)
    ELSE 0 END AS return_pct,
    last_snap.nav,
    last_snap.snapshot_at AS last_updated
FROM vaults v
LEFT JOIN LATERAL (
    SELECT share_price, nav, snapshot_at FROM pnl_snapshots WHERE vault = v.pubkey ORDER BY snapshot_at ASC LIMIT 1
) first_snap ON TRUE
LEFT JOIN LATERAL (
    SELECT share_price, nav, snapshot_at FROM pnl_snapshots WHERE vault = v.pubkey ORDER BY snapshot_at DESC LIMIT 1
) last_snap ON TRUE;
