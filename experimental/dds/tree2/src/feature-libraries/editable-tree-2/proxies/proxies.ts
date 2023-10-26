/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { brand, fail } from "../../../util";
import {
	AllowedTypes,
	FieldNodeSchema,
	TreeFieldSchema,
	ObjectNodeSchema,
	TreeNodeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
} from "../../typed-schema";
import { FieldKinds } from "../../default-field-kinds";
import {
	FieldNode,
	OptionalField,
	RequiredField,
	TreeNode,
	TypedField,
	boxedIterator,
} from "../editableTreeTypes";
import { LazySequence } from "../lazyField";
import { FieldKey } from "../../../core";
import { LazyObjectNode, getBoxedField } from "../lazyTree";
import { ContextuallyTypedNodeData } from "../../contextuallyTyped";
import {
	ProxyField,
	ProxyNode,
	ProxyNodeUnion,
	SharedTreeList,
	SharedTreeNode,
	SharedTreeObject,
	getSharedTreeNode,
	getTreeNode,
	setTreeNode,
	treeNodeSym,
} from "./types";
import { getFactoryObjectContent } from "./objectFactory";

/** Retrieve the associated proxy for the given field. */
export function getProxyForField<TSchema extends TreeFieldSchema>(
	field: TypedField<TSchema>,
): ProxyField<TSchema> {
	switch (field.schema.kind) {
		case FieldKinds.required: {
			const asValue = field as TypedField<TreeFieldSchema<typeof FieldKinds.required>>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getProxyForNode(asValue.boxedContent) as ProxyField<TSchema>;
		}
		case FieldKinds.optional: {
			const asValue = field as TypedField<TreeFieldSchema<typeof FieldKinds.optional>>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.

			const maybeContent = asValue.boxedContent;

			// Normally, empty fields are unreachable due to the behavior of 'tryGetField'.  However, the
			// root field is a special case where the field is always present (even if empty).
			return (
				maybeContent === undefined ? undefined : getProxyForNode(maybeContent)
			) as ProxyField<TSchema>;
		}
		// TODO: Remove if/when 'FieldNode' is removed.
		case FieldKinds.sequence: {
			// 'getProxyForNode' handles FieldNodes by unconditionally creating a list proxy, making
			// this case unreachable as long as users follow the 'list recipe'.
			fail("'sequence' field is unexpected.");
		}
		default:
			fail("invalid field kind");
	}
}

export function getProxyForNode<TSchema extends TreeNodeSchema>(
	treeNode: TreeNode,
): ProxyNode<TSchema> {
	const schema = treeNode.schema;

	if (schemaIsMap(schema)) {
		fail("Map not implemented");
	}
	if (schemaIsLeaf(schema)) {
		return treeNode.value as ProxyNode<TSchema>;
	}
	const isFieldNode = schemaIsFieldNode(schema);
	if (isFieldNode || schemaIsObjectNode(schema)) {
		const cachedProxy = getSharedTreeNode(treeNode);
		if (cachedProxy !== undefined) {
			return cachedProxy as ProxyNode<TSchema>;
		}

		const proxy = isFieldNode ? createListProxy(treeNode) : createObjectProxy();
		setTreeNode(proxy, treeNode);
		return proxy as ProxyNode<TSchema>;
	}

	fail("unrecognized node kind");
}

export function createObjectProxy<TSchema extends ObjectNodeSchema>(): SharedTreeObject<TSchema> {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
	// prototype as an object literal '{}'.  This is because 'deepEquals' uses 'Object.getPrototypeOf'
	// as a way to quickly reject objects with different prototype chains.
	//
	// (Note that the prototype of an object literal appears as '[Object: null prototype] {}', not because
	// the prototype is null, but because the prototype object itself has a null prototype.)

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy(
		{},
		{
			get(target, key): unknown {
				if (key === treeNodeSym) {
					return Reflect.get(target, key);
				}

				const field = assertTreeNode(proxy).tryGetField(key as FieldKey);
				if (field !== undefined) {
					return getProxyForField(field);
				}

				return Reflect.get(target, key);
			},
			set(target, key, value) {
				const treeNode = assertTreeNode(proxy);
				const fieldSchema = treeNode.schema.objectNodeFields.get(key as FieldKey);

				if (fieldSchema === undefined) {
					return false;
				}

				// TODO: Is it safe to assume 'content' is a LazyObjectNode?
				assert(treeNode instanceof LazyObjectNode, "invalid content");
				assert(typeof key === "string", "invalid key");
				const field = getBoxedField(treeNode, brand(key), fieldSchema);

				switch (field.schema.kind) {
					case FieldKinds.required: {
						const requiredField = field as RequiredField<AllowedTypes>;
						requiredField.content = getFactoryObjectContent(value) ?? value;
						setTreeNode(value, requiredField.boxedContent);
						break;
					}
					case FieldKinds.optional: {
						const optionalField = field as OptionalField<AllowedTypes>;
						optionalField.content = getFactoryObjectContent(value) ?? value;
						setTreeNode(
							value,
							optionalField.boxedContent ?? fail("Expected optional field to be set"),
						);
						break;
					}
					default:
						fail("invalid FieldKind");
				}

				return true;
			},
			has: (target, key) => {
				return assertTreeNode(proxy).schema.objectNodeFields.has(key as FieldKey);
			},
			ownKeys: (target) => {
				return [...assertTreeNode(proxy).schema.objectNodeFields.keys()];
			},
			getOwnPropertyDescriptor: (target, key) => {
				const field = assertTreeNode(proxy).tryGetField(key as FieldKey);

				if (field === undefined) {
					return undefined;
				}

				const p: PropertyDescriptor = {
					value: getProxyForField(field),
					writable: true,
					enumerable: true,
					configurable: true, // Must be 'configurable' if property is absent from proxy target.
				};

				return p;
			},
		},
	) as SharedTreeObject<TSchema>;
	return proxy;
}

/**
 * Given the a list proxy, returns its underlying LazySequence field.
 */
const getSequenceField = <TTypes extends AllowedTypes>(
	list: SharedTreeList<TTypes, "javaScript">,
) => {
	const treeNode = getTreeNode(list) as FieldNode<FieldNodeSchema>;
	const field = treeNode.content;
	return field as LazySequence<TTypes>;
};

function insertListContent<TTypes extends AllowedTypes>(
	list: SharedTreeList<TTypes, "javaScript">,
	inserted: Iterable<ProxyNodeUnion<TTypes, "javaScript">>,
	insert: (sequence: LazySequence<TTypes>, items: Iterable<ContextuallyTypedNodeData>) => void,
): void {
	const items: ContextuallyTypedNodeData[] = [];
	const proxies: SharedTreeNode[] = [];
	for (const v of inserted) {
		if (v === null || typeof v !== "object") {
			items.push(v as ContextuallyTypedNodeData);
		} else {
			const factoryContent = getFactoryObjectContent(v);
			if (factoryContent !== undefined) {
				proxies.push(v);
			}
			items.push(factoryContent ?? (v as ContextuallyTypedNodeData));
		}
	}

	const field = getSequenceField(list);
	insert(field, items);

	for (let i = 0; i < proxies.length; i++) {
		setTreeNode(proxies[i], field.boxedAt(i));
	}
}

// TODO: Experiment with alternative dispatch methods to see if we can improve performance.

/**
 * PropertyDescriptorMap used to build the prototype for our SharedListNode dispatch object.
 */
const listPrototypeProperties: PropertyDescriptorMap = {
	// We manually add [Symbol.iterator] to the dispatch map rather than use '[fn.name] = fn' as
	// above because 'Array.prototype[Symbol.iterator].name' returns "values" (i.e., Symbol.iterator
	// is an alias for the '.values()' function.)
	[Symbol.iterator]: {
		value: Array.prototype[Symbol.iterator],
	},
	insertAt: {
		value(
			this: SharedTreeList<AllowedTypes, "javaScript">,
			index: number,
			value: Iterable<ProxyNodeUnion<AllowedTypes, "javaScript">>,
		): void {
			insertListContent(this, value, (field, items) => field.insertAt(index, items));
		},
	},
	insertAtStart: {
		value(
			this: SharedTreeList<AllowedTypes, "javaScript">,
			value: Iterable<ProxyNodeUnion<AllowedTypes, "javaScript">>,
		): void {
			insertListContent(this, value, (field, items) => field.insertAtStart(items));
		},
	},
	insertAtEnd: {
		value(
			this: SharedTreeList<AllowedTypes, "javaScript">,
			value: Iterable<ProxyNodeUnion<AllowedTypes, "javaScript">>,
		): void {
			insertListContent(this, value, (field, items) => field.insertAtEnd(items));
		},
	},
	removeAt: {
		value(this: SharedTreeList<AllowedTypes, "javaScript">, index: number): void {
			getSequenceField(this).removeAt(index);
		},
	},
	removeRange: {
		value(
			this: SharedTreeList<AllowedTypes, "javaScript">,
			start?: number,
			end?: number,
		): void {
			getSequenceField(this).removeRange(start, end);
		},
	},
	moveToStart: {
		value(
			this: SharedTreeList<AllowedTypes, "javaScript">,
			sourceStart: number,
			sourceEnd: number,
			source?: SharedTreeList<AllowedTypes>,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveToStart(
					sourceStart,
					sourceEnd,
					getSequenceField(source),
				);
			} else {
				getSequenceField(this).moveToStart(sourceStart, sourceEnd);
			}
		},
	},
	moveToEnd: {
		value(
			this: SharedTreeList<AllowedTypes, "javaScript">,
			sourceStart: number,
			sourceEnd: number,
			source?: SharedTreeList<AllowedTypes>,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveToEnd(sourceStart, sourceEnd, getSequenceField(source));
			} else {
				getSequenceField(this).moveToEnd(sourceStart, sourceEnd);
			}
		},
	},
	moveToIndex: {
		value(
			this: SharedTreeList<AllowedTypes, "javaScript">,
			index: number,
			sourceStart: number,
			sourceEnd: number,
			source?: SharedTreeList<AllowedTypes>,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveToIndex(
					index,
					sourceStart,
					sourceEnd,
					getSequenceField(source),
				);
			} else {
				getSequenceField(this).moveToIndex(index, sourceStart, sourceEnd);
			}
		},
	},
};

/* eslint-disable @typescript-eslint/unbound-method */

// For compatibility, we are initially implement 'readonly T[]' by applying the Array.prototype methods
// to the list proxy.  Over time, we should replace these with efficient implementations on LazySequence
// to avoid re-entering the proxy as these methods access 'length' and the indexed properties.
//
// For brevity, the current implementation dynamically builds a property descriptor map from a list of
// Array functions we want to re-expose via the proxy.

// TODO: This assumes 'Function.name' matches the property name on 'Array.prototype', which may be
// dubious across JS engines.
[
	// TODO: Remove cast to any once targeting a more recent ES version.
	(Array.prototype as any).at,

	Array.prototype.concat,
	// Array.prototype.copyWithin,
	Array.prototype.entries,
	Array.prototype.every,
	// Array.prototype.fill,
	Array.prototype.filter,
	Array.prototype.find,
	Array.prototype.findIndex,
	Array.prototype.flat,
	Array.prototype.flatMap,
	Array.prototype.forEach,
	Array.prototype.includes,
	Array.prototype.indexOf,
	Array.prototype.join,
	Array.prototype.keys,
	Array.prototype.lastIndexOf,
	// Array.prototype.length,
	Array.prototype.map,
	// Array.prototype.pop,
	// Array.prototype.push,
	Array.prototype.reduce,
	Array.prototype.reduceRight,
	// Array.prototype.reverse,
	// Array.prototype.shift,
	Array.prototype.slice,
	Array.prototype.some,
	// Array.prototype.sort,
	// Array.prototype.splice,
	Array.prototype.toLocaleString,
	Array.prototype.toString,
	// Array.prototype.unshift,
	Array.prototype.values,
].forEach((fn) => {
	listPrototypeProperties[fn.name] = { value: fn };
});

/* eslint-enable @typescript-eslint/unbound-method */

const prototype = Object.create(Object.prototype, listPrototypeProperties);

/**
 * Helper to coerce property keys to integer indexes (or undefined if not an in-range integer).
 */
function asIndex(key: string | symbol, length: number) {
	if (typeof key === "string") {
		// TODO: It may be worth a '0' <= ch <= '9' check before calling 'Number' to quickly
		// reject 'length' as an index, or even parsing integers ourselves.
		const asNumber = Number(key);

		// TODO: See 'matrix/range.ts' for fast integer coercing + range check.
		if (Number.isInteger(asNumber)) {
			return 0 <= asNumber && asNumber < length ? asNumber : undefined;
		}
	}
}

export function createListProxy<TTypes extends AllowedTypes>(
	treeNode: TreeNode,
): SharedTreeList<TTypes> {
	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target.
	// Own properties on the dispatch object are surfaced as own properties of the proxy.
	// (e.g., 'length', which is defined below).
	//
	// Properties normally inherited from 'Array.prototype' are surfaced via the prototype chain.
	const dispatch = Object.create(prototype, {
		length: {
			get(this: SharedTreeList<AllowedTypes, "javaScript">) {
				return getSequenceField(this).length;
			},
			set() {},
			enumerable: false,
			configurable: false,
		},
	});

	setTreeNode(dispatch, treeNode);

	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an array literal in order
	// to pass 'Object.getPrototypeOf'.  It also satisfies 'Array.isArray' and 'Object.prototype.toString'
	// requirements without use of Array[Symbol.species], which is potentially on a path ot deprecation.
	return new Proxy<SharedTreeList<TTypes>>([] as any, {
		get: (target, key) => {
			const field = getSequenceField(dispatch);
			const maybeIndex = asIndex(key, field.length);

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return maybeIndex !== undefined
				? getProxyForNode(field.boxedAt(maybeIndex))
				: (Reflect.get(dispatch, key) as unknown);
		},
		set: (target, key, newValue, receiver) => {
			// 'Symbol.isConcatSpreadable' may be set on an Array instance to modify the behavior of
			// the concat method.  We allow this property to be added to the dispatch object.
			if (key === Symbol.isConcatSpreadable) {
				return Reflect.set(dispatch, key, newValue);
			}

			// For MVP, we otherwise disallow setting properties (mutation is only available via the list mutation APIs).
			return false;
		},
		has: (target, key) => {
			const field = getSequenceField(dispatch);
			const maybeIndex = asIndex(key, field.length);
			return maybeIndex !== undefined || Reflect.has(dispatch, key);
		},
		ownKeys: (target) => {
			const field = getSequenceField(dispatch);

			// TODO: Would a lazy iterator to produce the indexes work / be more efficient?
			// TODO: Need to surface 'Symbol.isConcatSpreadable' as an own key.
			return Array.from({ length: field.length }, (_, index) => `${index}`).concat("length");
		},
		getOwnPropertyDescriptor: (target, key) => {
			const field = getSequenceField(dispatch);
			const maybeIndex = asIndex(key, field.length);
			if (maybeIndex !== undefined) {
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for indexed properties must
				// be a simple value property (as opposed to using getter) and declared writable/enumerable/configurable.
				return {
					// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
					//       as simple as calling '.at' since this skips the node and returns the FieldNode's
					//       inner field.
					value: getProxyForNode(field.boxedAt(maybeIndex)),
					writable: true, // For MVP, disallow setting indexed properties.
					enumerable: true,
					configurable: true,
				};
			} else if (key === "length") {
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for 'length' must be a simple
				// value property (as opposed to using getter) and be declared writable / non-configurable.
				return {
					value: getSequenceField(dispatch).length,
					writable: true,
					enumerable: false,
					configurable: false,
				};
			}
			return Reflect.getOwnPropertyDescriptor(dispatch, key);
		},
	});
}

function assertTreeNode(object: unknown): TreeNode {
	return getTreeNode(object) ?? fail("Expected TreeNode to be present on object");
}

// function updateProxyAfterInsertion(proxy: SharedTreeNode, treeNode: TreeNode): void {
// 	if (schemaIsObjectNode(treeNode.schema)) {
// 		setTreeNode(proxy, treeNode);
// 	}
// 	for (const field of treeNode[boxedIterator]()) {
// 	}
// }
