# Agent Brief

This repository is an active product-development workspace for Tenon/Morti, a local-first parametric furniture builder that is becoming a product platform.

Before making non-trivial changes, read:

- `README.md` for setup and base architecture.
- `docs/product-development-memory.md` for current product context, decisions, open threads, and collaboration notes.

Working assumptions:

- The current product direction is Spanish-first, with English state/copy retained where useful for future scale.
- The app is more than a visual builder: it already has auth, cloud projects, publishing, public demos, remix flow, and admin gating.
- The left project editor and 3D preview have been under active visual/product iteration. Preserve interaction quality and avoid large refactors unless they clearly simplify risk.
- The user prefers collaborative manual testing; automated checks are useful, but do not treat them as a substitute for visual review in the browser.
- Do not touch unrelated `docs/superpowers/` work unless explicitly asked.

Local development:

- Common project URL: `http://127.0.0.1:3003/`.
- Run dev server with `npm run dev -- --host 127.0.0.1 --port 3003` so it matches the in-app browser URL.
- Local auth bypass may be enabled in `.env`; check whether that bypass user is admin before relying on admin-only UI.

