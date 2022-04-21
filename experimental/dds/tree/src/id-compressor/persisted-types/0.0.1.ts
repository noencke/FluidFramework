/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Serializable } from '@fluidframework/datastore-definitions';
import type {
	FinalCompressedId,
	LocalCompressedId,
	OpSpaceCompressedId,
	SessionId,
	UuidString,
} from '../../Identifiers';

/**
 * An identifier associated with a session for the purpose of attributing its edits to some entity.
 */
export type AttributionId = UuidString;

/**
 * A serialized ID allocation session for an `IdCompressor`.
 */
export type SerializedSessionData = readonly [
	/**
	 * The ID of the session.
	 */
	sessionId: SessionId,

	/**
	 * Index into the serialized AttributionIDs array; points to the attribution ID provided for this session
	 */
	attributionId?: number
];

export type SerializedClusterOverrides = readonly [
	/** The overridden final ID, represented as an index into the cluster's ID range */
	overriddenFinalIndex: number, // A cluster with base UUID '...beef' and an `overriddenFinalIndex` of 3 would correspond to '...bef2'
	/** The override string */
	override: string,
	/** The first ID that was finalized and associated with this override, set only if different than the `overriddenFinalIndex` */
	overriddenId?: FinalCompressedId
][];

/**
 * A serialized final ID cluster.
 */
export type SerializedCluster = readonly [
	/**
	 * Index into the serialized sessions array. Can be converted into a baseUuid via its order in `clusters`.
	 * If negative, then this cluster was created by the local session.
	 */
	sessionIndex: number,

	/**
	 * The capacity of the cluster.
	 */
	capacity: number,

	/**
	 * The number of IDs in the cluster. Omitted if count === capacity.
	 * --OR--
	 * The overrides in this cluster. Omitted if no overrides exist in the cluster.
	 */
	countOrOverrides?: number | SerializedClusterOverrides,

	/**
	 * Overrides in this cluster. Omitted if no overrides exist in the cluster.
	 */
	overrides?: SerializedClusterOverrides
];

export type SerializedLocalOverrides = readonly [LocalCompressedId, string][];

export interface SerializedLocalState {
	/**
	 * The total number of local IDs created by this session
	 */
	localIdCount: number;
	/**
	 * Overrides generated by this session. Omitted if no local overrides exist in the session.
	 */
	overrides?: SerializedLocalOverrides;

	/**
	 * Boolean to track whether attribution has been sent with an ID range yet.
	 */
	sentAttributionInfo: boolean;

	/**
	 * The most recent local ID in a range returned by `takeNextCreationRange`.
	 */
	lastTakenLocalId: LocalCompressedId | undefined;
}

/**
 * The minimal required contents of a serialized IdCompressor.
 */
export interface VersionedSerializedIdCompressor {
	readonly _versionedSerializedIdCompressor: '8c73c57c-1cf4-4278-8915-6444cb4f6af5';
	readonly version: string;
}

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 */
export interface SerializedIdCompressor extends VersionedSerializedIdCompressor {
	/** The cluster capacity of this compressor */
	readonly clusterCapacity: number;
	/** The number of reserved IDs in this compressor */
	readonly reservedIdCount: number;
	/** All sessions except the local session. */
	readonly sessions: readonly SerializedSessionData[];
	/** All clusters in the compressor in the order they were created. */
	readonly clusters: readonly SerializedCluster[];
	/** All attribution IDs for all sessions */
	readonly attributionIds?: readonly AttributionId[];
}

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 */
export interface SerializedIdCompressorWithNoSession extends SerializedIdCompressor {
	readonly _noLocalState: '3aa2e1e8-cc28-4ea7-bc1a-a11dc3f26dfb';
}

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 */
export interface SerializedIdCompressorWithOngoingSession extends SerializedIdCompressor {
	readonly _hasLocalState: '1281acae-6d14-47e7-bc92-71c8ee0819cb';
	/** The session ID of the local session, by index into `sessions`. */
	readonly localSessionIndex: number;
	/** This is only present if the local session made any IDs. */
	readonly localState?: SerializedLocalState;
}

/**
 * Data describing a range of session-local IDs (from a remote or local session).
 *
 * A range is composed of local IDs that were generated. Some of these may have overrides.
 *
 * @example
 * Suppose an IdCompressor generated a sequence of local IDs as follows:
 * ```
 * compressor.generateLocalId()
 * compressor.generateLocalId('0093cf29-9454-4034-8940-33b1077b41c3')
 * compressor.generateLocalId()
 * compressor.generateLocalId('0ed545f8-e97e-4dc1-acf9-c4a783258bdf')
 * compressor.generateLocalId()
 * compressor.generateLocalId()
 * compressor.takeNextCreationRange()
 * ```
 * This would result in the following range:
 * ```
 * {
 *     first: localId1,
 *     last: localId6,
 *     overrides: [[localId2, '0093cf29-9454-4034-8940-33b1077b41c3'], [localId4, '0ed545f8-e97e-4dc1-acf9-c4a783258bdf']]
 * }
 * ```
 */
export interface IdCreationRange {
	readonly sessionId: SessionId;
	readonly ids?: IdCreationRange.Ids;
	readonly attributionId?: AttributionId;
}

export type UnackedLocalId = LocalCompressedId & OpSpaceCompressedId;

export namespace IdCreationRange {
	export type Ids =
		| {
				readonly first: UnackedLocalId;
				readonly last: UnackedLocalId;
		  }
		| ({
				readonly first?: UnackedLocalId;
				readonly last?: UnackedLocalId;
		  } & HasOverrides);

	export interface HasOverrides {
		readonly overrides: Overrides;
	}

	export type Override = readonly [id: UnackedLocalId, override: string];
	export type Overrides = readonly [Override, ...Override[]];
}
