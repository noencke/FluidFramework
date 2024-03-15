/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { fail } from "../util/index.js";
import {
	FlexObjectNodeSchema,
	FlexFieldNodeSchema,
	FlexMapNodeSchema,
	FlexTreeNode,
	FlexTreeObjectNode,
	FlexTreeFieldNode,
	FlexTreeMapNode,
	assertFlexTreeEntityNotFreed,
	flexTreeSlot,
	schemaIsMap,
	schemaIsFieldNode,
	schemaIsObjectNode,
} from "../feature-libraries/index.js";
import { AnchorNode, anchorSlot } from "../core/index.js";
import { TreeNode, TypedNode } from "./types.js";
import { TreeArrayNode } from "./treeArrayNode.js";
import { TreeMapNode, TreeObjectNode } from "./schemaTypes.js";
import { RawTreeNode } from "./rawNode.js";

/** TODO document */
const proxySlot = anchorSlot<TreeNode>();

/**
 * This is intentionally a WeakMap, rather than a private symbol (e.g. like `targetSymbol`).
 * The map behaves essentially the same, except that performing a lookup in the map will not perform a property read/get on the key object (as is the case with a symbol).
 * Since `SharedTreeNodes` are proxies with non-trivial `get` traps, this choice is meant to prevent the confusion of the lookup passing through multiple objects
 * via the trap, or the trap not properly handling the special symbol, etc.
 */
const proxyToAnchorMap = new WeakMap<TreeNode, AnchorNode>();

// TODO: doc
const proxyToRawFlexNode = new WeakMap<TreeNode, RawTreeNode<FlexFieldNodeSchema, unknown>>();

/**
 * Retrieves the flex node associated with the given target via {@link setFlexNode}.
 * @remarks Fails if the flex node has not been set.
 */
export function getFlexNode(
	target: TypedNode<FlexObjectNodeSchema>,
	allowFreed?: true,
): FlexTreeObjectNode;
export function getFlexNode(
	target: TreeArrayNode,
	allowFreed?: true,
): FlexTreeFieldNode<FlexFieldNodeSchema>;
export function getFlexNode(
	target: TreeMapNode,
	allowFreed?: true,
): FlexTreeMapNode<FlexMapNodeSchema>;
export function getFlexNode(target: TreeNode, allowFreed?: true): FlexTreeNode;
export function getFlexNode(target: TreeNode, allowFreed = false): FlexTreeNode {
	const anchorNode = proxyToAnchorMap.get(target);
	if (anchorNode !== undefined) {
		const flexNode = demand(anchorNode);
		assert(!(flexNode instanceof RawTreeNode), "Expected cooked flex node");
		if (!allowFreed) {
			assertFlexTreeEntityNotFreed(flexNode);
		}
		return flexNode;
	}

	const rawFlexNode =
		proxyToRawFlexNode.get(target) ?? fail("Target is not associated with a flex node");

	assert(rawFlexNode instanceof RawTreeNode, "Expected raw flex node");
	return rawFlexNode;
}

function demand(anchorNode: AnchorNode): FlexTreeNode {
	const ancestry: AnchorNode[] = [anchorNode];
	while (ancestry[ancestry.length - 1].slots.get(flexTreeSlot) === undefined) {
		const parent =
			ancestry[ancestry.length - 1].parent ??
			fail("Failed to hydrate proxy: tree root is unhydrated"); // TODO: need to do something special for the root?

		ancestry.push(parent);
	}
	while (ancestry.length >= 2) {
		const parent = ancestry[ancestry.length - 1];
		const child = ancestry[ancestry.length - 2];
		const firstFlexAncestor =
			parent.slots.get(flexTreeSlot) ?? fail("Expected flex tree for anchor node");

		const proxy = parent.slots.get(proxySlot) ?? fail("Expected proxy for anchor node");
		if (schemaIsFieldNode(firstFlexAncestor.schema)) {
			const array = proxy as TreeArrayNode;
			array.at(child.parentIndex);
		} else if (schemaIsMap(firstFlexAncestor.schema)) {
			const map = proxy as TreeMapNode;
			map.get(child.parentField);
		} else if (schemaIsObjectNode(firstFlexAncestor.schema)) {
			const obj = proxy as TreeObjectNode<any>;
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			obj[child.parentField];
		} else {
			fail("Unexpected flex node schema type");
		}
		ancestry.pop();
	}
	return ancestry[0].slots.get(flexTreeSlot) ?? fail("Expected flex tree for anchor node");
}

/**
 * Retrieves the flex node associated with the given target via {@link setFlexNode}, if any.
 */
export function tryGetFlexNode(target: unknown): FlexTreeNode | undefined {
	// Calling 'WeakMap.get()' with primitives (numbers, strings, etc.) will return undefined.
	// This is in contrast to 'WeakMap.set()', which will throw a TypeError if given a non-object key.
	return (
		proxyToAnchorMap.get(target as TreeNode)?.slots.get(flexTreeSlot) ??
		proxyToRawFlexNode.get(target as TreeNode)
	);
}

/**
 * Retrieves the target associated with the given flex node via {@link setFlexNode}, if any.
 */
export function tryGetFlexNodeTarget(flexNode: FlexTreeNode): TreeNode | undefined {
	return flexNode.anchorNode.slots.get(proxySlot);
}

/**
 * Associate the given target object and the given flex node.
 * @returns The target object
 * @remarks
 * This creates a 1:1 mapping between the target and tree node.
 * Either can be retrieved from the other via {@link getFlexNode}/{@link tryGetFlexNode} or {@link tryGetFlexNodeTarget}.
 * If the given target is already mapped to an flex node, the existing mapping will be overwritten.
 * If the given flex node is already mapped to a different target, this function will fail.
 */
export function setFlexNode<T extends TreeNode>(target: T, flexNode: FlexTreeNode): T {
	const existingFlexNode = proxyToAnchorMap.get(target)?.slots.get(flexTreeSlot);
	assert(existingFlexNode === undefined, "Cannot associate a flex node with multiple targets");
	if (flexNode instanceof RawTreeNode) {
		proxyToRawFlexNode.set(target, flexNode);
	} else {
		assert(
			tryGetFlexNodeTarget(flexNode) === undefined,
			0x7f5 /* Cannot associate an flex node with multiple targets */,
		);
		bindProxyToAnchorNode(target, flexNode.anchorNode);
		// TODO: Cleanup up red line and anchor
	}
	return target;
}

// TODO document
export function bindProxyToAnchorNode(proxy: TreeNode, anchorNode: AnchorNode): void {
	// Once a proxy has been associated with an anchor node, it should never change to another anchor node
	assert(!proxyToAnchorMap.has(proxy), "Proxy has already been bound to a different anchor node");
	proxyToAnchorMap.set(proxy, anchorNode);
	// However, it's fine for an anchor node to rotate through different proxies when the content at that place in the tree is replaced.
	anchorNode.slots.set(proxySlot, proxy);
}
