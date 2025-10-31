
<# 
  tools\validate.ps1
  HATPro schema validation helper
  --------------------------------
  Validates JSON samples against a given root schema using AJV (draft-2020-12).
  - Runs both "valid" and "invalid" sample sets.
  - Loads all schemas/enums via -r globs so $ref URLs resolve.
  - Prints a PASS/FAIL summary.

  Usage examples (from repo root):

    # 1) Validate samples for TechString (PowerShell)
    powershell -ExecutionPolicy Bypass -File tools\validate.ps1 `
      -Schema packages\core\json\schemas\commonLib\TechString.schema.json

    # 2) Verbose logging + auto install dev deps (ajv, ajv-formats, ajv-cli)
    powershell -ExecutionPolicy Bypass -File tools\validate.ps1 `
      -Schema packages\core\json\schemas\commonLib\TechString.schema.json `
      -InstallDeps -VerboseLog

  Notes:
    - Requires Node.js. On first run with -InstallDeps, this script will run:
        npm i -D ajv ajv-formats ajv-cli
#>

param(
  [Parameter(Mandatory=$true)]
  [string] $Schema,

  [string] $ValidDir   = "samples\valid",
  [string] $InvalidDir = "samples\invalid",

  [string] $SchemasGlob = "packages\**\json\schemas\**\*.schema.json",
  [string] $EnumsGlob   = "packages\**\json\enums\**\*.json",

  [switch] $InstallDeps,
  [switch] $VerboseLog
)

function Write-Info($msg)  { Write-Host "[INFO ] $msg" -ForegroundColor Cyan }
function Write-Okay($msg)  { Write-Host "[ OK  ] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN ] $msg" -ForegroundColor Yellow }
function Write-Err ($msg)  { Write-Host "[FAIL ] $msg" -ForegroundColor Red }

function Ensure-Ajv {
  if ($InstallDeps) {
    Write-Info "Installing dev deps: ajv, ajv-formats, ajv-cli"
    npm i -D ajv ajv-formats ajv-cli | Out-Null
  }
  Write-Info "Checking AJV CLI availability (via npx)"
  $proc = Start-Process -FilePath "npx" -ArgumentList @("ajv","-h") -NoNewWindow -PassThru -Wait -ErrorAction SilentlyContinue
  if ($null -eq $proc -or $proc.ExitCode -ne 0) {
    Write-Err "AJV CLI not available. Re-run with -InstallDeps or install manually: npm i -D ajv ajv-formats ajv-cli"
    exit 1
  } else {
    Write-Okay "AJV CLI is available."
  }
}

function Invoke-AjvValidateOne {
  param(
    [Parameter(Mandatory=$true)][string] $SchemaPath,
    [Parameter(Mandatory=$true)][string] $DataPath
  )
  $args = @(
    "ajv","validate",
    "-s", $SchemaPath,
    "-d", $DataPath,
    "-r", $SchemasGlob,
    "-r", $EnumsGlob,
    "-c", "ajv-formats",
    "--spec=draft2020",
    "--all-errors"
  )
  if ($VerboseLog) { Write-Host "npx $($args -join ' ')" -ForegroundColor DarkGray }
  $p = Start-Process -FilePath "npx" -ArgumentList $args -NoNewWindow -PassThru -Wait
  return $p.ExitCode
}

function Validate-Dir {
  param(
    [Parameter(Mandatory=$true)][string] $SchemaPath,
    [Parameter(Mandatory=$true)][string] $Dir,
    [Parameter(Mandatory=$true)][bool]   $ExpectPass
  )
  if (-not (Test-Path $Dir)) {
    Write-Warn "Directory not found: $Dir  (skipping)"
    return @{ Total=0; Passed=0; Failed=0 }
  }

  $files = Get-ChildItem -Path $Dir -Filter *.json -Recurse
  if ($files.Count -eq 0) {
    Write-Warn "No JSON files found in: $Dir"
    return @{ Total=0; Passed=0; Failed=0 }
  }

  $total = 0; $passed = 0; $failed = 0
  foreach ($f in $files) {
    $total++
    $exit = Invoke-AjvValidateOne -SchemaPath $SchemaPath -DataPath $f.FullName
    $isPass = ($exit -eq 0)
    if ($ExpectPass) {
      if ($isPass) { $passed++; Write-Okay "VALID   $($f.FullName)" }
      else         { $failed++; Write-Err  "INVALID $($f.FullName)" }
    } else {
      if (-not $isPass) { $passed++; Write-Okay "EXPECTED FAIL $($f.FullName)" }
      else              { $failed++; Write-Err  "UNEXPECTED PASS $($f.FullName)" }
    }
  }
  return @{ Total=$total; Passed=$passed; Failed=$failed }
}

# ---- main ----
Write-Info "Root schema : $Schema"
Write-Info "SchemasGlob : $SchemasGlob"
Write-Info "EnumsGlob   : $EnumsGlob"
Write-Info "Valid dir   : $ValidDir"
Write-Info "Invalid dir : $InvalidDir"

Ensure-Ajv

$sumValid   = Validate-Dir -SchemaPath $Schema -Dir $ValidDir   -ExpectPass:$true
$sumInvalid = Validate-Dir -SchemaPath $Schema -Dir $InvalidDir -ExpectPass:$false

$grandTotal = $sumValid.Total + $sumInvalid.Total
$grandPass  = $sumValid.Passed + $sumInvalid.Passed
$grandFail  = $sumValid.Failed + $sumInvalid.Failed

Write-Host ""
Write-Host "==================== SUMMARY ====================" -ForegroundColor White
Write-Host (" Valid   : {0,3} files → Passed: {1,3}  Failed: {2,3}" -f $sumValid.Total, $sumValid.Passed, $sumValid.Failed)
Write-Host (" Invalid : {0,3} files → Passed: {1,3}  Failed: {2,3}" -f $sumInvalid.Total, $sumInvalid.Passed, $sumInvalid.Failed)
Write-Host (" Total   : {0,3} files → Passed: {1,3}  Failed: {2,3}" -f $grandTotal,   $grandPass,      $grandFail)

if ($grandFail -eq 0) {
  Write-Okay "All checks passed."
  exit 0
} else {
  Write-Err "Some checks failed."
  exit 1
}
