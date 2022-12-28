/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import BTree from "sorted-btree";
import {
    Anchor,
    CursorLocationType,
    GlobalFieldKey,
    GlobalFieldKeySymbol,
    IForestSubscription,
    Index,
    IndexEvents,
    ITreeSubscriptionCursor,
    moveToDetachedField,
    SummaryElement,
    symbolFromKey,
    TreeNavigationResult,
    UpPath,
} from "../core";
import { IEventEmitter } from "../events";
import { fail } from "../util";

export type Identifier = number;

export class IdentifierIndex<TFieldKey extends GlobalFieldKey> implements Index {
    private readonly fieldKeySymbol: GlobalFieldKeySymbol;
    private readonly identifiers = new BTree<Identifier, UpPath>();

    readonly summaryElement?: SummaryElement;

    public constructor(
        events: IEventEmitter<IndexEvents<unknown>>,
        private readonly forest: IForestSubscription,
        identifierFieldKey: TFieldKey,
    ) {
        // TODO: seems like it would be more ideal for IdentifierIndex to depend on a ForestIndex rather than a Forest directly.
        // ForestIndex would need to expose Forest
        this.fieldKeySymbol = symbolFromKey(identifierFieldKey);
        events.on("newLocalState", (_delta) => {
            this.identifiers.clear();
            for (const [identifier, path] of this.findIdentifiersInForest(this.forest)) {
                this.identifiers.set(identifier, path);
            }
        });
    }

    public getPath(id: Identifier): UpPath | undefined {
        return this.identifiers.get(id);
    }

    public getNode(id: Identifier): Anchor | undefined {
        const path = this.getPath(id);
        if (path !== undefined) {
            const cursor = this.forest.allocateCursor();
            if (this.forest.tryMoveCursorToPath(path, cursor) === TreeNavigationResult.Ok) {
                return cursor.buildAnchor();
            }
        }

        return undefined;
    }

    private *findIdentifiersInForest(
        forest: IForestSubscription,
    ): IterableIterator<[identifier: Identifier, path: UpPath]> {
        const cursor = forest.allocateCursor();
        moveToDetachedField(forest, cursor);
        for (const id of this.findIdentifiersInCurrentField(cursor)) {
            yield id;
        }
        cursor.exitField();
        cursor.clear();
    }

    private *findIdentifiersInCurrentField(
        cursor: ITreeSubscriptionCursor,
    ): IterableIterator<[identifier: Identifier, path: UpPath]> {
        assert(cursor.mode === CursorLocationType.Fields, "Cursor must be in Nodes mode");
        if (cursor.getFieldKey() === this.fieldKeySymbol) {
            if (cursor.getFieldLength() > 0) {
                cursor.enterNode(0);
                const { value } = cursor;
                if (typeof value === "number") {
                    // Get the path of the identifier node's parent, not the path to the identifier node itself
                    const path = cursor.getPath()?.parent ?? fail("Invalid path during identifier scan");
                    yield [value, path];
                }
                cursor.exitNode();
            }
        } else {
            if (cursor.firstNode()) {
                do {
                    if (cursor.firstField()) {
                        do {
                            yield* this.findIdentifiersInCurrentField(cursor);
                        } while (cursor.nextField());
                    }
                } while (cursor.nextNode());
            }
        }
    }
}
