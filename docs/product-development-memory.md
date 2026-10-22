# Product Development Memory

Last updated: 2026-10-22

## Purpose

This file is the durable project memory for product-development work. It is meant for Fernando, Codex sessions, and future AI agents working together on the same repo.

The short version: this is not only a visual furniture builder. It is already a local-first furniture design platform with the beginnings of SaaS behavior: users, cloud projects, publishing, demos, and remixable public examples.

## Current Product Direction

- Spanish-first interface for current users and product exploration.
- Keep enough English/internal state to allow future scaling and localization.
- Move the product away from "technical prototype" aesthetics toward a calm, premium furniture/product feel.
- Build toward ready-to-use examples/templates: public demo projects that users can view and remix into editable local projects.
- Prioritize fixes and product workflow quality before a larger rebrand/commercial packaging phase.

## Discovered Platform Capabilities

The codebase already includes:

- Passwordless email auth via OTP.
- Session cookie auth.
- Email verification state.
- User table with `is_admin`.
- Local projects in IndexedDB.
- Yjs snapshots for project state.
- Optional cloud records backed by Postgres.
- Public project pages at `/p/:id`.
- Publish/unpublish flow.
- Demo projects via `projects.is_demo`.
- Remix flow from public project to editable local copy.
- `remix_count` tracking.
- Admin-only demo toggling.
- AI furniture generation endpoints and UI surfaces.

This means the product has a real platform foundation, not just a local visual editor.

## Demo / Ready-To-Use Flow

A project appears in the home "Demos" section only when all are true:

- `is_demo = true`
- `visibility = 'public'`
- `snapshot IS NOT NULL`
- `deleted_at IS NULL`

When a user opens a demo card:

- The card links to `/p/:id`, the public viewer.
- The user cannot edit the original demo.
- Pressing "Remix" imports the public Yjs document as a new local editable project named like `Name (remix)`.
- If the user is anonymous, Remix opens auth first and continues after login.
- Remix count is incremented best-effort through `/api/public/projects/:id/remix`.

Admin workflow to create a demo:

1. Create or open the source project.
2. Publish it so the cloud record becomes public and has a snapshot.
3. Use the project/card menu and choose "Marcar como demo".
4. Check the home Demos section.

Current local behavior: `LOCAL_AUTH_BYPASS=true` provisions `local@localhost` as a development-only admin on localhost. This makes projects, publishing, and demo administration testable without Postmark; production builds always ignore the bypass.

## Recent Product/UI Work

Important recent changes in this working tree:

- UI copy moved substantially to Spanish while retaining English copy state.
- Project tabs ordered as `Diseño`, `Estilo`, `Corte`.
- Style controls moved into the same left sidebar pattern as design.
- Removed redundant style mode selector from the style sidebar because mode exists in the visual preview controls.
- Sidebar/editor width behavior received several alignment and resize fixes.
- Design detail row now includes compact editable Fondo/Grosor/Vuelo controls in cm.
- `Vuelo` became a `no/sí` toggle:
  - `no` sets overhang to 0 and aligns columns flush.
  - `sí` restores a positive overhang/default.
- Fixed assembly/render mismatch when `Vuelo no` was used.
- Defaults moved away from debug blue/green/yellow panels.
- New palette direction:
  - App light mode: soft gray, white surfaces, graphite text.
  - Accent: restrained white-oak/brass, not technical orange.
  - 3D rendered defaults: white lacquer body and soft gray fronts.
  - Added material presets for soft gray lacquer and graphite lacquer.
- Product pill v1 added to the project canvas:
  - Collapsed product entry point with inline expansion.
  - Theme switch, ES/EN locale switch, restart project, and home action.
  - Restart clears the furniture document while preserving project identity.
  - Locale preference persists in `tenon-locale`; theme preference persists through the existing color-mode storage.
  - Current known polish items are non-blocking: closing animation, re-click behavior on the collapsed mark, and focus restoration after Escape.

Current status of handles/pulls:

- Physical pomos/tiradores v1 are implemented in the 3D assembly render.
- Drawers render a short horizontal graphite pull using the existing pair of pull-hole positions as supports.
- Single-door fronts render a small graphite knob at the existing pull-hole position.
- The 2D editor/preview now uses the same visual language: drawer bars and door knobs instead of generic hole dots.
- Diseño now controls handles per selected front module with three explicit outcomes: `No` removes both machining and hardware, `Hueco` keeps the drilled opening without physical hardware, and `Sí` keeps both. A compact nine-point anchor selector controls vertical and horizontal placement independently, while handle orientation remains a separate choice; both apply to `Hueco` and `Sí`.
- Estilo presents `Tiradores` as a fifth product part alongside body, sides, shelves, and fronts. Its picker exposes global visual type (`Automático`, round/square knobs, round/square bars) and finish (`Grafito`, `Níquel`, `Latón`) as independent, freely combinable controls so the catalogue can grow without a Cartesian grid of presets.
- Existing projects normalize to handles enabled, upper placement, contextual horizontal placement (centered drawers/double doors and single-door handles opposite their hinges), contextual orientation, and `Automático · Grafito`, preserving the previous appearance.
- `No` removes pull-hole operations from compiled geometry and cutlist output; `Hueco` deliberately retains those manufacturing operations.
- Type and finish variants remain visual in v1; model-specific drilling patterns and purchasable hardware specifications are a future manufacturing step.

Current status of material rendering:

- The existing material catalogue remains the product model; there is no separate `Madera v2` material or user-facing grain toggle.
- Wood presets now render grain automatically in each panel's local coordinate system. The longest local board dimension determines the longitudinal grain direction, so shelves, sides, and fronts remain coherent when moved or rotated.
- End caps receive a restrained procedural end-grain treatment, while broad faces retain the species-specific pattern and PBR finish.
- Lacquers and custom flat colors remain grain-free.
- The previous grain texture encoding darkened every wood preset below its specified base color; rendering now decodes neutral grain back to the selected material color.
- A small per-species profile controls secondary face detail and end-grain contrast without creating extra UI or persisted project state.
- Each panel receives a deterministic texture offset from its stable panel key, preventing repeated drawer and door fronts while keeping renders reproducible.

Current status of open modules and interior shelves:

- Open `balda` modules support a persisted `Baldas interiores` count; `0` preserves the previous empty opening.
- Interior shelves are spaced evenly and limited by the module height, panel thickness, joint clearance, and configured minimum opening height.
- The same count drives the Design inspector, 2D editor, compact preview, 3D assembly, exports, and cutlist because every interior shelf compiles as a real horizontal deck panel.
- Existing projects remain visually unchanged until an interior shelf count is explicitly added.

## 0.1 Release

- Version `0.1.0` completed its automated gate and Fernando's manual product review on 2026-10-21.
- The release commit is the source of the annotated `v0.1.0` tag; future work continues under `Unreleased` in `CHANGELOG.md`.

- The deployable Nitro artifact has no known high-severity dependency findings after updating Nuxt, Nuxt UI, PostHog, and patched transitive packages. CI also rejects critical findings across the complete source/build tree; remaining high findings are confined to currently unpatched Nuxt development tooling and are not present in the deployed artifact.
- OTP verification now locks each challenge inside a transaction, preserving the five-attempt limit and single-use behavior under concurrent requests.
- Local Yjs documents recover from the newest valid checkpoint instead of silently opening an empty design; unrecoverable bytes remain downloadable for diagnosis.
- `.morti` imports validate envelope structure, base64, Yjs data, and future format/schema versions while retaining legacy raw-update compatibility.
- Cloud autosync keys its state by local project, cloud record, and user identity, and re-runs on login, logout, or account changes.
- Postgres schema changes are numbered in `schema_migrations`, serialized with an advisory lock, and include retention cleanup for expired operational data.
- Public remix counts are rate limited and can no longer be changed through the owner project patch endpoint.
- CI rejects critical source/build dependency findings, typechecks, tests, builds, and separately audits the deployable Nitro artifact for high-severity findings on every branch/PR candidate.
- Release positioning is explicitly product-preview: cutlist and machining output still require independent verification before manufacturing.

## Current Suggested Roadmap

Near-term order:

1. Preserve the post-0.1 trust boundary: inert validated snapshots and owner-scoped local projects. Completed 2026-10-21.
2. Define and migrate to `ProjectBundleV2` so geometry, style, hardware state, import/export, duplicate, publish, remix, and cloud round-trip as one product. Completed 2026-10-22.
3. Define deterministic `ManufacturingPackageV1` before adding CSV, XLSX, DXF, or CNC-specific adapters. Completed as a preliminary contract on 2026-10-22.
4. Add compiler/cutlist golden projects and a single visible validation pipeline.
5. Select a real manufacturer, construction system, material specification, and exact hardware families before generating joinery or hinge/runner machining.
6. Resume product realism with simple feet after the project/manufacturing contracts are stable; wheels remain a later optional product choice.

Product reasoning:

- The v0.1 visual product is strong enough to expose deeper data-contract problems that would otherwise be hidden by export features.
- A format such as DXF is an adapter, not the manufacturing model itself.
- Visual hardware and machining must derive from the same versioned hardware pattern.
- Simple feet remain broadly useful and premium, but adding them before portable project and manufacturing contracts would create more state to migrate.

## Post-0.1 Deep Audit and Trust Phase

- The 2026-10-21 deep audit is recorded in `docs/audits/tenon-v0.1-deep-audit.md`.
- The audit reviewed the v0.1 code, browser behavior, automated suite, persistence/cloud model, and primary Autodesk, HOMAG, and Blum documentation.
- It corrected two stale assumptions from the supplied external guide: v0.1 already had 54 tests, and compiled operations already carried local coordinates even though Corte did not preserve or display all of them.
- Public and private snapshot downloads are now always inert `application/octet-stream` attachments with a restrictive response CSP. Upload and publish reject data that is not a valid Yjs update and ignore client-provided MIME types and filenames.
- Local projects now carry an `ownerId`. Legacy rows are claimed once by the first confirmed authenticated identity that lists or opens them; subsequent accounts cannot list, open, export, delete, read snapshots from, or autosync those projects.
- Cloud reconciliation refuses to overwrite a local row owned by another account when legacy cloud records collide on the same client project id. A later cloud identity migration must resolve that historical collision explicitly; the portable bundle deliberately creates a fresh local storage identity on import/remix.
- Local auth bypass now ignores forwarded host headers, rejects `0.0.0.0`, and requires a raw loopback host. When Nitro exposes a socket address it must also be loopback; the supported dev command remains bound to `127.0.0.1`.
- The existing local project was opened successfully after migration in the in-app browser, and no browser warnings or errors were recorded.
- `.morti` format v2 now contains `ProjectBundleV2`: an explicit metric unit system, project name, normalized public style/material/handle appearance, and the validated Yjs parametric document. V1 envelopes and legacy raw Yjs files migrate to deterministic defaults; future bundle versions and unsupported units fail without creating a local project.
- Import, export, duplicate, public remix, and cloud restore now preserve geometry and appearance. Duplicates keep editor preferences but clear module selection; automatic reconciliation preserves an existing local style, while a missing local state or an explicit cloud download restores cloud style without replacing unrelated editor preferences.
- `ManufacturingPackageV1` now provides canonical, byte-stable JSON in millimetres. It preserves every compiled panel and operation, separates snapshot-local instance identity from fabrication-equivalent part identity, declares face-local coordinates, and carries material, face, edge, hardware, traceability, issue, and manufacturability data.
- The contract deliberately does not invent workshop facts: actual board thickness is null; manufacturing grain and all edge treatments are unspecified; handle selections are visual-only with no SKU or drilling pattern; current operations are unvalidated. Missing operation coordinates or faces block the package.
- Pure assembly compilation no longer imports Three.js or CSG; visual panel geometry is isolated under `shared/three/assembly-geometry.ts`.
- Next implementation block: golden compiler/manufacturing projects and a single visible validation pipeline. Corte remains preliminary until those checks and a real manufacturer validation are in place.

## Collaboration Notes

- Fernando does hands-on browser testing and gives visual/product feedback quickly.
- Keep explanations direct and in Spanish unless there is a reason to switch.
- Do not over-engineer when the request is a visual/product move.
- Prefer the existing component architecture and domain helpers.
- Preserve good editor "movement" and resizing behavior; recent regressions happened when layout constraints were too rigid.
- When updating visual UI, test/verify in browser when possible, and keep the dev server on `127.0.0.1:3003`.

## Git / Repo Notes

- Current active branch: `main`.
- Local remote `origin` points to `https://github.com/boldtonic/tenon.git`.
- The GitHub repo may still be marked as a fork, but local `upstream` was removed earlier.
- Some `docs/superpowers/` files are tracked for the product pill spec/plan. Avoid unrelated superpowers docs unless explicitly requested.
- `.claude/` is local tool configuration and should not be committed unless Fernando explicitly asks for it.
- Worktree may be dirty; never revert user or unrelated changes.

## Open Product Questions

- Should home label "Demos" become "Ejemplos", "Plantillas", or "Inspiración"?
- Should demo cards have a direct "Usar plantilla" action instead of only opening the public viewer?
- Should local auth bypass be admin in dev by default?
- What first demo set best communicates the product: TV unit, bookshelf, wardrobe, low console, modular shelf?
- How much of the future SaaS/org plan should be implemented now versus kept as architecture notes?
