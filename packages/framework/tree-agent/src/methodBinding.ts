/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TreeNodeSchema, TreeNodeSchemaClass } from "@fluidframework/tree";
import { NodeKind } from "@fluidframework/tree";

import { instanceOf } from "./renderTypeScript.js";
import type { TypeDef } from "./renderTypeScript.js";

/**
 * Extracts the method keys from a given type.
 * @alpha
 */
export type MethodKeys<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
};

/**
 * Constructor helper.
 * @alpha
 */
export type Ctor<T = any> = new (...args: any[]) => T;

/**
 * SharedTree schemas that can expose helper bindings.
 * @alpha
 */
export type BindableSchema =
	| TreeNodeSchema<string, NodeKind.Object>
	| TreeNodeSchema<string, NodeKind.Record>
	| TreeNodeSchema<string, NodeKind.Array>
	| TreeNodeSchema<string, NodeKind.Map>;

/**
 * A type guard to check if a schema is {@link BindableSchema | bindable}.
 */
export function isBindableSchema(schema: TreeNodeSchema): schema is BindableSchema {
	return (
		schema.kind === NodeKind.Object ||
		schema.kind === NodeKind.Record ||
		schema.kind === NodeKind.Array ||
		schema.kind === NodeKind.Map
	);
}

/**
 * Tuple describing a function argument name and its {@link TypeDef}.
 * @alpha
 */
export type Arg<T extends TypeDef = TypeDef> = readonly [name: string, type: T];

/**
 * Structured description of a function signature using {@link TypeDef} shapes.
 * @alpha
 */
export interface FunctionDef<
	Args extends readonly Arg[],
	Return extends TypeDef,
	Rest extends TypeDef | undefined = undefined,
> {
	/**
	 * Optional human readable description for prompt rendering.
	 */
	description?: string;
	/**
	 * Ordered list of named arguments and their types.
	 */
	args: Args;
	/**
	 * Optional variadic tail type (rest args share a single type).
	 */
	rest?: Rest;
	/**
	 * Return type of the function.
	 */
	returns: Return;
}

/**
 * Runtime carrier for a tf function definition (used when rendering helper methods).
 * @alpha
 */
export class FunctionWrapper
	implements FunctionDef<readonly Arg[], TypeDef, TypeDef | undefined>
{
	public constructor(
		public readonly name: string,
		public readonly description: string | undefined,
		public readonly args: readonly Arg[],
		public readonly rest: TypeDef | undefined,
		public readonly returns: TypeDef,
	) {}
}

/**
 * Extracts the TypeScript tuple type for the args of a {@link FunctionDef}.
 * @alpha
 */
export type ArgsTuple<T extends readonly Arg[]> = T extends readonly [
	...infer Entries extends Arg[],
]
	? { [K in keyof Entries]: Entries[K] extends Arg<infer U> ? TypeFromTypeDef<U> : never }
	: [];

/**
 * Expands a rest {@link TypeDef} into a tuple of repeated argument types.
 * @alpha
 */
export type RestTuple<TRest> = TRest extends TypeDef ? TypeFromTypeDef<TRest>[] : [];

/**
 * Emits a compile-time error when the helper method signature does not match the implementation.
 * @alpha
 */
export type FunctionMatchOrError<Expected, Received> = Expected extends (
	...expected: infer ExpectedArgs
) => infer ExpectedReturn
	? Received extends (...received: infer ReceivedArgs) => infer ReceivedReturn
		? [ExpectedArgs] extends [ReceivedArgs]
			? [ReceivedArgs] extends [ExpectedArgs]
				? [ExpectedReturn] extends [ReceivedReturn]
					? [ReceivedReturn] extends [ExpectedReturn]
						? unknown
						: {
								__error__: "Helper method return type does not match the implementation";
								expected: ExpectedReturn;
								received: ReceivedReturn;
							}
					: {
							__error__: "Helper method return type does not match the implementation";
							expected: ExpectedReturn;
							received: ReceivedReturn;
						}
				: {
						__error__: "Helper method parameters do not match the implementation";
						expected: ExpectedArgs;
						received: ReceivedArgs;
					}
			: {
					__error__: "Helper method parameters do not match the implementation";
					expected: ExpectedArgs;
					received: ReceivedArgs;
				}
		: {
				__error__: "Helper method is not callable";
				received: Received;
			}
	: {
			__error__: "Implementation is not callable";
			expected: Expected;
		};

/**
 * Computes the callable TypeScript function type for a {@link FunctionDef}.
 * @alpha
 */
export type FunctionFromDef<
	Def extends FunctionDef<readonly Arg[], TypeDef, TypeDef | undefined>,
> = Def extends FunctionDef<infer Args, infer Return, infer Rest>
	? (...args: [...ArgsTuple<Args>, ...RestTuple<Rest>]) => TypeFromTypeDef<Return>
	: never;

/**
 * Infers the callable type from a {@link FunctionDef}.
 * @alpha
 */
export type Infer<T> = T extends FunctionDef<infer Args, infer Return, infer Rest>
	? FunctionFromDef<FunctionDef<Args, Return, Rest>>
	: never;

/**
 * Helper to build a {@link FunctionDef} in a type-safe way.
 * @alpha
 */
export function buildFunc<
	const Return extends TypeDef,
	const Args extends readonly Arg[],
	const Rest extends TypeDef | undefined = undefined,
>(
	def: { description?: string; returns: Return; rest?: Rest },
	...args: [...Args]
): FunctionDef<Args, Return, Rest> {
	return {
		description: def.description,
		returns: def.returns,
		args,
		rest: def.rest,
	};
}

/**
 * Interface used by schema classes to expose helper methods to the agent.
 * @alpha
 */
export interface ExposedMethods {
	expose<
		S extends BindableSchema & Ctor & IExposedMethods,
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		const Args extends readonly Arg[],
		const Return extends TypeDef,
		const Rest extends TypeDef | undefined = undefined,
		Check extends FunctionMatchOrError<
			InstanceType<S>[K],
			FunctionFromDef<FunctionDef<Args, Return, Rest>>
		> = FunctionMatchOrError<
			InstanceType<S>[K],
			FunctionFromDef<FunctionDef<Args, Return, Rest>>
		>,
	>(schema: S, methodName: K, tfFunction: FunctionDef<Args, Return, Rest> & Check): void;

	/**
	 * Wrap a schema class in a {@link TypeDef} to reference it in helper signatures.
	 */
	instanceOf<T extends TreeNodeSchemaClass>(schema: T): TypeDef;
}

/**
 * Symbol that schema classes implement to expose helper methods.
 * @alpha
 */
export const exposeMethodsSymbol: unique symbol = Symbol("@fluidframework/tree-agent/run-tf");

/**
 * Contract schema classes can implement to publish helper methods.
 * @alpha
 */
export interface IExposedMethods {
	[exposeMethodsSymbol](methods: ExposedMethods): void;
}

class ExposedMethodsI implements ExposedMethods {
	private readonly methods: Record<string, FunctionWrapper> = {};
	private readonly referencedTypes = new Set<TreeNodeSchema>();

	public constructor(private readonly schemaClass: BindableSchema) {}

	public expose<
		S extends BindableSchema & Ctor & IExposedMethods,
		const K extends string & keyof MethodKeys<InstanceType<S>>,
		const Args extends readonly Arg[],
		const Return extends TypeDef,
		const Rest extends TypeDef | undefined = undefined,
	>(schema: S, methodName: K, tfFunction: FunctionDef<Args, Return, Rest>): void {
		if (schema !== this.schemaClass) {
			throw new Error('Must expose methods on the "this" object');
		}
		this.methods[methodName] = new FunctionWrapper(
			methodName,
			tfFunction.description,
			tfFunction.args,
			tfFunction.rest,
			tfFunction.returns,
		);
		collectFunctionReferences(tfFunction, this.referencedTypes);
	}

	public instanceOf<T extends TreeNodeSchemaClass>(schema: T): TypeDef {
		this.referencedTypes.add(schema as unknown as TreeNodeSchema);
		return instanceOf(schema);
	}

	public static getExposedMethods(schemaClass: BindableSchema): {
		methods: Record<string, FunctionWrapper>;
		referencedTypes: Set<TreeNodeSchema>;
	} {
		const exposedMethods = new ExposedMethodsI(schemaClass);
		const extractable = schemaClass as unknown as IExposedMethods;
		if (extractable[exposeMethodsSymbol] !== undefined) {
			extractable[exposeMethodsSymbol](exposedMethods);
		}
		return {
			methods: exposedMethods.methods,
			referencedTypes: exposedMethods.referencedTypes,
		};
	}
}

/**
 * Extract helper methods from a schema class (internal helper for prompt rendering).
 */
export function getExposedMethods(schemaClass: BindableSchema): {
	methods: Record<string, FunctionWrapper>;
	referencedTypes: Set<TreeNodeSchema>;
} {
	return ExposedMethodsI.getExposedMethods(schemaClass);
}

/**
 * Depth limiter used by {@link TypeFromTypeDef} to cap recursive expansion.
 * @alpha
 */
export type DecrementDepth<N extends number> = N extends 0
	? 0
	: N extends 1
		? 0
		: N extends 2
			? 1
			: N extends 3
				? 2
				: N extends 4
					? 3
					: N extends 5
						? 4
						: 5;

/**
 * Maps a {@link TypeDef} into its corresponding TypeScript type for compile-time checking.
 * Depth is limited to avoid infinite recursion when types are self-referential.
 * @alpha
 */
export type TypeFromTypeDef<T extends TypeDef, Depth extends number = 5> = Depth extends 0
	? unknown
	: T extends { kind: "primitive"; type: infer P }
		? P extends "string"
			? string
			: P extends "number"
				? number
				: P extends "boolean"
					? boolean
					: P extends "null"
						? // eslint-disable-next-line @rushstack/no-new-null
							null
						: P extends "undefined"
							? undefined
							: P extends "void"
								? void
								: any
		: T extends { kind: "array"; item: infer I extends TypeDef }
			? TypeFromTypeDef<I, DecrementDepth<Depth>>[]
			: T extends { kind: "object"; props: infer Props extends Record<string, TypeDef> }
				? { [K in keyof Props]: TypeFromTypeDef<Props[K], DecrementDepth<Depth>> }
				: T extends { kind: "promise"; inner: infer Inner extends TypeDef }
					? Promise<TypeFromTypeDef<Inner, DecrementDepth<Depth>>>
					: T extends { kind: "union"; types: infer Types extends TypeDef[] }
						? TypeFromTypeDef<Types[number], DecrementDepth<Depth>>
						: T extends { kind: "optional"; inner: infer OptionalInner extends TypeDef }
							? TypeFromTypeDef<OptionalInner, DecrementDepth<Depth>> | undefined
							: T extends {
										kind: "literal";
										value: infer Value extends string | number | boolean;
									}
								? Value
								: T extends {
											kind: "function";
											args: infer A extends TypeDef[];
											returns: infer R extends TypeDef;
										}
									? (
											...args: ArgsTupleFromDefs<A>
										) => TypeFromTypeDef<R, DecrementDepth<Depth>>
									: T extends { kind: "date" }
										? Date
										: T extends { kind: "lazy"; factory: () => infer U extends TypeDef }
											? TypeFromTypeDef<U, DecrementDepth<Depth>>
											: T extends {
														kind: "instanceof";
														schema: infer S extends TreeNodeSchemaClass;
													}
												? InstanceType<S>
												: unknown;

/**
 * Helper to turn an array of {@link TypeDef} entries into a tuple of concrete TS types.
 * @alpha
 */
export type ArgsTupleFromDefs<T extends readonly TypeDef[]> = T extends readonly [
	infer Single extends TypeDef,
]
	? [TypeFromTypeDef<Single>]
	: T extends readonly [infer Head extends TypeDef, ...infer Tail extends readonly TypeDef[]]
		? [TypeFromTypeDef<Head>, ...ArgsTupleFromDefs<Tail>]
		: [];

function collectFunctionReferences(
	func: FunctionDef<readonly Arg[], TypeDef, TypeDef | undefined>,
	referenced: Set<TreeNodeSchema>,
): void {
	const visited = new Set<TypeDef>();
	const visitedFactories = new Set<() => TypeDef>();
	for (const [, argType] of func.args) {
		collectTypeDefReferences(argType, referenced, visited, visitedFactories);
	}
	if (func.rest !== undefined) {
		collectTypeDefReferences(func.rest, referenced, visited, visitedFactories);
	}
	collectTypeDefReferences(func.returns, referenced, visited, visitedFactories);
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
