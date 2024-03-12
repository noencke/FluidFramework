/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, unreachableCase } from "@fluidframework/core-utils";
import { fail } from "../util/index.js";
import { Context } from "../feature-libraries/index.js";
import { TreeNode, TreeNodeApi, TreeView, treeNodeApi, getFlexNode } from "../simple-tree/index.js";
import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import { TreeCheckout } from "./treeCheckout.js";
import { contextToTreeView } from "./treeView.js";

/**
 * A constraint that may be applied to a transaction (see {@link treeApi.runTransaction}).
 * @remarks
 * Constraints allow additional validation to be added to a transaction.
 * If a constraint is violated, the associated transaction will be ignored by all clients and will have no effect on the tree.
 * This can be more powerful than simply checking invariants from with a transaction and rolling back the transaction manually,
 * because it will also take into account any concurrent changes to the tree that were sequenced after the originating client's local state and also sequenced before the transaction.
 * @public
 */
// TODO: Add additional constraint descriptors here, forming a discriminated union over "type".
export type TransactionConstraint = ExistenceConstraint;

/**
 * A {@link TransactionConstraint} that checks whether a given node exists.
 * If the node does not exist in the tree when the constraint is validated, the transaction will be discarded and/or rolled back.
 */
export interface ExistenceConstraint {
	type: "exists";
	node: TreeNode;
}

/**
 * Provides various functions for interacting with {@link TreeNode}s.
 * @public
 */
export interface TreeApi extends TreeNodeApi {
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param node - The node that will be passed to `transaction`.
	 * This is typically the root node of the subtree that will be modified by the transaction.
	 * @param transaction - The function to run as the body of the transaction.
	 * @param preconditions - Optional constraints that will cause the transaction to be ignored if any are violated.
	 * These are checked just before the transaction begins (see {@link TransactionConstraint} for more information).
	 * This function is passed the provided `node`.
	 * At any point during the transaction, the function may return the value `"rollback"` to abort the transaction and discard any changes it made so far.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction is cancelled and rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	runTransaction<TNode extends TreeNode>(
		node: TNode,
		transaction: (node: TNode) => void | "rollback",
		preconditions?: Iterable<TransactionConstraint>,
	): void;
	/**
	 * Apply one or more edits to the tree as a single atomic unit.
	 * @param tree - The tree which will be edited by the transaction
	 * @param transaction - The function to run as the body of the transaction.
	 * @param preconditions - Optional constraints that will cause the transaction to be ignored if any are violated.
	 * These are checked just before the transaction begins (see {@link TransactionConstraint} for more information).
	 * This function is passed the root of the tree.
	 * At any point during the transaction, the function may return the value `"rollback"` to abort the transaction and discard any changes it made so far.
	 * @remarks
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction is cancelled and rolled back, a corresponding change event will also be emitted for the rollback.
	 */
	runTransaction<TRoot>(
		tree: TreeView<TRoot>,
		transaction: (root: TRoot) => void | "rollback",
		preconditions?: Iterable<TransactionConstraint>,
	): void;
}

/**
 * The `Tree` object holds various functions for interacting with {@link TreeNode}s.
 * @public
 */
export const treeApi: TreeApi = {
	...treeNodeApi,
	runTransaction<TNode extends TreeNode, TRoot>(
		treeOrNode: TNode | TreeView<TRoot>,
		transaction: ((node: TNode) => void | "rollback") | ((root: TRoot) => void | "rollback"),
		preconditions?: Iterable<TransactionConstraint>,
	) {
		if (treeOrNode instanceof SchematizingSimpleTreeView) {
			const t = transaction as (root: TRoot) => void | "rollback";
			runTransaction(treeOrNode.checkout, () => t(treeOrNode.root as TRoot), preconditions);
		} else {
			const node = treeOrNode as TNode;
			const t = transaction as (node: TNode) => void | "rollback";
			const context = getFlexNode(node).context;
			assert(context instanceof Context, 0x901 /* Unsupported context */);
			const treeView =
				contextToTreeView.get(context) ??
				fail("Expected view to be registered for context");

			runTransaction(treeView.checkout, () => t(node), preconditions);
		}
	},
};

function runTransaction(
	checkout: TreeCheckout,
	transaction: () => void | "rollback",
	preconditions?: Iterable<TransactionConstraint>,
): void {
	checkout.transaction.start();
	for (const c of preconditions ?? []) {
		switch (c.type) {
			case "exists": {
				checkout.editor.addNodeExistsConstraint(getFlexNode(c.node).anchorNode);
				break;
			}
			default:
				unreachableCase(c.type);
		}
	}
	let result: void | "rollback";
	try {
		result = transaction();
	} catch (e) {
		// If the transaction has an unhandled error, abort and rollback the transaction but continue to propagate the error.
		checkout.transaction.abort();
		throw e;
	}

	if (result === "rollback") {
		checkout.transaction.abort();
	} else {
		checkout.transaction.commit();
	}
}
