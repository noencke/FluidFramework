/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { rootFieldKey } from "../../../core";
import { ProxyRoot, SharedTreeNode, Tree, TreeStatus, Any } from "../../../feature-libraries";
import { SchemaBuilder } from "../../../domains";
import { itWithRoot } from "./utils";

describe("Tree API", () => {
	const sb = new SchemaBuilder({ scope: "object" });
	const object = sb.object("child", {
		content: sb.number,
	});
	const list = sb.list(object);
	const map = sb.map(object);
	const parent = sb.object("parent", { object, list, map });
	const treeSchema = sb.intoSchema(parent);
	const initialTree: ProxyRoot<typeof treeSchema, "javaScript"> = {
		object: { content: 42 },
		list: [{ content: 42 }, { content: 42 }, { content: 42 }],
		map: new Map([
			["a", { content: 42 }],
			["b", { content: 42 }],
		]),
	};

	describe("schema", () => {
		itWithRoot("object", treeSchema, initialTree, (root) => {
			assert.equal(Tree.schema(root.object), object);
		});
		itWithRoot("list", treeSchema, initialTree, (root) => {
			assert.equal(Tree.schema(root.list), list);
		});
	});

	describe("is", () => {
		itWithRoot("object", treeSchema, initialTree, (root) => {
			assert.equal(Tree.is(root.object, object), true);
			assert.equal(Tree.is(root.object, list), false);
			assert.throws(() =>
				Tree.is(root.object, new SchemaBuilder({ scope: "never" }).list(Any)),
			);
		});
		itWithRoot("list", treeSchema, initialTree, (root) => {
			assert.equal(Tree.is(root.list, list), true);
			assert.equal(Tree.is(root.list, object), false);
			assert.throws(() =>
				Tree.is(root.object, new SchemaBuilder({ scope: "never" }).list(Any)),
			);
		});
	});

	describe("parent", () => {
		itWithRoot("object", treeSchema, initialTree, (root) => {
			assert.equal(Tree.parent(root.object), root);
		});

		itWithRoot("list", treeSchema, initialTree, (root) => {
			assert.equal(Tree.parent(root.list), root);
		});

		itWithRoot("root", treeSchema, initialTree, (root) => {
			assert.equal(Tree.parent(root), undefined);
		});
	});

	describe("key", () => {
		itWithRoot("object", treeSchema, initialTree, (root) => {
			for (const [key, child] of Object.entries(root)) {
				const key1 = Tree.key(child);
				assert.equal(key1, key);
				const key2 = Tree.key(root, child);
				assert.equal(key2, key);
			}
		});

		itWithRoot("list", treeSchema, initialTree, (root) => {
			for (let key = 0; key < root.list.length; key += 1) {
				const child = root.list[key];
				const key1 = Tree.key(child);
				assert.equal(key1, key);
				const key2 = Tree.key(root.list, child);
				assert.equal(key2, key);
			}
		});

		itWithRoot("map", treeSchema, initialTree, (root) => {
			for (const [key, child] of root.list.entries()) {
				const key1 = Tree.key(child);
				assert.equal(key1, key);
				const key2 = Tree.key(root.list, child);
				assert.equal(key2, key);
			}
		});

		itWithRoot("root", treeSchema, initialTree, (root) => {
			assert.equal(Tree.key(root), rootFieldKey);
		});
	});

	describe("treeStatus", () => {
		itWithRoot("object", treeSchema, initialTree, (root) => {
			const o = root.object;
			assert(o !== undefined);
			assert.equal(Tree.status(o), TreeStatus.InDocument);
			root.object = object.create({ content: 43 });
			assert.equal(Tree.status(o), TreeStatus.Removed);
		});

		// TODO: Enable a test like this when lists are directly settable
		// itWithRoot("list", treeSchema, initialTree, (root) => {
		// 	const l = root.list;
		// 	assert(l !== undefined);
		// 	assert.equal(Tree.status(l), TreeStatus.InDocument);
		// 	root.list = [];
		// 	assert.equal(Tree.status(l), TreeStatus.Removed);
		// });
	});

	describe("events", () => {
		function check(mutate: (root: ProxyRoot<typeof treeSchema>) => void) {
			itWithRoot(
				".on(..) must subscribe to change event",
				treeSchema,
				initialTree,
				(root) => {
					const log: any[][] = [];

					Tree.on(root as SharedTreeNode, "afterChange", (...args: any[]) => {
						log.push(args);
					});

					mutate(root);

					const numChanges = log.length;
					assert(
						numChanges > 0,
						"Must receive change notifications after subscribing to event.",
					);
				},
			);

			itWithRoot(
				".on(..) must return unsubscribe function",
				treeSchema,
				initialTree,
				(root) => {
					const log: any[][] = [];

					const unsubscribe = Tree.on(
						root as SharedTreeNode,
						"afterChange",
						(...args: any[]) => {
							log.push(args);
						},
					);

					mutate(root);

					const numChanges = log.length;
					assert(
						numChanges > 0,
						"Must receive change notifications after subscribing to event.",
					);

					unsubscribe();

					mutate(root);

					assert.equal(
						log.length,
						numChanges,
						"Mutation after unsubscribe must not emit change events.",
					);
				},
			);
		}

		describe("object", () => {
			check((root) => root.object.content++);
		});

		describe("list", () => {
			check((root) => root.list.insertAtEnd([{ content: root.list.length }]));
		});

		// TODO: map
	});
});
