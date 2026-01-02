/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TreeNodeSchema, TreeNodeSchemaClass } from "@fluidframework/tree/alpha";
import { ObjectNodeSchema } from "@fluidframework/tree/alpha";

/**
 * Structural description of a type used by the tf helper APIs for prompt/type generation.
 * @alpha
 */
export type TypeDef =
	| {
			kind: "primitive";
			type: "string" | "number" | "boolean" | "null" | "undefined" | "void" | "any";
	  }
	| { kind: "array"; item: TypeDef }
	| { kind: "object"; props: Record<string, TypeDef> }
	| { kind: "promise"; inner: TypeDef }
	| { kind: "union"; types: TypeDef[] }
	| { kind: "optional"; inner: TypeDef }
	| { kind: "literal"; value: string | number | boolean }
	| { kind: "function"; args: TypeDef[]; returns: TypeDef }
	| { kind: "date" }
	| { kind: "lazy"; factory: () => TypeDef }
	| { kind: "instanceof"; schema: TreeNodeSchemaClass };

/**
 * A lookup from TypeDef instanceOf types to their corresponding ObjectNodeSchema.
 * @alpha
 */
export const instanceOfs = new WeakMap<TypeDef, ObjectNodeSchema>();

/**
 * Create a TypeDef for a SharedTree schema class.
 * @alpha
 */
export function instanceOf<T extends TreeNodeSchemaClass>(schema: T): TypeDef {
	if (!(schema instanceof ObjectNodeSchema)) {
		throw new UsageError(`${schema.identifier} must be an instance of ObjectNodeSchema.`);
	}
	const typeDefInstance: TypeDef = { kind: "instanceof", schema };
	instanceOfs.set(typeDefInstance, schema);
	return typeDefInstance;
}

/**
 * Factory helpers for building {@link TypeDef} objects (tf analogue of the Zod builders).
 * @alpha
 */
export const tf = {
	// Primitives
	string: { kind: "primitive", type: "string" } as const,
	number: { kind: "primitive", type: "number" } as const,
	boolean: { kind: "primitive", type: "boolean" } as const,
	null: { kind: "primitive", type: "null" } as const,
	undefined: { kind: "primitive", type: "undefined" } as const,
	void: { kind: "primitive", type: "void" } as const,
	any: { kind: "primitive", type: "any" } as const,

	// Compound types
	array: <T extends TypeDef>(item: T) => ({ kind: "array", item }) as const,

	object: <T extends Record<string, TypeDef>>(props: T) =>
		({ kind: "object", props }) as const,

	promise: <T extends TypeDef>(inner: T) => ({ kind: "promise", inner }) as const,

	// Type operators
	union: <T extends TypeDef[]>(...types: T) => ({ kind: "union", types }) as const,

	optional: <T extends TypeDef>(inner: T) => ({ kind: "optional", inner }) as const,

	literal: <T extends string | number | boolean>(value: T) =>
		({ kind: "literal", value }) as const,

	// Special types
	function: <A extends TypeDef[], R extends TypeDef>(args: A, returns: R) =>
		({ kind: "function", args, returns }) as const,

	date: { kind: "date" } as const,

	// Recursive types
	lazy: <T extends TypeDef>(factory: () => T) => ({ kind: "lazy", factory }) as const,

	// Tree node schema
	instanceOf,
} as const;

/**
 * Converts tf {@link TypeDef} descriptions into TypeScript declaration text for prompts.
 */
export function renderTypeDefTypeScript(
	typeDef: TypeDef,
	getFriendlyName: (schema: TreeNodeSchema) => string,
	instanceOfLookup: WeakMap<TypeDef, ObjectNodeSchema>,
): string {
	let result = "";
	let startOfLine = true;
	let indent = 0;
	const visitedLazy = new Set<() => TypeDef>();

	appendType(typeDef);
	return result;

	function appendType(type: TypeDef, minPrecedence = TypePrecedence.Object): void {
		const shouldParenthesize = getTypePrecedence(type) < minPrecedence;
		if (shouldParenthesize) {
			append("(");
		}
		appendTypeDefinition(type);
		if (shouldParenthesize) {
			append(")");
		}
	}

	function append(s: string): void {
		if (startOfLine) {
			result += "    ".repeat(indent);
			startOfLine = false;
		}
		result += s;
	}

	function appendNewLine(): void {
		append("\n");
		startOfLine = true;
	}

	function appendTypeDefinition(type: TypeDef): void {
		switch (type.kind) {
			case "primitive": {
				appendPrimitiveType(type);
				return;
			}
			case "array": {
				appendArrayType(type);
				return;
			}
			case "object": {
				appendObjectType(type);
				return;
			}
			case "promise": {
				appendPromiseType(type);
				return;
			}
			case "union": {
				appendUnionOrIntersectionTypes(type.types, TypePrecedence.Union);
				return;
			}
			case "optional": {
				appendUnionOrIntersectionTypes(
					[type.inner, { kind: "primitive", type: "undefined" }],
					TypePrecedence.Union,
				);
				return;
			}
			case "literal": {
				appendLiteral(type.value);
				return;
			}
			case "function": {
				appendFunctionType(type);
				return;
			}
			case "date": {
				append("Date");
				return;
			}
			case "lazy": {
				appendLazyType(type);
				return;
			}
			case "instanceof": {
				appendInstanceOfType(type);
				return;
			}
			default: {
				throw new UsageError(
					`Unsupported type when formatting helper types: ${(type as TypeDef).kind}`,
				);
			}
		}
	}

	function appendPrimitiveType(type: TypeDef & { kind: "primitive" }): void {
		switch (type.type) {
			case "string": {
				append("string");
				return;
			}
			case "number": {
				append("number");
				return;
			}
			case "boolean": {
				append("boolean");
				return;
			}
			case "null": {
				append("null");
				return;
			}
			case "undefined": {
				append("undefined");
				return;
			}
			case "void": {
				append("void");
				return;
			}
			case "any": {
				append("any");
				return;
			}
			default: {
				throw new UsageError(`Unsupported primitive type: ${type.type}`);
			}
		}
	}

	function appendArrayType(arrayType: TypeDef & { kind: "array" }): void {
		appendType(arrayType.item, TypePrecedence.Object);
		append("[]");
	}

	function appendObjectType(objectType: TypeDef & { kind: "object" }): void {
		append("{");
		appendNewLine();
		indent++;
		for (const [name, propertyType] of Object.entries(objectType.props)) {
			append(name);
			if (propertyType.kind === "optional") {
				append("?");
				append(": ");
				appendType(propertyType.inner);
			} else {
				append(": ");
				appendType(propertyType);
			}
			append(";");
			appendNewLine();
		}
		indent--;
		append("}");
	}

	function appendPromiseType(promiseType: TypeDef & { kind: "promise" }): void {
		append("Promise<");
		appendType(promiseType.inner);
		append(">");
	}

	function appendUnionOrIntersectionTypes(
		types: readonly TypeDef[],
		minPrecedence: TypePrecedence,
	): void {
		let first = true;
		for (const innerType of types) {
			if (!first) {
				append(minPrecedence === TypePrecedence.Intersection ? " & " : " | ");
			}
			appendType(innerType, minPrecedence);
			first = false;
		}
	}

	function appendLiteral(value: string | number | boolean): void {
		append(JSON.stringify(value));
	}

	function appendFunctionType(functionType: TypeDef & { kind: "function" }): void {
		append("(");
		let first = true;
		for (let i = 0; i < functionType.args.length; i++) {
			if (!first) {
				append(", ");
			}
			append(`arg${i}: `);
			appendType(functionType.args[i] ?? oob());
			first = false;
		}
		append(") => ");
		appendType(functionType.returns);
	}

	function appendLazyType(lazyType: TypeDef & { kind: "lazy" }): void {
		if (visitedLazy.has(lazyType.factory)) {
			// Circular reference detected - could use a name/reference here
			append("(recursive)");
			return;
		}
		visitedLazy.add(lazyType.factory);
		appendType(lazyType.factory());
		visitedLazy.delete(lazyType.factory);
	}

	function appendInstanceOfType(instanceOfType: TypeDef & { kind: "instanceof" }): void {
		const schema = instanceOfLookup.get(instanceOfType);
		if (schema === undefined) {
			throw new UsageError(
				`Unsupported instanceof type when formatting helper types: no schema found`,
			);
		}
		append(getFriendlyName(schema));
	}
}

const enum TypePrecedence {
	Union = 0,
	Intersection = 1,
	Object = 2,
}

function getTypePrecedence(type: TypeDef): TypePrecedence {
	switch (type.kind) {
		case "union": {
			return TypePrecedence.Union;
		}
		// Add intersection when implemented
		// case "intersection": {
		//     return TypePrecedence.Intersection;
		// }
		default: {
			return TypePrecedence.Object;
		}
	}
}
