# INERRE Presentation System — PRD

## Original problem statement
INERRE Presentation System (Web App): online walkthrough platform like the INERRE V2 example, with login. The team uploads renders and floor plans through an editor without coding. Clients explore, comment, choose alternatives and give approval.
Roles: Admin (team, clients, projects), Designer (compose and publish revisions), Client (sees only own projects).
Client viewer: masthead (brand, project, revision badge, tabs Ruang / Denah / Layout 3D); Ruang stage (ambient blur, topline, prev/next, story panel 05/10, thumbnail rail, 7s autoplay, fullscreen, swipe, keyboard, mini-plan); hotspots incl. ALT A/B; Denah with camera pins + view cones grouped by room, area sidebar, floor tabs; Layout 3D per floor; deep link #scene=05 for logged-in users; theme #171713/#20201b/#eee9df/#c6b38b, Arial, wide-tracked uppercase eyebrows.
Designer editor: projects/floors/rooms/scenes, upload renders, floor-plan camera editor (click place, drag direction, cone width), hotspot editor with "buat link balik", drag-drop tour order, alternative groups, preview, publish validation.
Revisions (Revisi 01, 02…, read-only history dropdown), A/B alternatives auto-approve room, per-room + final approval with locking, pinned comments per revision, Resend emails.
Edge cases: 0–1 coordinates, ratio change flags hotspots "perlu dicek" and blocks publish, broken links block publish, mobile labels always visible / Denah button / bottom sheet, original kept + WebP ~2500px + thumbnail, preload next, signed URLs, no public share/download/ZIP.
Stack: React + TypeScript + Tailwind + react-zoom-pan-pinch; FastAPI JWT + roles; MongoDB; Object Storage; Resend.
User choices: Phase 1–2 first; watermark INERRE logo only; clients mostly on phone; first admin hans@inerre.com (plus owner hanskristian.1989@gmail.com).

## Architecture
- Backend FastAPI (`server.py`, `storage.py`, `clerk_auth.py`), MongoDB collections: users, invites, projects, floors, rooms, scenes (hotspots + camera embedded), files, revisions (frozen snapshot).
- Auth: Emergent-managed Clerk (email+password, Google) + app roles in DB (admin/designer/client/pending). ADMIN_EMAIL grants admin; invites pre-assign roles by email; client access by project.client_emails.
- Images: Emergent Object Storage; original + WebP 2500px + 480px thumb; served via HMAC signed URLs `/api/img/{id}/{web|thumb}`.
- Frontend: CRA + TSX (Babel transpile, type-check plugin disabled), Tailwind, framer-motion, vaul drawer, react-zoom-pan-pinch.

## Implemented (2026-11-14)
- Roles, admin page (invite email+role, change role), role guards on all routes.
- Studio: project list/create/delete, editor tree (floors, rooms, multi-render upload), scene info, render replace with ratio check + confirm, hotspot editor (click add, drag, target, label, backlink, delete), floor plan upload + camera editor (place, drag direction, FOV), Layout 3D upload + caption, tour order (drag/up/down), validation + publish → Revisi N snapshot, preview (draft).
- Client viewer: Ruang / Denah / Layout 3D per spec, watermark, deep link, mobile bottom sheets, preload, no right-click/drag on images.
- Sample project "Contoh: Apartemen Kemang" (placeholder content) published to test client.

## Iteration 2 (2026-11-14)
- Layout 3D tab replaced by "Presentasi" tab (PDF rendered to WebP pages, watermark, tab only shown when a PDF exists). Layout 3D editor section removed.
- Tour music: built-in library (Lounge by Kevin MacLeod CC BY 3.0 — default Backbay Lounge; Klasik public domain) served from /frontend/public/music, or own upload, or none. Credit shown in viewer. Music continues across tabs; part of the revision snapshot.
- Plan pins: per-scene colours (pinColor), small px-based dots with numbers, small cones; same colours in the camera editor.
- Denah tab locked to viewport (no page scroll, limitToBounds).
- Phone landscape ("short" screen): maximised stage, compact masthead, overlay story. Portrait: compact topline (32px buttons + Denah icon), stage height hugs the render.
- Screen Wake Lock while the tour is playing.
- Sample project republished as Revisi 03.

## Iteration 3 (2026-11-15)
- AI title+description is manual only (button "Buat judul & deskripsi (AI)", uses typed unsaved title as hint; image is source of truth). Upload no longer auto-generates; filename title → Title Case.
- Viewer mobile portrait hides the description; larger mini plan.
- Fullscreen tour shows a mini floor plan that follows the active scene (toggle button), tiny pins; smaller in phone landscape. CSS pseudo-fullscreen fallback for iPhone.
- Starting the tour (Play) enters fullscreen automatically (portrait & landscape); exit by double tap, pinch-in, Esc or the button; hint "Ketuk 2x atau cubit untuk keluar" shown 3s.
- Tour is always fullscreen: Play = start tour + fullscreen; stopping (Stop button, double tap, pinch-in, Esc, native exit) exits fullscreen and stops the tour. Separate fullscreen button removed.
- Rotate hint: "Putar HP untuk tampilan lebih luas" (animated phone icon) when the tour starts on a portrait phone; hides after 6s or on rotation.
- Tour start sequence: 1) welcome cover (INERRE wordmark only) 2.2s, tap to skip, autoplay waits for it; 2) rotate hint centred (portrait phones only, 4.5s or until rotated); 3) small "Ketuk 2x atau cubit untuk keluar" at the bottom, 3.2s.
- All viewer plans (mini plan, fullscreen plan, Denah tab, bottom sheet): inactive camera pins/cones faded (pins 50%, cones ~15%), only the active camera is fully bold.
- Browser tab title "INERRE Presentation System"; INERRE app icon (brass serif I on ink) as favicon/apple-touch/PWA icons; manifest.json makes it installable ("Add to Home Screen", standalone).
- Fix: thumbnail rail auto-scroll no longer shifts the whole stage sideways (LDG slide 4 bug; replaced scrollIntoView with rail-only scrollTo).

## Render Studio V1 — Phases 1-3 (2026-11-24)
User request: full "INERRE Render Studio — Architectural Visual Intelligence Engine V1.0" prompt (SketchUp screenshot → photoreal render, material library & calibration, ambience library, live grading, versions, learning engine, QC, cost control, n8n-ready). User choices: separate render projects (not linked to presentation), user's own OPENAI_API_KEY, first stage = Phases 1-3, approved renders downloaded then uploaded manually to presentation, existing roles (admin, designer; clients no access).
- Backend: `render_studio.py` (router /api/rs), `rs_engine.py` (OpenAI /v1/images/edits via httpx, prompt compiler, region mask + composite), `rs_grade.py` (numpy grading = frontend lib/grade.ts). Mongo collections rs_projects, rs_rooms, rs_angles, rs_renders, rs_materials, rs_material_versions, rs_ambiences, rs_settings, rs_usage, rs_grade_presets.
- Models (verified on account): draft gpt-image-2.6-flare, final gpt-image-2.6-sunburst, custom admin-set, vision gpt-5.5 (not yet used). No silent fallback.
- Jobs: asyncio worker (2 concurrent), statuses queued/analyzing/rendering/processing/completed/failed, 409 duplicate guard, restart marks running jobs failed. Budget: monthly + per-project (estimated cost from admin-set token rates).
- Region revise composites AI output onto parent so pixels outside region are identical; outputs flattened to RGB.
- Frontend /render/*: Dashboard, Proyek, Render Studio (3-panel: sources/refs with roles/materials/instructions | canvas with render/SketchUp/slider/side-by-side, zoom/pan, fullscreen, region select, version timeline | Render / Warna (live, no AI) / Review & Revisi tabs), Material Library + calibration studio (draft→approve→lock, new versions, corrections, JSON import), Ambience Library (9 presets, versions, rollback), Riwayat (compare 2), Pengaturan (models, budgets, usage).
- Seeds: MAT-001…MAT-010 (no 007) uncalibrated, 9 ambience presets.
- Tests: /app/backend/tests/test_render_studio.py, iteration_17 report (15/15 backend).

## Backlog
- Render Studio Phase 4: Train & Calibrate learning rules (vision model converts feedback → structured rules, scopes, approval, conflict resolution), intelligent revision classification, persistent project memory rules.
- Render Studio Phase 5: AI Quality Inspector, admin activity review, n8n signed webhooks, dark/light mode toggle.
- Render Studio minor: orphan storage files after project delete; N+1 queries on project list.
- P0 (Phase 3): revision history dropdown (read-only), A/B alternative groups + ALT hotspot, per-room & final approval with locking, pinned comments per revision, Resend emails (publish, comment, approval), watermark removed after approval.
- P1 (Phase 4): mobile polish (touch tour reorder), deploy, signed URLs bound to user session.
- P2: 360 renders, split server.py into routers.

## Next tasks
User to try Render Studio with real SketchUp screenshots; then Phase 4 (learning engine) or presentation Phase 3 (revisions/approvals).
