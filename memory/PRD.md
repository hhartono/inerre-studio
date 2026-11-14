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

## Backlog
- P0 (Phase 3): revision history dropdown (read-only), A/B alternative groups + ALT hotspot, per-room & final approval with locking, pinned comments per revision, Resend emails (publish, comment, approval), watermark removed after approval.
- P1 (Phase 4): mobile polish (touch tour reorder), deploy, signed URLs bound to user session.
- P2: 360 renders, split server.py into routers.

## Next tasks
Phase 3 build starting with revisions dropdown + approvals.
