/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
import { singleTextCursor } from "../../feature-libraries";

import { brand } from "../../util";
import { TestTreeProvider } from "../utils";
import { TransactionResult, TreeNavigationResult } from "../..";
import { rootFieldKeySymbol } from "../../tree";
import { identifierFieldKey } from "../../shared-tree";

describe("IdentifierIndex", () => {
    it("can find a node", async () => {
        const identifier = 42;
        const testValue = "test";
        const tree = (await TestTreeProvider.create(1)).trees[0];
        tree.runTransaction((f, editor) => {
            const writeCursor = singleTextCursor({
                type: brand("Node"),
                value: testValue,
                globalFields: {
                    [identifierFieldKey]: [{ type: brand("IdentifierNode"), value: identifier }],
                },
            });
            const field = editor.sequenceField(undefined, rootFieldKeySymbol);
            field.insert(0, writeCursor);
            return TransactionResult.Apply;
        });

        const anchor = tree.findNode(identifier) ?? fail("Failed to find node with identifier");
        const cursor = tree.forest.allocateCursor();
        assert.equal(tree.forest.tryMoveCursorToNode(anchor, cursor), TreeNavigationResult.Ok);
        assert.equal(cursor.value, testValue); // Ensure the correct node was retrieved
        tree.forest.forgetAnchor(anchor);
        cursor.free();
    });
});
