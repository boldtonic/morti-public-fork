# Changelog

All notable product changes will be recorded here. Tenon/Morti follows semantic versioning once a release is tagged.

## [Unreleased]

### Added

- Added `.morti` ProjectBundle v2 with explicit metric units, project name, and normalized product style while retaining v1 and legacy raw Yjs import compatibility.
- Added deterministic `ManufacturingPackageV1` JSON with individual panel identities, millimetre dimensions, complete preliminary operations, material/edge/hardware placeholders, traceability, structured issues, and explicit manufacturability status.

### Changed

- Project import, export, duplicate, public remix, and cloud restore now preserve the product's materials, handle style, and render appearance together with its parametric geometry.
- Separated Three.js/CSG panel geometry from the pure assembly compiler so manufacturing-domain code does not depend on the renderer.

### Security

- Validated project snapshots as inert Yjs data and isolated local projects by authenticated owner identity.

## [0.1.0] - 2026-10-21

### Added

- Interior shelves for open modules, configurable from Design.
- Configurable handles and knobs with type, finish, placement, orientation, and hole-only mode.
- Procedural wood grain with per-panel orientation, end grain, and deterministic variation.
- Spanish-first interface with persisted Spanish and English locales.
- Continuous integration for typechecking, tests, production dependency auditing, and builds.

### Changed

- Unified Design and Style controls in the resizable left editor.
- Refined light and dark product palettes, material defaults, shadows, and studio lighting.
- Hardened cloud autosync across login, logout, account changes, and cloud-record replacement.
- Updated Nuxt and analytics dependencies to patched versions.

### Fixed

- Serialized OTP verification so concurrent requests cannot bypass attempt limits or consume one code twice.
- Recovered damaged local Yjs documents from the newest valid checkpoint when possible.
- Rejected unsupported future `.morti` format and schema versions instead of importing them ambiguously.

### Safety

- Cutlist and machining output remain preview features in 0.1. Verify dimensions, joinery, edge treatment, hardware, tolerances, and material constraints before manufacturing.
