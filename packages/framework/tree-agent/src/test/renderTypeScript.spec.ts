/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { ObjectNodeSchema } from "@fluidframework/tree/alpha";
import { SchemaFactory } from "@fluidframework/tree/internal";

import {
	renderTypeDefTypeScript,
	instanceOfs,
	type TypeDef,
	tf,
	instanceOf,
} from "../renderTypeScript.js";

function render(
	type: TypeDef,
	lookup: WeakMap<TypeDef, ObjectNodeSchema> = new WeakMap<TypeDef, ObjectNodeSchema>(),
): string {
	return renderTypeDefTypeScript(type, (schema) => schema.identifier, lookup);
}

describe("renderTypeDefTypeScript", () => {
	it("renders primitive types", () => {
		const cases: [TypeDef, string][] = [
			[tf.string, "string"],
			[tf.number, "number"],
			[tf.boolean, "boolean"],
			[tf.null, "null"],
			[tf.undefined, "undefined"],
			[tf.void, "void"],
			[tf.any, "any"],
		];

		for (const [typeDef, expected] of cases) {
			assert.strictEqual(render(typeDef), expected);
		}
	});

	it("renders literal values", () => {
		const cases: [TypeDef, string][] = [
			[tf.literal("done"), '"done"'],
			[tf.literal(42), "42"],
			[tf.literal(true), "true"],
		];

		for (const [typeDef, expected] of cases) {
			assert.strictEqual(render(typeDef), expected);
		}
	});

	it("renders arrays and parenthesizes unions", () => {
		const unionArray = tf.array(tf.union(tf.string, tf.number));
		assert.strictEqual(render(unionArray), "(string | number)[]");

		const nestedArray = tf.array(tf.array(tf.boolean));
		assert.strictEqual(render(nestedArray), "boolean[][]");
	});

	it("renders object types with optional properties", () => {
		const objectType = tf.object({
			requiredProp: tf.boolean,
			optionalProp: tf.optional(tf.number),
		});

		const expected = `{
    requiredProp: boolean;
    optionalProp?: number;
}`;
		assert.strictEqual(render(objectType), expected);
	});

	it("renders unions and optional types", () => {
		const unionType = tf.union(tf.string, tf.literal("done"), tf.number);
		assert.strictEqual(render(unionType), '(string | "done" | number)');

		const optionalType = tf.optional(tf.boolean);
		assert.strictEqual(render(optionalType), "boolean | undefined");
	});

	it("renders promise and date types", () => {
		const promiseType = tf.promise(tf.date);
		assert.strictEqual(render(promiseType), "Promise<Date>");
	});

	it("renders function types", () => {
		const funcType = tf.function([tf.string, tf.number], tf.boolean);
		assert.strictEqual(render(funcType), "(arg0: string, arg1: number) => boolean");

		const noArgFuncType = tf.function([], tf.void);
		assert.strictEqual(render(noArgFuncType), "() => void");
	});

	it("renders nested structures", () => {
		const nestedType = tf.object({
			list: tf.array(
				tf.object({
					name: tf.string,
					tags: tf.optional(tf.array(tf.string)),
				}),
			),
			meta: tf.promise(
				tf.object({
					createdAt: tf.date,
				}),
			),
		});

		const expected = `{
    list: {
        name: string;
        tags?: string[];
    }[];
    meta: Promise<{
        createdAt: Date;
    }>;
}`;
		assert.strictEqual(render(nestedType), expected);
	});

	it("renders lazy types", () => {
		const lazyType = tf.lazy(() => tf.object({ value: tf.string }));

		const expected = `{
    value: string;
}`;
		assert.strictEqual(render(lazyType), expected);
	});

	it("renders recursive lazy types", () => {
		// eslint-disable-next-line prefer-const
		let recursiveLazy: TypeDef;
		const factory = (): TypeDef => recursiveLazy;
		recursiveLazy = { kind: "lazy", factory };
		assert.strictEqual(render(recursiveLazy), "(recursive)");
	});

	it("renders recursive structures with lazy references", () => {
		let recursiveLazy: TypeDef;
		// eslint-disable-next-line prefer-const
		recursiveLazy = tf.lazy(() =>
			tf.object({
				value: recursiveLazy,
			}),
		);

		const expected = `{
    value: (recursive);
}`;
		assert.strictEqual(render(recursiveLazy), expected);
	});

	it("renders instanceOf types", () => {
		const sf = new SchemaFactory("render-tests");
		class Todo extends sf.object("Todo", { title: sf.string }) {}

		const typeDef = instanceOf(Todo);
		const schema = instanceOfs.get(typeDef);
		assert.notStrictEqual(schema, undefined);

		const lookup = new WeakMap<TypeDef, ObjectNodeSchema>();
		lookup.set(typeDef, schema as ObjectNodeSchema);
		instanceOfs.delete(typeDef);

		assert.strictEqual(render(typeDef, lookup), "render-tests.Todo");
	});

	it("throws when instanceOf lookup is missing", () => {
		const sf = new SchemaFactory("render-tests-missing");
		class MissingTodo extends sf.object("MissingTodo", { title: sf.string }) {}

		const typeDef = instanceOf(MissingTodo);
		instanceOfs.delete(typeDef);

		assert.throws(
			() => render(typeDef),
			(error: unknown) =>
				error instanceof UsageError &&
				error.message ===
					"Unsupported instanceof type when formatting helper types: no schema found",
		);
	});

	it("throws for unsupported type kind", () => {
		const invalidType = { kind: "unknown" } as unknown as TypeDef;
		assert.throws(
			() => render(invalidType),
			(error: unknown) =>
				error instanceof UsageError &&
				error.message.includes("Unsupported type when formatting helper types"),
		);
	});

	it("throws for unsupported primitive type", () => {
		const invalidPrimitive = { kind: "primitive", type: "bigint" } as unknown as TypeDef;
		assert.throws(
			() => render(invalidPrimitive),
			(error: unknown) =>
				error instanceof UsageError && error.message === "Unsupported primitive type: bigint",
		);
	});
});
