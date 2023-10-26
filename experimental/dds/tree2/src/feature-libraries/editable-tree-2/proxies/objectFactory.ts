/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Assume } from "../../../util";
import { typeNameSymbol } from "../../contextuallyTyped";
import { ObjectNodeSchema, TreeNodeSchema } from "../../typed-schema";
import { createRawObjectNode, nodeContent } from "../rawObjectNode";
import { createObjectProxy } from "./proxies";
import { ProxyNode, SharedTreeObject, getTreeNode, setTreeNode } from "./types";

export function getFactoryObjectContent<TSchema extends ObjectNodeSchema>(
	object: SharedTreeObject<TSchema>,
): ProxyNode<TSchema, "javaScript"> | undefined {
	return (
		getTreeNode(object) as
			| Partial<{
					[nodeContent]?: ProxyNode<TSchema, "javaScript">;
			  }>
			| undefined
	)?.[nodeContent];
}

/**
 * Adds a factory function (`create`) to the given schema so that it satisfies the {@link SharedTreeObjectFactory} interface.
 */
export function addFactory<TSchema extends ObjectNodeSchema>(
	schema: TSchema,
): FactoryTreeSchema<TSchema> {
	const create = (content: ProxyNode<TSchema, "javaScript">): SharedTreeObject<TSchema> => {
		// Shallow copy the content and then add the type name symbol to it.
		// The copy is necessary so that the input `content` object can be re-used as the contents of a different typed/named node in another `create` call.
		const namedContent = { ...content };
		Object.defineProperty(namedContent, typeNameSymbol, { value: schema.name });
		const proxy = createObjectProxy<TSchema>();
		setTreeNode(proxy, createRawObjectNode(schema, namedContent as any)); // TODO any
		return proxy;
	};

	return Object.defineProperty(schema, "create", {
		value: create,
		configurable: true,
		enumerable: true,
	}) as FactoryTreeSchema<TSchema>;
}

/**
 * Creates `{@link SharedTreeObject}`s of the given schema type via a `create` method.
 * @alpha
 */
export interface SharedTreeObjectFactory<TSchema extends TreeNodeSchema<string, unknown>> {
	/**
	 * Create a {@link SharedTreeObject} that can be inserted into the tree via assignment `=`.
	 * @param content - the data making up the {@link SharedTreeObject} to be created.
	 * @remarks
	 * The {@link SharedTreeObject} created by this function may _only_ be used for insertion into the tree.
	 * It may not be read, mutated or queried in any way.
	 */
	create(
		content: ProxyNode<Assume<TSchema, ObjectNodeSchema>, "javaScript">,
	): SharedTreeObject<Assume<TSchema, ObjectNodeSchema>>;
}

/**
 * A {@link TreeNodeSchema} which is also a {@link SharedTreeObjectFactory}.
 * @alpha
 */
export type FactoryTreeSchema<TSchema extends TreeNodeSchema<string, unknown>> = TSchema &
	SharedTreeObjectFactory<TSchema>;
