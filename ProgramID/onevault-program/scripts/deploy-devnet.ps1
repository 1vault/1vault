# Deploy 1Vault to Solana Devnet
# Run from project root (onevault-program/)

Write-Host "=== 1Vault Devnet Deploy ===" -ForegroundColor Cyan

# Check prerequisites
if (-not (Get-Command solana -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Solana CLI not found." -ForegroundColor Red
    Write-Host "Install: sh -c `"`$(curl -sSfL https://release.anza.xyz/stable/install)`""
    exit 1
}

if (-not (Get-Command anchor -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Anchor CLI not found." -ForegroundColor Red
    exit 1
}

# Configure devnet
solana config set --url devnet
Write-Host "Cluster: $(solana config get | Select-String 'RPC URL')"

# Check balance
$balance = solana balance 2>&1
Write-Host "Wallet balance: $balance"

if ($balance -match "^0 SOL") {
    Write-Host "Requesting devnet airdrop..."
    solana airdrop 2
}

# Build
Write-Host "`nBuilding program..." -ForegroundColor Yellow
anchor build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Deploy
Write-Host "`nDeploying to devnet..." -ForegroundColor Yellow
anchor deploy --provider.cluster devnet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== Deploy Complete ===" -ForegroundColor Green
Write-Host "Program ID: 2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP"
Write-Host "Next: run initialize_protocol with your treasury and 1VAULT mint"
