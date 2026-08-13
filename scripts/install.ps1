$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 20 or later is required."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is required."
}

$NodeMajor = [int]((node -p 'process.versions.node.split(".")[0]').Trim())
if ($NodeMajor -lt 20) {
    throw "Node.js 20 or later is required (found $(node --version))."
}

Push-Location $RepoRoot
try {
    Write-Host "Installing project dependencies..."
    # The source installer builds with tsc, so dependency lifecycle hooks are unnecessary here.
    npm install --ignore-scripts --no-package-lock
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

    Write-Host "Checking and building Codex Shift..."
    npm run check
    if ($LASTEXITCODE -ne 0) { throw "npm run check failed." }

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }

    # Install from the built local package so the command is available outside this repository.
    Write-Host "Installing the codex-shift command globally..."
    npm install --global $RepoRoot
    if ($LASTEXITCODE -ne 0) { throw "Global installation failed." }
}
finally {
    Pop-Location
}

Write-Host "Codex Shift installed successfully. Run: codex-shift --help"
