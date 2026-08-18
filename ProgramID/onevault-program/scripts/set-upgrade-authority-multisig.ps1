# Transfer Solana program upgrade authority to Squads multisig
# Run AFTER initialize_upgrade_multisig on-chain

param(
    [Parameter(Mandatory = $true)]
    [string]$ProgramId,

    [Parameter(Mandatory = $true)]
    [string]$SquadsMultisig,

    [string]$Cluster = "devnet"
)

Write-Host "Setting upgrade authority for $ProgramId -> $SquadsMultisig ($Cluster)"

solana program set-upgrade-authority $ProgramId `
    --new-upgrade-authority $SquadsMultisig `
    --url $Cluster

Write-Host "Done. Future anchor upgrade commands must be signed by the Squads multisig."
