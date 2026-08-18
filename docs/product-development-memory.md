# Product Development Memory

Last updated: 2026-08-18

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

Current local caveat: `LOCAL_AUTH_BYPASS=true` returns `local@localhost`, but this bypass user currently has `is_admin: false`. For local product work, consider making the dev bypass admin or using a real DB user with `is_admin = true`.

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

## Current Suggested Roadmap

Near-term order:

1. Keep stable product milestones committed and pushed when they close a coherent block.
2. Validate the Apple-like palette visually in real projects and demos.
3. Make local dev admin workflow comfortable.
4. Create/curate a first set of ready-to-use demo projects.
5. Add visual realism:
   - Pomos/tiradores first.
   - Simple feet next.
   - Wheels later as a separate product choice.

Product reasoning:

- Palette changes improve perception quickly with lower geometry risk.
- Handles/pulls add realism and are already adjacent to existing drawer/door logic.
- Simple feet are broadly useful and premium; wheels are more specific and should be optional later.

## Collaboration Notes

- Fernando does hands-on browser testing and gives visual/product feedback quickly.
- Keep explanations direct and in Spanish unless there is a reason to switch.
- Do not over-engineer when the request is a visual/product move.
- Prefer the existing component architecture and domain helpers.
- Preserve good editor "movement" and resizing behavior; recent regressions happened when layout constraints were too rigid.
- When updating visual UI, test/verify in browser when possible, and keep the dev server on `127.0.0.1:3003`.

## Git / Repo Notes

- Current active branch during recent work: `codex/spanish-ui-i18n`.
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
