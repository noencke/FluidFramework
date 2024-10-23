/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	UsageError,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { noopValidator } from "../codec/index.js";
import {
	type Anchor,
	type AnchorLocator,
	type AnchorNode,
	AnchorSet,
	type AnchorSetRootEvents,
	type ChangeFamily,
	CommitKind,
	type CommitMetadata,
	type DeltaVisitor,
	type DetachedFieldIndex,
	type IEditableForest,
	type IForestSubscription,
	type JsonableTree,
	type Revertible,
	RevertibleStatus,
	type RevisionTag,
	type RevisionTagCodec,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	type TreeStoredSchemaSubscription,
	combineVisitors,
	makeDetachedFieldIndex,
	rebaseChange,
	rootFieldKey,
	tagChange,
	visitDelta,
	type RevertibleFactory,
} from "../core/index.js";
import {
	type HasListeners,
	type IEmitter,
	type Listenable,
	createEmitter,
} from "../events/index.js";
import {
	type FieldBatchCodec,
	type TreeCompressionStrategy,
	buildForest,
	createNodeKeyManager,
	intoDelta,
	jsonableTreeFromCursor,
	makeFieldBatchCodec,
} from "../feature-libraries/index.js";
import { SharedTreeBranch, getChangeReplaceType } from "../shared-tree-core/index.js";
import { Breakable, TransactionResult, disposeSymbol, fail } from "../util/index.js";

import { SharedTreeChangeFamily, hasSchemaChange } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { ISharedTreeEditor, SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import type { IDisposable } from "@fluidframework/core-interfaces";
import type {
	ImplicitFieldSchema,
	TreeView,
	TreeViewConfiguration,
	ViewableTree,
} from "../simple-tree/index.js";
import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";

/**
 * Events for {@link ITreeCheckout}.
 */
export interface CheckoutEvents {
	/**
	 * A batch of changes has finished processing and the view is in a consistent state.
	 * It is once again safe to access the FlexTree, Forest and AnchorSet.
	 *
	 * @remarks
	 * This is mainly useful for knowing when to do followup work scheduled during events from Anchors.
	 */
	afterBatch(): void;

	/**
	 * Fired when a revertible change has been made to this view.
	 *
	 * Applications which subscribe to this event are expected to revert or discard revertibles they acquire (failure to do so will leak memory).
	 * The provided revertible is inherently bound to the view that raised the event, calling `revert` won't apply to forked views.
	 *
	 * @param revertible - The revertible that can be used to revert the change.
	 */

	/**
	 * {@inheritdoc TreeViewEvents.commitApplied}
	 */
	commitApplied(data: CommitMetadata, getRevertible?: RevertibleFactory): void;
}

/**
 * A "version control"-style branch of a SharedTree.
 * @remarks Branches may be used to coordinate edits to a SharedTree, e.g. via merge and rebase operations.
 * Changes applied to a branch of a branch only apply to that branch and are isolated from other branches.
 * Changes may be synchronized across branches via merge and rebase operations provided on the branch object.
 * @alpha @sealed
 */
export interface TreeBranch extends ViewableTree {
	/**
	 * Spawn a new branch which is based off of the current state of this branch.
	 * Any mutations of the new branch will not apply to this branch until the new branch is merged back into this branch via `merge()`.
	 */
	branch(): TreeBranchFork;

	/**
	 * Apply all the new changes on the given branch to this branch.
	 * @param view - a branch which was created by a call to `branch()`.
	 * It is automatically disposed after the merge completes.
	 * @remarks All ongoing transactions (if any) in `branch` will be committed before the merge.
	 * A "commitApplied" event and a corresponding {@link Revertible} will be emitted on this branch for each new change merged from 'branch'.
	 */
	merge(branch: TreeBranchFork): void;

	/**
	 * Apply all the new changes on the given branch to this branch.
	 * @param branch - a branch which was created by a call to `branch()`.
	 * @param disposeMerged - whether or not to dispose `branch` after the merge completes.
	 * @remarks All ongoing transactions (if any) in `branch` will be committed before the merge.
	 */
	merge(branch: TreeBranchFork, disposeMerged: boolean): void;

	/**
	 * Rebase the given branch onto this branch.
	 * @param branch - a branch which was created by a call to `branch()`. It is modified by this operation.
	 */
	rebase(branch: TreeBranchFork): void;
}

/**
 * A {@link TreeBranch | branch} of a SharedTree that has merged from another branch.
 * @remarks This branch should be disposed when it is no longer needed in order to free resources.
 * @alpha @sealed
 */
export interface TreeBranchFork extends TreeBranch, IDisposable {
	/**
	 * Rebase the changes that have been applied to this branch over all the new changes in the given branch.
	 * @param branch - Either the root branch or a branch that was created by a call to `branch()`. It is not modified by this operation.
	 */
	rebaseOnto(branch: TreeBranch): void;
}

/**
 * Provides a means for interacting with a SharedTree.
 * This includes reading data from the tree and running transactions to mutate the tree.
 * @remarks This interface should not have any implementations other than those provided by the SharedTree package libraries.
 * @privateRemarks
 * API for interacting with a {@link SharedTreeBranch}.
 * Implementations of this interface must implement the {@link branchKey} property.
 */
export interface ITreeCheckout extends AnchorLocator, ViewableTree {
	/**
	 * Read and Write access for schema stored in the document.
	 *
	 * These APIs are temporary and will be replaced with different abstractions (View Schema based) in a different place later.
	 *
	 * TODO:
	 * Editing of this should be moved into transactions with the rest of tree editing to they can be intermixed.
	 * This will be done after the relations between views, branches and Indexes are figured out.
	 *
	 * TODO:
	 * Public APIs for dealing with schema should be in terms of View Schema, and schema update policies.
	 * The actual stored schema should be hidden (or ar least not be the most prominent way to interact with schema).
	 *
	 * TODO:
	 * Something should ensure the document contents are always in schema.
	 */
	readonly storedSchema: TreeStoredSchemaSubscription;
	/**
	 * Current contents.
	 * Updated by edits (local and remote).
	 * Use `editor` to create a local edit.
	 */
	readonly forest: IForestSubscription;

	/**
	 * Used to edit the state of the tree. Edits will be immediately applied locally to the tree.
	 * If there is no transaction currently ongoing, then the edits will be submitted to Fluid immediately as well.
	 */
	readonly editor: ISharedTreeEditor;

	/**
	 * A collection of functions for managing transactions.
	 */
	readonly transaction: ITransaction;

	branch(): ITreeCheckoutFork;

	merge(checkout: ITreeCheckoutFork): void;

	merge(checkout: ITreeCheckoutFork, disposeMerged: boolean): void;

	rebase(checkout: ITreeCheckoutFork): void;

	/**
	 * Replaces all schema with the provided schema.
	 * Can over-write preexisting schema, and removes unmentioned schema.
	 */
	updateSchema(newSchema: TreeStoredSchema): void;

	/**
	 * Events about this view.
	 */
	readonly events: Listenable<CheckoutEvents>;

	/**
	 * Events about the root of the tree in this view.
	 */
	readonly rootEvents: Listenable<AnchorSetRootEvents>;

	/**
	 * Returns a JsonableTree for each tree that was removed from (and not restored to) the document.
	 * This list is guaranteed to contain all nodes that are recoverable through undo/redo on this checkout.
	 * The list may also contain additional nodes.
	 *
	 * This is only intended for use in testing and exceptional code paths: it is not performant.
	 */
	getRemovedRoots(): [string | number | undefined, number, JsonableTree][];
}

/**
 * Creates a {@link TreeCheckout}.
 * @param args - an object containing optional components that will be used to build the view.
 * Any components not provided will be created by default.
 * @remarks This does not create a {@link SharedTree}, but rather a view with the minimal state
 * and functionality required to implement {@link ITreeCheckout}.
 */
export function createTreeCheckout(
	idCompressor: IIdCompressor,
	mintRevisionTag: () => RevisionTag,
	revisionTagCodec: RevisionTagCodec,
	args?: {
		branch?: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>;
		changeFamily?: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>;
		schema?: TreeStoredSchemaRepository;
		forest?: IEditableForest;
		fieldBatchCodec?: FieldBatchCodec;
		events?: Listenable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>;
		removedRoots?: DetachedFieldIndex;
		chunkCompressionStrategy?: TreeCompressionStrategy;
		logger?: ITelemetryLoggerExt;
		breaker?: Breakable;
	},
): TreeCheckout {
	const forest = args?.forest ?? buildForest();
	const schema = args?.schema ?? new TreeStoredSchemaRepository();
	const defaultCodecOptions = { jsonValidator: noopValidator };
	const defaultFieldBatchVersion = 1;
	const changeFamily =
		args?.changeFamily ??
		new SharedTreeChangeFamily(
			revisionTagCodec,
			args?.fieldBatchCodec ??
				makeFieldBatchCodec(defaultCodecOptions, defaultFieldBatchVersion),
			{ jsonValidator: noopValidator },
			args?.chunkCompressionStrategy,
			idCompressor,
		);
	const branch =
		args?.branch ??
		new SharedTreeBranch(
			{
				change: changeFamily.rebaser.compose([]),
				revision: "root",
			},
			changeFamily,
			() => idCompressor.generateCompressedId(),
		);
	const events = args?.events ?? createEmitter();

	const transaction = new Transaction(branch);

	return new TreeCheckout(
		transaction,
		branch,
		changeFamily,
		schema,
		forest,
		events,
		mintRevisionTag,
		revisionTagCodec,
		idCompressor,
		args?.removedRoots,
		args?.logger,
		args?.breaker,
	);
}

/**
 * A collection of functions for managing transactions.
 * Transactions allow edits to be batched into atomic units.
 * Edits made during a transaction will update the local state of the tree immediately, but will be squashed into a single edit when the transaction is committed.
 * If the transaction is aborted, the local state will be reset to what it was before the transaction began.
 * Transactions may nest, meaning that a transaction may be started while a transaction is already ongoing.
 *
 * To avoid updating observers of the view state with intermediate results during a transaction,
 * use {@link ITreeCheckout#branch} and {@link ISharedTreeFork#merge}.
 */
export interface ITransaction {
	/**
	 * Start a new transaction.
	 * If a transaction is already in progress when this new transaction starts, then this transaction will be "nested" inside of it,
	 * i.e. the outer transaction will still be in progress after this new transaction is committed or aborted.
	 *
	 * @remarks - Asynchronous transactions are not supported on the root checkout,
	 * since it is always kept up-to-date with the latest remote edits and the results of this rebasing (which might invalidate
	 * the transaction) is not visible to the application author.
	 * Instead,
	 *
	 * 1. fork the root checkout
	 * 2. run the transaction on the fork
	 * 3. merge the fork back into the root checkout
	 *
	 * @privateRemarks - There is currently no enforcement that asynchronous transactions don't happen on the root checkout.
	 * AB#6488 tracks adding some enforcement to make it more clear to application authors that this is not supported.
	 */
	start(): void;
	/**
	 * Close this transaction by squashing its edits and committing them as a single edit.
	 * If this is the root checkout and there are no ongoing transactions remaining, the squashed edit will be submitted to Fluid.
	 */
	commit(): TransactionResult.Commit;
	/**
	 * Close this transaction and revert the state of the tree to what it was before this transaction began.
	 */
	abort(): TransactionResult.Abort;
	/**
	 * True if there is at least one transaction currently in progress on this view, otherwise false.
	 */
	inProgress(): boolean;
}

class Transaction implements ITransaction {
	public constructor(
		private readonly branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
	) {}

	public start(): void {
		this.branch.startTransaction();
		this.branch.editor.enterTransaction();
	}
	public commit(): TransactionResult.Commit {
		this.branch.commitTransaction();
		this.branch.editor.exitTransaction();
		return TransactionResult.Commit;
	}
	public abort(): TransactionResult.Abort {
		this.branch.abortTransaction();
		this.branch.editor.exitTransaction();
		return TransactionResult.Abort;
	}
	public inProgress(): boolean {
		return this.branch.isTransacting();
	}
}

/**
 * Branch (like in a version control system) of SharedTree.
 *
 * {@link ITreeCheckout} that has forked off of the main trunk/branch.
 */
export interface ITreeCheckoutFork extends ITreeCheckout {
	rebaseOnto(view: ITreeCheckout): void;
}

/**
 * Metrics derived from a revert operation.
 *
 * @see {@link TreeCheckout.revertRevertible}.
 */
export interface RevertMetrics {
	/**
	 * The age of the revertible commit relative to the head of the branch to which the reversion will be applied.
	 */
	readonly age: number;

	// TODO: add other stats as needed for telemetry, etc.
}

/**
 * An implementation of {@link ITreeCheckoutFork}.
 */
export class TreeCheckout implements ITreeCheckoutFork {
	public disposed = false;

	private readonly views = new Set<TreeView<ImplicitFieldSchema>>();

	/**
	 * Set of revertibles maintained for automatic disposal
	 */
	private readonly revertibles = new Set<DisposableRevertible>();

	/**
	 * Each branch's head commit corresponds to a revertible commit.
	 * Maintaining a whole branch ensures the commit graph is not pruned in a way that would prevent the commit from
	 * being reverted.
	 */
	private readonly revertibleCommitBranches = new Map<
		RevisionTag,
		SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>
	>();

	/**
	 * copies of the removed roots used as snapshots for reverting to previous state when transactions are aborted
	 */
	private readonly removedRootsSnapshots: DetachedFieldIndex[] = [];

	/**
	 * The name of the telemetry event logged for calls to {@link TreeCheckout.revertRevertible}.
	 * @privateRemarks Exposed for testing purposes.
	 */
	public static readonly revertTelemetryEventName = "RevertRevertible";

	public constructor(
		public readonly transaction: ITransaction,
		private readonly _branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
		private readonly changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
		public readonly storedSchema: TreeStoredSchemaRepository,
		public readonly forest: IEditableForest,
		public readonly events: Listenable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>,
		private readonly mintRevisionTag: () => RevisionTag,
		private readonly revisionTagCodec: RevisionTagCodec,
		private readonly idCompressor: IIdCompressor,
		private removedRoots: DetachedFieldIndex = makeDetachedFieldIndex(
			"repair",
			revisionTagCodec,
			idCompressor,
		),
		/** Optional logger for telemetry. */
		private readonly logger?: ITelemetryLoggerExt,
		private readonly breaker: Breakable = new Breakable("TreeCheckout"),
	) {
		// when a transaction is started, take a snapshot of the current state of removed roots
		_branch.on("transactionStarted", () => {
			this.removedRootsSnapshots.push(this.removedRoots.clone());
		});
		// when a transaction is committed, the latest snapshot of removed roots can be discarded
		_branch.on("transactionCommitted", () => {
			this.removedRootsSnapshots.pop();
		});
		// after a transaction is rolled back, revert removed roots back to the latest snapshot
		_branch.on("transactionRolledBack", () => {
			const snapshot = this.removedRootsSnapshots.pop();
			assert(snapshot !== undefined, 0x9ae /* a snapshot for removed roots does not exist */);
			this.removedRoots = snapshot;
		});

		// We subscribe to `beforeChange` rather than `afterChange` here because it's possible that the change is invalid WRT our forest.
		// For example, a bug in the editor might produce a malformed change object and thus applying the change to the forest will throw an error.
		// In such a case we will crash here, preventing the change from being added to the commit graph, and preventing `afterChange` from firing.
		// One important consequence of this is that we will not submit the op containing the invalid change, since op submissions happens in response to `afterChange`.
		_branch.on("beforeChange", (event) => {
			if (event.change !== undefined) {
				const revision =
					event.type === "replace"
						? // Change events will always contain new commits
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							event.newCommits[event.newCommits.length - 1]!.revision
						: event.change.revision;

				// Conflicts due to schema will be empty and thus are not applied.
				for (const change of event.change.change.changes) {
					if (change.type === "data") {
						const delta = intoDelta(tagChange(change.innerChange, revision));
						this.withCombinedVisitor((visitor) => {
							visitDelta(delta, visitor, this.removedRoots, revision);
						});
					} else if (change.type === "schema") {
						// Schema changes from a current to a new schema are expected to be backwards compatible.
						// This guarantees that all data in the forest (which is valid before the schema change)
						// is also valid under the new schema.
						// Note however, that such schema changes may in some cases be rolled back:
						// Case 1: A transaction with a schema change may be aborted.
						// The transaction may have made some data changes that would render some trees invalid
						// under the old schema, but these changes will also be rolled back, thereby putting the forest
						// back in the state before the transaction, which is valid under the original (reinstated) schema.
						// Case 2: A branch with a schema change may be rebased such that the schema change (because
						// of a constraint) is no longer applied.
						// Such a branch may contain data changes that would render some trees invalid under the
						// original schema. These data changes may not necessarily be rolled back.
						// They will however be rebased over the rollback of the schema change. This rebasing will
						// ensure that these data changes are muted if they would render some trees invalid under the
						// original (reinstated) schema.
						storedSchema.apply(change.innerChange.schema.new);
					} else {
						fail("Unknown Shared Tree change type.");
					}
				}
				this.events.emit("afterBatch");
			}
			if (event.type === "replace" && getChangeReplaceType(event) === "transactionCommit") {
				const firstCommit = event.newCommits[0] ?? oob();
				const transactionRevision = firstCommit.revision;
				for (const transactionStep of event.removedCommits) {
					this.removedRoots.updateMajor(transactionStep.revision, transactionRevision);
				}
			}
		});
		_branch.on("afterChange", (event) => {
			// The following logic allows revertibles to be generated for the change.
			// Currently only appends (including merges) and transaction commits are supported.
			if (!_branch.isTransacting()) {
				if (
					event.type === "append" ||
					(event.type === "replace" && getChangeReplaceType(event) === "transactionCommit")
				) {
					// TODO:#20949: When the SharedTree is detached, these commits will already have been garbage collected.
					//       Figure out a way to generate revertibles before the commits are garbage collected.
					for (const commit of event.newCommits) {
						const kind = event.type === "append" ? event.kind : CommitKind.Default;
						const { change, revision } = commit;

						const getRevertible = hasSchemaChange(change)
							? undefined
							: (onRevertibleDisposed?: (revertible: Revertible) => void) => {
									if (!withinEventContext) {
										throw new UsageError(
											"Cannot get a revertible outside of the context of a commitApplied event.",
										);
									}
									if (this.revertibleCommitBranches.get(revision) !== undefined) {
										throw new UsageError(
											"Cannot generate the same revertible more than once. Note that this can happen when multiple commitApplied event listeners are registered.",
										);
									}
									const revertibleCommits = this.revertibleCommitBranches;
									const revertible: DisposableRevertible = {
										get status(): RevertibleStatus {
											const revertibleCommit = revertibleCommits.get(revision);
											return revertibleCommit === undefined
												? RevertibleStatus.Disposed
												: RevertibleStatus.Valid;
										},
										revert: (release: boolean = true) => {
											if (revertible.status === RevertibleStatus.Disposed) {
												throw new UsageError(
													"Unable to revert a revertible that has been disposed.",
												);
											}

											const revertMetrics = this.revertRevertible(revision, kind);
											this.logger?.sendTelemetryEvent({
												eventName: TreeCheckout.revertTelemetryEventName,
												...revertMetrics,
											});

											if (release) {
												revertible.dispose();
											}
										},
										dispose: () => {
											if (revertible.status === RevertibleStatus.Disposed) {
												throw new UsageError(
													"Unable to dispose a revertible that has already been disposed.",
												);
											}
											this.disposeRevertible(revertible, revision);
											onRevertibleDisposed?.(revertible);
										},
									};

									this.revertibleCommitBranches.set(revision, _branch.fork(commit));
									this.revertibles.add(revertible);
									return revertible;
								};

						let withinEventContext = true;
						this.events.emit("commitApplied", { isLocal: true, kind }, getRevertible);
						withinEventContext = false;
					}
				}
			}
		});

		// When the branch is trimmed, we can garbage collect any repair data whose latest relevant revision is one of the
		// trimmed revisions.
		_branch.on("ancestryTrimmed", ({ trimmedRevisions, newTail }) => {
			this.withCombinedVisitor((visitor) => {
				const remove = (revision: RevisionTag): void => {
					// get all the roots last created or used by the revision
					const roots = this.removedRoots.getRootsLastTouchedByRevision(revision);
					// get the detached field for the root and delete it from the removed roots
					for (const root of roots) {
						visitor.destroy(this.removedRoots.toFieldKey(root), 1);
					}

					this.removedRoots.deleteRootsLastTouchedByRevision(revision);
				};
				for (const revision of trimmedRevisions) {
					remove(revision);
				}
				// This code assumes that the new tail commit is not part of the trunk (the EditManager retains a "trunk base" commit that is not trimmed).
				remove(newTail.revision);
			});
		});
	}

	private withCombinedVisitor(fn: (visitor: DeltaVisitor) => void): void {
		const anchorVisitor = this.forest.anchors.acquireVisitor();
		const combinedVisitor = combineVisitors(
			[this.forest.acquireVisitor(), anchorVisitor],
			[anchorVisitor],
		);
		fn(combinedVisitor);
		combinedVisitor.free();
	}

	private checkNotDisposed(usageError?: string): void {
		if (this.disposed) {
			if (usageError !== undefined) {
				throw new UsageError(usageError);
			}
			assert(false, 0x911 /* Invalid operation on a disposed TreeCheckout */);
		}
	}

	public viewWith<TRoot extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TRoot>,
	): SchematizingSimpleTreeView<TRoot> {
		const view = new SchematizingSimpleTreeView(
			this,
			config,
			createNodeKeyManager(this.idCompressor),
			this.breaker,
			() => {
				this.views.delete(view);
			},
		);
		this.views.add(view);
		return view;
	}

	public get rootEvents(): Listenable<AnchorSetRootEvents> {
		return this.forest.anchors;
	}

	public get editor(): ISharedTreeEditor {
		this.checkNotDisposed();
		return this._branch.editor;
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		this.checkNotDisposed();
		return this.forest.anchors.locate(anchor);
	}

	public branch(): TreeCheckout {
		this.checkNotDisposed(
			"The parent branch has already been disposed and can no longer create new branches.",
		);
		const anchors = new AnchorSet();
		const branch = this._branch.fork();
		const storedSchema = this.storedSchema.clone();
		const forest = this.forest.clone(storedSchema, anchors);
		const transaction = new Transaction(branch);
		return new TreeCheckout(
			transaction,
			branch,
			this.changeFamily,
			storedSchema,
			forest,
			createEmitter(),
			this.mintRevisionTag,
			this.revisionTagCodec,
			this.idCompressor,
			this.removedRoots.clone(),
			this.logger,
			this.breaker,
		);
	}

	public rebase(checkout: TreeCheckout): void {
		this.checkNotDisposed(
			"The target of the branch rebase has been disposed and cannot be rebased.",
		);
		checkout.checkNotDisposed(
			"The source of the branch rebase has been disposed and cannot be rebased.",
		);
		assert(
			!checkout.transaction.inProgress(),
			0x9af /* A view cannot be rebased while it has a pending transaction */,
		);
		checkout._branch.rebaseOnto(this._branch);
	}

	public rebaseOnto(checkout: ITreeCheckout): void {
		this.checkNotDisposed(
			"The target of the branch rebase has been disposed and cannot be rebased.",
		);
		checkout.rebase(this);
	}

	public merge(checkout: TreeCheckout): void;
	public merge(checkout: TreeCheckout, disposeMerged: boolean): void;
	public merge(checkout: TreeCheckout, disposeMerged = true): void {
		this.checkNotDisposed(
			"The target of the branch merge has been disposed and cannot be merged.",
		);
		checkout.checkNotDisposed(
			"The source of the branch merge has been disposed and cannot be merged.",
		);
		assert(
			!this.transaction.inProgress(),
			0x9b0 /* Views cannot be merged into a view while it has a pending transaction */,
		);
		while (checkout.transaction.inProgress()) {
			checkout.transaction.commit();
		}
		this._branch.merge(checkout._branch);
		if (disposeMerged) {
			checkout[disposeSymbol]();
		}
	}

	public updateSchema(newSchema: TreeStoredSchema): void {
		this.checkNotDisposed();
		this.editor.schema.setStoredSchema(this.storedSchema.clone(), newSchema);
	}

	public dispose(): void {
		this[disposeSymbol]();
	}

	public [disposeSymbol](): void {
		this.checkNotDisposed(
			"The branch has already been disposed and cannot be disposed again.",
		);
		this.disposed = true;
		this.purgeRevertibles();
		this._branch.dispose();
		for (const view of this.views) {
			view.dispose();
		}
	}

	public getRemovedRoots(): [string | number | undefined, number, JsonableTree][] {
		this.assertNoUntrackedRoots();
		const trees: [string | number | undefined, number, JsonableTree][] = [];
		const cursor = this.forest.allocateCursor("getRemovedRoots");
		for (const { id, root } of this.removedRoots.entries()) {
			const parentField = this.removedRoots.toFieldKey(root);
			this.forest.moveCursorToPath({ parent: undefined, parentField, parentIndex: 0 }, cursor);
			const tree = jsonableTreeFromCursor(cursor);
			// This method is used for tree consistency comparison.
			const { major, minor } = id;
			const finalizedMajor = major !== undefined ? this.revisionTagCodec.encode(major) : major;
			trees.push([finalizedMajor, minor, tree]);
		}
		cursor.free();
		return trees;
	}

	/**
	 * This sets the tip revision as the latest relevant revision for any removed roots that are loaded from a summary.
	 * This needs to be called right after loading {@link this.removedRoots} from a summary to allow loaded data to be garbage collected.
	 */
	public setTipRevisionForLoadedData(revision: RevisionTag): void {
		this.removedRoots.setRevisionsForLoadedData(revision);
	}

	private purgeRevertibles(): void {
		for (const revertible of this.revertibles) {
			revertible.dispose();
		}
	}

	private disposeRevertible(revertible: DisposableRevertible, revision: RevisionTag): void {
		this.revertibleCommitBranches.get(revision)?.dispose();
		this.revertibleCommitBranches.delete(revision);
		this.revertibles.delete(revertible);
	}

	private revertRevertible(revision: RevisionTag, kind: CommitKind): RevertMetrics {
		if (this._branch.isTransacting()) {
			throw new UsageError("Undo is not yet supported during transactions.");
		}

		const revertibleBranch = this.revertibleCommitBranches.get(revision);
		assert(revertibleBranch !== undefined, 0x7cc /* expected to find a revertible commit */);
		const commitToRevert = revertibleBranch.getHead();
		const revisionForInvert = this.mintRevisionTag();

		let change = tagChange(
			this.changeFamily.rebaser.invert(commitToRevert, false, revisionForInvert),
			revisionForInvert,
		);

		const headCommit = this._branch.getHead();
		// Rebase the inverted change onto any commits that occurred after the undoable commits.
		if (commitToRevert !== headCommit) {
			change = tagChange(
				rebaseChange(
					this.changeFamily.rebaser,
					change,
					commitToRevert,
					headCommit,
					this.mintRevisionTag,
				).change,
				revisionForInvert,
			);
		}

		this._branch.apply(
			change,
			kind === CommitKind.Default || kind === CommitKind.Redo
				? CommitKind.Undo
				: CommitKind.Redo,
		);

		// Derive some stats about the reversion to return to the caller.
		let revertAge = 0;
		let currentCommit = headCommit;
		while (commitToRevert.revision !== currentCommit.revision) {
			revertAge++;

			const parentCommit = currentCommit.parent;
			assert(parentCommit !== undefined, 0x9a9 /* expected to find a parent commit */);
			currentCommit = parentCommit;
		}

		return { age: revertAge };
	}

	private assertNoUntrackedRoots(): void {
		const cursor = this.forest.getCursorAboveDetachedFields();
		const rootFields = new Set([rootFieldKey]);
		for (const { root } of this.removedRoots.entries()) {
			rootFields.add(this.removedRoots.toFieldKey(root));
		}

		if (!cursor.firstField()) {
			return;
		}

		do {
			const field = cursor.getFieldKey();
			assert(
				rootFields.has(field),
				0xa22 /* Forest has a root field which is unknown to the detached field index */,
			);

			rootFields.delete(field);
		} while (cursor.nextField());
	}
}

/**
 * Run a synchronous transaction on the given shared tree view.
 * This is a convenience helper around the {@link SharedTreeFork#transaction} APIs.
 * @param view - the view on which to run the transaction
 * @param transaction - the transaction function. This will be executed immediately. It is passed `view` as an argument for convenience.
 * If this function returns an `Abort` result then the transaction will be aborted. Otherwise, it will be committed.
 * @returns whether or not the transaction was committed or aborted
 */
export function runSynchronous(
	view: ITreeCheckout,
	transaction: (view: ITreeCheckout) => TransactionResult | void,
): TransactionResult {
	view.transaction.start();
	const result = transaction(view);
	return result === TransactionResult.Abort
		? view.transaction.abort()
		: view.transaction.commit();
}

interface DisposableRevertible extends Revertible {
	dispose: () => void;
}
