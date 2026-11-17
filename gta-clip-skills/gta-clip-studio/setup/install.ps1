# GTA Clipping Studio - Windows installer.
# Installs what is missing (Python 3.12, ffmpeg full build, Node.js LTS) with winget, then runs setup.py.
# Run:  powershell -ExecutionPolicy Bypass -File setup\install.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
    $m = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $u = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$m;$u"
}
function Winget-Install($id, $label) {
    if (-not (Have "winget")) {
        throw "winget is not available. Install '$label' by hand, then run this again."
    }
    Write-Host "Installing $label ($id) ..."
    winget install --id $id -e --silent --accept-source-agreements --accept-package-agreements
    Refresh-Path
}

Write-Host "== GTA Clipping Studio setup (Windows) =="

# Python 3.10+ (prefer the py launcher)
$py = $null
if (Have "py") { try { & py -3.12 -c "import sys" 2>$null; if ($LASTEXITCODE -eq 0) { $py = @("py", "-3.12") } } catch {} }
if (-not $py -and (Have "python")) {
    $v = & python -c "import sys; print(sys.version_info >= (3, 10))" 2>$null
    if ($v -eq "True") { $py = @("python") }
}
if (-not $py) {
    Winget-Install "Python.Python.3.12" "Python 3.12"
    if (Have "py") { $py = @("py", "-3.12") } else { $py = @("python") }
}

# ffmpeg (full build: NVENC + libass subtitles)
$needFF = -not (Have "ffmpeg")
if (-not $needFF) {
    $f = & ffmpeg -hide_banner -filters 2>$null | Out-String
    if ($f -notmatch " subtitles ") { $needFF = $true }
}
if ($needFF) { Winget-Install "Gyan.FFmpeg" "ffmpeg (full build)" }

# Node.js (yt-dlp uses it for YouTube, Playwright renders overlays)
if (-not (Have "node")) { Winget-Install "OpenJS.NodeJS.LTS" "Node.js LTS" }

Refresh-Path
$exe = $py[0]; $args0 = @(); if ($py.Count -gt 1) { $args0 = $py[1..($py.Count - 1)] }
& $exe @args0 (Join-Path $Root "setup\setup.py")
exit $LASTEXITCODE
