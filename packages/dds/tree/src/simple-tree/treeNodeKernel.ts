/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { fail } from "../util/index.js";
import { createEmitter, type Listenable, type Off } from "../events/index.js";
import type { TreeChangeEvents, TreeNode } from "./types.js";
import type {
	Anchor,
	AnchorNode,
	IForestSubscription,
	ITreeCursor,
	MapTree,
	UpPath,
} from "../core/index.js";
import {
	cursorForMapTreeNode,
	flexTreeSlot,
	isFreedSymbol,
	LazyEntity,
	TreeStatus,
	treeStatusFromAnchorCache,
} from "../feature-libraries/index.js";

// TODO: Make these into a class with a unified interface to reduce conditional branching when reading stuff
interface UnhydratedKernelState {
	mapTree: MapTree;
}

interface HydratedKernelState {
	forest: IForestSubscription;
	anchor: Anchor;
	anchorNode: AnchorNode;
	off: Off;
}

type KernelState = UnhydratedKernelState | HydratedKernelState;

function isHydrated(state: KernelState): state is HydratedKernelState {
	return (state as Partial<HydratedKernelState>).forest !== undefined;
}

/**
 * Contains state and an internal API for managing {@link TreeNode}s.
 * @remarks All {@link TreeNode}s have an associated kernel object.
 * The kernel has the same lifetime as the node and spans both its unhydrated and hydrated states.
 * When hydration occurs, the kernel is notified via the {@link TreeNodeKernel.hydrate | hydrate} method.
 */
export class TreeNodeKernel implements Listenable<TreeChangeEvents> {
	#state: KernelState;
	#events = createEmitter<TreeChangeEvents>();
	#cursor?: ITreeCursor;

	public constructor(node: TreeNode, mapTree: MapTree);
	public constructor(node: TreeNode, forest: IForestSubscription, path: UpPath);
	public constructor(
		public readonly node: TreeNode,
		forestOrMapTree: MapTree | IForestSubscription,
		path?: UpPath,
	) {
		this.#state =
			"type" in forestOrMapTree
				? { mapTree: forestOrMapTree }
				: this.createHydratedState(forestOrMapTree, path ?? fail("Expected path argument"));
	}

	public get cursor(): ITreeCursor {
		if (this.#cursor === undefined) {
			if (isHydrated(this.#state)) {
				const { forest, anchor } = this.#state;
				const cursor = forest.allocateCursor("Kernel");
				const anchorNode = forest.anchors.locate(anchor);
				assert(anchorNode !== undefined, "Invalid anchor node");
				forest.moveCursorToPath(anchorNode, cursor);
				this.#cursor = cursor;
			} else {
				this.#cursor = cursorForMapTreeNode(this.#state.mapTree);
			}
		}

		return this.#cursor;
	}

	public hydrate(forest: IForestSubscription, path: UpPath): void {
		this.#state = this.createHydratedState(forest, path);
	}

	private createHydratedState(forest: IForestSubscription, path: UpPath): HydratedKernelState {
		const anchor = forest.anchors.track(path);
		const anchorNode = forest.anchors.locate(anchor);
		assert(anchorNode !== undefined, "Node does not exist at hydration path");

		const offChildrenChanged = anchorNode.on("childrenChangedAfterBatch", () => {
			this.#events.emit("nodeChanged");
		});

		const offSubtreeChanged = anchorNode.on("subtreeChangedAfterBatch", () => {
			this.#events.emit("treeChanged");
		});

		const offAfterDestroy = anchorNode.on("afterDestroy", () => this.dispose());

		return {
			forest,
			anchor,
			anchorNode,
			off: () => {
				offChildrenChanged();
				offSubtreeChanged();
				offAfterDestroy();
				forest.anchors.forget(anchor);
			},
		};
	}

	public isHydrated(): boolean {
		return isHydrated(this.#state);
	}

	public getStatus(): TreeStatus {
		if (!isHydrated(this.#state)) {
			return TreeStatus.New;
		}

		// TODO: Replace this check with the proper check against the cursor state when the cursor becomes part of the kernel
		const flex = this.#state.anchorNode.slots.get(flexTreeSlot);
		if (flex !== undefined) {
			assert(flex instanceof LazyEntity, "Unexpected flex node implementation");
			if (flex[isFreedSymbol]()) {
				return TreeStatus.Deleted;
			}
		}

		return treeStatusFromAnchorCache(this.#state.anchorNode);
	}

	public on<K extends keyof TreeChangeEvents>(
		eventName: K,
		listener: TreeChangeEvents[K],
	): Off {
		return this.#events.on(eventName, listener);
	}

	public dispose(): void {
		if (isHydrated(this.#state)) {
			this.#state.off();
		}
		// TODO: go to the context and remove myself from withAnchors
	}
}
