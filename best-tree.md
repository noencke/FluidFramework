# SharedTree is the Best Tree

Building applications is hard.
Building enterprise applications where documents are shared between multiple users and are subject to performance, durability, cost, and compliance requirements is even harder.
The SharedTree library, powered by the Fluid Framework suite, addresses every major hurdle in one tidy package.
Its state-of-the-art OT/CRDT-hybrid architecture manages the full stack of the application, from server to client.
It provides durable persistence, real-time collaborative editing and conflict-free concurrency via a hyper-friendly query model while still remaining cheap, fast, simple and enterprise-compliant.
Simply put, there are no other software packages that do as much for as little cost.
This document will highlight high-value SharedTree features and note their equivalent support (or lack thereof) in various frameworks serving a similar problem space.

## Fluid Framework + SharedTree

Fluid Framework is the underlying architecture that the application-facing SharedTree library builds on top of.
Among other offerings, Fluid provides a service implementation powered by SharePoint Embedded that can be easily hosted on Azure and comes with enterprise-required features out of the box (for example, data lifetime management).
A front-end application then uses the SharedTree client library to interface with the Fluid service, abstracting away any of the service protocols.

## State Machine Replication

The service protocols are simple.
**When clients write data they immediately update their own local state optimistically.**
They then send deltas (descriptions of the changes) to the service.
The service orders and logs these deltas - nothing more.
Clients retrieve these deltas and employ deterministic operational transformation to rebase them before applying them locally, thus, all clients agree on their state at any position in the log.
This architecture means that **the service is _extremely cheap_, both in cost and in complexity**.
It's the best of two worlds: centralized ordering like classic OT systems, with CRDT-style merge semantics for rich tree edits.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ❌ | Network-agnostic CRDT; no central orderer. Providers like `y-websocket` are relays only. |
| Collabs | ❌ | Network/storage-agnostic hybrid CRDTs; providers (`@collabs/ws-server`, IndexedDB) impose no global order. |
| Automerge | ❌ | Peer-to-peer; `automerge-repo` adapters target arbitrary topologies, not ordered logs. |
| Yorkie | ✔ | Centralized server assigns each change a `ServerSeq`, persists it, and fans out; replicas replay in server order. |
| Firebase | ❌ | Database with query indices, rules, and a transactional engine — not a minimal delta-log service. |
| Liveblocks | ✔ | Centralized server totally orders Storage deltas over WebSocket; clients replicate in server order. |
| Convex | ❌ | Reactive database that computes server-side state and pushes query results, not delta-log replication. |
| Loro | ❌ | Network-agnostic peer-to-peer CRDT; sync via `import()`/`export()` over any transport, no central orderer. |
| Jazz | ✔ | Jazz Cloud (or self-hosted) acts as the source of truth; clients sync deltas through the server. |

## Storage

Application data is stored in documents by the service.
One document maps to one file on SharePoint.
Like any SharePoint file, these **files can be shared, permissioned, and rolled back with ease**.

As an optimization, the service is periodically updated with a compaction of the document's delta log into a cumulative snapshot of the data, which is also stored in the file.
This snapshot is produced by a client to keep service costs minimal.
Applications may also upload large, unstructured blobs of data (e.g. images) to the service and embed them by reference into the application document.

**All stored data - snapshots, deltas or blobs - is subject to garbage collection, search, and eDiscovery automatically. Combined with the snapshot optimization, service storage costs _and_ compute remain radically low without any additional work by the application developer.**

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ❌ | No built-in storage; community providers (`y-indexeddb`, `y-leveldb`, `y-redis`). No file/permission model, GC, search, eDiscovery, or blobs. |
| Collabs | ❌ | Ships browser storage providers and a WS server; no managed file abstraction, permissioning, search, eDiscovery, or blobs. |
| Automerge | ❌ | Compact binary save/load + `automerge-repo` adapters, but no file/permission model, eDiscovery, search, or referenced-blob workflow. |
| Yorkie | ❌ | MongoDB persistence with server-side compaction and named revisions, but no file/permission model, search, eDiscovery, or blob attachments. |
| Firebase | ❌ | Firestore + Cloud Storage + Security Rules cover blobs and permissioning, but no file model, eDiscovery, or delta-log compaction. |
| Liveblocks | ❌ | Rooms persist, but no file/permission/rollback model, snapshot/compaction APIs, search, eDiscovery, or blob-by-reference primitives in native Storage. |
| Convex | ❌ | File Storage and full-text/vector search exist, but no document-as-file model, eDiscovery, point-in-time rollback, or delta-log compaction. |
| Loro | ❌ | Snapshots, shallow snapshots, and compaction/GC are first-class, but no file/permission/rollback model, search, eDiscovery, or referenced-blob workflow. |
| Jazz | ❌ | Snapshot DAG, row-level security, and `createFileFromBlob()` cover a lot, but no file model with rollback, eDiscovery, or search; some GC still planned. |

## Data Migration

The document data schema is defined, enforced, and evolved in the client application code.
This makes it easy for application developers to reason about their service-stored data schema alongside their customer-facing feature code.
The SharedTree library provides simple and robust APIs for defining an application data schema.
The schema is enforced during all client writes to prevent document corruption.

The schema may also be changed as the application evolves.
This is also done in the client code, with careful APIs that guarantee reading, writing, and collaboration remain seamless between clients - even across different application versions with different schema!
This **allows developers to deliver new features with minimal friction and with well-defined guardrails around how and when rollouts must happen.**

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ❌ | Schemaless; no definition, enforcement, or migration helpers — entirely the app's responsibility. |
| Collabs | ❌ | Schema implicit in `CObject` structure; no validation API or migration story; older clients not guaranteed to interop. |
| Automerge | ❌ | Dynamically typed JSON-like docs; no schema or cross-version migration coordination. |
| Yorkie | ❌ | Optional attach-time schema validation key, but no managed cross-version evolution. |
| Firebase | ❌ | Schemaless; Security Rules can validate field shapes but offer no schema language, versioning, or migration path. |
| Liveblocks | ❌ | No schema definition, validation, or migration tooling for native Storage. |
| Convex | ❌ | Optional `v.*` validators enforce types and a Migrations component exists, but no managed cross-version interop between app schemas. |
| Loro | ❌ | `Mirror` validates updates against a schema, but no managed schema evolution or version negotiation. |
| Jazz | ✔ | TypeScript-defined schemas with "fluid migrations" (Cambria-inspired bidirectional transforms) keep old and new app versions interoperating. |

## JSON-Compatible POJO Read/Write API

Because the application data schema is defined in the client, the SharedTree library can produce type-safe read and write APIs for the document data from a single source of truth.
SharedTree provides a friendly API that looks and feels like "plain old JavaScript objects" - **developers do not need to learn a new language or even a new API in order to interact with the data.**
Specialized features of SharedTree, like Branching and Moves, are given intuitive APIs that mimic common JavaScript conventions as closely as possible.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ❌ | Method-based shared types (`Y.Map`, `Y.Array`, `Y.Text`, `Y.XmlFragment`); devs learn a new API rather than mutating plain props. |
| Collabs | ❌ | Method-based mutation on `CObject`/`CMap`/`CList`/`CVar`; type-safe but distinctly non-POJO. |
| Automerge | ✔ | Proxy-based mutation inside `change()` (`doc.list.push(x)`); doc is a frozen snapshot outside callbacks. |
| Yorkie | ✔ | `doc.update((root) => …)` proxies POJO mutation; specialized CRDT types (`Text`, `Tree`, `Counter`) need their own APIs. |
| Firebase | ❌ | JSON-shaped data, but reads/writes go through `getDoc`/`setDoc`/`updateDoc` — no proxy-based mutation. |
| Liveblocks | ❌ | Method-based mutation on `LiveObject`/`LiveMap`/`LiveList` (`.set()`, `.update()`, `.push()`); no proxy mutation. |
| Convex | ❌ | Function-based mutations (`ctx.db.patch()`, `replace()`, `insert()`); no proxy mutation. |
| Loro | ❌ | Method-based handlers (`getMap`, `getText`, `insert`); `toJSON()` is read-only. |
| Jazz | ❌ | ORM-style API (`db.insert/update/delete`); no proxy POJO mutation. |

## Identity + Moves

SharedTree gives all data strong identities that are easy to reference with JavaScript bindings.
Even **when data moves from one part of the document to another, clients will effortlessly retain any existing references to it and all concurrent edits will merge properly.**

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ❌ | `Y.RelativePosition` tracks positions, but no move op; emulated as delete+insert, losing identity and concurrent edits. |
| Collabs | ✔ | `CList.move()` (Kleppmann algorithm) preserves concurrent ops; `CollabID` provides stable cross-replica refs. |
| Automerge | ❌ | Stable `ExId` per object, but no built-in move; delete+insert can lose identity and concurrent edits. |
| Yorkie | ✔ | RGA-backed `Array.move`; every element has a stable `TimeTicket`; concurrent edits to moved elements are preserved. |
| Firebase | ❌ | No CRDT semantics, no node identity beyond doc IDs, no concurrency-safe move. |
| Liveblocks | ✔ | `LiveList.move(from, to)` preserves stable IDs and concurrent edits to the moved item. |
| Convex | ❌ | Document-level `_id` only; no move operation, no concurrency-safe reorder primitive. |
| Loro | ✔ | `MovableList` and `MovableTree` (Kleppmann/highly-available move algorithms) keep stable IDs and concurrent edits across moves. |
| Jazz | ❌ | Rows have stable IDs, but no documented `CoList.move()` that preserves concurrent edits during a move. |

## Granular Change Notifications

SharedTree provides a straightforward callback API for listening for changes to arbitrary layers of the data.
**Application UX can be rigorously optimized to respond precisely to relevant, partial data changes.**

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ✔ | `observe()` / `observeDeep()` on any shared type, with Quill-style delta events pinpointing changes. |
| Collabs | ✔ | Every `Collab` is an `EventEmitter` (`Set`/`Delete`/`Insert`/`Move`/…), so subscriptions can target any leaf in the tree. |
| Automerge | ❌ | `DocHandle` emits a single doc-level `change` event with a patch array; apps must route patches to interested views. |
| Yorkie | ✔ | Whole-doc `subscribe()` plus path-scoped `subscribe('$.path', …)`, plus separate streams for presence/sync/connection. |
| Firebase | ✔ | `onSnapshot` listeners on docs and queries with change diffs; granularity is doc/query, not per-field. |
| Liveblocks | ✔ | `room.subscribe(item, cb, { isDeep: true })` supports nested change tracking with insert/delete/update/move/set discrimination. |
| Convex | ✔ | Query-level subscriptions with automatic dependency tracking; clients only re-render on relevant changes (no per-field paths). |
| Loro | ✔ | Root, container, and JSONPath subscriptions with diff payloads. |
| Jazz | ✔ | Reactive `useAll()`/`subscribeAll()` with `.where()` filtering scopes notifications to relevant rows. |

## Transactions + Undo/Redo

**SharedTree has first-class support for ACID transactions** with optional rollback conditions (a.k.a. "constraints").
**Undo/redo support is native.**
Every edit produces a callable inverse edit that can be used to cleanly revert the first edit - even in the face of arbitrary intermediate edits from other clients.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ✔ | `doc.transact()` groups changes; `Y.UndoManager` provides scope-aware undo/redo. Not ACID — no constraint/rollback. |
| Collabs | ❌ | No built-in transactions-with-constraints and no built-in undo manager. |
| Automerge | ❌ | `change()` allows in-callback `rollback()`, but no native undo/redo — apps must derive inverses themselves. |
| Yorkie | ✔ | `document.update()` groups edits; built-in `doc.history.undo()`/`redo()` (50-deep) handles concurrent remote edits. No ACID constraint rollback. |
| Firebase | ❌ | True ACID `runTransaction` and batched writes, but no native undo/redo. |
| Liveblocks | ✔ | `room.batch()` groups changes atomically; `room.history` provides `undo()`/`redo()`/`pause()`/`resume()`. Not ACID with constraints. |
| Convex | ❌ | Mutations are serializable ACID transactions with auto-retry, but no native undo/redo manager. |
| Loro | ✔ | `doc.txn()` batches operations; native `UndoManager` handles concurrent edits. Explicitly not ACID. |
| Jazz | ❌ | Tunable consistency with optimistic local writes; full ACID is on the launch TODO and there is no native undo/redo. |

## Branching

SharedTree can create **version-control-style local branches that allow edits to be applied and rebased in isolation before being merged** in later.
Branches are essential for staging edits performed by agentic AI before final approval by the human-in-the-loop.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ❌ | No native branching; can be approximated by serialize/fork/replay, but no rebase or staged-edit/merge API. |
| Collabs | ❌ | No native branching API; forks must be assembled manually from saved state. |
| Automerge | ✔ | Flagship feature — `clone()`, `fork()`, `fork_at(heads)`, `merge()` provide a full Git-style workflow at any historical point. |
| Yorkie | ❌ | Immutable named revisions + `restoreRevision()` are save-points, not working branches. |
| Firebase | ❌ | No branching; snapshots/backups are for disaster recovery only. |
| Liveblocks | ❌ | No branching primitives in native Storage. |
| Convex | ❌ | Single shared database; no isolation or merge semantics. |
| Loro | ✔ | `fork()`/`fork_at(frontiers)`/`checkout()`/`import()` provide a full Git-like branch/merge/time-travel model. |
| Jazz | ✔ | Branching is native end-to-end (storage to sync protocol to APIs); per-field merge strategies and authorship metadata built in. |

## Summary

| Feature | FF + SharedTree | Yjs | Collabs | Automerge | Yorkie | Firebase | Liveblocks | Convex | Loro | Jazz |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| State Machine Replication | ✔ | ❌ | ❌ | ❌ | ✔ | ❌ | ✔ | ❌ | ❌ | ✔ |
| Storage | ✔ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Data Migration | ✔ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✔ |
| JSON-Compatible POJO Read/Write API | ✔ | ❌ | ❌ | ✔ | ✔ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Identity + Moves | ✔ | ❌ | ✔ | ❌ | ✔ | ❌ | ✔ | ❌ | ✔ | ❌ |
| Granular Change Notifications | ✔ | ✔ | ✔ | ❌ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Transactions + Undo/Redo | ✔ | ✔ | ❌ | ❌ | ✔ | ❌ | ✔ | ❌ | ✔ | ❌ |
| Branching | ✔ | ❌ | ❌ | ✔ | ❌ | ❌ | ❌ | ❌ | ✔ | ✔ |
