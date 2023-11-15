/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	TreeNodeSchema,
	schemaIsFieldNode,
} from "../typed-schema";
import { EditableTreeEvents, TreeStatus } from "../flex-tree";
import { getOrCreateNodeProxy } from "./proxies";
import { getEditNode, tryGetEditNode } from "./editNode";
import { ProxyNode, SharedTreeNode } from "./types";

interface GetKey {
	(child: SharedTreeNode): string | number;
	<TParentSchema extends ObjectNodeSchema>(
		parent: ProxyNode<TParentSchema>,
		child: SharedTreeNode,
	): keyof typeof parent;
	<TParentSchema extends FieldNodeSchema>(
		parent: ProxyNode<TParentSchema>,
		child: SharedTreeNode,
	): number;
	<TParentSchema extends MapNodeSchema>(
		parent: ProxyNode<TParentSchema>,
		child: SharedTreeNode,
	): string;
	<TParentSchema extends TreeNodeSchema>(
		parent: ProxyNode<TParentSchema>,
		child: SharedTreeNode,
	): string | number;
}

/**
 * Provides various functions for analyzing {@link SharedTreeNode}s.
 * @alpha
 * @privateRemarks
 * Inlining the typing of this interface onto the `Tree` object provides slightly different .d.ts generation,
 * which avoids typescript expanding the type of TreeNodeSchema and thus encountering
 * https://github.com/microsoft/rushstack/issues/1958.
 */
export interface TreeApi {
	/**
	 * The schema information for this node.
	 */
	readonly schema: (node: SharedTreeNode) => TreeNodeSchema;
	/**
	 * Narrow the type of the given value if it satisfies the given schema.
	 * @example
	 * ```ts
	 * if (node.is(myNode, point)) {
	 *     const y = myNode.y; // `myNode` is now known to satisfy the `point` schema and therefore has a `y` coordinate.
	 * }
	 * ```
	 */
	readonly is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	) => value is ProxyNode<TSchema>;
	/**
	 * Return the node under which this node resides in the tree (or undefined if this is a root node of the tree).
	 */
	readonly parent: (node: SharedTreeNode) => SharedTreeNode | undefined;
	/**
	 * The key of the given node under its parent.
	 * @remarks
	 * If `node` is an element in a {@link TreeList}, this returns the index of `node` in the list (a `number`).
	 * Otherwise, this returns the key of the field that it is under (a `string`).
	 */
	readonly key: GetKey;
	/**
	 * Register an event listener on the given node.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	readonly on: <K extends keyof EditableTreeEvents>(
		node: SharedTreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
	) => () => void;
	/**
	 * Returns the {@link TreeStatus} of the given node.
	 */
	readonly status: (node: SharedTreeNode) => TreeStatus;
}

/**
 * The `Tree` object holds various functions for analyzing {@link SharedTreeNode}s.
 * @alpha
 */
export const nodeApi: TreeApi = {
	schema: (node: SharedTreeNode) => {
		return getEditNode(node).schema;
	},
	is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	): value is ProxyNode<TSchema> => {
		return tryGetEditNode(value)?.is(schema) ?? false;
	},
	parent: (node: SharedTreeNode) => {
		const editNode = getEditNode(node).parentField.parent.parent;
		if (editNode !== undefined) {
			return getOrCreateNodeProxy(editNode);
		}

		return undefined;
	},
	key: ((parentOrChild: SharedTreeNode, child?: SharedTreeNode) => {
		const parentNode = child === undefined ? parentOrChild : nodeApi.parent(parentOrChild);
		const childNode = child ?? parentOrChild;
		const childEditNode = getEditNode(childNode);
		if (parentNode !== undefined) {
			const parentSchema = nodeApi.schema(parentNode);
			if (schemaIsFieldNode(parentSchema)) {
				// The parent of `node` is a list
				return childEditNode.parentField.index;
			}
		}

		// The parent of `node` is an object, a map, or undefined (and therefore `node` is a root/detached node).
		return childEditNode.parentField.parent.key;
	}) as GetKey,
	on: <K extends keyof EditableTreeEvents>(
		node: SharedTreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
	) => {
		return getEditNode(node).on(eventName, listener);
	},
	status: (node: SharedTreeNode) => {
		return getEditNode(node).treeStatus();
	},
};
