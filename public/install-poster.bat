@echo off
chcp 65001 >nul
setlocal
set "SRC=%~dp0"
set "APP=C:\Users\MAMAT\Downloads\Kimi_Agent_Proton Loan Update\app"

echo ==================================================
echo   POSTER KIRAAN LOAN - pemasangan automatik
echo ==================================================
echo.

if not exist "%APP%\.git" (
  echo [X] Folder repo tak dijumpai:
  echo     %APP%
  echo.
  echo     Betulkan baris  set "APP="  dalam fail ini
  echo     supaya menunjuk ke folder proton-calculator kau.
  echo.
  pause
  exit /b 1
)

echo [1/5] Salin fail...
if not exist "%APP%\public" mkdir "%APP%\public"
if not exist "%APP%\tools" mkdir "%APP%\tools"
if not exist "%APP%\public\images" mkdir "%APP%\public\images"
if not exist "%APP%\public\images\poster-bg" mkdir "%APP%\public\images\poster-bg"
copy /Y "%SRC%public\poster.js"                          "%APP%\public\poster.js" >nul
copy /Y "%SRC%tools\poster-smoke-test.cjs"               "%APP%\tools\poster-smoke-test.cjs" >nul
copy /Y "%SRC%supabase_poster_profile.sql"               "%APP%\supabase_poster_profile.sql" >nul
copy /Y "%SRC%public\images\faris-bust.png"              "%APP%\public\images\faris-bust.png" >nul
copy /Y "%SRC%public\images\faris-full.png"              "%APP%\public\images\faris-full.png" >nul
copy /Y "%SRC%public\images\faris.jpg"                   "%APP%\public\images\faris.jpg" >nul
echo     OK

echo [2/5] Tampal butang pada public\calculator.html...
pushd "%APP%"
git apply --ignore-whitespace "%SRC%calculator-poster-button.patch" 2>nul
findstr /c:"pg-open" "public\calculator.html" >nul
if errorlevel 1 (
  echo     patch tidak kena - guna fail siap sedia
  if exist "public\calculator.html" copy /Y "public\calculator.html" "public\calculator.html.bak" >nul
  copy /Y "%SRC%public\calculator.html.new" "public\calculator.html" >nul
  echo     backup: public\calculator.html.bak
) else (
  echo     butang JANA POSTER OK
)

echo [3/5] Ujian render poster...
node "tools\poster-smoke-test.cjs"

echo [4/5] git add + commit...
git add public\poster.js public\calculator.html public\images\faris-bust.png public\images\faris-full.png public\images\faris.jpg tools\poster-smoke-test.cjs supabase_poster_profile.sql
git commit -m "Add loan poster generator + agent photo (Faris Proton)"

echo [5/5] git push ke GitHub...
git push origin main
echo.
echo --------------------------------------------------
git log --oneline -1
git status --short
echo --------------------------------------------------
echo SIAP. Kalau push berjaya, Vercel akan deploy sendiri
echo dalam 1-2 minit. Refresh https://www.farisprotonapp.com/
echo.
pause
