/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TreeNodeSchema, TreeNodeSchemaClass } from "@fluidframework/tree";

import type { BindableSchema, Ctor, TypeFromTypeDef } from "./methodBinding.js";
import { instanceOf } from "./renderTypeScript.js";
import type { TypeDef } from "./renderTypeScript.js";

/**
 * Symbol used by schema classes to expose tf-described properties to the agent.
 * @alpha
 */
export const exposePropertiesSymbol: unique symbol = Symbol.for(
	"@fluidframework/tree-agent/exposeProperties-tf",
);

/**
 * Set of property keys from `T` that are not callable (methods excluded).
 * @alpha
 */
export type ExposableKeys<T> = {
	[K in keyof T]?: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];

/**
 * Type-level equality helper.
 * @alpha
 */
export type IfEquals<X, Y, A = true, B = false> = (<T>() => T extends X ? 1 : 2) extends <
	T,
>() => T extends Y ? 1 : 2
	? A
	: B;

/**
 * Produces a union of keys of `T` that are readonly.
 * @alpha
 */
export type ReadonlyKeys<T> = {
	// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
	[P in keyof T]-?: IfEquals<{ [Q in P]: T[P] }, { -readonly [Q in P]: T[P] }, never, P>;
}[keyof T];

/**
 * Enforces `readOnly: true` for readonly properties, and optional `readOnly` otherwise.
 * @alpha
 */
export type ReadOnlyRequirement<TObj, K extends keyof TObj> = {
	[P in K]-?: P extends ReadonlyKeys<TObj> ? { readOnly: true } : { readOnly?: false };
}[K];

/**
 * Emits a compile-time error when the {@link TypeDef} does not match the declared property type.
 * @alpha
 */
export type TypeMatchOrError<Expected, Received> = [Received] extends [Expected]
	? unknown
	: {
			__error__: "TypeDef value type does not match the property's declared type";
			expected: Expected;
			received: Received;
		};

/**
 * Runtime carrier describing a property exposed via tf type defs.
 * @alpha
 */
export class PropertyDef {
	public constructor(
		public readonly name: string,
		public readonly description: string | undefined,
		public readonly schema: TypeDef,
		public readonly readOnly: boolean,
	) {}
}

/**
 * Interface schema classes use to expose tf-described properties to the agent.
 * @alpha
 */
export interface ExposedProperties {
	exposeProperty<
		S extends BindableSchema & Ctor,
		K extends string & ExposableKeys<InstanceType<S>>,
		TSchema extends TypeDef,
	>(
		schema: S,
		name: K,
		def: { schema: TSchema; description?: string } & ReadOnlyRequirement<InstanceType<S>, K> &
			TypeMatchOrError<InstanceType<S>[K], TypeFromTypeDef<TSchema>>,
	): void;

	/**
	 * Wrap a schema class in a {@link TypeDef} to reference it in tf property definitions.
	 */
	instanceOf<T extends TreeNodeSchemaClass>(schema: T): TypeDef;
}

/**
 * Contract schema classes can implement to publish tf helper properties.
 * @alpha
 */
export interface IExposedProperties {
	[exposePropertiesSymbol]?(properties: ExposedProperties): void;
}

class ExposedPropertiesI implements ExposedProperties {
	private readonly properties: Record<string, PropertyDef> = {};
	private readonly referencedTypes = new Set<TreeNodeSchema>();

	public constructor(private readonly schemaClass: BindableSchema) {}

	public exposeProperty<
		S extends BindableSchema & Ctor,
		K extends string & ExposableKeys<InstanceType<S>>,
		TSchema extends TypeDef,
	>(
		schema: S,
		name: K,
		def: { schema: TSchema; description?: string } & ReadOnlyRequirement<InstanceType<S>, K> &
			TypeMatchOrError<InstanceType<S>[K], TypeFromTypeDef<TSchema>>,
	): void {
		if (schema !== this.schemaClass) {
			throw new Error('Must expose properties on the "this" schema class');
		}
		this.properties[name] = new PropertyDef(
			name,
			def.description,
			def.schema,
			def.readOnly === true,
		);
		collectTypeDefReferences(def.schema, this.referencedTypes, new Set(), new Set());
	}

	public instanceOf<T extends TreeNodeSchemaClass>(schema: T): TypeDef {
		this.referencedTypes.add(schema as unknown as TreeNodeSchema);
		return instanceOf(schema);
	}

	public static getExposedProperties(schemaClass: BindableSchema): {
		properties: Record<string, PropertyDef>;
		referencedTypes: Set<TreeNodeSchema>;
	} {
		const exposed = new ExposedPropertiesI(schemaClass);
		const extractable = schemaClass as unknown as IExposedProperties;
		if (extractable[exposePropertiesSymbol] !== undefined) {
			extractable[exposePropertiesSymbol](exposed);
		}
		return {
			properties: exposed.properties,
			referencedTypes: exposed.referencedTypes,
		};
	}
}

/**
 * Extract tf helper properties from a schema class (internal helper for prompt rendering).
 */
export function getExposedProperties(schemaClass: BindableSchema): {
	properties: Record<string, PropertyDef>;
	referencedTypes: Set<TreeNodeSchema>;
} {
	return ExposedPropertiesI.getExposedProperties(schemaClass);
}

function collectTypeDefReferences(
	type: TypeDef,
	referenced: Set<TreeNodeSchema>,
	visited: Set<TypeDef>,
	visitedFactories: Set<() => TypeDef>,
): void {
	if (visited.has(type)) {
		return;
	}
	visited.add(type);
	switch (type.kind) {
		case "instanceof": {
			referenced.add(type.schema as unknown as TreeNodeSchema);
			return;
		}
		case "array": {
			collectTypeDefReferences(type.item, referenced, visited, visitedFactories);
			return;
		}
		case "object": {
			for (const child of Object.values(type.props)) {
				collectTypeDefReferences(child, referenced, visited, visitedFactories);
			}
			return;
		}
		case "promise": {
			collectTypeDefReferences(type.inner, referenced, visited, visitedFactories);
			return;
		}
		case "union": {
			for (const unionType of type.types) {
				collectTypeDefReferences(unionType, referenced, visited, visitedFactories);
			}
			return;
		}
		case "optional": {
			collectTypeDefReferences(type.inner, referenced, visited, visitedFactories);
			return;
		}
		case "function": {
			for (const arg of type.args) {
				collectTypeDefReferences(arg, referenced, visited, visitedFactories);
			}
			collectTypeDefReferences(type.returns, referenced, visited, visitedFactories);
			return;
		}
		case "lazy": {
			if (visitedFactories.has(type.factory)) {
				return;
			}
			visitedFactories.add(type.factory);
			collectTypeDefReferences(type.factory(), referenced, visited, visitedFactories);
			return;
		}
		default: {
			return;
		}
	}
}
