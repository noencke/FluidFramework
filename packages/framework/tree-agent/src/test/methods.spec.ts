/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree/internal";

import {
	buildFunc,
	exposeMethodsSymbol,
	type ExposedMethods,
	type TypeFromTypeDef,
} from "../methodBinding.js";
import { tf } from "../renderTypeScript.js";

const sf = new SchemaFactory("test");

// Raise compile errors if the method signatures do not match the implementation.
{
	// @ts-expect-error: Class is unused at runtime
	class C extends sf.object("C", { a: sf.string }) {
		public method(_n: number): boolean {
			return false;
		}

		public static [exposeMethodsSymbol](methods: ExposedMethods): void {
			// @ts-expect-error: Method name is mispelled.
			methods.expose(C, "methodd", buildFunc({ returns: tf.boolean }, ["n", tf.number]));
			// @ts-expect-error: Method has incorrect parameter type.
			methods.expose(C, "method", buildFunc({ returns: tf.boolean }, ["n", tf.string]));
			// @ts-expect-error: Method has incorrect return type.
			methods.expose(C, "method", buildFunc({ returns: tf.number }, ["n", tf.number]));
		}
	}
}

// Positive coverage: deep-but-correct annotation with promise, arrays, and function args.
{
	// @ts-expect-error: Class is unused at runtime
	class WellTyped extends sf.object("WellTyped", { b: sf.number }) {
		private static readonly inputDef = tf.object({
			items: tf.array(tf.object({ name: tf.string, values: tf.array(tf.number) })),
			map: tf.function([tf.number], tf.promise(tf.string)),
		});

		private static readonly returnDef = tf.promise(
			tf.object({
				names: tf.array(tf.string),
				stats: tf.object({ count: tf.number, avg: tf.number }),
			}),
		);

		public transform: (
			input: TypeFromTypeDef<typeof WellTyped.inputDef>,
		) => TypeFromTypeDef<typeof WellTyped.returnDef> = async (_input) => {
			return { names: [], stats: { count: 0, avg: 0 } };
		};

		public static [exposeMethodsSymbol](methods: ExposedMethods): void {
			methods.expose(
				WellTyped,
				"transform",
				buildFunc(
					{ returns: WellTyped.returnDef },
					["input", WellTyped.inputDef],
				),
			);
		}
	}
}

// Additional compile-time coverage for complex signatures.
{
	// @ts-expect-error: Class is unused at runtime
	class Complex extends sf.object("Complex", { a: sf.string }) {
		public process = (
			payload: {
				id: string;
				metrics: { value: number; tags: string[] | undefined }[];
				callback: (value: number, info: { path: string[] }) => Promise<boolean>;
				mode: "fast" | "slow";
				optional: Date | undefined;
			},
			extra: (values: number[]) => number,
			...rest: string[]
		): Promise<{
			summary: { totals: number[]; created: Date }[];
			note: string | undefined;
		}> => {
			return Promise.resolve({ summary: [], note: undefined });
		};

		public static [exposeMethodsSymbol](methods: ExposedMethods): void {
			methods.expose(
				Complex,
				"process",
				// @ts-expect-error: Return payload is intentionally mis-annotated to ensure deep mismatch is detected.
				buildFunc(
					{
						returns: tf.promise(tf.number),
						rest: tf.string,
					},
					[
						"payload",
						tf.object({
							id: tf.string,
							metrics: tf.array(
								tf.object({ value: tf.number, tags: tf.optional(tf.array(tf.string)) }),
							),
							callback: tf.function(
								[tf.number, tf.object({ path: tf.array(tf.string) })],
								tf.promise(tf.boolean),
							),
							mode: tf.union(tf.literal("fast"), tf.literal("slow")),
							optional: tf.optional(tf.date),
						}),
					],
					["extra", tf.function([tf.array(tf.number)], tf.number)],
				),
			);
			methods.expose(
				Complex,
				"process",
				// @ts-expect-error: Nested payload metrics type is incorrect.
				buildFunc(
					{
						returns: tf.boolean,
						rest: tf.string,
					},
					[
						"payload",
						tf.object({
							id: tf.string,
							metrics: tf.array(tf.object({ value: tf.string })),
							callback: tf.function(
								[tf.number, tf.object({ path: tf.array(tf.string) })],
								tf.promise(tf.boolean),
							),
							mode: tf.union(tf.literal("fast"), tf.literal("slow")),
							optional: tf.optional(tf.date),
						}),
					],
					["extra", tf.function([tf.array(tf.number)], tf.number)],
				),
			);
			methods.expose(
				Complex,
				"process",
				// @ts-expect-error: Callback return type is missing Promise wrapping.
				buildFunc(
					{
						returns: tf.promise(
							tf.object({
								summary: tf.array(
									tf.object({ totals: tf.array(tf.number), created: tf.date }),
								),
								note: tf.optional(tf.string),
							}),
						),
						rest: tf.string,
					},
					[
						"payload",
						tf.object({
							id: tf.string,
							metrics: tf.array(
								tf.object({ value: tf.number, tags: tf.optional(tf.array(tf.string)) }),
							),
							callback: tf.function(
								[tf.number, tf.object({ path: tf.array(tf.string) })],
								tf.boolean,
							),
							mode: tf.union(tf.literal("fast"), tf.literal("slow")),
							optional: tf.optional(tf.date),
						}),
					],
					// Missing extra argument entirely.
				),
			);
			methods.expose(
				Complex,
				"process",
				// @ts-expect-error: Rest argument type is incorrect.
				buildFunc(
					{
						returns: tf.promise(
							tf.object({
								summary: tf.array(
									tf.object({ totals: tf.array(tf.number), created: tf.date }),
								),
								note: tf.optional(tf.string),
							}),
						),
						rest: tf.boolean,
					},
					[
						"payload",
						tf.object({
							id: tf.string,
							metrics: tf.array(
								tf.object({ value: tf.number, tags: tf.optional(tf.array(tf.string)) }),
							),
							callback: tf.function(
								[tf.number, tf.object({ path: tf.array(tf.string) })],
								tf.promise(tf.boolean),
							),
							mode: tf.union(tf.literal("fast"), tf.literal("slow")),
							optional: tf.optional(tf.date),
						}),
					],
					["extra", tf.function([tf.array(tf.number)], tf.number)],
				),
			);
			methods.expose(
				Complex,
				"process",
				// @ts-expect-error: Return payload structure is incorrect.
				buildFunc(
					{
						returns: tf.string,
						rest: tf.string,
					},
					[
						"payload",
						tf.object({
							id: tf.string,
							metrics: tf.array(
								tf.object({ value: tf.number, tags: tf.optional(tf.array(tf.string)) }),
							),
							callback: tf.function(
								[tf.number, tf.object({ path: tf.array(tf.string) })],
								tf.promise(tf.boolean),
							),
							mode: tf.union(tf.literal("fast"), tf.literal("slow")),
							optional: tf.optional(tf.date),
						}),
					],
					["extra", tf.function([tf.array(tf.number)], tf.number)],
				),
			);
		}
	}
}

// Recursive and functional return types remain checked deeply.
{
	// @ts-expect-error: Class is unused at runtime
	class Recursive extends sf.object("Recursive", { value: sf.number }) {
		public createTransformer = (node: {
			label: string;
			child: { label: string; child: { label: string } | undefined } | undefined;
		}): ((delta: number) => {
			label: string;
			child: { label: string; child: { label: string } | undefined } | undefined;
		}) => {
			return (delta) => ({
				label: `${node.label}${delta}`,
				child: node.child,
			});
		};

		public static [exposeMethodsSymbol](methods: ExposedMethods): void {
			methods.expose(
				Recursive,
				"createTransformer",
				// @ts-expect-error: Ensure deep recursive shape errors are surfaced when mis-annotated.
				buildFunc(
					{
						returns: tf.function(
							[tf.number],
							tf.object({
								label: tf.string,
								child: tf.optional(
									tf.object({
										label: tf.string,
										child: tf.optional(tf.object({ label: tf.string })),
									}),
								),
							}),
						),
					},
					[
						"node",
						tf.object({
							label: tf.string,
							child: tf.optional(
								tf.object({
									label: tf.string,
									child: tf.optional(tf.object({ label: tf.string })),
								}),
							),
						}),
					],
				),
			);
			methods.expose(
				Recursive,
				"createTransformer",
				// @ts-expect-error: Function return type omits nested optional shape.
				buildFunc({ returns: tf.function([tf.number], tf.object({ label: tf.string })) }, [
					"node",
					tf.object({
						label: tf.string,
						child: tf.optional(
							tf.object({
								label: tf.string,
								child: tf.optional(tf.object({ label: tf.string })),
							}),
						),
					}),
				]),
			);
			methods.expose(
				Recursive,
				"createTransformer",
				// @ts-expect-error: Parameter structure does not match nested optional child.
				buildFunc(
					{
						returns: tf.function(
							[tf.number],
							tf.object({
								label: tf.string,
								child: tf.optional(
									tf.object({
										label: tf.string,
										child: tf.optional(tf.object({ label: tf.string })),
									}),
								),
							}),
						),
					},
					["node", tf.object({ label: tf.string, child: tf.object({ label: tf.string }) })],
				),
			);
		}
	}
}
