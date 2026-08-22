package flow

import (
	"encoding/json"
	"time"

	"github.com/1vault/backend/internal/signing"
	"github.com/google/uuid"
)

type Mode string

const (
	ModeCreateVault     Mode = "create-vault"
	ModeDeposit         Mode = "deposit"
	ModeConfigureFollow Mode = "configure-follow"
	ModeWithdraw        Mode = "withdraw"
	ModeOpenPosition    Mode = "open-position"
	ModeExitPosition    Mode = "exit-position"
	ModeClaimFees       Mode = "claim-fees"
	ModeCloseVault      Mode = "close-vault"
)

type JobStatus string

const (
	StatusPending           JobStatus = "pending"
	StatusAwaitingSignature JobStatus = "awaiting_signature"
	StatusConfirming        JobStatus = "confirming"
	StatusCompleted         JobStatus = "completed"
	StatusFailed            JobStatus = "failed"
	StatusCancelled         JobStatus = "cancelled"
)

type StepStatus string

const (
	StepPending           StepStatus = "pending"
	StepAwaitingSignature StepStatus = "awaiting_signature"
	StepSubmitted         StepStatus = "submitted"
	StepConfirmed         StepStatus = "confirmed"
	StepSkipped           StepStatus = "skipped"
	StepFailed            StepStatus = "failed"
)

type InvestorIn struct {
	Pubkey        string  `json:"pubkey"`
	Role          string  `json:"role"` // strategies|investors (legacy degen|retail accepted)
	Lamports      uint64  `json:"lamports"`
	Shares        uint64  `json:"shares"`
	TakeProfitBps *uint16 `json:"takeProfitBps"`
	StopLossBps   *uint16 `json:"stopLossBps"`
	AutoFollow    *bool   `json:"autoFollow"`
	CopyBps       *uint64 `json:"copyBps"`
}

type StartParams struct {
	Mode              Mode         `json:"mode"`
	Strategist        string       `json:"strategist"`
	Vault             string       `json:"vault"`
	VaultID           uint64       `json:"vaultId"`
	VaultTokenAccount string       `json:"vaultTokenAccount"`
	Name              string       `json:"name"`
	PerformanceFeeBps uint16       `json:"performanceFeeBps"`
	VaultType         string       `json:"vaultType"` // pooled|sliced — off-chain metadata
	Investors         []InvestorIn `json:"investors"`
	// open-position
	OutputMint         string `json:"outputMint"`
	TradeID            uint64 `json:"tradeId"`
	PositionID         uint64 `json:"positionId"`
	Amount             uint64 `json:"amount"`
	EntryValue         uint64 `json:"entryValue"`
	OutputAmount       uint64 `json:"outputAmount"`
	Proceeds           uint64 `json:"proceeds"`
	OutputTokenAccount string `json:"outputTokenAccount"`
	TakeProfitBps      uint16 `json:"takeProfitBps"`
	StopLossBps        uint16 `json:"stopLossBps"`
	FeeWallet          string `json:"feeWallet"`
	SkipClosePosition  bool   `json:"skipClosePosition"`
	SkipClaimFees      bool   `json:"skipClaimFees"`
	// SkipTradeSteps: open-position only — trade already executed on-chain (resume after failed open).
	SkipTradeSteps bool `json:"skipTradeSteps"`
	// exit-position
	ExitPercent      float64 `json:"exitPercent"`
	ExitBps          uint16  `json:"exitBps"`
	SlippageBps      uint16  `json:"slippageBps"`
	MinAmountOut     uint64  `json:"minAmountOut"`
	BaseAmount       uint64  `json:"baseAmount"`
	InputMint        string  `json:"inputMint"`
	PriorityFeeMicro uint64  `json:"priorityFeeMicroLamports"`
	ComputeUnitLimit uint32  `json:"computeUnitLimit"`
	VaultInputToken  string  `json:"vaultInputToken"`
	VaultOutputToken string  `json:"vaultOutputToken"`
	// close-vault holders override (optional; else from vault_holdings)
	Holders []string `json:"holders"`
}

type Job struct {
	ID          uuid.UUID       `json:"id"`
	Cluster     string          `json:"cluster"`
	Mode        Mode            `json:"mode"`
	Status      JobStatus       `json:"status"`
	ActorPubkey string          `json:"actorPubkey"`
	Params      json.RawMessage `json:"params"`
	Context     map[string]any  `json:"context"`
	Error       *string         `json:"error,omitempty"`
	CurrentStep int             `json:"currentStep"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
	Steps       []Step          `json:"steps,omitempty"`
}

type Step struct {
	ID              uuid.UUID       `json:"id"`
	FlowID          uuid.UUID       `json:"flowId"`
	Seq             int             `json:"seq"`
	Name            string          `json:"name"`
	SignerRole      string          `json:"signerRole"`
	SignerPubkey    string          `json:"signerPubkey,omitempty"`
	Status          StepStatus      `json:"status"`
	Prepared        json.RawMessage `json:"prepared,omitempty"`
	RequiredSigners []string          `json:"requiredSigners"`
	SignerDetails   []signing.Detail  `json:"signerDetails,omitempty"`
	Signature       *string         `json:"signature,omitempty"`
	Error           *string         `json:"error,omitempty"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

type plannedStep struct {
	Name         string
	SignerRole   string
	SignerPubkey string
	Meta         map[string]any // lamports, investor index, etc.
}
