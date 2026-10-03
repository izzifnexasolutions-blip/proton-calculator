POSTER KIRAAN LOAN - cara pasang (v2)
=====================================

PALING SENANG: extract zip ini, kemudian DOUBLE-CLICK  install-poster.bat

Skrip itu akan:
  1. salin public/poster.js, tools/, supabase SQL dan gambar Faris ke repo kau
  2. tampal butang JANA POSTER pada public/calculator.html (guna git apply;
     kalau gagal, ia guna fail siap sedia + buat backup calculator.html.bak)
  3. jalankan ujian render
  4. git add + commit + push ke GitHub  ->  Vercel deploy sendiri

Kalau folder repo kau bukan di
  C:\Users\MAMAT\Downloads\Kimi_Agent_Proton Loan Update\app
buka install-poster.bat dengan Notepad dan betulkan baris  set "APP=" ...


MANUAL (kalau tak mahu guna skrip)
----------------------------------
Salin ke dalam repo:
  public/poster.js                     (ganti)
  public/images/faris-bust.png         (baru)
  public/images/faris-full.png         (baru)
  public/images/faris.jpg              (baru)
  tools/poster-smoke-test.cjs          (baru)
  supabase_poster_profile.sql          (baru)

Untuk calculator.html, tampal 2 blok ini:

  A) tepat SELEPAS  </div>  penutup #monthly-box:

     <!-- POSTER BUTTON -->
     <div id="pg-bar">
       <button id="pg-open">&#128248; JANA POSTER KIRAAN</button>
     </div>

  B) tepat SEBELUM  </body>:

     <script src="poster.js" defer></script>

Kemudian:
  git add public/poster.js public/calculator.html public/images/faris-bust.png public/images/faris-full.png public/images/faris.jpg tools/poster-smoke-test.cjs supabase_poster_profile.sql
  git commit -m "Add loan poster generator + agent photo"
  git push origin main


APA YANG BARU DALAM v2
----------------------
- Gambar ejen: public/images/faris-bust.png (latar sudah dipotong, lutsinar)
  dipaparkan dalam blok ejen pada poster
- Nama lalai: FARIS PROTON   |   Telefon lalai: 013-446 6179
- Butang baru dalam panel poster:
    GAMBAR ANDA  - ganti gambar ejen        (disimpan dalam browser)
    LOGO         - logo kecil di penjuru kanan atas poster
    GAMBAR KERETA- ganti gambar kereta per model
    LATAR AI     - gambar latar Higgsfield (lihat public/images/poster-bg/)
- Gambar kereta diambil terus dari data kalkulator (images/<model>.jpg
  atau media Supabase kalau ada)
