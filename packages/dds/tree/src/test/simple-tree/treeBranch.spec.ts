/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { TreeStatus } from "../../feature-libraries/index.js";
import { TreeAlpha } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	treeNodeApi as Tree,
	TreeViewConfiguration,
	type TreeView,
	type TreeViewAlpha,
} from "../../simple-tree/index.js";
import type { requireAssignableTo } from "../../util/index.js";
import { getView } from "../utils.js";

describe("TreeBranch", () => {
	const schemaFactory = new SchemaFactory(undefined);
	class Array extends schemaFactory.array("array", schemaFactory.string) {}

	function init(content: string[]): TreeViewAlpha<typeof Array> {
		const view = getView(
			new TreeViewConfiguration({ schema: Array, enableSchemaValidation: true }),
		);
		view.initialize(content);
		return view;
	}

	it("Test that branching from a TreeView returns a typed view (as opposed to an untyped context)", () => {
		const view = init([]);
		const branch = view.fork();
		type _check = requireAssignableTo<typeof branch, typeof view>;
	});

	it("can downcast to a view", () => {
		const view = init(["a", "b", "c"]);
		const array = view.root;
		const context = TreeAlpha.branch(array);
		assert(context !== undefined);
		assert.equal(context.hasRootSchema(Array), true);
		assert.equal(context.hasRootSchema(schemaFactory.number), false);
		assert.deepEqual([...array], ["a", "b", "c"]);
	});

	describe("swap", () => {
		it("swaps the state of two views", () => {
			const view = init(["a", "b"]);
			const branch = view.fork();
			branch.root.removeAt(0);
			branch.root.insertAtEnd("c");
			assert.deepEqual([...view.root], ["a", "b"]);
			assert.deepEqual([...branch.root], ["b", "c"]);
			view.swap(branch);
			assert.deepEqual([...view.root], ["b", "c"]);
			assert.deepEqual([...branch.root], ["a", "b"]);
		});

		it("views are independent after swap", () => {
			const view = init(["a"]);
			const branch = view.fork();
			branch.root.insertAtEnd("b");
			view.swap(branch);
			// Edit view (now on branch's old branch)
			view.root.insertAtEnd("c");
			assert.deepEqual([...view.root], ["a", "b", "c"]);
			assert.deepEqual([...branch.root], ["a"]);
			// Edit branch (now on view's old branch)
			branch.root.insertAtEnd("d");
			assert.deepEqual([...view.root], ["a", "b", "c"]);
			assert.deepEqual([...branch.root], ["a", "d"]);
		});

		it("round-trip swap restores original state", () => {
			const view = init(["x"]);
			const branch = view.fork();
			branch.root.insertAtEnd("y");
			view.swap(branch);
			assert.deepEqual([...view.root], ["x", "y"]);
			assert.deepEqual([...branch.root], ["x"]);
			view.swap(branch);
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...branch.root], ["x", "y"]);
		});

		it("swap + edit + merge + swap back workflow", () => {
			const view = init(["x"]);
			const branch = view.fork();
			// Swap: view is now on the fork branch, branch is on "main"
			view.swap(branch);
			// Edit through view (which is on the fork branch)
			view.root.insertAtEnd("y");
			assert.deepEqual([...view.root], ["x", "y"]);
			// Merge the fork into "main": branch (on main) merges view (on fork)
			branch.merge(view, false);
			assert.deepEqual([...branch.root], ["x", "y"]);
			// Swap back: view is back on main
			view.swap(branch);
			assert.deepEqual([...view.root], ["x", "y"]);
		});

		it("fires afterBatch events on both views during swap", () => {
			const view = getView(
				new TreeViewConfiguration({ schema: Array, enableSchemaValidation: true }),
			);
			view.initialize(["a"]);
			const branch = view.fork();
			branch.root.removeAt(0);
			branch.root.insertAtStart("b");
			let viewAfterBatch = false;
			let branchAfterBatch = false;
			view.checkout.events.on("afterBatch", () => {
				viewAfterBatch = true;
			});
			branch.checkout.events.on("afterBatch", () => {
				branchAfterBatch = true;
			});
			view.swap(branch);
			assert.equal(viewAfterBatch, true);
			assert.equal(branchAfterBatch, true);
		});

		it("no-op when both views have the same state", () => {
			const view = init(["a"]);
			const branch = view.fork();
			// No edits on either side
			view.swap(branch);
			assert.deepEqual([...view.root], ["a"]);
			assert.deepEqual([...branch.root], ["a"]);
		});

		it("throws when view has a pending transaction", () => {
			const view = getView(
				new TreeViewConfiguration({ schema: Array, enableSchemaValidation: true }),
			);
			view.initialize(["a"]);
			const branch = view.fork();
			view.checkout.transaction.start();
			assert.throws(() => view.checkout.swapBranches(branch.checkout), /transaction/i);
			view.checkout.transaction.abort();
		});

		it("throws when other view has a pending transaction", () => {
			const view = getView(
				new TreeViewConfiguration({ schema: Array, enableSchemaValidation: true }),
			);
			view.initialize(["a"]);
			const branch = view.fork();
			branch.checkout.transaction.start();
			assert.throws(() => view.checkout.swapBranches(branch.checkout), /transaction/i);
			branch.checkout.transaction.abort();
		});

		it("can edit both views after swap", () => {
			const view = init(["a"]);
			const branch = view.fork();
			view.swap(branch);
			view.root.insertAtEnd("b");
			branch.root.insertAtEnd("c");
			assert.deepEqual([...view.root], ["a", "b"]);
			assert.deepEqual([...branch.root], ["a", "c"]);
		});

		it("can swap two forks (neither is main)", () => {
			const view = init(["a"]);
			const branch1 = view.fork();
			const branch2 = view.fork();
			branch1.root.insertAtEnd("b");
			branch2.root.insertAtEnd("c");
			branch1.swap(branch2);
			assert.deepEqual([...branch1.root], ["a", "c"]);
			assert.deepEqual([...branch2.root], ["a", "b"]);
		});

		it("handles diverged branches", () => {
			const view = init(["a"]);
			const branch = view.fork();
			view.root.insertAtEnd("b");
			branch.root.insertAtEnd("c");
			assert.deepEqual([...view.root], ["a", "b"]);
			assert.deepEqual([...branch.root], ["a", "c"]);
			view.swap(branch);
			assert.deepEqual([...view.root], ["a", "c"]);
			assert.deepEqual([...branch.root], ["a", "b"]);
		});

		describe("node references across swap", () => {
			class Item extends schemaFactory.object("item", { value: schemaFactory.string }) {}
			class ItemList extends schemaFactory.array("itemList", Item) {}

			function initItems(values: string[]): ReturnType<typeof getView<typeof ItemList>> {
				const view = getView(
					new TreeViewConfiguration({
						schema: ItemList,
						enableSchemaValidation: true,
					}),
				);
				view.initialize(values.map((v) => ({ value: v })));
				return view;
			}

			it("node becomes Removed when swapped to a branch where it doesn't exist", () => {
				const view = initItems(["a", "b", "c"]);
				const nodeB = view.root[1];
				assert.equal(nodeB.value, "b");
				assert.equal(Tree.status(nodeB), TreeStatus.InDocument);

				const branch = view.fork();
				branch.root.removeAt(1); // remove "b" from the branch

				view.swap(branch);
				assert.deepEqual(
					[...view.root].map((n) => n.value),
					["a", "c"],
				);
				assert.equal(Tree.status(nodeB), TreeStatus.Removed);
			});

			it("node reference is restored after swap back", () => {
				const view = initItems(["a", "b", "c"]);
				const nodeB = view.root[1];
				assert.equal(nodeB.value, "b");

				const branch = view.fork();
				branch.root.removeAt(1);

				// Swap to branch where nodeB doesn't exist
				view.swap(branch);
				assert.equal(Tree.status(nodeB), TreeStatus.Removed);

				// Swap back to original branch where nodeB exists
				view.swap(branch);
				assert.equal(Tree.status(nodeB), TreeStatus.InDocument);
				assert.equal(nodeB.value, "b");
				assert.deepEqual(
					[...view.root].map((n) => n.value),
					["a", "b", "c"],
				);
			});

			it("node reference is the same object after round-trip swap", () => {
				const view = initItems(["a", "b"]);
				const nodeA = view.root[0];
				const nodeB = view.root[1];

				const branch = view.fork();

				// Swap and swap back (no edits)
				view.swap(branch);
				view.swap(branch);

				// The same node references should still work
				assert.equal(nodeA.value, "a");
				assert.equal(nodeB.value, "b");
				assert.equal(Tree.status(nodeA), TreeStatus.InDocument);
				assert.equal(Tree.status(nodeB), TreeStatus.InDocument);
			});
		});
	});

	describe("branches", () => {
		function newBranch(view: TreeView<typeof Array>) {
			const context = TreeAlpha.branch(view.root);
			assert(context !== undefined);
			const branch = context.fork();
			assert(branch.hasRootSchema(Array));
			return branch;
		}

		it("can downcast to a view", () => {
			const view = init(["a", "b", "c"]);
			const branch = newBranch(view);
			assert(branch.hasRootSchema(Array));
			assert.deepEqual([...branch.root], ["a", "b", "c"]);
		});

		it("can be edited", () => {
			const view = init(["a", "b", "c"]);
			const branch = newBranch(view);
			branch.root.removeAt(0);
			branch.root.insertAtEnd("d");
			assert.deepEqual([...branch.root], ["b", "c", "d"]);
		});

		it("are isolated from their parent's changes", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			view.root.removeAt(0);
			view.root.insertAtStart("y");
			assert.deepEqual([...view.root], ["y"]);
			assert.deepEqual([...branch.root], ["x"]);
		});

		it("are isolated from their children's changes", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			branch.root.removeAt(0);
			branch.root.insertAtStart("y");
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...branch.root], ["y"]);
			const branchBranch = newBranch(branch);
			branchBranch.root.removeAt(0);
			branchBranch.root.insertAtStart("z");
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...branch.root], ["y"]);
			assert.deepEqual([...branchBranch.root], ["z"]);
		});

		it("can rebase a child over a parent", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			view.root.removeAt(0);
			view.root.insertAtStart("y");
			branch.rebaseOnto(view);
			assert.deepEqual([...view.root], ["y"]);
			assert.deepEqual([...branch.root], ["y"]);
		});

		it("can rebase a parent over a child", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			const branchBranch = newBranch(branch);
			branchBranch.root.removeAt(0);
			branchBranch.root.insertAtStart("y");
			branch.rebaseOnto(branchBranch);
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...branch.root], ["y"]);
			assert.deepEqual([...branchBranch.root], ["y"]);
			assert.throws(
				() => view.rebaseOnto(branch),
				validateAssertionError(/cannot be rebased onto another branch./),
			);
		});

		it("can merge a child into a parent", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			branch.root.removeAt(0);
			branch.root.insertAtStart("y");
			view.merge(branch, false);
			assert.deepEqual([...view.root], ["y"]);
			assert.deepEqual([...branch.root], ["y"]);
		});

		it("can merge a parent into a child", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			const branchBranch = newBranch(branch);
			branch.root.removeAt(0);
			branch.root.insertAtStart("y");
			branchBranch.merge(branch, false);
			assert.deepEqual([...view.root], ["x"]);
			assert.deepEqual([...branch.root], ["y"]);
			assert.deepEqual([...branchBranch.root], ["y"]);
			view.root.removeAt(0);
			view.root.insertAtStart("z");
			branch.merge(view); // No need to pass `false` here, because it's the main branch
			assert.deepEqual([...branch.root], ["z", "y"]);
		});

		it("can be manually disposed", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			branch.dispose();
			assert.throws(() => {
				branch.root.removeAt(0);
			}, /disposed/);
		});

		it("are properly disposed after merging", () => {
			const view = init(["x"]);
			const branch = newBranch(view);
			branch.merge(view, true); // Should not dispose, because it's the main branch
			branch.merge(view); // Should not dispose, because it's the main branch
			view.merge(branch, false); // Should not dispose, because we passed 'false'
			branch.root.removeAt(0);
			view.merge(branch); // Should dispose, because default is 'true'
			assert.throws(() => {
				branch.root.insertAtStart("y");
			}, /disposed/);
		});
	});
});
