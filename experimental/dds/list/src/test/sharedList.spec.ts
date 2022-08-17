/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TestListProvider } from "./utils";

describe("SharedList", () => {
    it("can be constructed", async () => {
        const provider = await TestListProvider.create(2);
        assert(provider.lists[0].isAttached());
        assert(provider.lists[1].isAttached());
    });
});
