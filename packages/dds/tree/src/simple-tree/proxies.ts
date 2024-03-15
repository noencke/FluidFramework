/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { brand, fail, isReadonlyArray } from "../util/index.js";
import {
	FlexAllowedTypes,
	FlexFieldSchema,
	FlexObjectNodeSchema,
	FlexTreeNodeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	FlexMapNodeSchema,
	FlexFieldNodeSchema,
	FieldKinds,
	FlexTreeFieldNode,
	FlexTreeMapNode,
	FlexTreeObjectNode,
	FlexTreeOptionalField,
	FlexTreeRequiredField,
	FlexTreeSequenceField,
	FlexTreeNode,
	FlexTreeTypedField,
	typeNameSymbol,
	isFluidHandle,
	FlexTreeField,
} from "../feature-libraries/index.js";
import {
	AnchorSet,
	EmptyKey,
	FieldKey,
	TreeNodeSchemaIdentifier,
	TreeValue,
	UpPath,
} from "../core/index.js";
// TODO: decide how to deal with dependencies on flex-tree implementation.
// eslint-disable-next-line import/no-internal-modules
import { LazyObjectNode, getBoxedField } from "../feature-libraries/flex-tree/lazyNode.js";
import {
	type TreeNodeSchema as TreeNodeSchemaClass,
	type InsertableTypedNode,
	NodeKind,
	TreeMapNode,
} from "./schemaTypes.js";
import { IterableTreeArrayContent, TreeArrayNode } from "./treeArrayNode.js";
import { Unhydrated, TreeNode } from "./types.js";
import {
	setFlexNode,
	getFlexNode,
	tryGetFlexNode,
	tryGetFlexNodeTarget,
	bindProxyToAnchorNode,
} from "./flexNode.js";
import { cursorFromFieldData, cursorFromNodeData } from "./toMapTree.js";
import { RawTreeNode, createRawNode, extractRawNodeContent } from "./rawNode.js";

/**
 * Detects if the given 'candidate' is a TreeNode.
 *
 * @remarks
 * Supports both Hydrated and {@link Unhydrated} TreeNodes, both of which return true.
 *
 * Because the common usage is to check if a value being inserted/set is a TreeNode,
 * this function permits calling with primitives as well as objects.
 *
 * Primitives will always return false (as they are copies of data, not references to nodes).
 *
 * @param candidate - Value which may be a TreeNode
 * @returns true if the given 'candidate' is a hydrated TreeNode.
 */
export function isTreeNode(candidate: unknown): candidate is TreeNode | Unhydrated<TreeNode> {
	return tryGetFlexNode(candidate) !== undefined;
}

/**
 * Retrieve the associated proxy for the given field.
 * */
export function getProxyForField(field: FlexTreeField): TreeNode | TreeValue | undefined {
	switch (field.schema.kind) {
		case FieldKinds.required: {
			const asValue = field as FlexTreeTypedField<
				FlexFieldSchema<typeof FieldKinds.required>
			>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getOrCreateNodeProxy(asValue.boxedContent);
		}
		case FieldKinds.optional: {
			const asValue = field as FlexTreeTypedField<
				FlexFieldSchema<typeof FieldKinds.optional>
			>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.

			const maybeContent = asValue.boxedContent;

			// Normally, empty fields are unreachable due to the behavior of 'tryGetField'.  However, the
			// root field is a special case where the field is always present (even if empty).
			return maybeContent === undefined ? undefined : getOrCreateNodeProxy(maybeContent);
		}
		// TODO: Remove if/when 'FieldNode' is removed.
		case FieldKinds.sequence: {
			// 'getProxyForNode' handles FieldNodes by unconditionally creating a array node proxy, making
			// this case unreachable as long as users follow the 'array recipe'.
			fail("'sequence' field is unexpected.");
		}
		default:
			fail("invalid field kind");
	}
}

/**
 * A symbol for storing TreeNodeSchemaClass on FlexTreeNode's schema.
 */
export const simpleSchemaSymbol: unique symbol = Symbol(`simpleSchema`);

export function getClassSchema(schema: FlexTreeNodeSchema): TreeNodeSchemaClass | undefined {
	if (simpleSchemaSymbol in schema) {
		return schema[simpleSchemaSymbol] as TreeNodeSchemaClass;
	}
	return undefined;
}

export function getOrCreateNodeProxy(flexNode: FlexTreeNode): TreeNode | TreeValue {
	const cachedProxy = tryGetFlexNodeTarget(flexNode);
	if (cachedProxy !== undefined) {
		return cachedProxy;
	}

	const schema = flexNode.schema;
	let output: TreeNode | TreeValue;
	const classSchema = getClassSchema(schema);
	if (classSchema !== undefined) {
		if (typeof classSchema === "function") {
			const simpleSchema = classSchema as unknown as new (dummy: FlexTreeNode) => TreeNode;
			output = new simpleSchema(flexNode);
		} else {
			output = (schema as unknown as { create: (data: FlexTreeNode) => TreeNode }).create(
				flexNode,
			);
		}
	} else {
		// Fallback to createNodeProxy if needed.
		// TODO: maybe remove this fallback and error once migration to class based schema is done.
		output = createNodeProxy(flexNode, false);
	}
	return output;
}

/**
 * @param flexNode - underlying tree node which this proxy should wrap.
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided an empty collection of the relevant type is used for the target and a separate object created to dispatch methods.
 * If provided, the customTargetObject will be used as both the dispatch object and the proxy target, and therefor must provide needed functionality depending on the schema kind.
 */
export function createNodeProxy(
	flexNode: FlexTreeNode,
	allowAdditionalProperties: boolean,
	targetObject?: object,
): TreeNode | TreeValue {
	const schema = flexNode.schema;
	if (schemaIsLeaf(schema)) {
		// Can't use `??` here since null is a valid TreeValue.
		assert(flexNode.value !== undefined, 0x887 /* Leaf must have value */);
		return flexNode.value;
	}
	let proxy: TreeNode;
	if (schemaIsMap(schema)) {
		proxy = createMapProxy(allowAdditionalProperties, targetObject);
	} else if (schemaIsFieldNode(schema)) {
		proxy = createArrayNodeProxy(allowAdditionalProperties, targetObject);
	} else if (schemaIsObjectNode(schema)) {
		proxy = createObjectProxy(schema, allowAdditionalProperties, targetObject);
	} else {
		fail("unrecognized node kind");
	}
	setFlexNode(proxy, flexNode);
	return proxy;
}

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `{}` is used for the target.
 */
export function createObjectProxy<TSchema extends FlexObjectNodeSchema>(
	schema: TSchema,
	allowAdditionalProperties: boolean,
	targetObject: object = {},
): TreeNode {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
	// prototype as an object literal '{}'.  This is because 'deepEquals' uses 'Object.getPrototypeOf'
	// as a way to quickly reject objects with different prototype chains.
	//
	// (Note that the prototype of an object literal appears as '[Object: null prototype] {}', not because
	// the prototype is null, but because the prototype object itself has a null prototype.)

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy(targetObject, {
		get(target, key): unknown {
			const field = getFlexNode(proxy).tryGetField(key as FieldKey);
			if (field !== undefined) {
				return getProxyForField(field);
			}

			// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
			return Reflect.get(target, key, proxy);
		},
		set(target, key, value: InsertableContent) {
			const flexNode = getFlexNode(proxy);
			const flexNodeSchema = flexNode.schema;
			assert(flexNodeSchema instanceof FlexObjectNodeSchema, 0x888 /* invalid schema */);
			const fieldSchema = flexNodeSchema.objectNodeFields.get(key as FieldKey);

			if (fieldSchema === undefined) {
				return allowAdditionalProperties ? Reflect.set(target, key, value) : false;
			}

			// TODO: Is it safe to assume 'content' is a LazyObjectNode?
			assert(flexNode instanceof LazyObjectNode, 0x7e0 /* invalid content */);
			assert(typeof key === "string", 0x7e1 /* invalid key */);
			const field = getBoxedField(flexNode, brand(key), fieldSchema);

			switch (field.schema.kind) {
				case FieldKinds.required:
				case FieldKinds.optional: {
					const typedField = field as
						| FlexTreeRequiredField<FlexAllowedTypes>
						| FlexTreeOptionalField<FlexAllowedTypes>;

					const content = prepareForInsertion(
						value,
						{
							parent: flexNode.anchorNode,
							parentField: field.key,
							parentIndex: 0,
						},
						flexNode.context.anchorSet,
					);
					const cursor = cursorFromNodeData(
						content,
						flexNode.context.schema,
						fieldSchema.allowedTypeSet,
					);
					typedField.content = cursor;
					break;
				}

				default:
					fail("invalid FieldKind");
			}

			return true;
		},
		has: (target, key) => {
			return (
				schema.objectNodeFields.has(key as FieldKey) ||
				(allowAdditionalProperties ? Reflect.has(target, key) : false)
			);
		},
		ownKeys: (target) => {
			return [
				...schema.objectNodeFields.keys(),
				...(allowAdditionalProperties ? Reflect.ownKeys(target) : []),
			];
		},
		getOwnPropertyDescriptor: (target, key) => {
			const field = getFlexNode(proxy).tryGetField(key as FieldKey);

			if (field === undefined) {
				return allowAdditionalProperties
					? Reflect.getOwnPropertyDescriptor(target, key)
					: undefined;
			}

			const p: PropertyDescriptor = {
				value: getProxyForField(field),
				writable: true,
				enumerable: true,
				configurable: true, // Must be 'configurable' if property is absent from proxy target.
			};

			return p;
		},
	}) as TreeNode;
	return proxy;
}

/**
 * Given a array node proxy, returns its underlying LazySequence field.
 */
export const getSequenceField = <TTypes extends FlexAllowedTypes>(arrayNode: TreeArrayNode) =>
	getFlexNode(arrayNode).content as FlexTreeSequenceField<TTypes>;

// Used by 'insert*()' APIs to converts new content (expressed as a proxy union) to contextually
// typed data prior to forwarding to 'LazySequence.insert*()'.
function contextualizeInsertedArrayContent(
	content: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[],
	sequenceField: FlexTreeSequenceField<FlexAllowedTypes>,
	index: number,
): FactoryContent {
	return prepareForInsertion(
		content.flatMap((c): InsertableContent[] =>
			c instanceof IterableTreeArrayContent ? Array.from(c) : [c],
		),
		{
			parent:
				sequenceField.parent?.anchorNode ??
				fail("Expected sequence to have a parent array node"),
			parentField: EmptyKey,
			parentIndex: index,
		},
		sequenceField.context.anchorSet,
	);
}

// #region Create dispatch map for array nodes

// TODO: Experiment with alternative dispatch methods to see if we can improve performance.

/**
 * PropertyDescriptorMap used to build the prototype for our array node dispatch object.
 */
export const arrayNodePrototypeProperties: PropertyDescriptorMap = {
	// We manually add [Symbol.iterator] to the dispatch map rather than use '[fn.name] = fn' as
	// below when adding 'Array.prototype.*' properties to this map because 'Array.prototype[Symbol.iterator].name'
	// returns "values" (i.e., Symbol.iterator is an alias for the '.values()' function.)
	[Symbol.iterator]: {
		value: Array.prototype[Symbol.iterator],
	},
	at: {
		value(this: TreeArrayNode, index: number): TreeNode | TreeValue | undefined {
			const field = getSequenceField(this);
			const val = field.boxedAt(index);

			if (val === undefined) {
				return val;
			}

			return getOrCreateNodeProxy(val);
		},
	},
	insertAt: {
		value(
			this: TreeArrayNode,
			index: number,
			...value: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[]
		): void {
			const sequenceField = getSequenceField(this);
			const content = contextualizeInsertedArrayContent(value, sequenceField, index);
			sequenceField.insertAt(
				index,
				cursorFromFieldData(content, sequenceField.context.schema, sequenceField.schema),
			);
		},
	},
	insertAtStart: {
		value(
			this: TreeArrayNode,
			...value: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[]
		): void {
			const sequenceField = getSequenceField(this);
			const content = contextualizeInsertedArrayContent(value, sequenceField, 0);
			sequenceField.insertAtStart(
				cursorFromFieldData(content, sequenceField.context.schema, sequenceField.schema),
			);
		},
	},
	insertAtEnd: {
		value(
			this: TreeArrayNode,
			...value: readonly (InsertableContent | IterableTreeArrayContent<InsertableContent>)[]
		): void {
			const sequenceField = getSequenceField(this);
			const content = contextualizeInsertedArrayContent(value, sequenceField, this.length);
			sequenceField.insertAtEnd(
				cursorFromFieldData(content, sequenceField.context.schema, sequenceField.schema),
			);
		},
	},
	removeAt: {
		value(this: TreeArrayNode, index: number): void {
			getSequenceField(this).removeAt(index);
		},
	},
	removeRange: {
		value(this: TreeArrayNode, start?: number, end?: number): void {
			getSequenceField(this).removeRange(start, end);
		},
	},
	moveToStart: {
		value(this: TreeArrayNode, sourceIndex: number, source?: TreeArrayNode): void {
			if (source !== undefined) {
				getSequenceField(this).moveToStart(sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToStart(sourceIndex);
			}
		},
	},
	moveToEnd: {
		value(this: TreeArrayNode, sourceIndex: number, source?: TreeArrayNode): void {
			if (source !== undefined) {
				getSequenceField(this).moveToEnd(sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToEnd(sourceIndex);
			}
		},
	},
	moveToIndex: {
		value(
			this: TreeArrayNode,
			index: number,
			sourceIndex: number,
			source?: TreeArrayNode,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveToIndex(index, sourceIndex, getSequenceField(source));
			} else {
				getSequenceField(this).moveToIndex(index, sourceIndex);
			}
		},
	},
	moveRangeToStart: {
		value(
			this: TreeArrayNode,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeArrayNode,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveRangeToStart(
					sourceStart,
					sourceEnd,
					getSequenceField(source),
				);
			} else {
				getSequenceField(this).moveRangeToStart(sourceStart, sourceEnd);
			}
		},
	},
	moveRangeToEnd: {
		value(
			this: TreeArrayNode,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeArrayNode,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveRangeToEnd(
					sourceStart,
					sourceEnd,
					getSequenceField(source),
				);
			} else {
				getSequenceField(this).moveRangeToEnd(sourceStart, sourceEnd);
			}
		},
	},
	moveRangeToIndex: {
		value(
			this: TreeArrayNode,
			index: number,
			sourceStart: number,
			sourceEnd: number,
			source?: TreeArrayNode,
		): void {
			if (source !== undefined) {
				getSequenceField(this).moveRangeToIndex(
					index,
					sourceStart,
					sourceEnd,
					getSequenceField(source),
				);
			} else {
				getSequenceField(this).moveRangeToIndex(index, sourceStart, sourceEnd);
			}
		},
	},
};

/* eslint-disable @typescript-eslint/unbound-method */

// For compatibility, we are initially implement 'readonly T[]' by applying the Array.prototype methods
// to the array node proxy.  Over time, we should replace these with efficient implementations on LazySequence
// to avoid re-entering the proxy as these methods access 'length' and the indexed properties.
//
// For brevity, the current implementation dynamically builds a property descriptor map from a list of
// Array functions we want to re-expose via the proxy.

// TODO: This assumes 'Function.name' matches the property name on 'Array.prototype', which may be
// dubious across JS engines.
[
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
	arrayNodePrototypeProperties[fn.name] = { value: fn };
});

/* eslint-enable @typescript-eslint/unbound-method */

const arrayNodePrototype = Object.create(Object.prototype, arrayNodePrototypeProperties);

// #endregion

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

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `[]` is used for the target and a separate object created to dispatch array methods.
 * If provided, the customTargetObject will be used as both the dispatch object and the proxy target, and therefor must provide `length` and the array functionality from {@link arrayNodePrototype}.
 */
function createArrayNodeProxy(
	allowAdditionalProperties: boolean,
	customTargetObject?: object,
): TreeArrayNode {
	const targetObject = customTargetObject ?? [];

	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target, because we need
	// the proxy target to be a plain JS array (see comments below when we instantiate the Proxy).
	// Own properties on the dispatch object are surfaced as own properties of the proxy.
	// (e.g., 'length', which is defined below).
	//
	// Properties normally inherited from 'Array.prototype' are surfaced via the prototype chain.
	const dispatch: object =
		customTargetObject ??
		Object.create(arrayNodePrototype, {
			length: {
				get(this: TreeArrayNode) {
					return getSequenceField(this).length;
				},
				set() {},
				enumerable: false,
				configurable: false,
			},
		});

	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an array literal in order
	// to pass 'Object.getPrototypeOf'.  It also satisfies 'Array.isArray' and 'Object.prototype.toString'
	// requirements without use of Array[Symbol.species], which is potentially on a path ot deprecation.
	const proxy: TreeArrayNode = new Proxy<TreeArrayNode>(targetObject as any, {
		get: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);

			if (maybeIndex === undefined) {
				// Pass the proxy as the receiver here, so that any methods on
				// the prototype receive `proxy` as `this`.
				return Reflect.get(dispatch, key, proxy) as unknown;
			}

			const value = field.boxedAt(maybeIndex);

			if (value === undefined) {
				return undefined;
			}

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getOrCreateNodeProxy(value);
		},
		set: (target, key, newValue, receiver) => {
			// 'Symbol.isConcatSpreadable' may be set on an Array instance to modify the behavior of
			// the concat method.  We allow this property to be added to the dispatch object.
			if (key === Symbol.isConcatSpreadable) {
				return Reflect.set(dispatch, key, newValue, proxy);
			}

			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			if (maybeIndex !== undefined) {
				// For MVP, we otherwise disallow setting properties (mutation is only available via the array node mutation APIs).
				return false;
			}
			return allowAdditionalProperties ? Reflect.set(target, key, newValue) : false;
		},
		has: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			return maybeIndex !== undefined || Reflect.has(dispatch, key);
		},
		ownKeys: (target) => {
			const field = getSequenceField(proxy);

			// TODO: Would a lazy iterator to produce the indexes work / be more efficient?
			// TODO: Need to surface 'Symbol.isConcatSpreadable' as an own key.
			return Array.from({ length: field.length }, (_, index) => `${index}`).concat("length");
		},
		getOwnPropertyDescriptor: (target, key) => {
			const field = getSequenceField(proxy);
			const maybeIndex = asIndex(key, field.length);
			if (maybeIndex !== undefined) {
				const val = field.boxedAt(maybeIndex);
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for indexed properties must
				// be a simple value property (as opposed to using getter) and declared writable/enumerable/configurable.
				return {
					// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
					//       as simple as calling '.at' since this skips the node and returns the FieldNode's
					//       inner field.
					value: val === undefined ? val : getOrCreateNodeProxy(val),
					writable: true, // For MVP, disallow setting indexed properties.
					enumerable: true,
					configurable: true,
				};
			} else if (key === "length") {
				// To satisfy 'deepEquals' level scrutiny, the property descriptor for 'length' must be a simple
				// value property (as opposed to using getter) and be declared writable / non-configurable.
				return {
					value: getSequenceField(proxy).length,
					writable: true,
					enumerable: false,
					configurable: false,
				};
			}
			return Reflect.getOwnPropertyDescriptor(dispatch, key);
		},
	});
	return proxy;
}

// #region Create dispatch map for maps

export const mapStaticDispatchMap: PropertyDescriptorMap = {
	[Symbol.iterator]: {
		value(this: TreeMapNode) {
			return this.entries();
		},
	},
	delete: {
		value(this: TreeMapNode, key: string): void {
			const node = getFlexNode(this);
			node.delete(key);
		},
	},
	entries: {
		*value(this: TreeMapNode): IterableIterator<[string, unknown]> {
			const node = getFlexNode(this);
			for (const key of node.keys()) {
				yield [key, getProxyForField(node.getBoxed(key))];
			}
		},
	},
	get: {
		value(this: TreeMapNode, key: string): unknown {
			const node = getFlexNode(this);
			const field = node.getBoxed(key);
			return getProxyForField(field);
		},
	},
	has: {
		value(this: TreeMapNode, key: string): boolean {
			const node = getFlexNode(this);
			return node.has(key);
		},
	},
	keys: {
		value(this: TreeMapNode): IterableIterator<string> {
			const node = getFlexNode(this);
			return node.keys();
		},
	},
	set: {
		value(
			this: TreeMapNode,
			key: string,
			value: InsertableTypedNode<TreeNodeSchemaClass>,
		): TreeMapNode {
			const node = getFlexNode(this);
			const content = prepareForInsertion(
				value as FactoryContent,
				{ parent: node.anchorNode, parentField: brand(key), parentIndex: 0 },
				node.context.anchorSet,
			);
			const cursor = cursorFromNodeData(
				content,
				node.context.schema,
				node.schema.mapFields.allowedTypeSet,
			);
			node.set(key, cursor);
			return this;
		},
	},
	size: {
		get(this: TreeMapNode) {
			return getFlexNode(this).size;
		},
	},
	values: {
		*value(this: TreeMapNode): IterableIterator<unknown> {
			for (const [, value] of this.entries()) {
				yield value;
			}
		},
	},
	// TODO: add `clear` once we have established merge semantics for it.
};

const mapPrototype = Object.create(Object.prototype, mapStaticDispatchMap);

// #endregion

/**
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `new Map()` is used for the target and a separate object created to dispatch map methods.
 * If provided, the customTargetObject will be used as both the dispatch object and the proxy target, and therefor must provide the map functionality from {@link mapPrototype}.
 */
function createMapProxy(
	allowAdditionalProperties: boolean,
	customTargetObject?: object,
): TreeMapNode {
	// Create a 'dispatch' object that this Proxy forwards to instead of the proxy target.
	const dispatch: object =
		customTargetObject ??
		Object.create(mapPrototype, {
			// Empty - JavaScript Maps do not expose any "own" properties.
		});
	const targetObject: object = customTargetObject ?? new Map<string, TreeNode>();

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	const proxy = new Proxy<TreeMapNode>(targetObject as TreeMapNode, {
		get: (target, key, receiver): unknown => {
			// Pass the proxy as the receiver here, so that any methods on the prototype receive `proxy` as `this`.
			return Reflect.get(dispatch, key, proxy);
		},
		getOwnPropertyDescriptor: (target, key): PropertyDescriptor | undefined => {
			return Reflect.getOwnPropertyDescriptor(dispatch, key);
		},
		has: (target, key) => {
			return Reflect.has(dispatch, key);
		},
		set: (target, key, newValue): boolean => {
			return allowAdditionalProperties ? Reflect.set(dispatch, key, newValue) : false;
		},
		ownKeys: (target) => {
			// All of Map's properties are inherited via its prototype, so there is nothing to return here,
			return [];
		},
	});
	return proxy;
}

/**
 * Create a proxy to a {@link TreeObjectNode} that is backed by a raw object node (see {@link createRawNode}).
 * @param schema - the schema of the object node
 * @param content - the content to be stored in the raw node.
 * A copy of content is stored, the input `content` is not modified and can be safely reused in another call to {@link createRawObjectProxy}.
 * @param allowAdditionalProperties - If true, setting of unexpected properties will be forwarded to the target object.
 * Otherwise setting of unexpected properties will error.
 * @param customTargetObject - Target object of the proxy.
 * If not provided `{}` is used for the target.
 * @remarks
 * Because this proxy is backed by a raw node, it has the same limitations as the node created by {@link createRawNode}.
 * Most of its properties and methods will error if read/called.
 */
export function createRawNodeProxy(
	schema: FlexTreeNodeSchema,
	content: InsertableTypedNode<TreeNodeSchemaClass> & object,
	allowAdditionalProperties: boolean,
	target?: object,
): Unhydrated<TreeNode> {
	// Shallow copy the content and then add the type name symbol to it.
	let flexNode: RawTreeNode<FlexTreeNodeSchema, InsertableTypedNode<TreeNodeSchemaClass>>;
	let proxy: TreeNode;
	if (schema instanceof FlexObjectNodeSchema) {
		const contentCopy = copyContent(schema.name, content);
		flexNode = createRawNode(schema, contentCopy);
		proxy = createObjectProxy(schema, allowAdditionalProperties, target);
	} else if (schema instanceof FlexFieldNodeSchema) {
		// simple-tree uses field nodes exclusively to represent array nodes
		const contentCopy = copyContent(schema.name, content);
		flexNode = createRawNode(schema, contentCopy);
		proxy = createArrayNodeProxy(allowAdditionalProperties, target);
	} else if (schema instanceof FlexMapNodeSchema) {
		const contentCopy = copyContent(schema.name, content);
		flexNode = createRawNode(schema, contentCopy);
		proxy = createMapProxy(allowAdditionalProperties, target);
	} else {
		fail("Unrecognized content schema");
	}

	return setFlexNode(proxy, flexNode);
}

function copyContent<T extends object>(typeName: TreeNodeSchemaIdentifier, content: T): T {
	const copy =
		content instanceof Map
			? (new Map(content) as T)
			: Array.isArray(content)
			? (content.slice() as T)
			: { ...content };

	return Object.defineProperty(copy, typeNameSymbol, { value: typeName });
}

/** TODO document */
export function prepareForInsertion(
	content: InsertableContent,
	path: UpPath,
	anchors: AnchorSet,
): FactoryContent {
	return extractFactoryContent(content, {
		path,
		onVisitProxy: (proxyPath, proxy) => {
			const anchor = anchors.track(proxyPath);
			const anchorNode = anchors.locate(anchor) ?? fail("Expected anchor node to be present");
			// TODO: don't double dispose
			anchorNode.on("afterDestroy", () => anchors.forget(anchor));
			bindProxyToAnchorNode(proxy, anchorNode);
		},
	});
}

/**
 * Given a content tree that is to be inserted into the shared tree, replace all subtrees that were created by factories
 * (via {@link SharedTreeObjectFactory.create}) with the content that was passed to those factories.
 * @param content - the content being inserted which may be, and/or may contain, factory-created content
 * @param onVisitProxy - an optional callback that will run for each proxy (i.e. object created by a factory) found in the inserted content
 * @param insertedAtIndex - if the content being inserted is array node content, this must be the index in the array node at which the content is being inserted
 * @returns the result of the content replacement and a {@link ExtractedFactoryContent.hydrateProxies} function which must be invoked if present.
 * @remarks
 * This functions works recursively.
 * Factory-created objects that are nested inside of the content passed to other factory-created objects, and so on, will be in-lined.
 * This function also adds the hidden {@link typeNameSymbol} of each object schema to the output.
 * @example
 * ```ts
 * const x = foo.create({
 *   a: 3, b: bar.create({
 *     c: [baz.create({ d: 5 })]
 *   })
 * });
 * const y = extractFactoryContent(x);
 * y === {
 *   [typeNameSymbol]: "foo", a: 3, b: {
 *     [typeNameSymbol]: "bar", c: [{ [typeNameSymbol]: "baz", d: 5 }]
 *  }
 * }
 * ```
 */
export function extractFactoryContent(
	input: InsertableContent,
	visitProxies?: {
		path: UpPath;
		onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
	},
): FactoryContent {
	let content: FactoryContent;
	let fromFactory = false;
	const rawFlexNode = tryGetFlexNode(input);
	if (rawFlexNode !== undefined) {
		const factoryContent = extractRawNodeContent(rawFlexNode);
		if (factoryContent === undefined) {
			// We were passed a proxy, but that proxy doesn't have any raw content.
			throw new Error("Cannot insert a node that is already in the tree");
		}
		visitProxies?.onVisitProxy(visitProxies.path, input as TreeNode);
		content = factoryContent;
		fromFactory = true;
	} else {
		content = input as FactoryContent;
	}

	assert(!isTreeNode(content), 0x844 /* Unhydrated insertion content should have FlexNode */);

	let type: NodeKind;
	let extractedContent: FactoryContent;
	if (isReadonlyArray(content)) {
		type = NodeKind.Array;
		extractedContent = extractContentArray(content as readonly FactoryContent[], visitProxies);
	} else if (content instanceof Map) {
		type = NodeKind.Map;
		extractedContent = extractContentMap(
			content as ReadonlyMap<string, FactoryContent>,
			visitProxies,
		);
	} else if (typeof content === "object" && content !== null && !isFluidHandle(content)) {
		type = NodeKind.Object;
		extractedContent = extractContentObject(content as object, visitProxies);
	} else {
		extractedContent = content;
		type = NodeKind.Leaf;
	}

	if (rawFlexNode !== undefined) {
		const kindFromSchema =
			getClassSchema(rawFlexNode.schema)?.kind ??
			fail("NodeBase should always have class schema");
		assert(kindFromSchema === type, 0x845 /* kind of data should match kind of schema */);
	}

	if (fromFactory) {
		return content; // TODO: why do we do this?
	}

	return extractedContent;
}

/**
 * @param insertedAtIndex - Supply this if the extracted array content will be inserted into an existing array node in the tree.
 */
function extractContentArray(
	input: readonly FactoryContent[],
	visitProxies:
		| {
				path: UpPath;
				onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
		  }
		| undefined,
): FactoryContent {
	const output: FactoryContent[] = [];
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	for (let i = 0; i < input.length; i++) {
		const childContent = extractFactoryContent(
			input[i],
			visitProxies !== undefined
				? {
						path: {
							parent: visitProxies.path,
							parentField: EmptyKey,
							parentIndex: i,
						},
						onVisitProxy: visitProxies?.onVisitProxy,
				  }
				: undefined,
		);
		output.push(childContent);
	}
	return output;
}

function extractContentMap(
	input: ReadonlyMap<string, FactoryContent>,
	visitProxies:
		| {
				path: UpPath;
				onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
		  }
		| undefined,
): FactoryContent {
	const output = new Map();
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	for (const [key, value] of input) {
		const childContent = extractFactoryContent(
			value,
			visitProxies !== undefined
				? {
						path: {
							parent: visitProxies.path,
							parentField: brand(key),
							parentIndex: 0,
						},
						onVisitProxy: visitProxies?.onVisitProxy,
				  }
				: undefined,
		);
		output.set(key, childContent);
	}
	return output;
}

function extractContentObject(
	input: {
		readonly [P in string]?: FactoryContent;
	},
	visitProxies:
		| {
				path: UpPath;
				onVisitProxy: (path: UpPath, proxy: TreeNode) => void;
		  }
		| undefined,
): FactoryContent {
	const output: Record<string, FactoryContent> = {};
	if (typeNameSymbol in input) {
		Object.defineProperty(output, typeNameSymbol, { value: input[typeNameSymbol] });
	}
	for (const [key, value] of Object.entries(input)) {
		// Treat undefined fields and missing fields the same.
		// Generally tree does not require explicit undefined values at runtime despite some of the schema aware type checking currently requiring it.
		if (value !== undefined) {
			const childContent = extractFactoryContent(
				value,
				visitProxies !== undefined
					? {
							path: {
								parent: visitProxies.path,
								parentField: brand(key),
								parentIndex: 0,
							},
							onVisitProxy: visitProxies?.onVisitProxy,
					  }
					: undefined,
			);
			output[key] = childContent;
		}
	}
	return output;
}

/**
 * Content which can be used to build a node.
 * @remarks
 * Can contain unhydrated nodes, but can not be an unhydrated node at the root.
 */
export type FactoryContent =
	| IFluidHandle
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| ReadonlyMap<string, InsertableContent>
	| readonly InsertableContent[]
	| {
			readonly [P in string]?: InsertableContent;
	  };

/**
 * Content which can be inserted into a tree.
 */
export type InsertableContent = Unhydrated<TreeNode> | FactoryContent;

function getArrayNodeChildNode(
	arrayNode: FlexTreeFieldNode<FlexFieldNodeSchema>,
	index: number,
): FlexTreeNode | undefined {
	const field = arrayNode.tryGetField(EmptyKey);
	assert(
		field?.schema.kind === FieldKinds.sequence,
		0x7fc /* Expected sequence field when hydrating array node */,
	);
	return (field as FlexTreeSequenceField<FlexAllowedTypes>).boxedAt(index);
}

function getMapChildNode(
	mapNode: FlexTreeMapNode<FlexMapNodeSchema>,
	key: string,
): FlexTreeNode | undefined {
	const field = mapNode.getBoxed(key);
	assert(
		field.schema.kind === FieldKinds.optional,
		0x7fd /* Sequence field kind is unsupported as map values */,
	);
	return (field as FlexTreeOptionalField<FlexAllowedTypes>).boxedContent;
}

function getObjectChildNode(objectNode: FlexTreeObjectNode, key: string): FlexTreeNode | undefined {
	const field =
		objectNode.tryGetField(brand(key)) ?? fail("Expected a field for inserted content");
	assert(
		field.schema.kind === FieldKinds.required || field.schema.kind === FieldKinds.optional,
		0x7fe /* Expected required or optional field kind */,
	);
	return (
		field as FlexTreeRequiredField<FlexAllowedTypes> | FlexTreeOptionalField<FlexAllowedTypes>
	).boxedContent;
}
