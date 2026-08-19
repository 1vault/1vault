# 1Vault --- Product Specification

**Tagline:** Capital in Motion  
**Product Type:** Non-custodial pooled trading vault (shared book) on Solana  
**Primary Network:** Solana  
**Core Technology:** Solana, Anchor, SPL Token, Jupiter / Pump.fun / PumpSwap  
**Primary Users:** Degens (strategists) and Retail  
**UI copy:** English  
**Brand:** `#093C5D`

> **Read this first.** Section **0. Locked Current Product** is what is shipping.  
> Sections 1--56 and Early Exit are the longer vision. Where they conflict, **Section 0 wins**.

**MVP program (Aug 2026):** referral, risk engine, platform staking, vault SOL stake, flat withdraw fee, DCA flags, on-chain MEV mode, protocol performance split, and related PDAs are **stripped from the on-chain build**. Park and redeem are **free**. Performance fee on eligible profit goes **100% to the degen fee wallet**.

------------------------------------------------------------------------

# 0. Locked Current Product (shipping)

This is the product implemented on Devnet. Do not design FE/BE against
isolated copy-trading, per-investor DCA, flat withdraw fees, referral PDAs,
or platform staking discounts.

## 0.1 One-liner

Degen and retail park SOL into the **same vault**. The degen signs. The vault
pays. Retail sets park amount plus take-profit / stop-loss only. Close vault
pays leftover SOL **by share weight**, not an equal split.

## 0.2 Branding

| Layer | Copy |
|-------|------|
| Tagline | Capital in Motion |
| Subline | Same vault. Degen signs. Vault pays. |
| Product line | Park. They trade. You ride. |
| Trust line | Close pays by share weight. Not 50/50. |

Voice: navy book (`#093C5D`), degen words. UI verbs: **park**, **sign**, **ride**, **close**.  
On UI say **degen**, not strategist. Do not say safe, guaranteed, passive income, or 50/50.

## 0.3 Locked rules

1. **One vault = one pooled book.** Locked wSOL is inventory the degen spends on a DEX. Not per-wallet copy.
2. **`create_vault` locks 1,000,000 1vault Licence (1VL)** into that vault's `vault_license` PDA until Close vault. Mint: 6 decimals.
3. **Deposit is recorded in Postgres first, then on-chain.** Chain is source of truth after confirm.
4. **Degen must park shares before `request_trade`** (`StrategistMustPark`). No park, no trade.
5. **Closing the vault position closes all retail books with it.**
6. **Close vault is not 50/50.** Example: degen 2 + retail 8, leftover 9 → ~1.8 / ~7.2.
7. **Park (deposit) and redeem to wallet are free.** No flat platform fee and no staking discount on withdraw. The legacy 0.5% model (§43) and flat ~$0.50 model are **not** current on-chain behavior.
8. **Retail controls:** park amount + TP/SL only. Auto Follow / allocation modes / per-investor DCA in later sections are **not** current UX (some follow ix remain in-program for future surfaces).
9. **Launchpad trading** is in scope: Pump.fun + PumpSwap. Vault pays the swap.
10. **UI is English.** Brand `#093C5D`.

## 0.4 Roles (current)

| Role | Does | Does not |
|------|------|----------|
| Degen | Lock 1VL, create vault, park SOL, sign trades | Hold retail keys |
| Retail | Park SOL, set TP/SL, redeem / receive close payout | Sign swaps, pick the mint |
| Vault program | Custody, NAV, shares, fees, close math | --- |
| Indexer / API | Ledger, books, leaderboard, UX reads | Ownership |

## 0.5 Close math

```text
payout = holder_shares / remaining_shares × remaining_NAV
last holder receives leftover dust
```

Not an equal split. Not 50/50 with the degen.

## 0.6 NAV (current on-chain)

```text
NAV = total_assets + position_value
```

Vault-wide high-water mark drives performance fees. **No** `staked_value` or validator-stake component in the MVP build.

## 0.7 Current fees

| Event | Fee |
|-------|-----|
| Park / deposit | 0 |
| Redeem shares to wallet | 0 (free withdraw) |
| Eligible profit | Performance fee (default 20% / 2000 bps) → **100% to degen fee wallet** |
| Referral / protocol performance split | **Not in MVP program** |
| Platform trade fee (0.1%) | **Future** — not in current contract |

## 0.8 License token

| Item | Value |
|------|-------|
| Name | 1vault Licence |
| Ticker | 1VL |
| Decimals | 6 |
| Lock to create a vault | 1,000,000 1VL into `vault_license` until Close vault |
| Devnet mint | `4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK` |

Do not call this **1VAULT** in current product copy. Older sections still say 1VAULT --- treat that as legacy naming.

## 0.9 Devnet (public)

| Item | Address |
|------|---------|
| Program | `2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP` |
| Protocol config | `2WXErzw6DEZsVQ2QD3oTcwumCknpzhLf99akKu7qweQR` *(re-bootstrap after MVP upgrade)* |
| 1VL mint | `4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK` |
| Platform fee wallet | `9YajdkrkvyzDm57bPSijfy6sFNj9wuqQtYmuYUXZtPDx` |
| Degen fee wallet | `EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286` |
| Base mint | wSOL `So11111111111111111111111111111111111111112` |
| Pump.fun | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| PumpSwap | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` |

## 0.10 Repo map

| Path | What |
|------|------|
| `ProgramID/onevault-program/` | Anchor program + TS SDK |
| `ProgramID/onevault-indexer/` | Postgres indexer, deposit ledger, REST |
| `simulator/` | Devnet workflow UI (reference, not production) |

## 0.11 Spec status (this file)

| Status | Sections |
|--------|----------|
| **CURRENT --- shipping** | §0, tagline Capital in Motion, non-custodial, one program, vault shares, NAV (`total_assets + position_value`), vault HWM performance fee → degen wallet, **free** park/withdraw, close by share weight, 1VL license, indexer as cache only |
| **IN PROGRAM, not current UX** | Auto Follow, investor allocation modes, investor DCA, mirror/copy ix, launchpad + DEX allowlist |
| **STRIPPED from MVP program** | Referral PDAs, risk engine (`VaultRiskState`), platform staking, vault SOL validator stake, flat withdraw fee, DCA flags, on-chain MEV mode, `StrategyType`, protocol 5% performance split, follower stats ix, vault-wide position caps |
| **SUPERSEDED by §0** | Isolated copy-trading model in §1 / §9--14 / §18; 0.5% withdrawal fee in §43; flat ~$0.50 redeem fee; staking fee discounts; "1VAULT" token name; close-as-equal-split; NAV staked component |
| **FUTURE / not launch** | Early Exit Fee at the end of this file; management fee; platform 0.1% trade fee; per-investor HWM; guaranteed same-price copy |

## 0.12 MVP on-chain (instruction summary)

**In contract (~47 ix):** `lock_license`, park/deposit, **free** withdraw, trade + TP/SL + launchpad allowlist, follow/copy, `accrue_fees` / `claim_fees` (degen wallet), `keeper_refresh_vault`, upgrade multisig.

**Breaking:** `ProtocolConfig` and `Vault` layouts changed — re-run `npm run bootstrap:devnet` and create **new vaults** after program upgrade.

------------------------------------------------------------------------

## 1. Product Overview

1Vault is a non-custodial **pooled trading vault** on Solana. A degen and
retail park SOL into the **same vault**. The degen signs trades; the vault
pays. Retail sets park amount plus take-profit / stop-loss only.

The current product is a **shared book**, not isolated copy-trading.

> Degen controls the trade. Retail controls park size and TP/SL.
> The vault contract controls the funds. Close pays by share weight.

Later sections describe a fuller configurable follow system (Auto Follow,
allocation modes, DCA). That is **vision / in-program**, not current UX.

A degen can:

-   Lock **1,000,000 1VL** and create a public vault.
-   Park SOL in the vault (required before trading).
-   Sign buys/sells; the vault inventory pays the DEX.
-   Close the vault position (retail books close with it).
-   Earn performance fees on eligible profit.

Retail can:

-   Park SOL into a vault and receive vault shares.
-   Set take-profit / stop-loss only.
-   Redeem shares to wallet (**free**) or receive
    leftover SOL on close **by share weight**.

Funds remain controlled by on-chain smart contracts rather than by the
degen's personal wallet.

------------------------------------------------------------------------

# 2. Product Goals

## Primary Goals

1.  Build a permissioned, non-custodial strategy vault system.
2.  Separate strategist trading authority from custody of investor
    funds.
3.  Allow multiple strategists to create multiple vaults using one core
    program.
4.  Give investors independent risk and allocation controls.
5.  Make strategy performance and vault accounting transparent on-chain.
6.  Support scalable indexing and analytics through an off-chain
    database.
7.  Support trading through Jupiter and compatible Solana DEXs.
8.  Provide a foundation for future staking and additional yield
    modules.

## Non-Goals for Initial MVP

-   Fully anonymous leveraged trading.
-   Unrestricted arbitrary smart-contract execution by strategists.
-   Custodial storage of private keys.
-   Database-controlled ownership balances.
-   Rebuilding Solana's native staking mechanism.
-   Guaranteed copy-trade execution at exactly the same price.

------------------------------------------------------------------------

# 3. Core Product Model

## 3.1 Protocol

There is one 1Vault protocol and one core program.

``` text
1Vault Core Program
        |
        +-- Strategist A
        |     +-- Vault 001
        |     +-- Vault 002
        |
        +-- Strategist B
        |     +-- Vault 003
        |
        +-- Strategist C
        |     +-- Vault 004
        |
        +-- ...
```

All vaults use the same core Program ID.

Creating a vault creates new PDAs/accounts rather than deploying a new
smart contract.

------------------------------------------------------------------------

# 4. Actors

## 4.1 Protocol

Responsible for:

-   Protocol configuration.
-   Platform treasury.
-   Platform fees.
-   Global risk parameters.
-   Allowed assets and integrations.
-   Emergency controls.

## 4.2 Strategist / Degen

Responsible for:

-   Creating a vault.
-   Locking the required platform token license.
-   Defining strategy parameters.
-   Initiating trades.
-   Managing positions.
-   Managing strategy risk within protocol limits.

The strategist does **not** receive custody of investor funds.

## 4.3 Investor / Retail

Responsible for:

-   Depositing capital.
-   Selecting vaults.
-   Configuring follow behavior.
-   Configuring risk limits.
-   Turning Auto Follow ON/OFF.
-   Choosing DCA behavior.
-   Withdrawing.

## 4.4 Keeper / Executor

Optional off-chain service responsible for:

-   Monitoring strategy events.
-   Preparing batched execution.
-   Indexing state.
-   Triggering permitted automated actions.

The keeper must not become the custodian of investor funds.

## 4.5 External DEX / Aggregator

Examples:

-   Jupiter
-   Raydium
-   Orca
-   Other approved Solana DEX programs

------------------------------------------------------------------------

# 5. Vault Lifecycle

``` text
Strategist Connects Wallet
        |
        v
Hold Minimum 1VAULT Token
        |
        v
Lock License Token
        |
        v
Create Vault
        |
        v
Vault PDA Created
        |
        v
Investors Deposit
        |
        v
Vault Shares Minted
        |
        v
Investor Configures Follow / Risk
        |
        v
Strategist Opens Position
        |
        v
1Vault Validates Trade
        |
        v
Execute via Jupiter / DEX
        |
        v
Update Position / NAV
        |
        v
Profit or Loss
        |
        v
Fees Calculated
        |
        v
Investor Withdraws
        |
        v
Vault Closed
        |
        v
License Unlocked
```

------------------------------------------------------------------------

# 6. Strategist Flow

> **Current (shipping):** lock **1,000,000 1VL** into the vault's
> `vault_license` on `create_vault`. Degen must **park shares** before
> `request_trade` (`StrategistMustPark`). License unlocks only on Close vault.

## Step 1 --- Connect Wallet

Strategist connects a Solana wallet.

The application checks:

-   Wallet address.
-   Platform token balance.
-   Existing strategist account.
-   Existing licenses.
-   Existing vaults.

## Step 2 --- License Requirement

Strategist must hold the required minimum amount of 1VAULT.

Initial proposed requirement:

``` text
Minimum license balance: 1,000,000 1VAULT
```

The protocol locks the required amount into a license-controlled
account.

The strategist cannot use the locked tokens while the license is active.

## Step 3 --- Create Vault

Strategist defines:

-   Vault name.
-   Description.
-   Strategy type.
-   Base asset.
-   Accepted assets.
-   Fee configuration.
-   Position limits.
-   DCA settings.
-   Slippage limits.
-   Risk limits.

The protocol creates the Vault PDA and associated token accounts.

## Step 4 --- Trading

Strategist creates a trade instruction:

``` text
BUY / SELL
Asset
Position Size
Slippage
DCA configuration
Optional TP
Optional SL
```

The smart contract validates the request before execution.

------------------------------------------------------------------------

# 7. Strategist Position Sizing

The strategist should not automatically use all available capital.

Two initial modes:

## Fixed Amount

Example:

``` text
Capital = $200
Position = $100
```

## Percentage

Example:

``` text
Capital = $200
Position Size = 50%
Position = $100
```

Percentage mode is preferred for strategies where capital changes over
time.

------------------------------------------------------------------------

# 8. Strategist Risk Controls

Suggested configuration:

``` text
Max Position Size
Max Total Exposure
Max Open Positions
Max Slippage
Allowed Assets
Allowed DEXs
DCA Enabled
DCA Count
DCA Allocation
Take Profit
Stop Loss
```

Example:

``` text
Capital: $200
Max Position: 50%
Max Exposure: 80%
Max Open Positions: 3
Max Slippage: 1%
```

If current exposure is 50% and a new trade would increase exposure to
90%, the program rejects the trade if the maximum is 80%.

------------------------------------------------------------------------

# 9. Investor Flow

> **Current UX (shipping):** retail parks SOL, sets TP/SL only, then rides
> the shared book. Steps below (Auto Follow, allocation, DCA) are vision /
> in-program --- not the current product surface.

## Step 1 --- Select Vault

Investor views:

-   Strategist.
-   Vault name.
-   Strategy.
-   Performance.
-   TVL/AUM.
-   Risk parameters.
-   Active followers.
-   Estimated following capital.
-   Fees.

## Step 2 --- Deposit

Investor deposits supported assets.

Example:

``` text
Deposit: $100
```

Funds move to the vault asset account.

## Step 3 --- Receive Vault Shares

The protocol mints vault shares.

Example:

``` text
NAV = $100,000
Total Shares = 100,000
Share Price = $1

Investor deposits $100

Investor receives 100 shares
```

Vault shares represent the investor's economic ownership in the vault.

## Step 4 --- Configure Follow Settings

Investor chooses:

``` text
Auto Follow: ON/OFF
Allocation Mode
Position Size
Max Position
Max Total Exposure
Max Open Positions
Follow DCA
Follow Partial Exit
Follow Full Exit
Follow TP/SL
Max Slippage
```

These settings should be represented on-chain where they affect
execution permissions.

------------------------------------------------------------------------

# 10. Investor Auto Follow

## ON

When Auto Follow is ON:

``` text
Strategist Trade
       |
       v
Investor Config Check
       |
       v
Risk Validation
       |
       v
Investor Allocation
       |
       v
Follow Position
```

## OFF

When Auto Follow is OFF:

``` text
Strategist Trade
       |
       v
Investor Config
       |
       v
Auto Follow = OFF
       |
       v
Do Not Open New Position
```

Important:

**OFF should mean stop following new positions. It should not
automatically close existing positions.**

Existing positions remain open until:

-   Investor closes them.
-   Investor follows a strategist exit.
-   TP/SL is triggered.
-   Vault closes.
-   Another protocol-defined exit condition occurs.

------------------------------------------------------------------------

# 11. Investor Position Allocation

Investor allocation is independent from strategist sizing.

Example:

Strategist:

``` text
Capital = $200
Entry = 50%
Entry Value = $100
```

Investor A:

``` text
Capital = $100
Fixed = $10
```

Investor A enters:

``` text
$10
```

Investor B:

``` text
Capital = $1,000
Percentage = 10%
```

Investor B enters:

``` text
$100
```

Investor C:

``` text
Capital = $500
Percentage = 5%
```

Investor C enters:

``` text
$25
```

------------------------------------------------------------------------

# 12. Investor Allocation Modes

## Fixed

``` text
$10 per strategy position
```

## Percentage

``` text
10% of available investor capital
```

## Proportional

Investor follows the strategist's exposure percentage.

Example:

``` text
Strategist exposure = 50%
Investor capital = $100

Investor position = $50
```

------------------------------------------------------------------------

# 13. Investor DCA Settings

Strategist DCA and investor DCA are independent.

## Strategist DCA

Example:

``` text
Capital = $200
Maximum Position = $100
DCA = ON
Entries = 5

Entry 1 = $20
Entry 2 = $20
Entry 3 = $20
Entry 4 = $20
Entry 5 = $20
```

## Investor DCA OFF

Investor may treat the entire strategist position as one allocation.

Example:

``` text
Investor allocation = $10
DCA = OFF

Entry 1 -> $10
DCA 2   -> ignored
DCA 3   -> ignored
```

## Investor DCA ON

Investor may follow strategist DCA or use a custom DCA distribution.

Example:

``` text
Total allocation = $10

DCA 1 = $2.50
DCA 2 = $2.50
DCA 3 = $2.50
DCA 4 = $2.50
```

------------------------------------------------------------------------

# 14. Investor Exit Settings

Investor can independently choose:

``` text
Follow Initial Entry
Follow DCA
Follow Partial Close
Follow Full Close
Follow Stop Loss
Follow Take Profit
```

Example:

``` text
Strategist:
BUY
DCA
DCA
DCA
SELL

Investor:
Initial Entry = ON
DCA = OFF
Full Close = ON
```

The investor may therefore open one position while ignoring strategist
DCA transactions and still follow the final exit.

------------------------------------------------------------------------

# 15. Trade Signal

A trade request should contain at least:

``` text
Vault
Strategist
Action
Input Asset
Output Asset
Position Size
Position Mode
Max Slippage
DCA Information
Optional TP
Optional SL
Timestamp
```

Example:

``` text
BUY SOL/USDC

Position Size: 50%
Max Slippage: 1%

DCA: ON
DCA Count: 5

TP: +30%
SL: -10%
```

------------------------------------------------------------------------

# 16. Trade Validation

Before execution, the protocol checks:

## Strategist

-   Is strategist authorized?
-   Is license active?
-   Is strategist allowed to trade this vault?

## Vault

-   Is vault active?
-   Is vault paused?
-   Is asset allowed?
-   Is DEX allowed?

## Risk

-   Position size limit.
-   Total exposure limit.
-   Open position limit.
-   Slippage limit.
-   Available capital.
-   Asset exposure.

Only valid instructions can proceed to execution.

------------------------------------------------------------------------

# 17. Trade Execution

Recommended flow:

``` text
Strategist
    |
    v
1Vault Trade Instruction
    |
    v
Validation
    |
    v
Jupiter
    |
    v
Approved DEX
    |
    v
Vault Asset Account
```

The strategist does not sign a transaction that transfers the vault's
funds directly to their personal wallet.

The vault program controls the asset account.

------------------------------------------------------------------------

# 18. Investor Distribution

When a new strategy position is created:

``` text
New Trade
    |
    v
Find Active Investor Configurations
    |
    v
Auto Follow ON?
    |
    +-- NO --> Skip
    |
    +-- YES
          |
          v
Calculate Allocation
          |
          v
Check Investor Risk Limits
          |
          v
Position Created / Updated
```

For large vaults, processing should be batched rather than attempting
hundreds or thousands of investor updates in a single Solana
transaction.

------------------------------------------------------------------------

# 19. Strategist Estimated Follower Capital

Strategist dashboard can show aggregate information:

``` text
Active Followers: 932
Estimated Following Capital: $428,500
```

Before a trade:

``` text
Strategist Capital: $200
Position Size: 50%
Strategist Entry: $100

Estimated Active Follower Capital: $428,500
Estimated Follower Exposure: $214,250
```

This is an estimate, not a guaranteed execution amount, because investor
settings can change before execution.

Investor privacy should be preserved. Strategists should see aggregate
values rather than individual investor balances unless explicitly made
public.

------------------------------------------------------------------------

# 20. NAV

> **Current (shipping):** `NAV = total_assets + position_value`. No staked-value
> component in the MVP program. See §0.6.

Core formula (full vision):

``` text
NAV =
Trading Assets
+ Open Position Value
+ Staked Assets
+ Accrued Rewards
- Liabilities
- Accrued Fees
```

Share price:

``` text
Share Price = NAV / Total Shares
```

Example:

``` text
NAV = $150,000
Total Shares = 100,000

Share Price = $1.50
```

------------------------------------------------------------------------

# 21. Profit and Loss

Example:

``` text
Initial NAV = $100,000
Current NAV = $150,000

Profit = $50,000
ROI = +50%
```

Loss example:

``` text
Initial NAV = $100,000
Current NAV = $70,000

Loss = -$30,000
ROI = -30%
```

Losses are reflected in NAV and therefore affect investor share value.

------------------------------------------------------------------------

# 22. Performance Fee

Proposed model:

``` text
Performance Fee = percentage of eligible profit
```

Example:

``` text
Profit = $10,000
Performance Fee = 20%

Fee = $2,000
Investor/protocol allocation = according to configuration
```

------------------------------------------------------------------------

# 23. High Water Mark

The strategist should not repeatedly earn performance fees on the same
profit.

Example:

``` text
High Water Mark = $1.00

NAV/share rises to $1.50
Performance fee becomes eligible.

NAV/share falls to $1.20.

NAV/share rises again to $1.50.

No second performance fee should be charged on the already-accounted-for range.
```

The next performance fee should apply only to new eligible profit above
the high-water mark.

------------------------------------------------------------------------

# 24. Fee Structure

> **Current (shipping):** park and redeem are **free**. Performance fee on
> eligible profit (default 20%) goes **100% to the degen fee wallet**. No
> protocol performance split or referral fee path in the MVP program. See §0.7.
> Management fee is future. The 0.5% and flat ~$0.50 withdrawal models in
> §43 and §45 are superseded.

Potential fees:

## Performance Fee

Paid to strategist and/or protocol from eligible profit.

## Protocol Fee

Paid to the 1Vault treasury.

## Management Fee

Optional future feature.

For MVP, performance fee only is recommended for simplicity.

------------------------------------------------------------------------

# 25. Withdrawal

Investor selects:

``` text
Withdraw:
- Partial
- Full
```

Flow:

``` text
Investor Request
      |
      v
Calculate Current Share Value
      |
      v
Burn / Reduce Shares
      |
      v
Transfer Underlying Asset
      |
      v
Update Vault State
```

Example:

``` text
Investor Shares = 100
NAV/share = $1.50

Withdrawal Value = $150
```

Withdrawal behavior must respect available liquidity and vault-specific
rules.

------------------------------------------------------------------------

# 26. Vault Closure

> **Current close rule (shipping):** leftover SOL is paid **by share weight**,
> not an equal split. Example: degen 2 + retail 8, leftover 9 → ~1.8 / ~7.2.
> Closing the vault position closes all retail books with it.
> Last holder receives leftover dust so lamports are not trapped.
> License (1VL in `vault_license`) unlocks only after the vault is Closed.

Strategist requests vault closure.

Protocol checks:

``` text
No active positions
No pending trades
Investor withdrawals completed
Fees settled
```

Then:

``` text
Vault Status = CLOSED
```

After the vault is safely closed:

``` text
License Unlock
        |
        v
Locked 1VAULT
        |
        v
Strategist Wallet
```

------------------------------------------------------------------------

# 27. Staking Module

> **Not in MVP program.** Vault SOL validator stake and platform staking modules
> are stripped from the current on-chain build. Legacy vision below.

Staking can be integrated as a module of the same 1Vault core program.

The protocol should not recreate Solana's native staking mechanism.

Instead:

``` text
1Vault Core
     |
     v
Solana Stake Program
     |
     v
Validator
```

Potential vault allocation:

``` text
Total Vault NAV = $100,000

Trading = $70,000
Staking = $30,000
```

Staking rewards increase vault NAV if the staked assets belong to the
vault.

------------------------------------------------------------------------

# 28. On-Chain Architecture

> **MVP note:** `Staking State`, `Risk Configuration`, and referral PDAs are
> **not** in the current program. Diagram below is the full vision.

``` text
1Vault Core Program
|
+-- ProtocolConfig PDA
|
+-- Strategist PDA
|
+-- License PDA
|
+-- Vault PDA
|    |
|    +-- Vault Asset Account
|    +-- Share Mint
|    +-- Vault Position PDA
|
+-- InvestorVaultConfig PDA
|
+-- InvestorPosition PDA
|
+-- TradeRequest PDA
|
+-- Staking State PDA
|
+-- Fee State
|
+-- Risk Configuration
```

------------------------------------------------------------------------

# 29. Suggested PDA Seeds

## Protocol

``` text
["protocol"]
```

## Strategist

``` text
["strategist", strategist_pubkey]
```

## License

``` text
["license", strategist_pubkey]
```

## Vault

``` text
["vault", strategist_pubkey, vault_id]
```

## Investor Vault Config

``` text
["investor_config", vault, investor]
```

## Investor Position

``` text
["position", vault, position_id]
```

## Trade Request

``` text
["trade", vault, trade_id]
```

## Staking

``` text
["staking_pool"]
["stake_position", user, position_id]
```

------------------------------------------------------------------------

# 30. Core Program Instructions

## Protocol

``` text
initialize_protocol()
update_protocol_config()
pause_protocol()
```

## Strategist

``` text
register_strategist()
lock_license()
unlock_license()
```

## Vault

``` text
create_vault()
update_vault()
pause_vault()
resume_vault()
close_vault()
```

## Investor

``` text
deposit()
withdraw()
create_investor_config()
update_investor_config()
follow_on()
follow_off()
```

## Trading

``` text
request_trade()
execute_trade()
cancel_trade()
```

## Position

``` text
open_position()
increase_position()
reduce_position()
close_position()
```

## Accounting

``` text
update_nav()
accrue_fees()
claim_fees()
```

## Staking

``` text
initialize_staking()
stake()
unstake()
claim_reward()
```

------------------------------------------------------------------------

# 31. Token Architecture

There are two distinct token concepts.

## 1VAULT Platform Token

Used for:

-   Strategist license.
-   Future governance.
-   Protocol utility.
-   Potential rewards.

## Vault Share Token

Each vault has its own share mint.

Example:

``` text
Vault: SOL Momentum
Share Mint: vSOLM
```

Investor ownership is represented by vault shares.

Do not use the 1VAULT platform token as the ownership token for every
vault.

------------------------------------------------------------------------

# 32. Database Architecture

A database is recommended, but it must not be the source of truth for
funds or ownership.

## On-chain source of truth

-   Vault balances.
-   Token ownership.
-   Vault state.
-   Investor positions.
-   Trade execution.
-   Fees.
-   Risk settings affecting execution.

## Database / Indexer

Recommended stack:

``` text
Node.js / TypeScript
PostgreSQL
Redis (optional)
```

Database stores:

``` text
Strategists
Vault metadata
Vault performance snapshots
Trade history
Transactions
Leaderboard data
Analytics
UI metadata
```

------------------------------------------------------------------------

# 33. Backend Architecture

``` text
Frontend
   |
   v
1Vault API
   |
   +-- PostgreSQL
   |
   +-- Redis
   |
   +-- Indexer
   |
   v
Solana RPC
   |
   v
1Vault Program
```

The backend should not have authority to arbitrarily move investor
funds.

------------------------------------------------------------------------

# 34. Security Principles

## Non-Custodial

Strategist cannot withdraw investor assets to their own wallet.

## Permission-Based Trading

Strategist can request/execute only approved trading operations.

## Vault Isolation

Vault A must never be able to access Vault B assets.

## Investor Isolation

Investor A configuration must not affect Investor B configuration.

## Risk Limits

Every trade should be checked against protocol and vault risk
constraints.

## Emergency Pause

Protocol and vault-level emergency controls should exist.

## Database Independence

Database compromise must not allow unauthorized fund movement.

## External Program Validation

Only approved DEX and aggregator programs should be executable.

------------------------------------------------------------------------

# 35. Use Cases

## UC-01 --- Strategist Creates Vault

``` text
Strategist
 -> Connect Wallet
 -> Verify 1VAULT balance
 -> Lock license
 -> Configure strategy
 -> Create vault
 -> Vault PDA created
```

## UC-02 --- Investor Joins Vault

``` text
Investor
 -> Connect Wallet
 -> Select Vault
 -> Deposit
 -> Receive Vault Shares
 -> Configure Auto Follow
 -> Configure risk
```

## UC-03 --- Strategist Opens Position

``` text
Strategist
 -> Create BUY/SELL order
 -> Define position size
 -> Program validates
 -> Jupiter/DEX executes
 -> Position updated
```

## UC-04 --- Investor Auto Follow

``` text
Trade Signal
 -> Check Auto Follow
 -> Calculate allocation
 -> Check risk
 -> Execute / allocate position
```

## UC-05 --- Strategist DCA, Investor DCA OFF

``` text
Strategist:
Entry 1
DCA 2
DCA 3
DCA 4

Investor:
Initial Entry = ON
DCA = OFF

Result:
Investor follows only the initial allocation.
```

## UC-06 --- Investor Auto Follow OFF

``` text
Investor sets OFF
 -> New strategist trades
 -> Investor is skipped
 -> Existing positions remain
```

## UC-07 --- Investor Exits

``` text
Investor
 -> Request close
 -> Calculate current value
 -> Close/reduce position
 -> Update NAV
 -> Receive funds
```

## UC-08 --- Strategist Sees Aggregate Followers

``` text
Strategist Dashboard
 -> Active followers
 -> Estimated following capital
 -> Estimated trade impact
```

No individual investor identity/balance is exposed by default.

## UC-09 --- Vault Closes

``` text
Strategist
 -> Request closure
 -> Close positions
 -> Investors withdraw
 -> Fees settle
 -> Vault closed
 -> License unlocked
```

## UC-10 --- Staking

``` text
Vault
 -> Allocate capital to staking
 -> Interact with Solana Stake Program
 -> Receive staking rewards
 -> Update NAV
```

------------------------------------------------------------------------

# 36. Example End-to-End Scenario

## Strategist

``` text
Capital = $200
DCA = ON
Maximum Position = $100
DCA Count = 5
```

Strategist creates:

``` text
SOL Momentum Vault
```

## Investors

Alice:

``` text
Capital = $100
Auto Follow = ON
Fixed Position = $10
DCA = OFF
```

Bob:

``` text
Capital = $1,000
Auto Follow = ON
Percentage = 10%
DCA = ON
```

Charlie:

``` text
Capital = $500
Auto Follow = OFF
```

## Strategist Entry

``` text
BUY SOL
Position = 50%
```

Strategist enters:

``` text
$100
```

## Alice

Auto Follow ON:

``` text
$10 position
DCA ignored
```

## Bob

Auto Follow ON:

``` text
10% allocation
DCA follows
```

## Charlie

Auto Follow OFF:

``` text
No new position
```

This demonstrates that each participant can have a different risk policy
while following the same strategist.

------------------------------------------------------------------------

# 37. Product Dashboard

## Investor Dashboard

``` text
Portfolio
Total Value
Available Balance
Invested
Open Positions
P&L
ROI

My Vaults
- Vault Name
- Strategist
- Allocation
- Auto Follow
- DCA
- Exposure
- NAV
- P&L

Settings
- Auto Follow
- Position Size
- Allocation Mode
- DCA
- Exit Rules
- Risk Limits
```

## Strategist Dashboard

``` text
My Vaults
AUM
NAV
ROI
P&L
Followers
Active Followers
Estimated Following Capital

Trade
BUY
SELL
Position Size
DCA
TP
SL
Slippage

Risk
Max Position
Max Exposure
Max Open Positions
```

------------------------------------------------------------------------

# 38. Product Differentiation

1Vault differentiates itself through:

### Investor-controlled copy execution

Investors do not have to blindly mirror every strategist action.

### Strategist-controlled strategy

Strategists maintain their own trading methodology.

### On-chain vault custody

Investor funds remain controlled by the vault program.

### Configurable DCA

Strategist and investor DCA settings are independent.

### Investor-level risk limits

Every investor can define their own exposure.

### Aggregate capital visibility

Strategists can estimate how much capital is following their strategy.

### Transparent NAV

Vault value and share price are derived from on-chain state.

### Multi-vault architecture

One program can support many strategists and many vaults.

------------------------------------------------------------------------

# 39. MVP Scope

## Phase 1 --- Core

Shipping lock for this phase (see §0): pooled book, 1VL vault license,
StrategistMustPark, Postgres-first deposit, share-weight close, **free**
park/withdraw, Pump.fun / PumpSwap, English UI, performance fee → degen wallet.

Also in this phase:

-   Solana/Anchor program.
-   Protocol initialization.
-   Strategist registration.
-   License locking.
-   Vault creation.
-   Deposit.
-   Vault share minting.
-   Withdraw.
-   Basic NAV.
-   Basic fees.
-   Vault close.

## Phase 2 --- Trading

-   Trade requests.
-   Strategist permission.
-   Jupiter integration.
-   Approved DEX execution.
-   Position accounting.
-   Risk limits.

## Phase 3 --- Copy / Follow

-   Auto Follow.
-   Investor allocation modes.
-   Investor risk settings.
-   Strategist DCA.
-   Investor DCA.
-   Exit preferences.
-   Aggregate follower estimates.

## Phase 4 --- Analytics

-   Indexer.
-   PostgreSQL.
-   Performance history.
-   Leaderboard.
-   Strategy analytics.
-   Trade history.

## Phase 5 --- Advanced

-   Native SOL staking integration.
-   Additional yield strategies.
-   More DEX integrations.
-   Advanced risk engine.
-   Automated keepers.
-   Governance.

------------------------------------------------------------------------

# 40. Recommended Initial Program Architecture

Use one core Anchor program:

``` text
1vault-program
|
+-- protocol
+-- strategist
+-- license
+-- vault
+-- investor
+-- trading
+-- position
+-- accounting
+-- risk
+-- staking
```

The architecture should remain modular internally even if all modules
initially share one Program ID.

External protocols remain separate:

``` text
1Vault Core Program
        |
        +-- SPL Token / Token-2022
        |
        +-- Jupiter
        |
        +-- Raydium
        |
        +-- Orca
        |
        +-- Solana Stake Program
```

------------------------------------------------------------------------

# 41. Core Product Principle

Shipping rule:

> **Degen controls the trade. Retail controls park size and TP/SL.
> Smart contract controls the funds. Close pays by share weight.**

The longer-vision rule (later sections) is:

> **Strategist controls the strategy. Investor controls the risk. Smart
> contract controls the funds.**

This creates three separate responsibilities:

``` text
Strategist
    |
    | Strategy
    v

Investor
    |
    | Risk / Allocation
    v

1Vault Smart Contract
    |
    | Custody / Validation / Execution
    v

On-chain Assets
```

------------------------------------------------------------------------

# 42. Product Summary

**1Vault --- Capital in Motion** is a Solana-native, non-custodial
pooled trading vault. Degen and retail park SOL into the same book. The
degen signs; the vault pays. Retail sets park amount plus TP/SL. Close
pays leftover by share weight --- not 50/50.

The **shipping** platform is designed around:

-   One shared book per vault (not isolated copy-trading).
-   1VL license lock on `create_vault` until Close vault.
-   Degen must park before trading (`StrategistMustPark`).
-   Postgres-first deposit; chain is source of truth after confirm.
-   **Free** park and redeem (no flat platform fee on-chain).

The longer vision (later in this file) also includes:

-   One core 1Vault program.
-   Unlimited vault instances.
-   Independent strategist and investor configuration.
-   On-chain custody.
-   Vault shares.
-   Configurable copy execution.
-   Independent DCA settings.
-   Position and exposure limits.
-   Transparent NAV.
-   Performance fees.
-   Optional staking module.
-   Off-chain indexing for scalable application UX.

The product should be designed so that the blockchain remains the source
of truth for assets, ownership, permissions, and execution while the
database is used only for indexing, analytics, metadata, and application
performance.


---

# 43. Withdrawal Fee

> **Superseded for current product.** MVP on-chain behavior: **park and redeem
> are free** (`fee_amount = 0` on `withdraw`). No flat ~$0.50 fee, no staking
> discount, no 0.5% model. Sections below are legacy / optional future only.

When a retail investor withdraws funds from a vault to their personal wallet, 1Vault charges a **0.5% withdrawal fee**.

## Formula

```text
Withdrawal Fee = Gross Withdrawal Value × 0.5%

Net Withdrawal = Gross Withdrawal Value - Withdrawal Fee
```

Example:

```text
Investor withdraws: $1,000
Withdrawal fee: 0.5%

Fee = $5
Net received = $995
```

The withdrawal fee should be calculated by the smart contract at execution time.

## Fee Destination

The 0.5% withdrawal fee can be divided between:

```text
Protocol Treasury
Referral Rewards
Strategist / Vault (optional, depending on product configuration)
```

The exact split should be configurable at the protocol level.

## Important Rule

The fee applies when the investor actually withdraws assets from the vault.

It should **not** be charged merely because:

- Investor turns Auto Follow OFF.
- Investor changes allocation settings.
- Investor stops following a strategy.
- A position is closed inside the vault.

---

# 44. Referral System

> **Not in MVP program.** Stripped from the current on-chain build. Legacy
> vision below — do not implement against current Devnet program.

1Vault includes a referral system designed to reward users who bring new users into the protocol.

## Referral Structure

Each user can have a unique referral code/link:

```text
1vault.app/ref/ABCD123
```

A new user connects a wallet through the referral link and creates their referral relationship.

The referral relationship should be stored on-chain or cryptographically bound to the user's initial registration so it cannot be arbitrarily changed later.

## Referral Rewards

Referral rewards can be funded from eligible protocol fees.

Example:

```text
Investor withdrawal = $1,000

Withdrawal Fee = $5

Referral allocation = 20% of fee

Referral reward = $1

Protocol remaining = $4
```

The percentage should be configurable by protocol governance/admin.

## Referral Rules

Recommended initial rules:

- One primary referrer per wallet.
- Referrer cannot be changed after the relationship is established.
- Self-referral is prohibited.
- Referral rewards are calculated only from eligible fees.
- Referral rewards should not create unlimited recursive liabilities.
- Referral balances should be claimable on-chain.
- Referral history should be indexable for analytics.

## Referral Dashboard

Users can see:

```text
My Referral Code
Total Referred Users
Active Referred Users
Total Referral Fees Generated
Claimable Rewards
Claimed Rewards
```

---

# 45. Staking for Fee Discounts

> **Not in MVP program.** Platform staking and withdraw-fee discounts are
> stripped from the current on-chain build. Legacy vision below.

1Vault staking should provide a utility beyond rewards: **staking can reduce protocol fees for the staker**.

The staking system should be separated conceptually from vault trading but can initially live as a module under the same 1Vault Program ID.

## Example Tier System

```text
Tier 0
No stake
Fee discount: 0%

Tier 1
Stake 100,000 1VAULT
Fee discount: 10%

Tier 2
Stake 500,000 1VAULT
Fee discount: 25%

Tier 3
Stake 1,000,000 1VAULT
Fee discount: 50%

Tier 4
Stake 5,000,000 1VAULT
Fee discount: 75%
```

These numbers are examples and should be configurable.

## Discount Application

If the standard withdrawal fee is:

```text
0.5%
```

and the investor has a 50% staking discount:

```text
0.5% × (1 - 50%)
= 0.25%
```

Example:

```text
Withdrawal = $1,000
Standard fee = $5
50% discount = $2.50

Final fee = $2.50
Investor receives = $997.50
```

## Fee Discount Types

The staking discount can eventually apply to:

```text
Withdrawal Fee
Performance Fee
Protocol Fee
Other eligible platform fees
```

For MVP, the safest approach is to start with the **withdrawal fee** and add other fee classes later.

## Staking State

Suggested PDA:

```text
["staking_pool"]
["staker", user]
```

The staker account can track:

```text
Staked Amount
Stake Start Time
Lock Duration
Current Tier
Fee Discount BPS
Pending Rewards
```

---

# 46. MEV Protection / MEV Preference

> **Not in MVP program.** On-chain `mev_mode` / protected routing is stripped.
> Execution uses DEX allowlist only. Legacy vision below.

Strategists should have an explicit setting to choose whether their trades use the available MEV-aware execution route.

## Strategist Setting

```text
MEV Protection

[ ON ] Use MEV-aware execution
[ OFF ] Standard execution
```

This setting belongs to the strategist's vault/strategy configuration.

## MEV ON

When enabled:

```text
Strategist
    |
    v
1Vault Trade Request
    |
    v
MEV-aware / protected routing
    |
    v
DEX / Aggregator
```

The exact implementation depends on the Solana execution infrastructure and supported routing provider.

## MEV OFF

```text
Strategist
    |
    v
1Vault Trade Request
    |
    v
Standard Jupiter / DEX routing
    |
    v
DEX
```

## Important Security Rule

The strategist should **not** be allowed to specify arbitrary external programs simply by turning MEV on.

The protocol should maintain an allowlist of supported execution routes/programs.

## Suggested Configuration

```text
mev_mode
    STANDARD
    PROTECTED
```

Potential future modes:

```text
STANDARD
PROTECTED
PRIVATE / SPECIALIZED ROUTE
```

The UI should clearly explain that MEV protection may affect:

- Execution route.
- Execution speed.
- Price.
- Fees.
- Availability.

MEV protection should never be presented as a guarantee of zero MEV or guaranteed better execution.

---

# 47. Share PNL

1Vault should allow investors and strategists to share their performance publicly.

The goal is to turn verified on-chain performance into shareable social content.

## Investor Share PNL

Investor can generate a share card such as:

```text
┌─────────────────────────────┐
│           1VAULT            │
│                             │
│       MY PERFORMANCE        │
│                             │
│          +24.83%             │
│                             │
│        PNL: +$248.30         │
│                             │
│      Vault: SOL Alpha        │
│                             │
│      Capital: $1,000         │
│      Current: $1,248.30      │
│                             │
│      1Vault — Capital        │
│           in Motion          │
└─────────────────────────────┘
```

The user can share the generated result to:

- X
- Telegram
- Discord
- Copy/share link
- Downloadable image

## Strategist Share PNL

Strategists can share verified strategy performance:

```text
Strategy:
SOL Momentum

Performance:
+42.6%

AUM:
$428,500

Followers:
932

Win Rate:
68%

Total Trades:
184
```

The application should distinguish between:

```text
Verified On-chain Data
```

and:

```text
User-entered / marketing information
```

Performance figures should be generated from indexed on-chain data whenever possible.

---

# 48. PNL Share Link

Each shareable PNL card can have a public verification URL:

```text
1vault.app/pnl/<share-id>
```

The page can show:

```text
Wallet / Strategy
Vault
Period
Starting NAV
Ending NAV
PNL
ROI
Fees
Verified Transactions
```

Sensitive information should be optional.

For example, an investor may share:

```text
ROI: +24.83%
PNL: +$248
```

without revealing:

```text
Wallet Address
Exact Portfolio Balance
Individual Positions
```

unless the investor explicitly enables public disclosure.

---

# 49. Privacy Controls for Share PNL

Investor should have options:

```text
Share Mode

○ Public
○ Anonymous
○ Private Link
```

## Public

Shows:

- Vault.
- Performance.
- ROI.
- PNL.
- Selected period.

## Anonymous

Shows:

- Performance.
- ROI.
- PNL.

Does not show the wallet identity.

## Private Link

Only people with the link can view the PNL page.

---

# 50. Updated Fee Architecture

The fee system now contains multiple potential fee sources:

```text
                    1VAULT FEES
                         |
          +--------------+--------------+
          |              |              |
          v              v              v
    Withdrawal       Performance     Future Fees
       0.5%              Fee
          |
          v
   Staking Discount
          |
          v
   Referral Allocation
```

## Withdrawal Fee

Base:

```text
0.5%
```

Then:

```text
Final Fee =
Base Fee × (1 - Staking Discount)
```

Example:

```text
Base = 0.5%
Staking discount = 50%

Final = 0.25%
```

Referral rewards are calculated from the eligible fee according to protocol configuration.

---

# 51. Updated Investor Settings

Investor settings should now include:

```text
FOLLOW
-------------------------
Auto Follow              ON/OFF

ALLOCATION
-------------------------
Allocation Mode
Fixed / Percentage / Proportional

Position Size
Max Position
Max Total Exposure
Max Open Positions

DCA
-------------------------
Follow DCA                ON/OFF
DCA Mode
Custom DCA Allocation

EXIT
-------------------------
Follow Partial Exit       ON/OFF
Follow Full Exit          ON/OFF
Follow TP                 ON/OFF
Follow SL                 ON/OFF

EXECUTION
-------------------------
Max Slippage

FEES
-------------------------
Staking Status
Fee Discount

SOCIAL
-------------------------
Share PNL
Privacy Mode
```

---

# 52. Updated Strategist Settings

Strategist settings should now include:

```text
STRATEGY
-------------------------
Strategy Type
Position Mode
Position Size

RISK
-------------------------
Max Position
Max Exposure
Max Open Positions
Max Slippage

DCA
-------------------------
DCA ON/OFF
DCA Count
DCA Allocation
DCA Interval

EXIT
-------------------------
Take Profit
Stop Loss
Partial Exit

EXECUTION
-------------------------
MEV Mode
STANDARD / PROTECTED

VAULT
-------------------------
Vault Status
Deposit Status
Withdrawal Status

SOCIAL
-------------------------
Share PNL
Public Strategy Profile
```

---

# 53. Updated End-to-End Investor Flow

```text
Investor Connect Wallet
        |
        v
Enter via Referral Link? ---- NO ----+
        |                             |
       YES                            |
        |                             |
        v                             |
Set Referrer                          |
        |                             |
        +-------------+---------------+
                      |
                      v
                Select Vault
                      |
                      v
                   Deposit
                      |
                      v
               Receive Shares
                      |
                      v
            Configure Investor
                  Settings
                      |
          +-----------+-----------+
          |                       |
          v                       v
     Auto Follow ON          Auto Follow OFF
          |                       |
          v                       |
     Wait for Signal              |
          |                       |
          v                       |
    Strategy Trade                |
          |                       |
          v                       |
    Risk Validation               |
          |                       |
          v                       |
    Open / Update Position <------+
          |
          v
        PNL
          |
          +------> Share PNL
          |
          v
       Withdraw
          |
          v
Calculate 0.5% Base Fee
          |
          v
Check Staking Discount
          |
          v
Calculate Referral Allocation
          |
          v
Send Net Funds
          |
          v
Investor Wallet
```

---

# 54. Updated End-to-End Strategist Flow

```text
Strategist Connect Wallet
        |
        v
Check 1VAULT License
        |
        v
Lock License
        |
        v
Create Vault
        |
        v
Configure:
- Position Size
- Risk
- DCA
- TP / SL
- MEV Mode
        |
        v
Vault Goes Public
        |
        v
Investors Deposit
        |
        v
Strategist Sees:
- AUM
- Active Followers
- Estimated Following Capital
        |
        v
Create Trade
        |
        v
MEV Setting Checked
        |
        v
Risk Validation
        |
        v
Jupiter / Approved DEX
        |
        v
Position Updated
        |
        v
NAV Updated
        |
        v
Profit / Loss
        |
        v
Performance Fee
        |
        v
Share PNL
        |
        v
Close Strategy / Vault
        |
        v
Unlock License
```

---

# 55. Updated Product Positioning

Current (shipping) positioning:

> **1Vault — Capital in Motion**
>
> Same vault. Degen signs. Vault pays.
> Park. They trade. You ride.
> Close pays by share weight. Not 50/50.

Core pillars (current):

```text
MOTION
Parked SOL is inventory. The vault pays the trade.

DESK
Degen signs. Retail rides. One book.

SKIN
Degen must park before they can trade. 1VL locked until close.

PAYOUT
Close pays leftover by share weight. Not 50/50.

CUSTODY
Vault contracts control capital, not the degen.
```

Longer-vision pillars (in program / future, not current UX):

```text
CONTROL
Investors choose exactly how much and how they follow.

EFFICIENCY
MEV-aware execution can be selected by strategists.

UTILITY
1VL staking unlocks fee discounts.

GROWTH
Referral rewards create network incentives.

SOCIAL
Verified PNL can be shared publicly.
```

---

# 56. Updated Core Product Principle

Shipping principle:

> **Degen controls the trade. Retail controls park size and TP/SL.
> Smart contract controls the funds. Close pays by share weight.**

The expanded (future) principle becomes:

> **Strategist controls the strategy. Investor controls the risk. Smart contract controls the funds. Staking controls fee discounts. The protocol verifies the performance.**

This keeps the responsibilities separated:

```text
                1VAULT
                   |
       +-----------+-----------+
       |           |           |
       v           v           v
  STRATEGIST    INVESTOR    PROTOCOL
       |           |           |
   Strategy       Risk      Fees / Rules
       |           |           |
       +-----------+-----------+
                   |
                   v
            SMART CONTRACT
                   |
          +--------+--------+
          |        |        |
          v        v        v
       Trading  Staking   Shares
          |
          v
        NAV / PNL
          |
          v
      Share PNL
```


---

# NEXT FEATURE — Early Exit Fee / Strategy Exit Compensation

> **Status: NEXT FEATURE — not part of MVP/core launch.**  
> Current close already pays leftover by share weight and closes all retail
> books with the vault position. Independent early exit + compensation is
> post-MVP.

## Purpose

Allow retail investors to exit a strategist's active position before the strategist/Degen closes the strategy, while compensating the strategist for the early exit.

The investor is **not locked** into the strategy. They can still exit, but an optional early-exit compensation fee may apply.

## Basic Flow

```text
Degen Strategy
      |
      v
Position ACTIVE
      |
      v
Retail wants to exit
      |
      v
Is Strategist still ACTIVE?
      |
     YES
      |
      v
Early Exit Fee
      |
      +------> Strategist Compensation
      |
      v
Retail receives remaining value
```

If the strategist has already closed the strategy:

```text
Strategist EXIT
      |
      v
Retail EXIT
      |
      v
No Early Exit Fee
```

## Recommended Fee Model

Prefer charging the fee on **realized profit**, rather than the investor's entire position value.

Example:

```text
Investor Entry = 1 SOL
Current Value  = 3 SOL
Realized Profit = 2 SOL

Early Exit Fee = 10% of realized profit

Fee = 0.2 SOL

Investor receives = 2.8 SOL
Strategist receives = 0.2 SOL
```

This is generally fairer than charging a percentage of the investor's entire principal + profit.

## Strategist Setting

Example:

```text
Early Exit Protection
[ ON ]

Early Exit Fee
[ 10% ]

Fee applies when:
[x] Strategist is still active
[x] Investor exits early
```

The protocol should enforce a maximum fee to prevent abusive configurations.

Example:

```text
Allowed:
0% - 5% / 10% depending on governance parameters

Not allowed:
50%
90%
100%
```

The exact maximum should be decided during tokenomics/economic design.

## Investor Transparency

Before joining a vault, the investor must be able to see:

```text
Early Exit Fee: 10% of realized profit
```

The fee should also be displayed on the exit confirmation screen:

```text
Position Value       3.00 SOL
Realized Profit      2.00 SOL
Early Exit Fee      -0.20 SOL
--------------------------------
You Receive           2.80 SOL
Strategist            0.20 SOL
```

## Important Rules

1. Early Exit Fee only applies while the strategist position is ACTIVE.
2. No Early Exit Fee after the strategist closes the strategy.
3. Investor can always request an exit; the fee does not lock the investor.
4. Fee calculation must be enforced by the smart contract.
5. Strategist cannot arbitrarily change the fee after investors have entered without an explicit protocol rule.
6. Fee configuration must be visible before investment.
7. The protocol should enforce a maximum fee.
8. Partial exits can also trigger the fee.
9. The fee should preferably apply to realized profit rather than principal.
10. The feature should be implemented only after the core vault, investor-position accounting, exit settlement, and fee architecture are stable.

## Future UI

Investor:

```text
SOL Strategy

Current Value
3.00 SOL

Profit
+2.00 SOL

⚠ Early Exit

Early Exit Fee
10% of realized profit

[ Exit Position ]
```

Strategist:

```text
Strategy Settings

Early Exit Protection
[ ON ]

Compensation
10% of realized profit
```

## Why This Is a Next Feature

The mechanism depends on several core systems already being reliable:

```text
Vault Accounting
       +
Investor Position
       +
Realized PNL
       +
Independent Investor Exit
       +
Fee Distribution
       +
Strategist Revenue
       =
Early Exit Compensation
```

Therefore it should be treated as a **post-MVP economic feature**, not a launch-critical requirement.
