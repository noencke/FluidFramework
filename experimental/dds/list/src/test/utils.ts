/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalServerTestDriver } from "@fluidframework/test-drivers";
import {
    ITestObjectProvider,
    ChannelFactoryRegistry,
    TestObjectProvider,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    ITestFluidObject } from "@fluidframework/test-utils";
import { SharedList, SharedListFactory } from "../sharedList";

/**
 * Manages the creation, connection, and retrieval of SharedLists and related components for ease of testing.
 * Satisfies the {@link ITestObjectProvider} interface.
 */
 export type ITestListProvider = TestListProvider & ITestObjectProvider;

 /**
  * A test helper class that manages the creation, connection and retrieval of SharedLists. Instances of this
  * class are created via {@link create} and satisfy the {@link ITestObjectProvider} interface.
  */
 export class TestListProvider {
     private static readonly listId = "TestSharedList";

     private readonly provider: ITestObjectProvider;
     private readonly _lists: SharedList[] = [];
     private readonly _containers: IContainer[] = [];

     public get lists(): readonly SharedList[] {
         return this._lists;
     }

     public get containers(): readonly IContainer[] {
         return this._containers;
     }

     /**
      * Create a new {@link TestListProvider} with a number of lists pre-initialized.
      * @param lists - the number of lists to initialize this provider with. This is the same as calling
      * {@link create} followed by {@link createList} _lists_ times.
      *
      * @example
      * ```ts
      * const provider = await TestListProvider.create(2);
      * assert(provider.lists[0].isAttached());
      * assert(provider.lists[1].isAttached());
      * await lists.ensureSynchronized();
      * ```
      */
     public static async create(lists = 0): Promise<ITestListProvider> {
         const provider = new TestListProvider() as ITestListProvider;
         for (let i = 0; i < lists; i++) {
             await provider.createList();
         }
         return provider;
     }

     /**
      * Create and initialize a new {@link SharedList} that is connected to all other lists from this provider.
      * @returns the list that was created. For convenience, the list can also be accessed via `this[i]` where
      * _i_ is the index of the list in order of creation.
      */
     public async createList(): Promise<SharedList> {
         const container = this.lists.length === 0
         ? await this.provider.makeTestContainer()
         : await this.provider.loadTestContainer();

         const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
         return this._lists[this.lists.length] = await dataObject.getSharedObject<SharedList>(TestListProvider.listId);
     }

     public [Symbol.iterator](): IterableIterator<SharedList> {
         return this.lists[Symbol.iterator]();
     }

     private constructor() {
         const factory = new SharedListFactory();
         const registry = [[TestListProvider.listId, factory]] as ChannelFactoryRegistry;
         const driver = new LocalServerTestDriver();
         this.provider = new TestObjectProvider(
             Loader,
             driver,
             () => new TestContainerRuntimeFactory(
                 "@fluid-example/test-dataStore",
                 new TestFluidObjectFactory(registry),
             ),
         );

         return new Proxy(this, {
             get: (target, prop, receiver) => {
                 // Route all properties that are on the `TestListProvider` itself
                 if ((target as never)[prop] !== undefined) {
                     return Reflect.get(target, prop, receiver) as unknown;
                 }

                 // Route all other properties to the `TestObjectProvider`
                 return Reflect.get(this.provider, prop, receiver) as unknown;
             },
         });
     }
 }
