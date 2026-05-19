# RUPickups – start backend + frontend with one command (handles setup from scratch)
# Usage: .\start.ps1
# If you get "script execution disabled", run once: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot
$backendProc = $null

function Stop-Backend {
    if ($backendProc -and -not $backendProc.HasExited) {
        Write-Host ""
        Write-Host "Stopping backend (PID $($backendProc.Id))..."
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
}

# Backend venv
if (-not (Test-Path "$ROOT\backend\venv")) {
    Write-Host "Creating backend virtual environment..."
    Push-Location "$ROOT\backend"
    try {
        $venvCmd = Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $venvCmd) { $venvCmd = Get-Command py -ErrorAction SilentlyContinue | Select-Object -First 1 }
        if (-not $venvCmd) { throw "Python not found. Install Python and ensure 'python' or 'py' is in PATH." }
        & $venvCmd.Name -m venv venv
        if ($LASTEXITCODE -ne 0) { throw "python -m venv failed" }
    } finally {
        Pop-Location
    }
}

# Backend dependencies
Write-Host "Ensuring backend dependencies are installed..."
$pip = "$ROOT\backend\venv\Scripts\pip.exe"
if (-not (Test-Path $pip)) { $pip = "$ROOT\backend\venv\Scripts\pip3.exe" }
Push-Location "$ROOT\backend"
try {
    & $pip install -q -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
} finally {
    Pop-Location
}

# Backend .env
$NEED_ENV = $false
if (-not (Test-Path "$ROOT\backend\.env")) {
    if (Test-Path "$ROOT\backend\.env.example") {
        Write-Host "Creating backend/.env from .env.example."
        Copy-Item "$ROOT\backend\.env.example" "$ROOT\backend\.env"
    } else {
        New-Item -Path "$ROOT\backend\.env" -ItemType File -Force | Out-Null
        Write-Host "Created empty backend/.env."
    }
    $NEED_ENV = $true
}

# Frontend .env
if (-not (Test-Path "$ROOT\frontend\.env")) {
    if (Test-Path "$ROOT\frontend\.env.example") {
        Write-Host "Creating frontend/.env from .env.example."
        Copy-Item "$ROOT\frontend\.env.example" "$ROOT\frontend\.env"
    } else {
        New-Item -Path "$ROOT\frontend\.env" -ItemType File -Force | Out-Null
        Write-Host "Created empty frontend/.env."
    }
    $NEED_ENV = $true
}

if ($NEED_ENV) {
    Write-Host ""
    Write-Host "Edit backend/.env (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET)"
    Write-Host "and frontend/.env (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY), then run .\start.ps1 again."
    exit 1
}

# Frontend dependencies
if (-not (Test-Path "$ROOT\frontend\node_modules")) {
    Write-Host "Installing frontend dependencies..."
    Push-Location "$ROOT\frontend"
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    } finally {
        Pop-Location
    }
}

# ---- Run ----

Write-Host "Starting backend (FastAPI) at http://127.0.0.1:8000 ..."
$python = "$ROOT\backend\venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }
$backendProc = Start-Process -FilePath $python -ArgumentList "-m", "uvicorn", "app.main:app", "--reload" -WorkingDirectory "$ROOT\backend" -PassThru -NoNewWindow

# Give backend a moment to bind
Start-Sleep -Seconds 2

Write-Host "Starting frontend (Expo)..."
Write-Host ""

try {
    Push-Location "$ROOT\frontend"
    & npx expo start
} finally {
    Stop-Backend
    Pop-Location
}
