/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UpPath } from "../../core";
import { ISubscribable } from "../../events";

interface VisitorEvents {
	/** The node at the given path is about to be deleted */
	deleting(path: UpPath): void;
	/** The node at the given path is about to be moved */
	moving(path: UpPath): void;
	/** A node was moved to the given path */
	moved(path: UpPath): void;
	/** A node was inserted at the given path */
	inserted(path: UpPath): void;
	/** The value of the node at the given path changed */
	valueChanged(path: UpPath, value: unknown, previousValue: unknown): void;
}

/**
 * Events emitted by an EditableTree.
 */
interface EditableTreeEvents {
	/**
	 * When part of the tree changes, the root of the tree will emit a `changing` event,
	 * followed by a `changing` event for each of the nodes in the subtree that are changing in depth-first pre-order.
	 * @param path - the path of the tree that is changing
	 * @param stopPropagation - a function that can be called to stop the event from propagating further.
	 * This prevents further calls to `changing` in the subtree, but does not prevent events in `subtree`.
	 * @param subtree - a subscribable that will emit detailed events depending on the type of change(s) that occurred.
	 * When multiple nodes in the subtree change at once, the events are emitted in depth-first pre-order.
	 * All subtree events for this tree are emitted before any subsequent `changing` events and their associated subtree events.
	 */
	changing(
		path: UpPath,
		stopPropagation: () => void,
		subtree: ISubscribable<VisitorEvents>,
	): void;

	/**
	 * After a node in the tree has changed, the node will emit a `changed` event,
	 * followed by a `changed` event for each of the nodes in its ancestry ending at the root of the tree.
	 * @param path - the path of the tree that changed
	 * @param stopPropagation - a function that can be called to stop the event from propagating further
	 */
	changed(path: UpPath, stopPropagation: () => void): void;
}

// #region Examples

//   a
//  / \
// b   c

const a = undefined as unknown as ISubscribable<EditableTreeEvents> & { b: number; c: number };
a.b = 0;
a.c = 0;

// ---- The capturing (i.e. tunneling) events are called from top to bottom

a.on("changing", (path) => {
	console.log("changing", path);
});
a.b = 42;

// "changing" a
// "changing" a/b

// ---- The bubbling events are called from bottom to top

a.on("changed", (path) => {
	console.log("changed", path);
});
a.b = 42;

// "changed" a/b
// "changed" a

// ---- The capturing events can be stopped from propagating further

a.on("changing", (path, stopPropagation) => {
	stopPropagation();
	console.log("changing", path);
});
a.b = 42;

// "changing" a

// ---- The bubbling events can be stopped from propagating further

a.on("changed", (path, stopPropagation) => {
	stopPropagation();
	console.log("changed", path);
});
a.b = 42;

// "changed" a/b

// ---- The capturing events can register additional fine grained events

a.on("changing", (_, stopPropagation, subtree) => {
	stopPropagation();
	subtree.on("moving", (path) => {
		console.log("moving", path);
	});
	subtree.on("moved", (path) => {
		console.log("moved", path);
	});
});
// Swap a and b

// "moving" a
// "moved" b
// "moving" b
// "moved" a

// ---- SetValue

a.on("changing", (_, stopPropagation, subtree) => {
	stopPropagation();
	subtree.on("valueChanged", (path, value: number, previousValue: number) => {
		console.log("valueChanged", path, value, previousValue);
	});
});

// "valueChanged" a/b 42 0

// #endregion Examples
