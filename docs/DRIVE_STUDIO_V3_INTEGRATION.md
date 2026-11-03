# FARIS PROTON · DRIVE/STUDIO V3 integration audit and handoff

Date: 2026-11-03. Branch: `feature/drive-studio-v3-admin-hidden-20261103`.

## Verified source identity
- GitHub repository `izzifnexasolutions-blip/proton-calculator`, main HEAD before work `5e3182838100dd86bde554e4928d877bbfe9a7ab`.
- Existing `vercel.json`: static `public/` output, `/` routes to `/calculator.html` (retained). Live Vercel project / domain mapping is **NOT confirmed** by the connected Vercel account. No production deploy was requested or executed.
- Existing `public/calculator.html` is the actual Montserrat yellow/red Proton car calculator that matches the supplied screenshot's controls and contains the settings gear `#settings-tab-btn`.
- Same active Supabase reference `qagsczjxzshjxmmxvkbq` (project `FarisProton`) is already embedded in calculator's public config. It has existing `car-media` and `variant-media` buckets and `sales_staff_profiles` table; **no active admin rows** in that table at audit time. There was 1 Supabase Auth user at audit; no identity/role was guessed or modified.

## What changed (development branch only)
1. `public/calculator.html` — only one deferred script tag added before `</body>`. No calculator DOM/layout/value/finance changes. Hold existing settings gear for ~1.8s (or Ctrl+Alt+3 on desktop) to access the isolated studio route. Normal taps continue to open settings.
2. `public/studio3d/hidden-entry.js` — long-press handler, no visible new button on public calculator.
3. `public/studio3d/index.html`, `style.css`, `auth.js` — admin login gate, verified Supabase Auth `getUser` and `sales_staff_profiles` admin check. Unlike the prior local-only V3 prototype, UI cannot initialize before role verification.
4. `public/studio3d/studio.js` — categorized WebP/EXIF-stripped photos, duplicate SHA check, real GLB header validation/Three.js parsing, mapping, pivot preview, photography panorama, manual review/approval, private cloud draft save/load, explicit gated publication, unpublish and version rollback. No paid AI calls.
5. `public/studio3d/showroom.html`, `viewer.js` — isolated public viewer selects only `drive_3d_public.published=true`, loads published media/GLB only. If unmapped, parts remain unavailable; no false inspection claims.
6. `supabase/migrations/20261103_drive_studio_v3.sql` — PROPOSED migration only; adds independent `drive_3d_*` tables/functions and dedicated private/public buckets with RLS and admin validation. Does not overwrite old media/finance tables. **NOT APPLIED** to live Supabase.
7. `vercel.json` — preserves existing root calculator route and adds isolated `/studio3d` alias plus static filesystem handling.
8. `tests/qa_static.py` — reproducible offline/HTTP structural tests. Does not claim WebGL interaction.

## Running development preview
From repository root, serve `public/` as document root with any HTTP static server, e.g. `python -m http.server 8765 --directory public`. For admin editor route: `http://localhost:8765/studio3d/index.html`. Root calculator: `http://localhost:8765/calculator.html` (Vercel maps `/` to this file).

**Production authorization gate:** the Studio needs Supabase Auth credentials of a verified owner plus an explicitly assigned admin row in `sales_staff_profiles`. Anonymous visitors, authenticated non-admins and ordinary calculator buyers cannot use the editor. Existing passcode-based lead-hub accounts are **not** interchangeable with Supabase Auth and cannot be assumed to authorize the Studio.

## Supabase setup pending explicit approval
1. Review the SQL migration, ensure authenticated users can read only their own staff roles, and apply migration first to a staging database. Run Supabase advisors after applying.
2. Confirm the real owner's `auth.users.id` through an authorized admin workflow and create or update exactly one `sales_staff_profiles` row with `role='admin'`, `is_active=true`. **Do not bootstrap a role by email/client metadata or grant admin automatically.**
3. Test that unauthenticated and staff accounts cannot select private rows or upload to `drive3d-private`, that admin may save/load draft, and that the public viewer only returns published assets.
4. Before production, enable staging/preview in the correct Vercel account, test `/studio3d`, `/studio3d/showroom.html`, `/`, existing poster and media pages. Root calculator must remain byte-for-byte identical except for hidden-entry script.
5. Publishing should use verified rights/privacy, with physical inspection still shown as unverified. Raw GLB geometry must not be described as official/OEM.

## Known limits / release blockers
- **Vercel:** connected Vercel account did not show the project/domain. No preview URL or live browser QA can be verified.
- **Supabase:** migration not applied, admin profiles absent, remote upload/publish/rollback therefore cannot yet be exercised end-to-end.
- **WebGL/mobile:** Chromium automation was blocked by `ERR_BLOCKED_BY_ADMINISTRATOR`; genuine GLB/pivot/panorama and mobile screenshots are **NOT TESTED**. The local structural checks and HTTP are not an equivalent.
- Public Storage object URLs can remain retrievable after unpublish even though public listing disappears. A production retention/deletion and CDN purge procedure is needed.
- Current editor requires separately segmented GLB component nodes, cannot derive doors/engine from ordinary photos, and uses manual rigging; no automatic mesh reconstruction.
- Model preview uses CDN imports; for an offline/no-internet deployment, vendor Three.js/decoders as static files and verify licences.
- GLB payload budget 30 MB; optimized mobile target remains to be measured with real customer GLBs.
- Sales calculator (current price, financing, WhatsApp, poster) is not modified or revalidated by this branch. New 3D showroom is intentionally separate from the calculator.

## Reproducible tests
```
python -m http.server 8765 --directory public
python tests/qa_static.py
node --check public/studio3d/studio.js
```
Local execution: 18/18 structural/file checks PASS, JS syntax PASS, HTTP tests PASS. Browser screenshot and WebGL NOT RUN (environment blocked).

## Rollback
Revert or decline the feature branch / draft PR: no production source is changed. On a later deployment, revert only the Vercel route, the inserted `<script src="/studio3d/hidden-entry.js" defer>` tag and new `public/studio3d/` assets. Preserve `public/calculator.html` finance logic; do not reset original database. If migration was already applied, disable admin roles/publish entries first and plan a non-destructive schema cleanup with backups rather than dropping customer data.

## Costs
AI image-to-3D is OFF and no provider job or recurring API fee is introduced. Existing Supabase/Vercel usage and storage transfer quotas may incur platform usage charges if/when enabled; no assumption of unlimited free usage.