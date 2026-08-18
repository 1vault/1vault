# 1Vault Program Upgrade (Multisig Flow)

## Overview

1Vault uses **two layers** for safe program upgrades:

| Layer | Purpose |
|-------|---------|
| **On-chain Upgrade Multisig** | M-of-N members approve upgrade proposals (audit trail + governance) |
| **Squads Multisig (recommended)** | Holds Solana **upgrade authority** — signs actual `anchor upgrade` |

## Setup (once after deploy)

### 1. Initialize on-chain multisig

Instruction: `initialize_upgrade_multisig(members, threshold, squads_multisig)`

Example: 3-of-5 members, Squads vault holds upgrade authority.

### 2. Transfer upgrade authority to Squads

```powershell
.\scripts\set-upgrade-authority-multisig.ps1 `
  -ProgramId 2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP `
  -SquadsMultisig <SQUADS_MULTISIG_PUBKEY> `
  -Cluster devnet
```

## Upgrade flow

1. Member: `create_upgrade_proposal` (buffer + version label)
2. Members: `approve_upgrade_proposal` until threshold → `UpgradeProposalReady` event
3. Off-chain: `anchor build` + upgrade via Squads UI
4. Member: `mark_upgrade_executed`

## Instructions

| Instruction | Who |
|-------------|-----|
| `initialize_upgrade_multisig` | Protocol authority |
| `update_upgrade_multisig` | Any member |
| `create_upgrade_proposal` | Any member |
| `approve_upgrade_proposal` | Each member (once) |
| `cancel_upgrade_proposal` | Proposer or member |
| `mark_upgrade_executed` | Any member (after Squads upgrade) |
