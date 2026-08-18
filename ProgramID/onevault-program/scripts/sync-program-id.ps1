# Sync 1Vault Program ID & keypair
# Run from onevault-program/

param(
    [switch]$GenerateNew
)

$ErrorActionPreference = "Stop"
$DeployDir = Join-Path $PSScriptRoot "..\target\deploy"
$KeypairPath = Join-Path $DeployDir "onevault-keypair.json"

Write-Host "=== 1Vault Program ID Sync ===" -ForegroundColor Cyan

if (-not (Test-Path $DeployDir)) {
    New-Item -ItemType Directory -Path $DeployDir -Force | Out-Null
}

if ($GenerateNew -or -not (Test-Path $KeypairPath)) {
    Write-Host "Generating new program keypair..." -ForegroundColor Yellow
    if (-not (Get-Command solana-keygen -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: solana-keygen not found. Install Solana CLI first." -ForegroundColor Red
        Write-Host "  sh -c `"`$(curl -sSfL https://release.anza.xyz/stable/install)`""
        exit 1
    }
    solana-keygen new -o $KeypairPath --no-bip39-passphrase --force
}

if (-not (Get-Command anchor -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: anchor CLI not found." -ForegroundColor Red
    exit 1
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
    Write-Host "Running anchor keys sync..." -ForegroundColor Yellow
    anchor keys sync

    $pubkey = ""
    if (Get-Command solana-keygen -ErrorAction SilentlyContinue) {
        $pubkey = (solana-keygen pubkey $KeypairPath 2>$null)
    }

    Write-Host ""
    Write-Host "=== Done ===" -ForegroundColor Green
    if ($pubkey) {
        Write-Host "Program ID: $pubkey"
    }
    Write-Host "Keypair:    $KeypairPath"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Update sdk/constants.ts ONEVAULT_PROGRAM_ID if changed"
    Write-Host "  2. anchor build"
    Write-Host "  3. Copy target/idl/onevault.json to frontend/backend"
}
finally {
    Pop-Location
}
