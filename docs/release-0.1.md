# Tenon/Morti 0.1 Release

Released: 2026-10-21

## Positioning

Version 0.1 is a product-preview milestone for designing, visualizing, saving, sharing, and remixing parametric furniture. It is not yet a certified manufacturing system.

## Automated Gate

Run from a clean checkout:

```bash
npm ci
npm audit --audit-level=critical
npm run typecheck
npm test
npm run build
npm --prefix .output/server install --package-lock-only --ignore-scripts
npm --prefix .output/server audit --omit=dev --audit-level=high
```

GitHub Actions runs the same gate on pushes and pull requests. The source-tree audit rejects critical findings across the complete build toolchain. The artifact audit rejects high findings in the exact Nitro server dependency set that is deployed.

## Manual Product Gate

- Create a local project and reload it.
- Add, resize, reorder, and remove columns and modules.
- Test open modules, interior shelves, drawers, doors, handles, holes, and handle placement.
- Switch Design, Style, and Cut views at minimum and maximum sidebar widths.
- Change materials, theme, and ES/EN locale, then reload.
- Export and re-import a `.morti` project.
- Sign in, sync a local project, sign out, sign in again, and verify the intended cloud record.
- Publish a project, open its public URL, and create a remix.
- Check desktop and 375 px mobile layouts in light and dark mode.

## Release Steps

1. Complete the automated and manual gates.
2. Review `CHANGELOG.md` and move the 0.1 changes under a dated `0.1.0` heading.
3. Merge the release branch into `main`.
4. Create the annotated tag `v0.1.0` from the verified merge commit.
5. Deploy that exact tag and run a production smoke test.

## Known Boundary

Cutlist, machining operations, and generated measurements are useful previews but must be independently checked before ordering material or manufacturing furniture. A later manufacturing milestone should add explicit material rules, hardware drilling patterns, tolerances, edge-banding rules, and reference fixtures with golden outputs.
