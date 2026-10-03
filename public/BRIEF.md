# TUGAS: pasang modul poster ke repo + push ke GitHub

Kau berjalan dalam PC Ruffer (Windows). Kerja ini mekanikal — jangan melencong.

## Lokasi

- Repo tempatan: `C:\Users\MAMAT\Downloads\Kimi_Agent_Proton Loan Update\app`
- Payload (root zip ini, sudah diextract): `%USERPROFILE%\Downloads\poster-deploy\`
- Kalau payload tiada, ambil semula:
  `scp -o BatchMode=yes -i "%USERPROFILE%\.ssh\makanmana_vps" hermes@134.209.96.122:/home/hermes/work/poster-deploy.zip "%USERPROFILE%\Downloads\"`
  kemudian extract guna `"%SystemRoot%\System32\tar.exe" -xf ... -C ...`

## Langkah

1. **Salin fail** ke dalam repo (buat folder `tools` dan `public\images` kalau belum ada):
   - `public\poster.js` → `APP\public\poster.js`
   - `public\images\faris-bust.png`, `faris-full.png`, `faris.jpg` → `APP\public\images\`
   - `tools\poster-smoke-test.cjs` → `APP\tools\`
   - `supabase_poster_profile.sql` → `APP\`

2. **Butang poster** dalam `APP\public\calculator.html`:
   - cuba `git apply --ignore-whitespace "<payload>\calculator-poster-button.patch"`
   - kalau gagal: backup `calculator.html` → `calculator.html.bak`, kemudian guna `public\calculator.html.new` sebagai ganti
   - sahkan fail mengandungi `pg-open` dan `<script src="poster.js" defer></script>`

3. **Ujian**: `node tools\poster-smoke-test.cjs` — mesti keluar `SEMUA LULUS`

4. **Commit + push** (jangan benarkan prompt interaktif menggantung):
   - set `GIT_TERMINAL_PROMPT=0`
   - `git add` fail-fail di atas (termasuk `public/calculator.html`)
   - commit dengan mesej: `Add loan poster generator + agent photo (Faris Proton)`
   - `git push origin main`

5. **Kalau push gagal** (auth/kredential): JANGAN taip kata laluan, jangan hangs.
   Guna Chrome yang sudah login GitHub (Ruffer dah buka):
   - pergi `https://github.com/izzifnexasolutions-blip/proton-calculator`
   - `Add file` → `Upload files` → muat naik `poster.js` (ke `public/`), gambar Faris (ke `public/images/`), `poster-smoke-test.cjs` (ke `tools/`), `supabase_poster_profile.sql` (root)
   - edit `public/calculator.html` melalui web editor: tambah blok `<div id="pg-bar">` dengan butang `JANA POSTER KIRAAN` tepat selepas penutup `#monthly-box`, dan `<script src="poster.js" defer></script>` sebelum `</body>`
   - commit terus ke branch `main`

6. **Laporan**: akhiri dengan SATU baris sahaja:

   `RESULT=push:<ok|gagal> | commit:<sha atau web-commit> | ujian:<lulus|gagal> | nota:<ringkas>`

## Peraturan

- Jangan ubah apa-apa lagi dalam repo selain yang di atas.
- Jangan cetak token, kata laluan, atau kunci.
- Ringkas: jangan teroka, jangan tulis dokumentasi.
