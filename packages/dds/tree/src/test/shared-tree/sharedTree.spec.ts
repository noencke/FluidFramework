/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    ChannelFactoryRegistry,
    ITestFluidObject,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    TestObjectProvider } from "@fluidframework/test-utils";
import {
    IContainer,
} from "@fluidframework/container-definitions";
import {
    Container,
    Loader,
} from "@fluidframework/container-loader";
import {
    IChannelAttributes,
    IChannelFactory,
    IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import { ISummaryTree, SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
    ITelemetryContext,
    ISummaryTreeWithStats,
    IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { mergeStats, requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalServerTestDriver } from "@fluidframework/test-drivers";
import { MockFluidDataStoreRuntime, MockSharedObjectServices } from "@fluidframework/test-runtime-utils";
import {
    Index,
    SharedTreeCore,
    SummaryElement,
    SummaryElementParser,
    SummaryElementStringifier,
} from "../../shared-tree-core";
import { AnchorSet } from "../../tree";
import { SharedTreeFactory, SharedTree } from "../../shared-tree";

describe("SharedTree", () => {
    it("can be connected to another tree", async () => {
        const { tree: tree1, testObjectProvider } = await createConnectedTree();
        // const { tree: tree2 } = await createConnectedTree(testObjectProvider);
    });

    async function createConnectedTree(testObjectProvider?: TestObjectProvider): Promise<{
        tree: SharedTree;
        testObjectProvider: TestObjectProvider;
        container: IContainer;
    }> {
        const factory = new SharedTreeFactory();
        const treeId = "TestSharedTree";
        const registry = [[treeId, factory]] as ChannelFactoryRegistry;
        const driver = new LocalServerTestDriver();
        const provider = testObjectProvider ?? new TestObjectProvider(
            Loader,
            driver,
            () => new TestContainerRuntimeFactory(
                "@fluid-example/test-dataStore",
                new TestFluidObjectFactory(registry),
            ),
        );
        const container = testObjectProvider !== undefined
            ? await provider.loadTestContainer()
            : await provider.makeTestContainer();

        const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
        const tree = await dataObject.getSharedObject<SharedTree>(treeId);
        return { tree, testObjectProvider: provider, container };
    }
});
