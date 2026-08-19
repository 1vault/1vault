$ErrorActionPreference = "Stop"
$solanaBin = Join-Path $env:USERPROFILE ".local\share\solana\install\active_release\bin"
$env:PATH = "$solanaBin;$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:HOME = $env:USERPROFILE

$root = Split-Path $PSScriptRoot -Parent
$so = Join-Path $root "target\deploy\onevault.so"
if (-not (Test-Path $so)) {
  throw "missing onevault.so"
}

$rpc = $null
$envFile = Join-Path $root "..\onevault-indexer\.env"
foreach ($line in Get-Content $envFile) {
  if ($line -match '^RPC_URL=(.+)$') {
    $rpc = $Matches[1].Trim()
    break
  }
}
if (-not $rpc) {
  throw "RPC_URL missing"
}

$programId = "2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP"
$size = (Get-Item $so).Length
Write-Host "deploying so size=$size"
solana program deploy $so --program-id $programId --url $rpc --use-rpc --max-sign-attempts 100 --with-compute-unit-price 5000
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "upgrade ok"
solana program show $programId --url $rpc | Select-String -Pattern "Program Id|Last Deployed|Authority|Balance"
exit 0
