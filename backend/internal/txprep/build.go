package txprep

import (
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/1vault/backend/internal/cluster"
	"github.com/1vault/backend/internal/signing"
	s "github.com/1vault/backend/internal/solana"
	"github.com/gagliardetto/solana-go"
)

type Prepared struct {
	TransactionBase64 string           `json:"transaction"`
	RecentBlockhash   string           `json:"recentBlockhash"`
	FeePayer          string           `json:"feePayer"`
	Signers           []string         `json:"requiredSigners"`
	SignerDetails     []signing.Detail `json:"signerDetails,omitempty"`
	SigningMode       signing.Mode     `json:"signingMode,omitempty"`
	Message           string           `json:"message,omitempty"`
	Accounts          any              `json:"accounts,omitempty"`
}

func AttachSignerMeta(p *Prepared, kinds map[string]signing.SignerKind) {
	if p == nil {
		return
	}
	p.SignerDetails = signing.DetailsForSigners(p.Signers, kinds)
	p.SigningMode = signing.ModeFromDetails(p.SignerDetails)
}

type Builder struct {
	Program            solana.PublicKey
	Protocol           solana.PublicKey
	License            solana.PublicKey // platform mint
	LicenseLockAmount  string
	AllowedDexProgram  solana.PublicKey // auto-picked from PROGRAM_IDS[0]
	AllowedDexPrograms []solana.PublicKey
	DexMeta            []cluster.DexProgramEntry
	RPC                *RPC
}

func NewBuilder(addr cluster.Addresses, rpc *RPC) *Builder {
	b := &Builder{
		Program:           s.MustPK(addr.ProgramID),
		Protocol:          s.MustPK(addr.ProtocolConfig),
		License:           s.MustPK(addr.LicenseMint),
		LicenseLockAmount: addr.LicenseLockAmount,
		DexMeta:           addr.DexPrograms,
		RPC:               rpc,
	}
	for _, id := range addr.AllowedDexPrograms {
		if pk, err := s.ParsePK(id); err == nil {
			b.AllowedDexPrograms = append(b.AllowedDexPrograms, pk)
		}
	}
	if addr.AllowedDexProgram != "" {
		if pk, err := s.ParsePK(addr.AllowedDexProgram); err == nil {
			b.AllowedDexProgram = pk
		}
	}
	if b.AllowedDexProgram.IsZero() && len(b.AllowedDexPrograms) > 0 {
		b.AllowedDexProgram = b.AllowedDexPrograms[0]
	}
	return b
}

// AutoDexProgram picks an on-chain allowlisted DEX/launchpad program.
// PROGRAM_IDS order is preferred when it intersects the protocol allowlist.
func (b *Builder) AutoDexProgram(venue uint8) (solana.PublicKey, error) {
	allowed, err := b.allowedTradePrograms(venue)
	if err != nil {
		return solana.PublicKey{}, err
	}
	if len(allowed) == 0 {
		return solana.PublicKey{}, fmt.Errorf("no allowed trade programs on protocol config for venue %d", venue)
	}
	allowedSet := make(map[string]solana.PublicKey, len(allowed))
	for _, pk := range allowed {
		allowedSet[pk.String()] = pk
	}
	// Prefer backend PROGRAM_IDS priority when also on-chain allowlisted.
	for _, pk := range b.AllowedDexPrograms {
		if hit, ok := allowedSet[pk.String()]; ok {
			if b.RPC == nil || b.dexAccountExists(hit) {
				return hit, nil
			}
		}
	}
	// Fall back to first allowlisted program that exists on RPC (devnet programs may be missing).
	for _, pk := range allowed {
		if b.RPC == nil || b.dexAccountExists(pk) {
			return pk, nil
		}
	}
	return allowed[0], nil
}

func (b *Builder) allowedTradePrograms(venue uint8) ([]solana.PublicKey, error) {
	if b.RPC == nil {
		return b.envDexFallback(), nil
	}
	data, err := b.RPC.AccountData(b.Protocol)
	if err != nil {
		return b.envDexFallback(), nil
	}
	dex, launch, err := s.DecodeProtocolTradePrograms(data)
	if err != nil {
		return nil, err
	}
	if venue == s.TradeVenueLaunchpad {
		return launch, nil
	}
	return dex, nil
}

func (b *Builder) envDexFallback() []solana.PublicKey {
	if len(b.AllowedDexPrograms) > 0 {
		return b.AllowedDexPrograms
	}
	if !b.AllowedDexProgram.IsZero() {
		return []solana.PublicKey{b.AllowedDexProgram}
	}
	return nil
}

func (b *Builder) dexAccountExists(pk solana.PublicKey) bool {
	ok, err := b.RPC.AccountExists(pk)
	return err == nil && ok
}

// AutoDexProgramDefault uses TradeVenue::Dex (request_trade default).
func (b *Builder) AutoDexProgramDefault() (solana.PublicKey, error) {
	return b.AutoDexProgram(s.TradeVenueDex)
}

func (b *Builder) pack(feePayer solana.PublicKey, signers []solana.PublicKey, ixs ...solana.Instruction) (*Prepared, error) {
	return b.packWithBudget(feePayer, signers, 0, 0, ixs...)
}

func (b *Builder) packWithBudget(feePayer solana.PublicKey, signers []solana.PublicKey, cuLimit uint32, priorityMicro uint64, ixs ...solana.Instruction) (*Prepared, error) {
	bh, err := b.RPC.LatestBlockhash()
	if err != nil {
		return nil, err
	}
	budget := []solana.Instruction{}
	if priorityMicro > 0 {
		budget = append(budget, s.SetComputeUnitPrice(priorityMicro))
	}
	if cuLimit > 0 {
		budget = append(budget, s.SetComputeUnitLimit(cuLimit))
	}
	all := append(budget, ixs...)
	tx, err := solana.NewTransaction(
		all,
		bh,
		solana.TransactionPayer(feePayer),
	)
	if err != nil {
		return nil, err
	}
	// Unsigned txs must still reserve signature slots (gagliardetto writes len(Signatures)=0 otherwise).
	nSig := int(tx.Message.Header.NumRequiredSignatures)
	if nSig > 0 && len(tx.Signatures) != nSig {
		tx.Signatures = make([]solana.Signature, nSig)
	}
	raw, err := tx.MarshalBinary()
	if err != nil {
		return nil, err
	}
	sigs := make([]string, len(signers))
	for i, pk := range signers {
		sigs[i] = pk.String()
	}
	return finishPack(&Prepared{
		TransactionBase64: base64.StdEncoding.EncodeToString(raw),
		RecentBlockhash:   bh.String(),
		FeePayer:          feePayer.String(),
		Signers:           sigs,
	}, nil)
}

func finishPack(p *Prepared, err error) (*Prepared, error) {
	if err != nil {
		return nil, err
	}
	AttachSignerMeta(p, nil)
	return p, nil
}

func (b *Builder) RegisterStrategist(strategist solana.PublicKey) (*Prepared, error) {
	ix := s.Ix(b.Program, s.DiscRegisterStrategist,
		s.Meta(strategist, true, true),
		s.Meta(b.Protocol, false, false),
		s.Meta(s.StrategistPDA(b.Program, strategist), false, true),
		s.Meta(s.SystemProgramID, false, false),
	)
	p, err := b.pack(strategist, []solana.PublicKey{strategist}, s.SetComputeUnitLimit(200_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Register strategist PDA"
	p.Accounts = map[string]string{
		"strategistAccount": s.StrategistPDA(b.Program, strategist).String(),
		"licenseMint":       b.License.String(),
	}
	return p, nil
}

func (b *Builder) LockLicense(strategist solana.PublicKey) (*Prepared, error) {
	ata := s.ATA(b.License, strategist)
	ixs := []solana.Instruction{
		s.SetComputeUnitLimit(300_000),
		s.CreateIdempotentATA(strategist, strategist, b.License),
		s.Ix(b.Program, s.DiscLockLicense,
			s.Meta(strategist, true, true),
			s.Meta(b.Protocol, false, false),
			s.Meta(s.StrategistPDA(b.Program, strategist), false, true),
			s.Meta(s.LicensePDA(b.Program, strategist), false, true),
			s.Meta(ata, false, true),
			s.Meta(s.LicenseVaultPDA(b.Program, strategist), false, true),
			s.Meta(b.License, false, false),
			s.Meta(s.TokenProgramID, false, false),
			s.Meta(s.SystemProgramID, false, false),
			s.Meta(s.RentSysvar, false, false),
		),
	}
	p, err := b.pack(strategist, []solana.PublicKey{strategist}, ixs...)
	if err != nil {
		return nil, err
	}
	p.Message = "Activate licence record (1VL lock happens on create_vault)"
	p.Accounts = map[string]string{
		"strategistAccount":    s.StrategistPDA(b.Program, strategist).String(),
		"license":              s.LicensePDA(b.Program, strategist).String(),
		"licenseVault":         s.LicenseVaultPDA(b.Program, strategist).String(),
		"licenseMint":          b.License.String(),
		"strategistLicenseAta": ata.String(),
	}
	return p, nil
}

type CreateVaultParams struct {
	Strategist        solana.PublicKey
	VaultTokenAccount solana.PublicKey
	VaultID           uint64
	Name              string
	PerformanceFeeBps uint16
	Description       string
	MaxSlippageBps    uint16
	BaseMint          solana.PublicKey   // vault base mint account (usually wSOL)
	AllowedMints      []solana.PublicKey // VaultRiskParams.accepted_mints
	VaultType         string             // pooled|sliced — encoded as on-chain book mode
	ManagementFeeBps  uint16             // book-mode param; pooled must be 0, sliced demos use 1000
}

// createVaultBookMode encodes the deployed program's book-mode enum (u8 + u16).
// Local IDL is stale; on-chain CreateVault expects this after performance_fee_bps.
// Pooled=0 (param must be 0), Sliced=1 (param is management fee bps).
func createVaultBookMode(vaultType string, managementFeeBps uint16) (mode uint8, param uint16) {
	switch strings.ToLower(strings.TrimSpace(vaultType)) {
	case "sliced", "sliced_vault", "slice":
		if managementFeeBps == 0 {
			managementFeeBps = 1000
		}
		return 1, managementFeeBps
	default:
		return 0, 0
	}
}

func (b *Builder) CreateVault(p CreateVaultParams) (*Prepared, error) {
	if p.VaultID == 0 {
		return nil, fmt.Errorf("vaultId required")
	}
	if p.Name == "" {
		p.Name = fmt.Sprintf("Vault %d", p.VaultID)
	}
	if p.PerformanceFeeBps == 0 {
		p.PerformanceFeeBps = 2000
	}
	if p.Description == "" {
		switch strings.ToLower(strings.TrimSpace(p.VaultType)) {
		case "sliced", "sliced_vault", "slice":
			p.Description = "1Vault sliced vault"
		default:
			p.Description = "1Vault pooled book"
		}
	}
	if p.MaxSlippageBps == 0 {
		p.MaxSlippageBps = 100
	}
	if p.BaseMint.IsZero() {
		p.BaseMint = s.WSOL
	}
	if len(p.AllowedMints) == 0 {
		p.AllowedMints = []solana.PublicKey{p.BaseMint}
	}
	bookMode, bookParam := createVaultBookMode(p.VaultType, p.ManagementFeeBps)
	vault := s.VaultPDA(b.Program, p.Strategist, p.VaultID)
	data := s.Concat(
		s.DiscCreateVault,
		s.U64LE(p.VaultID),
		s.EncodeString(p.Name),
		s.U16LE(p.PerformanceFeeBps),
		s.U8(bookMode),
		s.U16LE(bookParam),
		s.EncodeString(p.Description),
		s.U16LE(p.MaxSlippageBps),
		s.EncodePubkeyVec(p.AllowedMints),
	)
	ix := s.Ix(b.Program, data,
		s.Meta(p.Strategist, true, true),
		s.Meta(b.Protocol, false, false),
		s.Meta(s.StrategistPDA(b.Program, p.Strategist), false, true),
		s.Meta(s.LicensePDA(b.Program, p.Strategist), false, false),
		s.Meta(vault, false, true),
		s.Meta(s.VaultFeePDA(b.Program, vault), false, true),
		s.Meta(p.BaseMint, false, false),
		s.Meta(s.ShareMintPDA(b.Program, vault), false, true),
		s.Meta(p.VaultTokenAccount, true, true),
		s.Meta(s.ATA(b.License, p.Strategist), false, true),
		s.Meta(b.License, false, false),
		s.Meta(s.VaultLicensePDA(b.Program, vault), false, true),
		s.Meta(s.TokenProgramID, false, false),
		s.Meta(s.SystemProgramID, false, false),
		s.Meta(s.RentSysvar, false, false),
	)
	out, err := b.pack(p.Strategist, []solana.PublicKey{p.Strategist, p.VaultTokenAccount}, s.SetComputeUnitLimit(400_000), ix)
	if err != nil {
		return nil, err
	}
	AttachSignerMeta(out, map[string]signing.SignerKind{
		p.Strategist.String():       signing.KindEOA,
		p.VaultTokenAccount.String(): signing.KindEphemeral,
	})
	out.Message = "Create vault — strategist signs in wallet; vaultTokenAccount co-signed by backend"
	acc := map[string]string{
		"strategist":        p.Strategist.String(),
		"vault":             vault.String(),
		"shareMint":         s.ShareMintPDA(b.Program, vault).String(),
		"vaultFeeState":     s.VaultFeePDA(b.Program, vault).String(),
		"vaultLicenseVault": s.VaultLicensePDA(b.Program, vault).String(),
		"vaultTokenAccount": p.VaultTokenAccount.String(),
		"baseMint":          p.BaseMint.String(),
		"vaultId":           fmt.Sprintf("%d", p.VaultID),
		"bookMode":          fmt.Sprintf("%d", bookMode),
		"managementFeeBps":  fmt.Sprintf("%d", bookParam),
	}
	vt := strings.ToLower(strings.TrimSpace(p.VaultType))
	if vt == "" {
		vt = "pooled"
	}
	acc["vaultType"] = vt
	if b.LicenseLockAmount != "" {
		acc["licenseLocked"] = b.LicenseLockAmount + " 1VL"
	}
	out.Accounts = acc
	return out, nil
}

type UpdateVaultRiskParams struct {
	Strategist       solana.PublicKey
	Vault            solana.PublicKey
	Description      string
	MaxSlippageBps   uint16
	AcceptedMints    []solana.PublicKey
	PriorityFeeMicro uint64
	ComputeUnitLimit uint32
}

// UpdateVaultRisk adds trading mints to the vault allowlist (required before open_position on demo tokens).
func (b *Builder) UpdateVaultRisk(p UpdateVaultRiskParams) (*Prepared, error) {
	if p.Vault.IsZero() || p.Strategist.IsZero() {
		return nil, fmt.Errorf("strategist and vault required")
	}
	if len(p.AcceptedMints) == 0 {
		return nil, fmt.Errorf("acceptedMints required")
	}
	hasBase := false
	for _, m := range p.AcceptedMints {
		if m.Equals(s.WSOL) {
			hasBase = true
			break
		}
	}
	if !hasBase {
		return nil, fmt.Errorf("acceptedMints must include base mint (wSOL)")
	}
	desc := p.Description
	if desc == "" {
		desc = "1Vault pooled book"
	}
	slip := p.MaxSlippageBps
	if slip == 0 {
		slip = 100
	}
	risk := s.Concat(
		s.EncodeString(desc),
		s.U16LE(slip),
		s.EncodePubkeyVec(p.AcceptedMints),
	)
	data := s.Concat(
		s.DiscUpdateVault,
		[]byte{0},
		[]byte{0},
		[]byte{1},
		risk,
	)
	cu := p.ComputeUnitLimit
	if cu == 0 {
		cu = 200_000
	}
	priority := p.PriorityFeeMicro
	if priority == 0 {
		priority = 100_000
	}
	ix := s.Ix(b.Program, data,
		s.Meta(p.Strategist, true, true),
		s.Meta(p.Vault, false, true),
	)
	out, err := b.packWithBudget(p.Strategist, []solana.PublicKey{p.Strategist}, cu, priority, ix)
	if err != nil {
		return nil, err
	}
	out.Message = "Update vault accepted_mints (demo token allowlist)"
	out.Accounts = map[string]string{
		"vault":         p.Vault.String(),
		"acceptedMints": fmt.Sprintf("%d", len(p.AcceptedMints)),
	}
	return out, nil
}

// ResolveAccounts derives program PDAs from caller-supplied pubkeys (no static wallets).
func (b *Builder) ResolveAccounts(strategist, investor, vault solana.PublicKey, vaultID uint64) map[string]string {
	out := map[string]string{
		"programId":      b.Program.String(),
		"protocolConfig": b.Protocol.String(),
		"licenseMint":    b.License.String(),
		"wsolMint":       s.WSOL.String(),
	}
	if !strategist.IsZero() {
		out["strategist"] = strategist.String()
		out["strategistAccount"] = s.StrategistPDA(b.Program, strategist).String()
		out["license"] = s.LicensePDA(b.Program, strategist).String()
		out["licenseVault"] = s.LicenseVaultPDA(b.Program, strategist).String()
		out["strategistLicenseAta"] = s.ATA(b.License, strategist).String()
		if vaultID > 0 {
			vault = s.VaultPDA(b.Program, strategist, vaultID)
			out["vaultId"] = fmt.Sprintf("%d", vaultID)
		}
	}
	if !vault.IsZero() {
		out["vault"] = vault.String()
		out["shareMint"] = s.ShareMintPDA(b.Program, vault).String()
		out["vaultFeeState"] = s.VaultFeePDA(b.Program, vault).String()
		out["vaultLicenseVault"] = s.VaultLicensePDA(b.Program, vault).String()
	}
	if !investor.IsZero() && !vault.IsZero() {
		out["investor"] = investor.String()
		out["investorConfig"] = s.InvestorConfigPDA(b.Program, vault, investor).String()
		shareMint := s.ShareMintPDA(b.Program, vault)
		out["investorShareAta"] = s.ATA(shareMint, investor).String()
		out["investorWsolAta"] = s.ATA(s.WSOL, investor).String()
	}
	return out
}

func (b *Builder) Park(investor, vault, vaultTokenAccount solana.PublicKey, lamports uint64) (*Prepared, error) {
	if lamports == 0 {
		return nil, fmt.Errorf("lamports required")
	}
	if err := b.requireVaultActive(vault); err != nil {
		return nil, err
	}
	shareMint := s.ShareMintPDA(b.Program, vault)
	wsolATA := s.ATA(s.WSOL, investor)
	shareATA := s.ATA(shareMint, investor)
	ixs := []solana.Instruction{
		s.SetComputeUnitLimit(400_000),
		s.CreateIdempotentATA(investor, investor, s.WSOL),
		s.TransferLamports(investor, wsolATA, lamports),
		s.SyncNative(wsolATA),
		s.CreateIdempotentATA(investor, investor, shareMint),
		s.Ix(b.Program, s.Concat(s.DiscDeposit, s.U64LE(lamports)),
			s.Meta(investor, true, true),
			s.Meta(b.Protocol, false, false),
			s.Meta(vault, false, true),
			s.Meta(wsolATA, false, true),
			s.Meta(vaultTokenAccount, false, true),
			s.Meta(shareMint, false, true),
			s.Meta(shareATA, false, true),
			s.Meta(s.TokenProgramID, false, false),
		),
	}
	p, err := b.pack(investor, []solana.PublicKey{investor}, ixs...)
	if err != nil {
		return nil, err
	}
	p.Message = "Park SOL: wrap → deposit → mint shares"
	p.Accounts = map[string]string{
		"wsolAta":   wsolATA.String(),
		"shareAta":  shareATA.String(),
		"shareMint": shareMint.String(),
	}
	return p, nil
}

func (b *Builder) Withdraw(investor, vault, vaultTokenAccount solana.PublicKey, shares uint64) (*Prepared, error) {
	return b.WithdrawOpts(WithdrawParams{
		Investor: investor, Vault: vault, VaultTokenAccount: vaultTokenAccount, Shares: shares,
	})
}

type WithdrawParams struct {
	Investor             solana.PublicKey
	Vault                solana.PublicKey
	VaultTokenAccount    solana.PublicKey
	Shares               uint64
	PriorityFeeMicro     uint64
	ComputeUnitLimit     uint32
}

func (b *Builder) investorConfigIx(investor, vault solana.PublicKey) solana.Instruction {
	cfg := s.InvestorConfigPDA(b.Program, vault, investor)
	return s.Ix(b.Program, s.DiscCreateInvestorCfg,
		s.Meta(investor, true, true),
		s.Meta(b.Protocol, false, false),
		s.Meta(vault, false, false),
		s.Meta(cfg, false, true),
		s.Meta(s.SystemProgramID, false, false),
	)
}

func (b *Builder) WithdrawOpts(p WithdrawParams) (*Prepared, error) {
	if p.Shares == 0 {
		return nil, fmt.Errorf("shares required")
	}
	shareMint := s.ShareMintPDA(b.Program, p.Vault)
	wsolATA := s.ATA(s.WSOL, p.Investor)
	shareATA := s.ATA(shareMint, p.Investor)
	cfg := s.InvestorConfigPDA(b.Program, p.Vault, p.Investor)
	cu := p.ComputeUnitLimit
	if cu == 0 {
		cu = 400_000
	}
	priority := p.PriorityFeeMicro
	if priority == 0 {
		priority = 100_000
	}
	ixs := []solana.Instruction{
		s.SetComputeUnitPrice(priority),
		s.SetComputeUnitLimit(cu),
		s.Ix(b.Program, s.DiscUpdateNav,
			s.Meta(p.Vault, false, true),
			s.Meta(p.VaultTokenAccount, false, false),
		),
		s.CreateIdempotentATA(p.Investor, p.Investor, s.WSOL),
		s.CreateIdempotentATA(p.Investor, p.Investor, shareMint),
	}
	if b.RPC != nil {
		if exists, err := b.RPC.AccountExists(cfg); err == nil && !exists {
			ixs = append(ixs, b.investorConfigIx(p.Investor, p.Vault))
		}
	}
	ixs = append(ixs,
		s.Ix(b.Program, s.Concat(s.DiscWithdraw, s.U64LE(p.Shares)),
			s.Meta(p.Investor, true, true),
			s.Meta(b.Protocol, false, false),
			s.Meta(p.Vault, false, true),
			s.Meta(shareATA, false, true),
			s.Meta(wsolATA, false, true),
			s.Meta(p.VaultTokenAccount, false, true),
			s.Meta(shareMint, false, true),
			s.Meta(cfg, false, false),
			s.Meta(s.TokenProgramID, false, false),
		),
		s.CloseTokenAccount(wsolATA, p.Investor, p.Investor),
	)
	out, err := b.pack(p.Investor, []solana.PublicKey{p.Investor}, ixs...)
	if err != nil {
		return nil, err
	}
	out.Message = "Free redeem: burn shares → unwrap wSOL to native"
	out.Accounts = map[string]string{
		"investorShareAta": shareATA.String(),
		"investorWsolAta":  wsolATA.String(),
		"shareMint":        shareMint.String(),
		"investorConfig":   cfg.String(),
	}
	return out, nil
}

func (b *Builder) AccrueFees(payer, vault solana.PublicKey) (*Prepared, error) {
	ix := s.Ix(b.Program, s.DiscAccrueFees,
		s.Meta(b.Protocol, false, false),
		s.Meta(vault, false, true),
		s.Meta(s.VaultFeePDA(b.Program, vault), false, true),
	)
	p, err := b.pack(payer, []solana.PublicKey{payer}, s.SetComputeUnitLimit(200_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Accrue performance fees into vault fee state"
	return p, nil
}

func (b *Builder) ClaimFees(strategist, vault, vaultTokenAccount, degenFeeWallet solana.PublicKey) (*Prepared, error) {
	unwrap := s.FeeUnwrapPDA(b.Program, vault, degenFeeWallet)
	ix := s.Ix(b.Program, s.DiscClaimFees,
		s.Meta(strategist, true, true),
		s.Meta(b.Protocol, false, false),
		s.Meta(vault, false, true),
		s.Meta(s.VaultFeePDA(b.Program, vault), false, true),
		s.Meta(vaultTokenAccount, false, true),
		s.Meta(degenFeeWallet, false, true),
		s.Meta(unwrap, false, true),
		s.Meta(s.WSOL, false, false),
		s.Meta(s.TokenProgramID, false, false),
		s.Meta(s.SystemProgramID, false, false),
		s.Meta(s.RentSysvar, false, false),
	)
	p, err := b.pack(strategist, []solana.PublicKey{strategist}, s.SetComputeUnitLimit(400_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Claim accrued performance fees to strategies fee wallet"
	return p, nil
}

func (b *Builder) requireVaultActive(vault solana.PublicKey) error {
	if b.RPC == nil {
		return nil
	}
	data, err := b.RPC.AccountData(vault)
	if err != nil {
		return fmt.Errorf("load vault %s: %w", vault, err)
	}
	return s.RequireVaultActive(vault, data)
}

func (b *Builder) requireCurrentVaultLayout(vault solana.PublicKey) error {
	if b.RPC == nil {
		return nil
	}
	data, err := b.RPC.AccountData(vault)
	if err != nil {
		return fmt.Errorf("load vault %s: %w", vault, err)
	}
	return s.ValidateVaultAccountData(vault, data)
}

func (b *Builder) InitiateVaultClose(strategist, vault solana.PublicKey) (*Prepared, error) {
	if err := b.requireCurrentVaultLayout(vault); err != nil {
		return nil, err
	}
	if b.RPC != nil {
		data, err := b.RPC.AccountData(vault)
		if err != nil {
			return nil, fmt.Errorf("load vault %s: %w", vault, err)
		}
		st, err := s.DecodeVaultStatus(data)
		if err != nil {
			return nil, err
		}
		switch st {
		case s.VaultStatusClosed:
			return nil, fmt.Errorf("vault %s is already Closed — nothing to initiate", vault)
		case s.VaultStatusClosing:
			return nil, fmt.Errorf("vault %s is already Closing — continue with close_vault (not initiate_close)", vault)
		case s.VaultStatusActive, s.VaultStatusPaused:
			// ok
		default:
			return nil, fmt.Errorf("vault %s status %s cannot initiate close", vault, st)
		}
	}
	ix := s.Ix(b.Program, s.DiscInitiateVaultClose,
		s.Meta(strategist, true, false),
		s.Meta(vault, false, true),
	)
	p, err := b.pack(strategist, []solana.PublicKey{strategist}, s.SetComputeUnitLimit(200_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Mark vault as closing"
	return p, nil
}

func (b *Builder) UnlockLicense(strategist solana.PublicKey) (*Prepared, error) {
	ata := s.ATA(b.License, strategist)
	ixs := []solana.Instruction{
		s.SetComputeUnitLimit(300_000),
		s.CreateIdempotentATA(strategist, strategist, b.License),
		s.Ix(b.Program, s.DiscUnlockLicense,
			s.Meta(strategist, true, true),
			s.Meta(b.Protocol, false, false),
			s.Meta(s.StrategistPDA(b.Program, strategist), false, true),
			s.Meta(s.LicensePDA(b.Program, strategist), false, true),
			s.Meta(s.LicenseVaultPDA(b.Program, strategist), false, true),
			s.Meta(ata, false, true),
			s.Meta(s.TokenProgramID, false, false),
		),
	}
	p, err := b.pack(strategist, []solana.PublicKey{strategist}, ixs...)
	if err != nil {
		return nil, err
	}
	p.Message = "Unlock licence after all vaults closed"
	return p, nil
}

func (b *Builder) CreateInvestorConfig(investor, vault solana.PublicKey) (*Prepared, error) {
	if err := b.requireVaultActive(vault); err != nil {
		return nil, err
	}
	cfg := s.InvestorConfigPDA(b.Program, vault, investor)
	ix := s.Ix(b.Program, s.DiscCreateInvestorCfg,
		s.Meta(investor, true, true),
		s.Meta(b.Protocol, false, false),
		s.Meta(vault, false, false),
		s.Meta(cfg, false, true),
		s.Meta(s.SystemProgramID, false, false),
	)
	p, err := b.pack(investor, []solana.PublicKey{investor}, s.SetComputeUnitLimit(200_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Create investor config PDA"
	p.Accounts = map[string]string{"investorConfig": cfg.String()}
	return p, nil
}

type RequestTradeParams struct {
	Strategist       solana.PublicKey
	Vault            solana.PublicKey
	ShareAta         solana.PublicKey
	InputMint        solana.PublicKey
	OutputMint       solana.PublicKey
	TradeID          uint64
	Amount           uint64
	Action           string // buy|sell
	PositionMode     string // fixed|percentage
	SlippageBps      uint16
	MinAmountOut     uint64
	TakeProfit       uint16
	StopLoss         uint16
	LinkedPositionID uint64
	PriorityFeeMicro uint64 // gas tip (micro-lamports / CU)
	ComputeUnitLimit uint32
}

func (b *Builder) RequestTrade(p RequestTradeParams) (*Prepared, error) {
	if p.TradeID == 0 {
		return nil, fmt.Errorf("tradeId required")
	}
	if p.Amount == 0 {
		return nil, fmt.Errorf("amount required")
	}
	if p.InputMint.IsZero() {
		p.InputMint = s.WSOL
	}
	if p.ShareAta.IsZero() {
		p.ShareAta = s.ATA(s.ShareMintPDA(b.Program, p.Vault), p.Strategist)
	}
	if p.Action == "" {
		p.Action = "buy"
	}
	trade := s.TradePDA(b.Program, p.Vault, p.TradeID)
	data := requestTradeData(p)
	ix := s.Ix(b.Program, data,
		s.Meta(p.Strategist, true, true),
		s.Meta(b.Protocol, false, false),
		s.Meta(p.Vault, false, true),
		s.Meta(s.LicensePDA(b.Program, p.Strategist), false, false),
		s.Meta(trade, false, true),
		s.Meta(s.SystemProgramID, false, false),
		s.Meta(p.ShareAta, false, false),
	)
	cu := p.ComputeUnitLimit
	if cu == 0 {
		cu = 400_000
	}
	priority := p.PriorityFeeMicro
	if priority == 0 {
		priority = 100_000
	}
	out, err := b.packWithBudget(p.Strategist, []solana.PublicKey{p.Strategist}, cu, priority, ix)
	if err != nil {
		return nil, err
	}
	out.Message = fmt.Sprintf("Request %s trade (slippage=%dbps tp=%d sl=%d)", p.Action, p.SlippageBps, p.TakeProfit, p.StopLoss)
	out.Accounts = map[string]string{
		"strategist":    p.Strategist.String(),
		"vault":         p.Vault.String(),
		"tradeRequest":  trade.String(),
		"tradeId":       fmt.Sprintf("%d", p.TradeID),
		"inputMint":     p.InputMint.String(),
		"outputMint":    p.OutputMint.String(),
		"shareAta":      p.ShareAta.String(),
		"action":        p.Action,
		"slippageBps":   fmt.Sprintf("%d", p.SlippageBps),
		"takeProfitBps": fmt.Sprintf("%d", p.TakeProfit),
		"stopLossBps":   fmt.Sprintf("%d", p.StopLoss),
	}
	return out, nil
}

type ExecuteTradeParams struct {
	Strategist       solana.PublicKey
	Vault            solana.PublicKey
	TradeID          uint64
	VaultInputToken  solana.PublicKey
	VaultOutputToken solana.PublicKey
	// SwapData empty = direct on-chain fill (no Jupiter CPI).
	SwapData         []byte
	PriorityFeeMicro uint64
	ComputeUnitLimit uint32
}

// ExecuteTrade prepares execute_trade with auto-selected DEX from PROGRAM_IDS (client does not choose).
func (b *Builder) ExecuteTrade(p ExecuteTradeParams) (*Prepared, error) {
	if p.TradeID == 0 {
		return nil, fmt.Errorf("tradeId required")
	}
	if p.VaultInputToken.IsZero() || p.VaultOutputToken.IsZero() {
		return nil, fmt.Errorf("vaultInputToken and vaultOutputToken required")
	}
	dex, err := b.AutoDexProgramDefault()
	if err != nil {
		return nil, err
	}
	trade := s.TradePDA(b.Program, p.Vault, p.TradeID)
	data := s.Concat(s.DiscExecuteTrade, s.EncodeBytes(p.SwapData))
	ix := s.Ix(b.Program, data,
		s.Meta(p.Strategist, true, true),
		s.Meta(b.Protocol, false, false),
		s.Meta(p.Vault, false, true),
		s.Meta(s.LicensePDA(b.Program, p.Strategist), false, false),
		s.Meta(trade, false, true),
		s.Meta(dex, false, false),
		s.Meta(p.VaultInputToken, false, true),
		s.Meta(p.VaultOutputToken, false, true),
		s.Meta(s.TokenProgramID, false, false),
	)
	cu := p.ComputeUnitLimit
	if cu == 0 {
		cu = 400_000
	}
	priority := p.PriorityFeeMicro
	if priority == 0 {
		priority = 100_000
	}
	out, err := b.packWithBudget(p.Strategist, []solana.PublicKey{p.Strategist}, cu, priority, ix)
	if err != nil {
		return nil, err
	}
	out.Message = "Execute trade on-chain (DEX auto-selected from PROGRAM_IDS)"
	acc := map[string]string{
		"strategist":       p.Strategist.String(),
		"vault":            p.Vault.String(),
		"tradeRequest":     trade.String(),
		"tradeId":          fmt.Sprintf("%d", p.TradeID),
		"dexProgram":       dex.String(),
		"dexAuto":          "true",
		"vaultInputToken":  p.VaultInputToken.String(),
		"vaultOutputToken": p.VaultOutputToken.String(),
	}
	if len(b.DexMeta) > 0 && b.DexMeta[0].ProgramID == dex.String() {
		acc["dexName"] = b.DexMeta[0].Name
		acc["dexRank"] = "1"
	}
	out.Accounts = acc
	return out, nil
}

type OpenPositionParams struct {
	Strategist       solana.PublicKey
	Vault            solana.PublicKey
	TradeID          uint64
	PositionID       uint64
	EntryValue       uint64
	OutputAmount     uint64
	PriorityFeeMicro uint64
	ComputeUnitLimit uint32
}

func (b *Builder) OpenPosition(p OpenPositionParams) (*Prepared, error) {
	if p.TradeID == 0 || p.PositionID == 0 {
		return nil, fmt.Errorf("tradeId and positionId required")
	}
	trade := s.TradePDA(b.Program, p.Vault, p.TradeID)
	pos := s.VaultPositionPDA(b.Program, p.Vault, p.PositionID)
	data := s.Concat(s.DiscOpenPosition, s.U64LE(p.PositionID), s.U64LE(p.EntryValue), s.U64LE(p.OutputAmount))
	ix := s.Ix(b.Program, data,
		s.Meta(p.Strategist, true, true),
		s.Meta(p.Vault, false, true),
		s.Meta(trade, false, true),
		s.Meta(pos, false, true),
		s.Meta(s.SystemProgramID, false, false),
	)
	cu := p.ComputeUnitLimit
	if cu == 0 {
		cu = 300_000
	}
	priority := p.PriorityFeeMicro
	if priority == 0 {
		priority = 100_000
	}
	out, err := b.packWithBudget(p.Strategist, []solana.PublicKey{p.Strategist}, cu, priority, ix)
	if err != nil {
		return nil, err
	}
	out.Message = "Open vault position from filled trade"
	out.Accounts = map[string]string{
		"tradeRequest": trade.String(),
		"tradeId":      fmt.Sprintf("%d", p.TradeID),
		"vaultPosition": pos.String(),
		"positionId":   fmt.Sprintf("%d", p.PositionID),
	}
	return out, nil
}

func (b *Builder) ClosePosition(strategist, vault, vaultTokenAccount, outputTokenAccount solana.PublicKey, positionID, proceeds uint64) (*Prepared, error) {
	return b.ClosePositionOpts(ExitPositionParams{
		Strategist: strategist, Vault: vault, VaultTokenAccount: vaultTokenAccount,
		OutputTokenAccount: outputTokenAccount, PositionID: positionID, Proceeds: proceeds,
	})
}

type ExitPositionParams struct {
	Strategist         solana.PublicKey
	Vault              solana.PublicKey
	VaultTokenAccount  solana.PublicKey
	OutputTokenAccount solana.PublicKey
	PositionID         uint64
	Proceeds           uint64
	ReduceBps          uint16 // 1-10000; 0 or 10000 = full close via close_position
	PriorityFeeMicro   uint64
	ComputeUnitLimit   uint32
}

func (b *Builder) ClosePositionOpts(p ExitPositionParams) (*Prepared, error) {
	pos := s.VaultPositionPDA(b.Program, p.Vault, p.PositionID)
	data := s.Concat(s.DiscClosePosition, s.U64LE(p.Proceeds))
	ix := s.Ix(b.Program, data,
		s.Meta(p.Strategist, true, true),
		s.Meta(p.Vault, false, true),
		s.Meta(pos, false, true),
		s.Meta(p.VaultTokenAccount, false, true),
		s.Meta(p.OutputTokenAccount, false, true),
		s.Meta(s.TokenProgramID, false, false),
		s.Meta(s.SystemProgramID, false, false),
	)
	cu := p.ComputeUnitLimit
	if cu == 0 {
		cu = 400_000
	}
	out, err := b.packWithBudget(p.Strategist, []solana.PublicKey{p.Strategist}, cu, p.PriorityFeeMicro, ix)
	if err != nil {
		return nil, err
	}
	out.Message = "Close vault position (full exit)"
	out.Accounts = map[string]string{
		"vaultPosition": s.VaultPositionPDA(b.Program, p.Vault, p.PositionID).String(),
		"positionId":    fmt.Sprintf("%d", p.PositionID),
		"exitPercent":   "100",
	}
	return out, nil
}

func (b *Builder) ReducePosition(p ExitPositionParams) (*Prepared, error) {
	if p.ReduceBps == 0 || p.ReduceBps > 10_000 {
		return nil, fmt.Errorf("reduceBps must be 1..10000 (percent*100)")
	}
	pos := s.VaultPositionPDA(b.Program, p.Vault, p.PositionID)
	data := s.Concat(s.DiscReducePosition, s.U16LE(p.ReduceBps), s.U64LE(p.Proceeds))
	ix := s.Ix(b.Program, data,
		s.Meta(p.Strategist, true, false),
		s.Meta(p.Vault, false, true),
		s.Meta(pos, false, true),
		s.Meta(p.VaultTokenAccount, false, true),
		s.Meta(p.OutputTokenAccount, false, true),
		s.Meta(s.TokenProgramID, false, false),
	)
	cu := p.ComputeUnitLimit
	if cu == 0 {
		cu = 400_000
	}
	out, err := b.packWithBudget(p.Strategist, []solana.PublicKey{p.Strategist}, cu, p.PriorityFeeMicro, ix)
	if err != nil {
		return nil, err
	}
	out.Message = fmt.Sprintf("Reduce/sell position by %d bps (%.2f%%)", p.ReduceBps, float64(p.ReduceBps)/100)
	out.Accounts = map[string]string{
		"vaultPosition": pos.String(),
		"positionId":    fmt.Sprintf("%d", p.PositionID),
		"exitBps":       fmt.Sprintf("%d", p.ReduceBps),
		"exitPercent":   fmt.Sprintf("%.2f", float64(p.ReduceBps)/100),
	}
	return out, nil
}

// ExitPosition picks reduce_position (partial) or close_position (100%).
func (b *Builder) ExitPosition(p ExitPositionParams) (*Prepared, error) {
	if p.ReduceBps == 0 || p.ReduceBps >= 10_000 {
		return b.ClosePositionOpts(p)
	}
	return b.ReducePosition(p)
}

type InvestorConfigParams struct {
	AutoFollow        *bool
	AllocationMode    *uint8 // 0 Fixed, 1 Percentage, 2 Proportional
	PositionSize      *uint64
	MaxPositionBps    *uint16
	MaxExposureBps    *uint16
	MaxOpenPositions  *uint8
	FollowPartialExit *bool
	FollowFullExit    *bool
	FollowTpSl        *bool
	MaxSlippageBps    *uint16
	TakeProfitBps     *uint16
	StopLossBps       *uint16
}

func encodeOptBool(v *bool) []byte {
	if v == nil {
		return []byte{0}
	}
	b := byte(0)
	if *v {
		b = 1
	}
	return []byte{1, b}
}

func encodeOptU8(v *uint8) []byte {
	if v == nil {
		return []byte{0}
	}
	return []byte{1, *v}
}

func encodeOptU16(v *uint16) []byte {
	if v == nil {
		return []byte{0}
	}
	return s.Concat([]byte{1}, s.U16LE(*v))
}

func encodeOptU64(v *uint64) []byte {
	if v == nil {
		return []byte{0}
	}
	return s.Concat([]byte{1}, s.U64LE(*v))
}

func encodeInvestorConfigParams(p InvestorConfigParams) []byte {
	return s.Concat(
		encodeOptBool(p.AutoFollow),
		encodeOptU8(p.AllocationMode),
		encodeOptU64(p.PositionSize),
		encodeOptU16(p.MaxPositionBps),
		encodeOptU16(p.MaxExposureBps),
		encodeOptU8(p.MaxOpenPositions),
		encodeOptBool(p.FollowPartialExit),
		encodeOptBool(p.FollowFullExit),
		encodeOptBool(p.FollowTpSl),
		encodeOptU16(p.MaxSlippageBps),
		encodeOptU16(p.TakeProfitBps),
		encodeOptU16(p.StopLossBps),
	)
}

func (b *Builder) UpdateInvestorConfig(investor, vault solana.PublicKey, params InvestorConfigParams) (*Prepared, error) {
	if err := b.requireVaultActive(vault); err != nil {
		return nil, err
	}
	cfg := s.InvestorConfigPDA(b.Program, vault, investor)
	data := s.Concat(s.DiscUpdateInvestorCfg, encodeInvestorConfigParams(params))
	ix := s.Ix(b.Program, data,
		s.Meta(investor, true, true),
		s.Meta(vault, false, false),
		s.Meta(cfg, false, true),
		s.Meta(s.SystemProgramID, false, false),
	)
	p, err := b.pack(investor, []solana.PublicKey{investor}, s.SetComputeUnitLimit(200_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Update investor config (TP/SL, allocation, auto-follow)"
	p.Accounts = map[string]string{"investorConfig": cfg.String(), "investor": investor.String()}
	return p, nil
}

func (b *Builder) FollowOn(investor, vault solana.PublicKey) (*Prepared, error) {
	cfg := s.InvestorConfigPDA(b.Program, vault, investor)
	ix := s.Ix(b.Program, s.DiscFollowOn,
		s.Meta(investor, true, false),
		s.Meta(vault, false, false),
		s.Meta(cfg, false, true),
	)
	p, err := b.pack(investor, []solana.PublicKey{investor}, s.SetComputeUnitLimit(100_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Enable auto-follow"
	return p, nil
}

func (b *Builder) FollowOff(investor, vault solana.PublicKey) (*Prepared, error) {
	cfg := s.InvestorConfigPDA(b.Program, vault, investor)
	ix := s.Ix(b.Program, s.DiscFollowOff,
		s.Meta(investor, true, false),
		s.Meta(vault, false, false),
		s.Meta(cfg, false, true),
	)
	p, err := b.pack(investor, []solana.PublicKey{investor}, s.SetComputeUnitLimit(100_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Disable auto-follow"
	return p, nil
}

func (b *Builder) UpdateNav(payer, vault, vaultTokenAccount solana.PublicKey) (*Prepared, error) {
	ix := s.Ix(b.Program, s.DiscUpdateNav,
		s.Meta(vault, false, true),
		s.Meta(vaultTokenAccount, false, false),
	)
	p, err := b.pack(payer, []solana.PublicKey{payer}, s.SetComputeUnitLimit(200_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Refresh vault NAV from token account"
	return p, nil
}

// HolderMeta is one share holder for close_vault remaining accounts.
type HolderMeta struct {
	Owner    solana.PublicKey
	ShareAta solana.PublicKey
}

func (b *Builder) CloseVault(strategist, vault, vaultTokenAccount solana.PublicKey, holders []HolderMeta) (*Prepared, error) {
	if err := b.requireCurrentVaultLayout(vault); err != nil {
		return nil, err
	}
	metas := []solana.AccountMeta{
		s.Meta(strategist, true, true),
		s.Meta(s.StrategistPDA(b.Program, strategist), false, true),
		s.Meta(vault, false, true),
		s.Meta(vaultTokenAccount, false, true),
		s.Meta(s.VaultLicensePDA(b.Program, vault), false, true),
		s.Meta(s.ATA(b.License, strategist), false, true),
		s.Meta(s.TokenProgramID, false, false),
		s.Meta(s.WSOL, false, false),
		s.Meta(s.SystemProgramID, false, false),
	}
	for _, h := range holders {
		metas = append(metas,
			s.Meta(h.ShareAta, false, false),
			s.Meta(s.FeeUnwrapPDA(b.Program, vault, h.Owner), false, true),
			s.Meta(h.Owner, false, true),
		)
	}
	ix := s.Ix(b.Program, s.DiscCloseVault, metas...)
	p, err := b.pack(strategist, []solana.PublicKey{strategist}, s.SetComputeUnitLimit(1_200_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Close vault and payout remaining SOL by share weight"
	return p, nil
}

func (b *Builder) KeeperRefresh(payer, vault, vaultTokenAccount solana.PublicKey) (*Prepared, error) {
	ix := s.Ix(b.Program, s.DiscKeeperRefresh,
		s.Meta(vault, false, true),
		s.Meta(vaultTokenAccount, false, false),
	)
	p, err := b.pack(payer, []solana.PublicKey{payer}, s.SetComputeUnitLimit(200_000), ix)
	if err != nil {
		return nil, err
	}
	p.Message = "Keeper refresh vault accounting"
	return p, nil
}
