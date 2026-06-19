Set-Location "C:\Users\MAMAT\Downloads\Kimi_Agent_Proton Loan Update\app"

Get-ChildItem ".git\*.lock" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force

# Remove api/config.js if it still exists in git
git rm api/config.js 2>$null

git add public/calculator.html
git add public/media-settings.html
git add vercel.json

git commit -m "Add variant media showroom: per-variant slideshows, settings manager, Supabase integration"
git push origin main --force

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host "Tunggu 1-2 minit lepas tu refresh Vercel."
Write-Host ""
Write-Host "PENTING: Jalankan SQL di Supabase dashboard dulu!" -ForegroundColor Yellow
Write-Host "Tekan Enter untuk tutup..."
Read-Host
