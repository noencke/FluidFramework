/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { CheckoutFlexTreeView, Tree } from "../../shared-tree/index.js";
import { SchemaFactory, TreeConfiguration } from "../../simple-tree/index.js";
import { createTestUndoRedoStacks, getView } from "../utils.js";

const schema = new SchemaFactory("com.example");
class TestChild extends schema.object("TestChild", {}) {}
class TestObject extends schema.object("TestObject", {
	content: schema.number,
	child: schema.optional(TestChild),
}) {}

function createInitialTree(): TestObject {
	return new TestObject({ content: 42, child: new TestChild({}) });
}

describe("treeApi", () => {
	describe("runTransaction invoked via a tree view", () => {
		it("runs transactions", () => {
			const view = getView(new TreeConfiguration(TestObject, createInitialTree));
			Tree.runTransaction(view, (root) => {
				root.content = 43;
			});
			assert.equal(view.root.content, 43);
		});

		it("can be rolled back", () => {
			const view = getView(new TreeConfiguration(TestObject, createInitialTree));
			Tree.runTransaction(view, (root) => {
				root.content = 43;
				return "rollback";
			});
			assert.equal(view.root.content, 42);
		});

		it("rolls back transactions on error", () => {
			const view = getView(new TreeConfiguration(TestObject, createInitialTree));
			try {
				Tree.runTransaction(view, (root) => {
					root.content = 43;
					throw Error("Oh no");
				});
			} catch (e) {
				assert(e instanceof Error);
				assert.equal(e.message, "Oh no");
			}
			assert.equal(view.root.content, 42);
		});

		// TODO: Either enable when afterBatch is implemented, or delete if no longer relevant
		it.skip("emits change events", () => {
			const view = getView(new TreeConfiguration(TestObject, createInitialTree));
			let event = false;
			view.events.on("afterBatch", () => (event = true));
			view.root.content = 44;
			Tree.runTransaction(view, (root) => {
				root.content = 43;
			});
			assert.equal(event, true);
		});

		it.skip("emits change events on rollback", () => {
			const view = getView(new TreeConfiguration(TestObject, createInitialTree));
			let eventCount = 0;
			view.events.on("afterBatch", () => (eventCount += 1));
			Tree.runTransaction(view, (r) => {
				r.content = 43;
				return "rollback";
			});
			assert.equal(eventCount, 2);
		});

		it("undoes and redoes entire transaction", () => {
			const view = getView(new TreeConfiguration(TestObject, createInitialTree));
			const checkoutView = view.getViewOrError();
			assert(checkoutView instanceof CheckoutFlexTreeView);
			const { undoStack, redoStack } = createTestUndoRedoStacks(checkoutView.checkout.events);

			Tree.runTransaction(view, (root) => {
				root.content = 43;
				root.content = 44;
			});
			assert.equal(view.root.content, 44);
			assert.equal(undoStack.length, 1);
			undoStack[0].revert();
			assert.equal(view.root.content, 42);
			assert.equal(redoStack.length, 1);
			redoStack[0].revert();
			assert.equal(view.root.content, 44);
		});
		it("succeeds with a node existence precondition constraint that is not violated", () => {
			const view = getView(new TreeConfiguration(TestObject, createInitialTree));
			assert(view.root.child !== undefined);
			Tree.runTransaction(
				view,
				(root) => {
					root.content = 43;
				},
				[{ type: "exists", node: view.root.child }],
			);
			assert.equal(view.root.content, 43);
		});

		it("succeeds with a node existence precondition constraint that is violated after the transaction starts", () => {
			const view = getView(new TreeConfiguration(TestObject, createInitialTree));
			assert(view.root.child !== undefined);
			Tree.runTransaction(
				view,
				(root) => {
					view.root.child = undefined;
					root.content = 43;
				},
				[{ type: "exists", node: view.root.child }],
			);
			assert.equal(view.root.content, 43);
		});
	});

	describe("runTransaction invoked via a node", () => {
		it("runs transactions", () => {
			const { root } = getView(new TreeConfiguration(TestObject, createInitialTree));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
			});
			assert.equal(root.content, 43);
		});

		it("can be rolled back", () => {
			const { root } = getView(new TreeConfiguration(TestObject, createInitialTree));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
				return "rollback";
			});
			assert.equal(root.content, 42);
		});

		it("rolls back transactions on error", () => {
			const { root } = getView(new TreeConfiguration(TestObject, createInitialTree));
			try {
				Tree.runTransaction(root, (r) => {
					r.content = 43;
					throw Error("Oh no");
				});
			} catch (e) {
				assert(e instanceof Error);
				assert.equal(e.message, "Oh no");
			}
			assert.equal(root.content, 42);
		});

		it("emits change events", () => {
			const { root } = getView(new TreeConfiguration(TestObject, createInitialTree));
			let event = false;
			Tree.on(root, "afterChange", () => (event = true));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
			});
			assert.equal(event, true);
		});

		it("emits change events on rollback", () => {
			const { root } = getView(new TreeConfiguration(TestObject, createInitialTree));
			let eventCount = 0;
			Tree.on(root, "afterChange", () => (eventCount += 1));
			Tree.runTransaction(root, (r) => {
				r.content = 43;
				return "rollback";
			});
			assert.equal(eventCount, 2);
		});

		it("undoes and redoes entire transaction", () => {
			const view = getView(new TreeConfiguration(TestObject, createInitialTree));
			const checkoutView = view.getViewOrError();
			assert(checkoutView instanceof CheckoutFlexTreeView);
			const { undoStack, redoStack } = createTestUndoRedoStacks(checkoutView.checkout.events);

			Tree.runTransaction(view.root, (r) => {
				r.content = 43;
				r.content = 44;
			});
			assert.equal(view.root.content, 44);
			assert.equal(undoStack.length, 1);
			undoStack[0].revert();
			assert.equal(view.root.content, 42);
			assert.equal(redoStack.length, 1);
			redoStack[0].revert();
			assert.equal(view.root.content, 44);
		});

		// TODO: When SchematizingSimpleTreeView supports forking, add test coverage to ensure that transactions work properly on forks
	});
});
