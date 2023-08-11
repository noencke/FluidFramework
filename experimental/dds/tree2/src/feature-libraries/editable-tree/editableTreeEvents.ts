/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UpPath } from "../../core";
import { ISubscribable } from "../../events";

interface EditableTreeChange {
	/**
	 * A function that can be called to stop the event from propagating further.
	 */
	stopPropagation: () => void;
}

/**
 * Events emitted by an EditableTree.
 */
interface EditableTreeChangeEvents {
	/**
	 * When part of the tree changes, the root of the tree will emit a `changing` event,
	 * followed by a `changing` event for each of the nodes in the subtree that are changing in depth-first pre-order.
	 * @param ev - the event arguments
	 */
	beforeChange(ev: EditableTreeChange): void;

	/**
	 * After a node in the tree has changed, the node will emit a `changed` event,
	 * followed by a `changed` event for each of the nodes in its ancestry ending at the root of the tree.
	 * @param ev - the event arguments
	 */
	afterChange(ev: EditableTreeChange): void;
}

interface EditableTreeFineGrainedEvents {
	/**
	 * @param visitor - a subscribable that will emit detailed events for the entire subtree depending on the type of change(s) that occurred.
	 * When multiple nodes in the subtree change at once, the events are emitted in depth-first pre-order.
	 * All subtree events for this tree are emitted before any subsequent `changing` events and their associated subtree events.
	 */
	visitChanging(visitor: ISubscribable<VisitorEvents>): void;
}

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

class TreeNode
	implements
		ISubscribable<EditableTreeChangeEvents>,
		ISubscribable<EditableTreeFineGrainedEvents>
{
	/**
	 * Register an event that listens to changes in the tree.
	 * @param eventName - the name of the event
	 * @param listener - the handler to run when the event is fired
	 * @param capture - if true, the listener will fire during the event capture phase, otherwise it will fire during the event bubble phase
	 * @returns a function which will deregister the listener when run.
	 * This function will error if called more than once.
	 */
	public on<K extends keyof EditableTreeChangeEvents>(
		eventName: K,
		listener: EditableTreeChangeEvents[K],
		capture?: boolean,
	): () => void;
	/**
	 * Register an event that listens to fine-grained changes in the tree.
	 * @param eventName - the name of the event
	 * @param listener - the handler to run when the event is fired
	 * @returns a function which will deregister the listener when run.
	 * This function will error if called more than once.
	 */
	public on<K extends keyof EditableTreeFineGrainedEvents>(
		eventName: K,
		listener: EditableTreeFineGrainedEvents[K],
	): () => void;
	public on<K extends keyof (EditableTreeChangeEvents | EditableTreeFineGrainedEvents)>(
		eventName: K,
		listener: K extends keyof EditableTreeChangeEvents
			? EditableTreeChangeEvents[K]
			: EditableTreeFineGrainedEvents[K],
		capture = false,
	): () => void {
		return () => {};
	}
}

// #region Examples

const node = undefined as unknown as TreeNode;

// Common use case
node.on("afterChange", () => {
	// invalidate/dirty my UI at `node`
});

// Stop propagation during capture/tunnel/trickle phase (stretch goal for MVP)
node.on(
	"afterChange",
	({ stopPropagation }) => {
		stopPropagation();
	},
	true,
);

// Fine-grained (not included in MVP)
node.on("visitChanging", (visitor) => {
	visitor.on("inserted", () => {});
	visitor.on("deleting", () => {});
});

// #endregion Examples
