-- ============================================================
--  Poster Kiraan Loan — profil ejen (PILIHAN)
--  Jalankan dalam Supabase → SQL Editor (projek: FarizProton)
--  Jika tidak dijalankan, poster.js tetap berfungsi penuh
--  (profil disimpan dalam localStorage pelayar sahaja).
-- ============================================================

create table if not exists public.poster_profile (
  id         int primary key default 1,
  name       text,
  phone      text,
  agency     text,
  tagline    text,
  logo       text,                      -- data URL atau URL awam (Supabase Storage)
  template   text default 'classic',    -- classic | bold | ringkas
  theme      text default 'red',        -- red | dark | gold
  size       text default 'feed',       -- feed | story | square
  updated_at timestamptz default now()
);

alter table public.poster_profile enable row level security;

-- Kalkulator sedia ada guna anon key tanpa login → polisi terbuka.
-- (Kegunaan peribadi sahaja; jangan simpan data sensitif dalam jadual ini.)
drop policy if exists poster_profile_all on public.poster_profile;
create policy poster_profile_all on public.poster_profile
  for all using (true) with check (true);

-- baris tunggal (id = 1)
insert into public.poster_profile (id) values (1)
on conflict (id) do nothing;

-- ============================================================
--  PILIHAN 2: simpan gambar poster per model dalam Storage
--  Buat bucket 'poster-assets' (public), kemudian guna URL-nya
--  dalam jadual atau terus dalam kod.
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('poster-assets','poster-assets', true)
-- on conflict (id) do nothing;
