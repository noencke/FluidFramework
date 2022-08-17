/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannel, IChannelAttributes, IChannelFactory, IChannelServices, IChannelStorageService, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ITelemetryContext, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";

export class SharedList extends SharedObject {
    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string
    ) {
        super(id, runtime, attributes, telemetryContextPrefix);
    }

    protected summarizeCore(serializer: IFluidSerializer, telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();
        return builder.getSummaryTree();
    }

    protected async loadCore(services: IChannelStorageService): Promise<void> {
        // TODO
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        // TODO
    }

    protected onDisconnect() {}

    protected applyStashedOp(content: any): unknown {
        return;
    }
}

/**
 * A channel factory that creates {@link SharedTree}s.
 */
 export class SharedListFactory implements IChannelFactory {
    public type: string = "SharedList";

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
        // TODO: What should the telemetry context be here?
        const tree = new SharedList(id, runtime, channelAttributes, "SharedList");
        await tree.load(services);
        return tree;
    }

    public create(runtime: IFluidDataStoreRuntime, id: string): IChannel {
        // TODO: What should the telemetry context be here?
        const tree = new SharedList(id, runtime, this.attributes, "SharedList");
        tree.initializeLocal();
        return tree;
    }
}
