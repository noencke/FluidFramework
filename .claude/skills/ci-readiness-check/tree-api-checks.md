# Tree-specific API check guidance

This document is read by the `ci-readiness-check` skill when `@fluidframework/tree` is among the changed packages. Follow these instructions **in addition to** the general steps in `SKILL.md`.

---

## Before running `build:api-reports`: check for new top-level exports

`@fluidframework/tree` uses committed files in `src/entrypoints/` (e.g. `src/entrypoints/alpha.ts`) that explicitly list every named export by API tier. If you added a **new top-level export** (a new type, class, function, or constant at the package root — not just adding members to an existing type), you must regenerate these files before running `build:api-reports`. Otherwise the new export will be missing from the API surface.

To check: run `git diff` on `src/entrypoints/` — if your new export doesn't appear there, it needs to be added.

Run the generator:

```bash
cd packages/dds/tree && pnpm run generate:entrypoint-sources
```

This script writes to both `src/entrypoints/*.ts` and `lib/entrypoints/*.d.ts`. The `lib/` copy has wrong import paths and must be fixed by rebuilding immediately after:

```bash
pnpm run build:esnext
```

Verify the fix: `grep "from " lib/entrypoints/public.d.ts` should show `../index.js`, not `./index.js`. Then stage the `src/entrypoints/` changes and proceed to `build:api-reports`.

If your change only adds members to an existing exported type (e.g. a new optional property on an existing interface), skip this — the entrypoints files don't need to change.

---

## After running `build:api-reports`: check for phantom key-reorder diffs

There is a known bug in API Extractor that non-deterministically reorders union key strings within `Omit<>` type signatures in this package — e.g. `"keyA" | "keyB"` swapped to `"keyB" | "keyA"` — with no real API change. The ordering is stable within a single fresh compilation (local and CI agree), but it can silently flip between compilations after clearing `tsbuildinfo` or after TypeScript version changes.

A diff is a phantom key-reorder if: only the order of string literal keys in an `Omit<>` changes; nothing is added or removed.

**Always commit the file that `build:api-reports` produces.** Do not manually flip key order or restore from git. The local fresh build and CI agree on the same ordering, so the build output is exactly what CI expects. If you restore the old order, CI will fail.

There are two situations:

1. **The only diff is key reorderings** (no real API additions/removals): Commit the updated file. The reordering is spurious but CI requires it.

2. **The diff contains both real API changes and key reorderings:** Commit the entire file as-is. Both the real changes and the reorderings match what CI will produce.

---

## After tree reports updated: cascade to aggregator packages

If `@fluidframework/tree`'s API reports actually changed (check `git diff` on `packages/dds/tree/api-report/`), also regenerate the reports for packages that re-export from it:

```bash
cd packages/framework/fluid-framework && pnpm exec fluid-build . -t build:api-reports
cd packages/service-clients/azure-client && pnpm exec fluid-build . -t build:api-reports
```

If the tree reports are unchanged, skip this — the aggregator reports won't change either.

After running either of these, apply the same phantom key-reorder check above — the same bug affects their reports for the same reason.
