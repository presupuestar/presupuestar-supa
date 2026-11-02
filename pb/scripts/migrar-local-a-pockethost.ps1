$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$importer = Join-Path $projectRoot 'app\scripts\importar-local-a-pockethost.mjs'
if (-not (Test-Path -LiteralPath $importer)) {
  throw "No se encuentra el importador: $importer"
}

$email = Read-Host 'Correo del superusuario de PocketHost'
$securePassword = Read-Host 'Contraseña del superusuario de PocketHost' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:PB_SUPER_EMAIL = $email
  $env:PB_SUPER_PASS = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $env:PB_URL = 'https://presupuestar-sy.pockethost.io'
  Push-Location (Join-Path $projectRoot 'app')
  try {
    node $importer
    if ($LASTEXITCODE -ne 0) { throw "La importación terminó con código $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item Env:PB_SUPER_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:PB_SUPER_PASS -ErrorAction SilentlyContinue
  Remove-Item Env:PB_URL -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $securePassword.Dispose()
}
