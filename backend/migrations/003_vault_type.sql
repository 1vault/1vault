-- Vault product type: pooled | sliced (off-chain metadata)
ALTER TABLE vaults
  ADD COLUMN IF NOT EXISTS vault_type TEXT NOT NULL DEFAULT 'pooled';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vaults_vault_type_check'
  ) THEN
    ALTER TABLE vaults
      ADD CONSTRAINT vaults_vault_type_check
      CHECK (vault_type IN ('pooled', 'sliced'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS vault_type_registry (
  vault_pubkey TEXT PRIMARY KEY,
  strategist TEXT,
  vault_id BIGINT,
  vault_type TEXT NOT NULL CHECK (vault_type IN ('pooled', 'sliced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vault_type_registry_strategist_idx
  ON vault_type_registry (strategist, vault_id);
