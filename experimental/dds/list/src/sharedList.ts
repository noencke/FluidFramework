import { IChannelAttributes, IChannelStorageService, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ITelemetryContext, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";

export class SharedList extends SharedObject {
    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string
    ) {
        super(id, runtime, attributes, telemetryContextPrefix);
        throw new Error("Not implemented");
    }

    protected summarizeCore(serializer: IFluidSerializer, telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
        throw new Error("Method not implemented.");
    }

    protected async loadCore(services: IChannelStorageService): Promise<void> {
        throw new Error("Method not implemented.");
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        throw new Error("Method not implemented.");
    }

    protected onDisconnect() {
        throw new Error("Method not implemented.");
    }

    protected applyStashedOp(content: any): unknown {
        throw new Error("Method not implemented.");
    }
}
