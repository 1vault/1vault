-- Async non-custodial flow orchestration only.
-- Do NOT recreate indexer/auth tables (already live on shared DB).

CREATE TABLE IF NOT EXISTS flow_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster TEXT NOT NULL DEFAULT 'devnet',
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'awaiting_signature', 'confirming', 'completed', 'failed', 'cancelled'
    )),
  actor_pubkey TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  current_step INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_jobs_status ON flow_jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_jobs_actor ON flow_jobs(actor_pubkey, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_jobs_cluster ON flow_jobs(cluster, created_at DESC);

CREATE TABLE IF NOT EXISTS flow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flow_jobs(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  name TEXT NOT NULL,
  signer_role TEXT NOT NULL DEFAULT 'strategist'
    CHECK (signer_role IN ('strategist', 'investor', 'vault_token', 'client')),
  signer_pubkey TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'awaiting_signature', 'submitted', 'confirmed', 'skipped', 'failed'
    )),
  prepared JSONB,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_signers TEXT[] NOT NULL DEFAULT '{}',
  signature TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_flow_steps_flow ON flow_steps(flow_id, seq);
