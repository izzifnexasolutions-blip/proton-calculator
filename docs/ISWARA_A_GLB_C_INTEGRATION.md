# FARIS PROTON — Iswara Aeroback A → GLB → C

Date: 2026-11-04 (Malaysia); integration branch only, **not deployed to production**.

## Source material

- Original user archive: `Iswara.zip`
- Spec PDF: `Iswara/Spec.pdf` (4 pages)
- 27 still photographs in `Iswara/Gambar dan Video kereta/`
- Four `.MOV` references retained in original archive, not included in import ZIP; no image-to-video inference attempted.

## Step A — Full draft manifest

- `iswara_manifest.json` has structured vehicle, technical spec, source photo references, condition notes, 27 mapped image categories, six pivots, rights/review status and evidence caveats.
- Declared vehicle: Proton Iswara 1.3 Aeroback manual, approx. 2000, right-hand-drive, 5-door hatchback, front-wheel-drive.
- PDF text indicates 1,298 cc, 4G13, ~74–75 PS, 101 Nm, 5-speed manual, approximate dimensions 3,960 × 1,610 × 1,390 mm.
- **Conflicting evidence:** PDF explicitly describes a SOHC *8-valve* engine; the supplied engine-bay photograph prominently reads *MAGMA 12 VALVE*. Both claims remain unverified and are recorded without choosing a winner.
- Body condition from actual photos: severely faded/damaged black paint, black aftermarket multi-spoke wheels, grey/dark manual interior and real engine bay.
- `rights`, `privacy`, `licenseReviewed`, `adminApproved` default to `false`; `status='draft'` and `published=false`.
- No photo was automatically labelled as an equirectangular 2:1 interior panorama. The GLB provides interactive orbit/rotation, which is different from real photographic panorama.

## Step GLB — Actual three-dimensional geometry

- Generated `Proton_Iswara_2000_Aeroback_manual_approx_rigged.glb` is a real glTF 2.0 binary mesh with 68 geometry groups and 15,887 triangles, four modelled wheels, interior, an illustrative engine and separate named pivot nodes: `hood`, `trunk`, `door_fr`, `door_fl`, `door_rr`, `door_rl`.
- GLB coordinate convention: **+Z forward, +X vehicle right, +Y upward, metres**. 6 built-in hinge transforms use correct local origins. The model is intentionally *an illustrative manual mesh reconstruction*, not a high-fidelity photogrammetry model, not OEM CAD, not certified accuracy.
- The synthetic weathering and engine detail are approximate, not photo-mapped or mechanically validated. Wheels are approximate to the supplied black aftermarket rims.
- Built with local Python libraries, no paid photo-to-3D API calls.
- Git object blob SHA for binary GLB: `06b2cc2fb5a5615c771a3ea3306b0ceadcd7137d`; binary SHA256: `c87800376780bd1aa96cca83813e7d9e59f6e65046d7a3c056261d6268505e6c`.

## Step C — Repo-based integration

Repository: `izzifnexasolutions-blip/proton-calculator`

Branch: `feature/drive-studio-v3-admin-hidden-20261103`

Review PR: `https://github.com/izzifnexasolutions-blip/proton-calculator/pull/1` (draft, unmerged)

Files:

- `public/studio3d/assets/iswara-aeroback-2000-rigged.glb` — actual GLB binary committed on development branch.
- `public/studio3d/assets/iswara_manifest.json` — full source-based draft metadata.
- `public/studio3d/iswara-preview.html` / `iswara-preview.js` — isolated 3D orbit viewer and open/close controls, no calculator changes.
- `public/studio3d/index.html`, `studio.js` — new import buttons **Muat GLB Iswara Contoh** (from repo) and **Import Pakej A + GLB + C** (ZIP). ZIP uses JSZip 3.10.1 CDN free library, no paid API. Photo input is processed locally in browser and strips EXIF.
- All import paths leave rights/privacy/approval unchecked. No automatic publication.

Intended preview path after staging is deployed: `/studio3d/iswara-preview.html`.

**Current site is unaffected.** Production routing of `farisprotonapp.com` remains unidentified in accessible Vercel account; GitHub PR is unmerged, Supabase migration from previous stage has **not** been applied, Supabase admin role still requires approved account setup. Therefore no claim of live app operation or media publication.

The existing hidden-gear long-press remains unavailable on the live site until branch changes are merged and the correct Vercel project is deployed with explicit permission. The standalone preview route is a separate test asset, not the live calculator homepage.

## QA

`qa_iswara.py` run locally: **23/23 PASS**

GLB verified by trimesh and direct glTF 2.0 JSON inspection: 68 geometry objects, 6 separate rig nodes, named engine/cabin meshes, 4 wheels, embedded plate PNG texture. JSON manifests and 27 EXIF-stripped WebP photo files verified. Node syntax check passed for Studio and Preview JS.

Unverified: browser WebGL rendering, true 3D articulation in mobile Chrome/Safari, actual admin Supabase session, database RLS/storage writes, full ZIP import browser end-to-end, public showroom publication, and Vercel preview deployment. Chromium browser tests were blocked in the available environment; no fabricated screenshot or QA pass is claimed.

## Rollback

Close PR #1 or revert branch files; current `main` and production remain unchanged. Draft model and original photos can be removed before any publication.

## Remaining blockers for production

1. Identify correct Vercel project/domain and stage branch safely.
2. Review migration and apply on non-production Supabase first; run RLS, storage, role and upload tests.
3. Create and verify a real admin account/role; don't rely on a hidden button as auth.
4. Perform manual 3D accuracy inspection; improve/rebuild the model if photorealism or true scan accuracy is required.
5. Check rights and privacy (particularly visible registration number) and obtain explicit owner production approval.
6. Handle deletion/access of published Storage assets after unpublish; public media retention is not solved by hiding listings.