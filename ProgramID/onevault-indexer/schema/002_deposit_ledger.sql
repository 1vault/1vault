-- Deposit ledger: record intent in Postgres before the on-chain vault deposit.
-- Blockchain remains source of truth once `signature` is confirmed.

CREATE TABLE IF NOT EXISTS deposit_intents (
    id BIGSERIAL PRIMARY KEY,
    cluster TEXT NOT NULL DEFAULT 'devnet',
    vault TEXT NOT NULL,
    investor TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('degen', 'retail')),
    amount NUMERIC(40, 0) NOT NULL,
    take_profit_bps INT,
    stop_loss_bps INT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
    signature TEXT,
    shares_minted NUMERIC(40, 0),
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_intents_vault ON deposit_intents(vault, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_intents_investor ON deposit_intents(investor);
CREATE INDEX IF NOT EXISTS idx_deposit_intents_signature ON deposit_intents(signature)
    WHERE signature IS NOT NULL;

-- Retail (and degen-as-investor) mandate: park amount + TP/SL. Degen executes the trade.
CREATE TABLE IF NOT EXISTS investor_mandates (
    vault TEXT NOT NULL,
    investor TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('degen', 'retail')),
    park_amount NUMERIC(40, 0) NOT NULL DEFAULT 0,
    take_profit_bps INT,
    stop_loss_bps INT,
    auto_follow BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (vault, investor)
);
