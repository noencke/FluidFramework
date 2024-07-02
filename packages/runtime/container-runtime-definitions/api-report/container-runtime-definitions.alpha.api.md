## Alpha API Report File for "@fluidframework/container-runtime-definitions"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import type { AttachState } from '@fluidframework/container-definitions';
import type { FluidObject } from '@fluidframework/core-interfaces';
import type { FlushMode } from '@fluidframework/runtime-definitions/internal';
import type { IClientDetails } from '@fluidframework/driver-definitions';
import type { IContainerRuntimeBase } from '@fluidframework/runtime-definitions/internal';
import type { IContainerRuntimeBaseEvents } from '@fluidframework/runtime-definitions/internal';
import type { IDeltaManager } from '@fluidframework/container-definitions/internal';
import type { IDocumentMessage } from '@fluidframework/driver-definitions/internal';
import type { IDocumentStorageService } from '@fluidframework/driver-definitions/internal';
import type { IEventProvider } from '@fluidframework/core-interfaces';
import type { IFluidHandle } from '@fluidframework/core-interfaces';
import type { IFluidHandleContext } from '@fluidframework/core-interfaces/internal';
import type { IProvideFluidDataStoreRegistry } from '@fluidframework/runtime-definitions/internal';
import type { IRequest } from '@fluidframework/core-interfaces';
import type { IResponse } from '@fluidframework/core-interfaces';
import type { ISequencedDocumentMessage } from '@fluidframework/driver-definitions/internal';

// @alpha
export interface IContainerRuntime extends IProvideFluidDataStoreRegistry, IContainerRuntimeBaseWithCombinedEvents {
    readonly attachState: AttachState;
    // (undocumented)
    readonly clientDetails: IClientDetails;
    // (undocumented)
    readonly clientId: string | undefined;
    // (undocumented)
    readonly connected: boolean;
    // (undocumented)
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    // (undocumented)
    readonly flushMode: FlushMode;
    getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;
    getAliasedDataStoreEntryPoint(alias: string): Promise<IFluidHandle<FluidObject> | undefined>;
    readonly isDirty: boolean;
    // (undocumented)
    readonly options: Record<string | number, any>;
    // (undocumented)
    readonly scope: FluidObject;
    // (undocumented)
    readonly storage: IDocumentStorageService;
}

// @alpha (undocumented)
export type IContainerRuntimeBaseWithCombinedEvents = IContainerRuntimeBase & IEventProvider<IContainerRuntimeEvents>;

// @alpha
export interface IContainerRuntimeEvents extends IContainerRuntimeBaseEvents {
    // (undocumented)
    (event: "dirty" | "disconnected" | "saved" | "attached", listener: () => void): any;
    // (undocumented)
    (event: "connected", listener: (clientId: string) => void): any;
}

// @alpha @deprecated (undocumented)
export interface IContainerRuntimeWithResolveHandle_Deprecated extends IContainerRuntime {
    // (undocumented)
    readonly IFluidHandleContext: IFluidHandleContext;
    // (undocumented)
    resolveHandle(request: IRequest): Promise<IResponse>;
}

// (No @packageDocumentation comment for this package)

```