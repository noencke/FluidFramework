---
"@fluidframework/tree": minor
"__section": feature
---

Add SchemaFactoryAlpha.stagedOptionalRecursive for recursive schema support

`SchemaFactoryAlpha.stagedOptionalRecursive(T)` is the recursive-type variant of
`stagedOptional`, with relaxed type constraints to work around TypeScript limitations with
recursive schema definitions. Use with `ValidateRecursiveSchema` for improved type safety.
