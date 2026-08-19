-- Protocol / stake / risk / upgrade books, idempotent indexes, backfill from already-indexed facts.

ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE vault_positions ADD COLUMN IF NOT EXISTS take_profit_bps INT;
ALTER TABLE vault_positions ADD COLUMN IF NOT EXISTS stop_loss_bps INT;

CREATE TABLE IF NOT EXISTS protocol_state (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    authority TEXT,
    treasury TEXT,
    platform_token_mint TEXT,
    initialized_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_stakers (
    owner TEXT PRIMARY KEY,
    total_staked NUMERIC(40, 0) NOT NULL DEFAULT 0,
    tier SMALLINT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_sol_stakes (
    vault TEXT PRIMARY KEY,
    lamports NUMERIC(40, 0) NOT NULL DEFAULT 0,
    validator TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_sol_stake_events (
    id BIGSERIAL PRIMARY KEY,
    vault TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('stake', 'unstake')),
    lamports NUMERIC(40, 0) NOT NULL,
    validator TEXT,
    signature TEXT,
    block_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS circuit_breaker_events (
    id BIGSERIAL PRIMARY KEY,
    vault TEXT NOT NULL,
    reason SMALLINT,
    drawdown_bps INT,
    signature TEXT,
    block_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS upgrade_proposals (
    multisig TEXT NOT NULL,
    proposal_id BIGINT NOT NULL,
    proposer TEXT,
    program_buffer TEXT,
    version_label TEXT,
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'approved', 'ready', 'cancelled', 'executed')),
    approval_count INT,
    threshold INT,
    expires_at TIMESTAMPTZ,
    signature TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (multisig, proposal_id)
);

DELETE FROM position_events a
USING position_events b
WHERE a.id > b.id
  AND a.signature IS NOT DISTINCT FROM b.signature
  AND a.event_type = b.event_type
  AND a.position_id = b.position_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_events_sig
    ON position_events(signature, event_type, position_id)
    WHERE signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_accruals_sig
    ON fee_accruals(signature)
    WHERE signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_events_sig
    ON follow_events(signature, investor, position_id)
    WHERE signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_close_payouts_sig
    ON close_payouts(signature, investor)
    WHERE signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pnl_snapshots_sig
    ON pnl_snapshots(signature)
    WHERE signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_sig
    ON referral_rewards(signature)
    WHERE signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staking_events_sig
    ON staking_events(signature, event_type)
    WHERE signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sol_stake_events_sig
    ON vault_sol_stake_events(signature, event_type)
    WHERE signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_circuit_breaker_sig
    ON circuit_breaker_events(signature)
    WHERE signature IS NOT NULL;

-- Park book from already-indexed deposits / withdrawals (skip rows the live parser already filled).
INSERT INTO vault_holdings (vault, investor, role, deposited, withdrawn_net, shares, last_nav, updated_at)
SELECT
    d.vault,
    d.investor,
    CASE WHEN d.investor = v.strategist THEN 'degen' ELSE 'retail' END,
    COALESCE(SUM(d.amount), 0),
    COALESCE((
        SELECT SUM(w.net_amount) FROM withdrawals w
        WHERE w.vault = d.vault AND w.investor = d.investor
    ), 0),
    GREATEST(
        COALESCE(SUM(d.shares_minted), 0)
        - COALESCE((
            SELECT SUM(w.shares_burned) FROM withdrawals w
            WHERE w.vault = d.vault AND w.investor = d.investor
        ), 0),
        0
    ),
    MAX(d.nav),
    NOW()
FROM deposits d
LEFT JOIN vaults v ON v.pubkey = d.vault
GROUP BY d.vault, d.investor, v.strategist
ON CONFLICT (vault, investor) DO NOTHING;

INSERT INTO vault_positions (
    vault, position_id, entry_value, current_value, proceeds, status,
    opened_signature, closed_signature, opened_at, closed_at
)
SELECT
    vault,
    position_id,
    MAX(entry_value) FILTER (WHERE event_type = 'open'),
    COALESCE(
        MAX(current_value) FILTER (WHERE event_type IN ('mark', 'tp_sl')),
        MAX(entry_value) FILTER (WHERE event_type = 'open')
    ),
    MAX(proceeds) FILTER (WHERE event_type = 'close'),
    CASE
        WHEN BOOL_OR(event_type = 'tp_sl') THEN 'tp_sl'
        WHEN BOOL_OR(event_type = 'close') THEN 'closed'
        ELSE 'open'
    END,
    (ARRAY_AGG(signature ORDER BY block_time ASC NULLS LAST) FILTER (WHERE event_type = 'open'))[1],
    (ARRAY_AGG(signature ORDER BY block_time DESC NULLS LAST)
        FILTER (WHERE event_type IN ('close', 'tp_sl')))[1],
    MIN(block_time) FILTER (WHERE event_type = 'open'),
    MAX(block_time) FILTER (WHERE event_type IN ('close', 'tp_sl'))
FROM position_events
GROUP BY vault, position_id
ON CONFLICT (vault, position_id) DO NOTHING;

INSERT INTO investor_mandates (vault, investor, role, park_amount, auto_follow, updated_at)
SELECT
    vault,
    investor,
    role,
    GREATEST(deposited - withdrawn_net - close_returned, 0),
    TRUE,
    NOW()
FROM vault_holdings
ON CONFLICT (vault, investor) DO NOTHING;

UPDATE vaults v
SET total_shares = COALESCE((
    SELECT SUM(h.shares) FROM vault_holdings h WHERE h.vault = v.pubkey
), 0),
updated_at = NOW()
WHERE COALESCE(v.total_shares, 0) = 0;
