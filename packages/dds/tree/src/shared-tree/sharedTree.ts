/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { DefaultChangeFamily, DefaultChangeSet, ForestIndex, ObjectForest, SchemaIndex } from "../feature-libraries";
import { Index, SharedTreeCore } from "../shared-tree-core";
import { AnchorSet } from "../tree";

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 * TODO: node identifier index.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree extends SharedTreeCore<DefaultChangeSet, DefaultChangeFamily> {
    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string) {
            const anchors = new AnchorSet();
            const forest = new ObjectForest(anchors);
            const indexes: Index<DefaultChangeSet>[] = [
                new SchemaIndex(runtime, forest.schema),
                new ForestIndex(runtime, forest),
            ];
            super(
                indexes,
                new DefaultChangeFamily(), anchors, id, runtime, attributes, telemetryContextPrefix,
                );

            // Could save a reference to this to allow use as part of a default checkout.
            // this.forest = forest;
    }
}

/**
 * A channel factory that creates {@link SharedTree}s.
 */
export class SharedTreeFactory implements IChannelFactory {
    public type: string = "SharedTree";

    public attributes: IChannelAttributes = {
		type: this.type,
		snapshotFormatVersion: "0.0.0",
		packageVersion: "0.0.0",
	};

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        channelAttributes: Readonly<IChannelAttributes>,
    ): Promise<IChannel> {
        const tree = new SharedTree(id, runtime, channelAttributes, "TODO");
        await tree.load(services);
        return tree;
    }

    public create(runtime: IFluidDataStoreRuntime, id: string): IChannel {
        const tree = new SharedTree(id, runtime, this.attributes, "TODO");
        tree.initializeLocal();
        return tree;
    }
}
