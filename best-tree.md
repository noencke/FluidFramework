# Fluid Framework Makes It Easy

Building applications is hard.
Building enterprise applications where data is shared between multiple users and is subject to performance, durability, cost, and compliance requirements is even harder.
There are several critical design areas that are incredibly difficult to get right, requiring the coordination of multiple teams with specialized knowledge.
For example, a typical application which merely renders some shared, mutable state needs to solve (or give up on):

* Collaboration where every user converges to the same document state, even in the face of concurrent edits
* Durable storage that supports sharing, permissions, and version restore
* Centralized search, audit logs, eDiscovery, retention/legal hold and service-level compliance controls
* Schema evolution that lets new app features ship without breaking older clients still in the wild
* Identity preservation of data so that references, attribution, and concurrent edits survive when content changes/moves
* Atomic transactions to maintain document data invariants when writing

That's just a baseline document-powered application, and the requirements are already enormous.
Modern competitive applications also demand:

* Creating branches to stage edits for review and merge (essential for human-in-the-loop AI workflows)
* Blob storage for large binary content (images, attachments) with automatic cleanup of unreferenced data
* Reliable undo and redo operations
* High frequency edits (many edits per second per client)
* Presence information - which users are viewing/editing what, in real time
* A service whose COGS start low and stay low, even as documents grow/age

The **Fluid Framework addresses every one of these hurdles in one tidy package**.
_And it even has an ecosystem-friendly and developer-friendly API._

Fluid has a mature client library and a robust service implementation, powered by SharePoint Embedded and easily hostable on Azure.
Put simply, if you want to build a document-based enterprise app in the Microsoft ecosystem, Fluid is the de facto option.

## How is this possible?

Fluid's state-of-the-art hybrid OT and CRDT-inspired architecture efficiently manages the full stack of the application, from server to client.
It provides durable persistence, real-time collaborative editing and conflict-free concurrency via a hyper-friendly query model while still remaining cheap, fast, simple and enterprise-compliant.

Fluid's architecture takes inspiration from decentralized architectures - for example, serverless peer-to-peer CRDTs.
CRDTs are excellent at:

* Merging concurrent edits without coordination
* Local responsiveness; every edit applies instantly with no server roundtrip
* Horizontal scalability; there's no single bottleneck or coordinator to overload
* Cheap infrastructure; "servers" are relays at most, all meaningful logic is performed by the clients

But these decentralized systems suffer from various drawbacks which are typically non-starters for enterprise applications:

* No total ordering of edits - therefore, only "commutative" edits are possible (this severely restricts the kinds of edits a system can support)
* No agreed serialization point, so ACID transactions and global invariants/constraints are impossible to enforce
* Every peer eventually pays the full bandwidth and storage cost of every change ever made
* No trusted service layer to index data for search/discovery, control access, or collect garbage

Inspired by CRDTs, but not bound to a strict CRDT architecture, Fluid takes a hybrid approach.
It reaps the rewards and dodges the downsides by introducing a centralized service - but one that is extremely minimal.
The service's primary duty is to provide a total ordering to edits - a trivially simple duty in both complexity and service COGS.
A total-ordering service is used by other "operational transform"-style architectures (e.g. Google Docs), but Fluid goes the extra mile to **do everything possible on the client, not the service.**
The centralized service provides capabilities that _only_ a centralized service can provide - for example, enterprise search/audit/eDiscovery/legal retention/permissions and automatic garbage collection of document assets.
But beyond that, anything that _can_ be delegated to the clients _is_ delegated to the clients.
That keeps service COGS minimal.

## But Does My Application Need Collaboration at All?

**Very likely, your application needs collaborative capabilities**.
Consider a "document-based application" - one whose data is stored in documents that are created and owned by users.
Office applications like Word, Excel and PowerPoint follow this model.

The application needs to handle collaboration (multiple views of the same document at the same time) if:

* Users can share files with other users
* A user can open a file on two devices at once
* A user can open two web browser tabs viewing the same file at once
* An AI agent outside of the application (e.g. Copilot) can read or edit a document

Most modern applications will have all or most of these needs.

## Fluid Features

**There are no other software packages available that do as much for as little cost.**
Below, this document highlights some of Fluid's most high-value features and notes their equivalent support (or lack thereof) in various frameworks tackling a similar problem space.

| Icon | Meaning |
| :-: | --- |
| ✔ | Fully, natively supported out of the box |
| ○ | Partial support, or only available via DIY pattern, opt-in feature, or first-party add-on |
|   | Not supported |

### Optimistic Edits

**When clients write data they immediately update their own local state optimistically.**
They then send deltas (descriptions of the changes) to the service.
The service replies, and even if other clients made concurrent edits at the same time, all clients will order and rebase their changes in the same way, remaining consistent.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ✔ | All shared-type mutations apply locally immediately; remote ops are merged via CRDT semantics on receive. |
| Collabs | ✔ | Same model as Yjs — local CRDT writes are immediate; remote ops are merged on receive. |
| Automerge | ✔ | `change()` mutates the local doc immediately; sync via `automerge-repo` rebases concurrent edits on receive. |
| Yorkie | ✔ | `document.update()` applies locally first, then syncs through the server which assigns global order. |
| Firebase | ○ | Firestore offline persistence applies writes locally with `hasPendingWrites`; reconciliation is last-write-wins per field, not a rebase. |
| Liveblocks | ✔ | LiveObject/LiveMap/LiveList mutations apply locally immediately; the server orders and rebroadcasts. |
| Convex | ○ | Optimistic UI via `useMutation(…).withOptimisticUpdate()` is opt-in per mutation and overwritten by the server's authoritative result. |
| Loro | ✔ | All handler mutations apply locally immediately; remote ops are merged via CRDT semantics on `import()`. |
| Jazz | ✔ | "Optimistic local writes that resolve centrally" is a headline feature; the central server has final say but local edits never block. |

### Persistence

Application data is stored in documents by the service.
One document maps to one file on SharePoint.
Like any SharePoint file, these **files can be shared, permissioned, and rolled back with ease**.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs |   | Library/protocol only; persistence depends on providers such as IndexedDB/LevelDB/Redis/Hocuspocus, so file sharing, permissions, and rollback require a separate service. |
| Collabs |   | Library plus WS server; no managed central document service for file sharing, permissions, or rollback. |
| Automerge | ○ | No managed document service; storage adapters persist binary docs with history and support time-travel/forking, but file sharing, permissions, and rollback are app/service responsibilities. |
| Yorkie | ○ | Named revisions + `restoreRevision()` provide document-level rollback; Auth Webhook covers permissioning, but no file-as-document abstraction. |
| Firebase | ○ | Document-level Security Rules + PITR (≤ 7 days) + scheduled backups; rollback granularity is project-wide, not per-document. |
| Liveblocks |   | Persistent rooms with access controls, but no rollback. |
| Convex | ○ | Documents in tables with scheduled backups + point-in-time backup snapshots; permissions are app-implemented, no per-document rollback. |
| Loro |   | Library-only; `checkout(version)` enables time-travel, but file sharing, permissions, and rollback require a separate service. |
| Jazz | ○ | Row-level security + per-row git-like history with soft/hard delete enable rollback; no file-as-document model. |

### Compaction + Coordination

As an optimization, the service is periodically updated with a compaction of the document's delta log into a cumulative snapshot of the data, which is also stored in the file.
This means old edits can be forgotten - Fluid's storage cost scales with the _size_ of the file, not with _time_ (the number of edits to the file).
The snapshot is produced by a client, not the service itself, to keep service costs minimal.
Therefore, **service storage _and_ compute costs remain radically low without any additional work by the application developer.**

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ○ | No managed service to coordinate lifecycle; `Y.encodeStateAsUpdate` + `mergeUpdates` and `doc.gc` reduce stored state, but CRDT metadata/tombstones still accumulate and no canonical snapshot lifecycle exists. |
| Collabs |   | Library-only; no central service to coordinate compaction lifecycle. |
| Automerge |   | No managed service to coordinate compaction; `automerge-repo` exposes hooks, but lifecycle is app/operator responsibility. |
| Yorkie |   | Server-side compaction shrinks storage but keeps compute on the server. |
| Firebase |   | No delta log to compact. |
| Liveblocks |   | v2 storage engine compacts opaquely server-side; no client-driven snapshots. |
| Convex |   | No delta log to compact. |
| Loro | ○ | Library-only; `shallow_snapshot()` truncates pre-cutoff history (~70–90% smaller), but snapshots still encode per-op CRDT metadata and no service-coordinated lifecycle exists. |
| Jazz |   | Snapshot DAG maintained server-side. |

### Blob storage + Lifetime Management

Applications may also upload large, unstructured blobs of data (e.g. images) to the service and embed them by reference into the application document.
**If blob references are removed from the document, the corresponding blobs are automatically garbage collected.**
This is critical for document longevity and extremely difficult to implement from scratch.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs |   | Library/protocol only; no central document service to own blob references or garbage collect external files. |
| Collabs |   | Library-only; no central document service for blob storage or lifetime management. |
| Automerge |   | No managed document service for blob references/lifetime management; binary data is app-managed or stored inline. |
| Yorkie |   | No native blob attachments. |
| Firebase | ○ | Cloud Storage holds blobs referenced by URL with Security Rules, but no automatic GC of unreferenced files. |
| Liveblocks |   | No blob-by-reference primitives in native Storage. |
| Convex | ○ | File Storage uploads referenced by `_id` with metadata, but no automatic GC when references are removed. |
| Loro |   | Library-only; external blob storage and garbage collection must be provided separately. |
| Jazz | ○ | `createFileFromBlob()`/`createFileFromStream()` chunked file storage by reference; no automatic GC of orphaned blobs. |

### Compliance

The SharePoint service ensures the application's data remains compliant with enterprise requirements.
Because Fluid documents are SharePoint/OneDrive files, they inherit a broad Microsoft 365 compliance surface: central content search, audit logs, eDiscovery, retention/legal hold, encryption, access controls, and relevant service compliance programs such as SOC 2 Type II and HIPAA.
**The important distinction is service ownership: these controls require a trusted central service that can index, govern, and audit the data.**

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs |   | Library/protocol only; no managed central service to index, audit, retain, or produce content for eDiscovery. Providers such as Hocuspocus would need to add those controls. |
| Collabs |   | Library-only; no managed service to provide search, audit logs, retention, or eDiscovery. |
| Automerge |   | No managed central service to index or govern documents; search, audit logs, retention, and eDiscovery require app/service integration. |
| Yorkie |   | Centralized sync service, but no enterprise content search, audit-log, retention/legal-hold, or eDiscovery integration. |
| Firebase | ○ | Managed service with Cloud Audit Logs and indexed queries, but no document content search, legal-hold/eDiscovery workflow, or Microsoft 365-style file governance. |
| Liveblocks | ○ | Managed service with SOC 2 Type II + HIPAA compliance, audit trail, and encryption at rest/transit; no content search, retention/legal hold, or eDiscovery primitives. |
| Convex | ○ | Managed service with first-class full-text + vector search; no audit-log, retention/legal-hold, or eDiscovery primitives. |
| Loro |   | Library-only; no managed service to provide search, audit logs, retention, or eDiscovery. |
| Jazz |   | Central sync/storage service with row-level security/history, but no enterprise search, audit-log, retention/legal-hold, or eDiscovery controls. |

### Data Migration

The document data schema is defined, enforced, and evolved in the client application code.
This makes it easy for application developers to reason about their service-stored data schema alongside their customer-facing feature code.
Fluid provides simple and robust APIs for defining an application data schema.
The schema is enforced during all client writes to prevent document corruption.

The schema may also be changed as the application evolves.
This is also done in the client code, with careful APIs that guarantee reading, writing, and collaboration remain seamless between clients - even across different application versions with different schemas!
This **allows developers to deliver new features with minimal friction and with well-defined guardrails around how and when rollouts must happen.**

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs |   | Schemaless; no definition, enforcement, or migration helpers — entirely the app's responsibility. |
| Collabs |   | Schema implicit in `CObject` structure; no validation API or migration story; older clients not guaranteed to interop. |
| Automerge |   | Dynamically typed JSON-like docs; no schema or cross-version migration coordination. |
| Yorkie | ○ | Schema validation with rich types + immutable schema versioning; no automatic cross-version evolution (clients must detach/reattach to switch versions). |
| Firebase |   | Schemaless; Security Rules can validate field shapes but offer no schema language, versioning, or migration path. |
| Liveblocks |   | No schema definition, validation, or migration tooling for native Storage. |
| Convex | ○ | Optional `v.*` validators enforce types; first-party Migrations component (`@convex-dev/migrations`) handles online migrations, but no managed cross-version interop. |
| Loro | ○ | `Mirror` package provides write-time `validateUpdates` (default) and explicit `validateSchema()`; no managed schema evolution. |
| Jazz | ✔ | TypeScript-defined schemas with "fluid migrations" (Cambria-inspired bidirectional transforms) keep old and new app versions interoperating. |

### JSON-Compatible POJO Read/Write API

Because the application data schema is defined in the client, Fluid can produce type-safe read and write APIs for the document data from a single source of truth.
Fluid provides a friendly API that looks and feels like "plain old JavaScript objects" - **developers do not need to learn a new language or even a new API in order to interact with the data.**
Specialized features of Fluid, like Branching and Moves, are given intuitive APIs that mimic common JavaScript conventions as closely as possible.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ○ | Method-based core types (`Y.Map`/`Y.Array`/`Y.Text`), but README-endorsed bindings (SyncedStore, valtio-yjs, immer-yjs) wrap them in proxy-based POJO mutation. |
| Collabs |   | Method-based mutation on `CObject`/`CMap`/`CList`/`CVar`; type-safe but distinctly non-POJO. |
| Automerge | ✔ | Proxy-based mutation inside `change()` (`doc.list.push(x)`); doc is a frozen snapshot outside callbacks. |
| Yorkie | ✔ | `doc.update((root) => …)` proxies POJO mutation; specialized CRDT types (`Text`, `Tree`, `Counter`) need their own APIs. |
| Firebase |   | JSON-shaped data, but reads/writes go through `getDoc`/`setDoc`/`updateDoc` — no proxy-based mutation. |
| Liveblocks |   | Method-based mutation on `LiveObject`/`LiveMap`/`LiveList` (`.set()`, `.update()`, `.push()`); no proxy mutation. |
| Convex |   | Function-based mutations (`ctx.db.patch()`, `replace()`, `insert()`); no proxy mutation. |
| Loro | ○ | Method-based handlers (`getMap`/`getText`/`insert`); the `Mirror` package adds declarative two-way reactive binding (`setState()`), but not true proxy mutation. |
| Jazz |   | ORM-style API (`db.insert/update/delete`); no proxy POJO mutation. |

### Branching

Fluid can create **version-control-style local branches that allow edits to be applied and rebased in isolation before being merged** in.
_Branches are essential for staging edits performed by agentic AI before final approval by a human-in-the-loop._

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs |   | No native branching; can be approximated by serialize/fork/replay, but no rebase or staged-edit/merge API. |
| Collabs |   | No native branching API; forks must be assembled manually from saved state. |
| Automerge | ✔ | Flagship feature — `clone()`, `fork()`, `fork_at(heads)`, `merge()` provide a full Git-style workflow at any historical point. |
| Yorkie |   | Immutable named revisions + `restoreRevision()` are save-points, not working branches. |
| Firebase |   | No branching; snapshots/backups are for disaster recovery only. |
| Liveblocks |   | No branching primitives in native Storage. |
| Convex |   | Single shared database; no isolation or merge semantics. |
| Loro | ✔ | `fork()`/`fork_at(frontiers)`/`checkout()`/`import()` provide a full Git-like branch/merge/time-travel model. |
| Jazz | ✔ | Branching is native end-to-end (storage to sync protocol to APIs); per-field merge strategies and authorship metadata built in. |

### Identity + Moves

Fluid gives all data strong identities that are easy to reference with JavaScript bindings.
Even **when data moves from one part of the document to another, clients will effortlessly retain any existing references to it and all concurrent edits will merge properly.**

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs |   | `Y.RelativePosition` tracks positions, but no move op; emulated as delete+insert, losing identity and concurrent edits. |
| Collabs | ✔ | `CList.move()` (Kleppmann algorithm) preserves concurrent ops; `CollabID` provides stable cross-replica refs. |
| Automerge | ○ | Stable `ExId` per object preserves identity across edits, but no built-in move op — delete+insert still loses concurrent edits. |
| Yorkie | ✔ | RGA-backed `Array.move`; every element has a stable `TimeTicket`; concurrent edits to moved elements are preserved. |
| Firebase |   | No CRDT semantics, no node identity beyond doc IDs, no concurrency-safe move. |
| Liveblocks | ✔ | `LiveList.move(from, to)` preserves stable IDs and concurrent edits to the moved item. |
| Convex |   | Document-level `_id` only; no move operation, no concurrency-safe reorder primitive. |
| Loro | ✔ | `MovableList` and `MovableTree` (Kleppmann/highly-available move algorithms) keep stable IDs and concurrent edits across moves. |
| Jazz | ○ | Stable UUID row identity preserved across operations, but no documented `CoList.move()` for concurrency-safe reorder. |

### Presence

**Fluid natively provides lightweight network side channels for transient data that doesn't need to be persisted, like presence signals.**
Like everything else, this capability is provided as a first-class API and makes it easy for applications to broadcast messages that don't belong in the document itself.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ✔ | First-class `Awareness` protocol (`y-protocols/awareness`) with `setLocalState()`/`getStates()`/`on('change')` for ephemeral per-client state. |
| Collabs | ✔ | First-class `CPresence<V>` ephemeral TTL-based map with heartbeats and per-replica value updates. |
| Automerge | ✔ | `DocHandle.broadcast(message)` plus `ephemeral-message` events provide best-effort, non-persisted peer messaging. |
| Yorkie | ✔ | First-class `initialPresence` + `doc.subscribe('presence', …)`; ships Multi-Cursor and Profile Stack widgets. |
| Firebase | ○ | RTDB `.onDisconnect()` is a first-class Firebase primitive specifically positioned for building presence; not a managed presence API. |
| Liveblocks | ✔ | Headline feature: `room.updatePresence()`, `useMyPresence()`, `useOthers()`, `initialPresence`. |
| Convex | ○ | Official first-party Presence component (`@convex-dev/presence`) tracks online status via scheduled functions; not in the Convex core. |
| Loro | ✔ | First-class `EphemeralStore` (timestamp-based LWW with partial updates) plus legacy `Awareness` for ephemeral per-peer state. |
| Jazz |   | No ephemeral CoValue or presence primitive. |

### Transactions + Undo/Redo

**Fluid has first-class support for ACID transactions** with optional rollback conditions (a.k.a. "constraints").
**Undo/redo support is native.**
Every edit produces a callable inverse edit that can be used to cleanly revert the first edit - even in the face of arbitrary intermediate edits from other clients.
Undo/redo works seamlessly with branching - each branch has its own undo/redo stack.

| Framework | Support | Notes |
| --- | :-: | --- |
| Yjs | ✔ | `doc.transact()` groups changes; `Y.UndoManager` provides scope-aware undo/redo. Not ACID — no constraint/rollback. |
| Collabs |   | No built-in transactions-with-constraints and no built-in undo manager. |
| Automerge | ○ | `change()` allows in-callback `rollback()` for atomic transaction abort, but no native undo/redo manager. |
| Yorkie | ✔ | `document.update()` groups edits; built-in `doc.history.undo()`/`redo()` (50-deep) handles concurrent remote edits. No ACID constraint rollback. |
| Firebase | ○ | True ACID `runTransaction` and batched writes, but no native undo/redo. |
| Liveblocks | ✔ | `room.batch()` groups changes atomically; `room.history` provides `undo()`/`redo()`/`pause()`/`resume()`. Not ACID with constraints. |
| Convex | ○ | Mutations are serializable ACID transactions with auto-retry, but no native undo/redo manager. |
| Loro | ✔ | `doc.txn()` batches operations; native `UndoManager` handles concurrent edits. Explicitly not ACID. |
| Jazz | ○ | `db.transaction()`/`db.batch()` with `commit()`/`rollback()` and tunable durability tiers; no native undo/redo. |

## Framework Feature Summary

| Feature | Fluid Framework | Yjs | Collabs | Automerge | Yorkie | Firebase | Liveblocks | Convex | Loro | Jazz |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Optimistic Edits | ✔ | ✔ | ✔ | ✔ | ✔ | ○ | ✔ | ○ | ✔ | ✔ |
| Persistence | ✔ |   |   | ○ | ○ | ○ |   | ○ |   | ○ |
| Compaction + Coordination | ✔ | ○ |   |   |   |   |   |   | ○ |   |
| Blob storage + Lifetime Management | ✔ |   |   |   |   | ○ |   | ○ |   | ○ |
| Compliance | ✔ |   |   |   |   | ○ | ○ | ○ |   |   |
| Data Migration | ✔ |   |   |   | ○ |   |   | ○ | ○ | ✔ |
| JSON-Compatible POJO Read/Write API | ✔ | ○ |   | ✔ | ✔ |   |   |   | ○ |   |
| Branching | ✔ |   |   | ✔ |   |   |   |   | ✔ | ✔ |
| Identity + Moves | ✔ |   | ✔ | ○ | ✔ |   | ✔ |   | ✔ | ○ |
| Presence | ✔ | ✔ | ✔ | ✔ | ✔ | ○ | ✔ | ○ | ✔ |   |
| Transactions + Undo/Redo | ✔ | ✔ |   | ○ | ✔ | ○ | ✔ | ○ | ✔ | ○ |
