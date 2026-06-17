# ── Proton Calculator – GitHub Setup Script ──
# Run this once from the app folder: .\setup-github.ps1

$TOKEN    = $env:GITHUB_TOKEN
$REPONAME = "proton-calculator"
$HEADERS  = @{ Authorization = "token $TOKEN"; "User-Agent" = "setup-script" }

Write-Host "`n[1/4] Getting GitHub username..." -ForegroundColor Cyan
$user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $HEADERS
$USERNAME = $user.login
Write-Host "    Logged in as: $USERNAME" -ForegroundColor Green

Write-Host "`n[2/4] Creating repo '$REPONAME'..." -ForegroundColor Cyan
$body = @{ name = $REPONAME; private = $false; description = "Proton Cacu Calculator" } | ConvertTo-Json
try {
    $repo = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $HEADERS -Body $body -ContentType "application/json"
    Write-Host "    Repo created: $($repo.html_url)" -ForegroundColor Green
} catch {
    Write-Host "    Repo mungkin dah ada, teruskan..." -ForegroundColor Yellow
}

$REMOTE = "https://${TOKEN}@github.com/${USERNAME}/${REPONAME}.git"

Write-Host "`n[3/4] Init git dan stage files..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
git init
git config user.email "izzifnexasolutions@gmail.com"
git config user.name $USERNAME
git add .
git commit -m "Initial commit: Proton Cacu Calculator"

Write-Host "`n[4/4] Push ke GitHub..." -ForegroundColor Cyan
git branch -M main
git remote remove origin 2>$null
git remote add origin $REMOTE
git push -u origin main

Write-Host "`n✅ Done! Repo kau: https://github.com/$USERNAME/$REPONAME" -ForegroundColor Green
Write-Host "   Sekarang connect repo tu ke Vercel dan deploy!`n" -ForegroundColor Green
