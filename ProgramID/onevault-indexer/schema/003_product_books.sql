-- Product books: current holdings, positions, close payouts, fees, follows.
-- Chain remains source of truth; these tables keep a readable ledger.

ALTER TABLE vaults ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE vaults ADD COLUMN IF NOT EXISTS cluster TEXT NOT NULL DEFAULT 'devnet';

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_signature
    ON deposits(signature) WHERE signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_signature
    ON withdrawals(signature) WHERE signature IS NOT NULL;

-- Running park book per wallet in a vault. Close vault pays this remaining stake,
-- weighted by shares — not an equal split.
CREATE TABLE IF NOT EXISTS vault_holdings (
    vault TEXT NOT NULL,
    investor TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'retail' CHECK (role IN ('degen', 'retail')),
    deposited NUMERIC(40, 0) NOT NULL DEFAULT 0,
    withdrawn_net NUMERIC(40, 0) NOT NULL DEFAULT 0,
    close_returned NUMERIC(40, 0) NOT NULL DEFAULT 0,
    shares NUMERIC(40, 0) NOT NULL DEFAULT 0,
    last_nav NUMERIC(40, 0),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (vault, investor)
);

CREATE INDEX IF NOT EXISTS idx_vault_holdings_investor ON vault_holdings(investor);

CREATE TABLE IF NOT EXISTS vault_positions (
    vault TEXT NOT NULL,
    position_id BIGINT NOT NULL,
    input_mint TEXT,
    output_mint TEXT,
    entry_value NUMERIC(40, 0),
    current_value NUMERIC(40, 0),
    proceeds NUMERIC(40, 0),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed', 'tp_sl')),
    follower_count INT DEFAULT 0,
    opened_signature TEXT,
    closed_signature TEXT,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    PRIMARY KEY (vault, position_id)
);

CREATE TABLE IF NOT EXISTS investor_positions (
    vault TEXT NOT NULL,
    investor TEXT NOT NULL,
    position_id BIGINT NOT NULL,
    allocation NUMERIC(40, 0) NOT NULL DEFAULT 0,
    auto_by_keeper BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed')),
    signature TEXT,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    PRIMARY KEY (vault, investor, position_id)
);

CREATE INDEX IF NOT EXISTS idx_investor_positions_vault ON investor_positions(vault, position_id);

CREATE TABLE IF NOT EXISTS close_payouts (
    id BIGSERIAL PRIMARY KEY,
    vault TEXT NOT NULL,
    investor TEXT NOT NULL,
    shares NUMERIC(40, 0) NOT NULL,
    amount NUMERIC(40, 0) NOT NULL,
    signature TEXT,
    block_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_close_payouts_vault ON close_payouts(vault, created_at DESC);

CREATE TABLE IF NOT EXISTS fee_accruals (
    id BIGSERIAL PRIMARY KEY,
    vault TEXT NOT NULL,
    performance_fee NUMERIC(40, 0) NOT NULL DEFAULT 0,
    protocol_fee NUMERIC(40, 0) NOT NULL DEFAULT 0,
    share_price NUMERIC(40, 0),
    signature TEXT,
    block_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_accruals_vault ON fee_accruals(vault, created_at DESC);

CREATE TABLE IF NOT EXISTS follow_events (
    id BIGSERIAL PRIMARY KEY,
    vault TEXT NOT NULL,
    investor TEXT NOT NULL,
    position_id BIGINT NOT NULL,
    allocation NUMERIC(40, 0) NOT NULL DEFAULT 0,
    auto_by_keeper BOOLEAN DEFAULT FALSE,
    signature TEXT,
    block_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_events_vault ON follow_events(vault, position_id);

CREATE OR REPLACE VIEW vault_holder_book AS
SELECT
    h.vault,
    h.investor,
    h.role,
    h.deposited,
    h.withdrawn_net,
    h.close_returned,
    h.shares,
    GREATEST(h.deposited - h.withdrawn_net - h.close_returned, 0) AS remaining_parked,
    h.last_nav,
    h.updated_at
FROM vault_holdings h;
