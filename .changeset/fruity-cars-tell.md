---
"@fluidframework/tree": minor
"__section": feature
---

Add SchemaFactoryAlpha.stagedOptional and stagedOptionalRecursive for incremental required-to-optional field migrations

`SchemaFactoryAlpha.stagedOptional(T)` enables incremental migration of a field from required to
optional. It creates a field that is optional in the view schema but stored as required in the
stored schema until all clients have been upgraded, avoiding the need for a coordinated
simultaneous deployment.

`SchemaFactoryAlpha.stagedOptionalRecursive(T)` is the recursive-type variant, with relaxed type
constraints to work around TypeScript limitations with recursive schema definitions. Use with
`ValidateRecursiveSchema` for improved type safety.

Migration path:
1. Start with `sf.required(T)` - all clients require the field.
2. Deploy `sf.stagedOptional(T)` (or `sf.stagedOptionalRecursive(T)` for recursive schemas) -
   new clients see the field as optional and can read documents whether the field is present or
   absent, but the stored schema stays required so old clients are not broken. Writing
   `undefined` is blocked at runtime during this phase.
3. Deploy `sf.optional(T)` once all clients have been updated - the stored schema becomes
   optional and the field can be cleared.

Example:

```typescript
const sf = new SchemaFactoryAlpha("my-app");
class MyObject extends sf.object("MyObject", {
  name: sf.string,
  // Was sf.required — now transitioning to optional:
  nickname: sf.stagedOptional(sf.string),
}) {}
```

Example (recursive schema):

```typescript
const sf = new SchemaFactoryAlpha("my-app");
class TreeNode extends sf.objectRecursiveAlpha("TreeNode", {
  value: sf.number,
  child: sf.stagedOptionalRecursive([() => TreeNode]),
}) {}
type _check = ValidateRecursiveSchema<typeof TreeNode>;
```
