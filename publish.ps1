# Publish Logcat Studio to GitHub Pages
# Requires: GitHub CLI (gh) logged in — run: gh auth login

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

$gh = "$env:TEMP\gh-cli\bin\gh.exe"
if (-not (Test-Path $gh)) {
  Write-Host "Downloading GitHub CLI..."
  $ghZip = "$env:TEMP\gh.zip"
  $ghDir = "$env:TEMP\gh-cli"
  Invoke-WebRequest -Uri "https://github.com/cli/cli/releases/download/v2.63.2/gh_2.63.2_windows_amd64.zip" -OutFile $ghZip -UseBasicParsing
  Expand-Archive -Path $ghZip -DestinationPath $ghDir -Force
}

& $gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Please log in first:" -ForegroundColor Yellow
  Write-Host "  & `"$gh`" auth login"
  exit 1
}

$owner = "dhavalsolanki1095"
$repo = "LogcatStudio"

Write-Host "Creating repository $owner/$repo (if needed)..."
$exists = & $gh repo view "$owner/$repo" 2>$null
if ($LASTEXITCODE -ne 0) {
  & $gh repo create "$owner/$repo" --public --description "Extract, clean, format, and explore JSON from Android Studio Logcat" --source=. --remote=origin --push
} else {
  Write-Host "Repository exists — pushing main..."
  git push -u origin main
}

Write-Host "Enabling GitHub Pages (branch: main, path: /)..."
& $gh api -X POST "/repos/$owner/$repo/pages" -f "build_type=legacy" -f "source[branch]=main" -f "source[path]=/" 2>$null
if ($LASTEXITCODE -ne 0) {
  & $gh api -X PUT "/repos/$owner/$repo/pages" -f "build_type=legacy" -f "source[branch]=main" -f "source[path]=/"
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "Live site: https://$owner.github.io/$repo/" -ForegroundColor Cyan
Write-Host "Repository: https://github.com/$owner/$repo" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pages may take 1-2 minutes to become available after the first deploy."
