# Home & Discover

Bottom nav: **Home** · **Discover** · **Trade** · **History** · **Vault**.

---

## Home (your dashboard)

Home is for the vault you selected - capital snapshot, quick actions, and your vault list.

### Top account chip

Avatar / name (or “Not signed in”), short wallet address, available SOL when loaded. Tap for the account menu when signed in with X.

### Capital hero

| When | What you see |
|------|----------------|
| No vaults yet | **Wallet Balance** + wallet SOL |
| Vault selected | Wallet balance + type chip (`POOLED` / `SLICED`), **My Park** / **Investor Park** / **Total Park**, bar for **Committed** / **Incoming** / **Mandated**, vault address |

Incoming capital may show a dismissible banner (“Capital in motion”) with how much SOL is still settling and a projected figure.

Deep dive: [Capital pipeline](/extension/capital-pipeline).

### Quick actions

| Button | What it does | Notes |
|--------|----------------|-------|
| **Create** | Opens create wizard | [Create vault & lock](/extension/create-vault-and-lock) |
| **Park** | Park SOL into the active vault | Needs vault **Active** |
| **Trade** | Jump into opening / managing a position | Needs park + active vault |
| **Close** | Start close vault | Blocked if positions still open |

Tooltips explain why a button is disabled (for example: vault must be Active to park).

### Segment tabs on Home

| Tab | Content |
|-----|---------|
| **Vaults** | Vaults **you** run - name, type, address, NAV, Active / Closed badges, **Detail** |
| **Capital** | Pipeline detail for the selected vault |
| **Positions** | Open positions (read-only here - exit on Trade) |
| **Holdings** | Share / park holdings; withdraw where shown |

**Empty vaults:** “No vaults yet” - create from Home or browse Discover.

### Selecting a vault

- Tap a vault card to **select** it (Park / Trade / Close target that vault)  
- Tap **Detail** for the full [Vault detail](/extension/vault-detail) profile  

---

## Discover (public vaults)

Discover lists **public** vaults - not only yours.

| Control | Behaviour |
|---------|-----------|
| Search | Filter by name, vault address, trader, type |
| List | Matched cards (UI may cap how many show) |
| Tap card | Opens vault detail / park path |
| Refresh | Reload the list |

Each card typically shows: name, type chip, trader short address, **SOL NAV**.

| Empty state | Meaning |
|-------------|---------|
| No vaults indexed yet | Nothing listed right now |
| No vaults match “…” | Broaden or clear search |

Investor flow from here: [Park into a vault](/investor/park-into-vault).

---

## History

Recent parks, trades, creates, closes from your session.

Empty hint: Park, Trade, or Create from Home.

---

## Vault tab (tools)

For the **active** vault:

| Tool | Purpose |
|------|---------|
| **Claim fees** | Collect accrued performance fees ([guide](/extension/claim-fees)) |
| **Close vault** | Wind down; settle by share weight |
| **Unlock $1VAULTS** | Return locked licence after close |

Full order: [Close vault & unlock](/extension/close-vault-and-unlock).

If no vault is selected: “Select a vault on Home first.”

---

## Processing banner

While a flow runs you may see:

Creating vault… · Parking SOL… · Opening position… · Closing position… · Claiming fees… · Closing vault… · Withdrawing…

Use **Cancel** if the UI offers it and you need to stop waiting on a stuck prompt.

Next: [Capital pipeline](/extension/capital-pipeline) / [Vault detail](/extension/vault-detail) / [Park SOL](/extension/park-and-capital)
