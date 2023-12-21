/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField as SF } from "../../../feature-libraries";
import { brand, generateStableId, Populated } from "../../../util";
import { ChangeAtomId } from "../../../core";
import { TestChange } from "../../testChange";
// eslint-disable-next-line import/no-internal-modules
import { CellMark } from "../../../feature-libraries/sequence-field";
import {
	Attach,
	Detach,
	DetachIdOverride,
	DetachIdOverrideType,
	MarkEffect,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/types";

export type PopulatedMark<TNodeChange = TestChange> = Populated<
	CellMark<Populated<MarkEffect>, TNodeChange>
>;

/**
 * Generates a list of marks with all fields populated.
 *
 * @remarks - New objects are generated every time this function is called. This is to ensure that stable IDs are
 * generated when appropriate.
 */
export function generatePopulatedMarks(): PopulatedMark[] {
	const tag = generateStableId();
	const lineageEvent: Populated<SF.LineageEvent> = {
		count: 2,
		id: brand(0),
		offset: 1,
		revision: tag,
	};
	const adjacentCell: Populated<SF.IdRange> = { count: 2, id: brand(0) };
	const atomId: Populated<ChangeAtomId> = { localId: brand(0), revision: tag };
	const cellId: Populated<SF.CellId> = {
		localId: brand(0),
		revision: tag,
		lineage: [lineageEvent],
		adjacentCells: [adjacentCell],
	};
	const changes = TestChange.mint([], 1);
	const unattachIdOverride: Populated<DetachIdOverride> = {
		type: DetachIdOverrideType.Unattach,
		id: cellId,
	};
	const redetachIdOverride: Populated<DetachIdOverride> = {
		type: DetachIdOverrideType.Redetach,
		id: cellId,
	};
	const attach: Populated<Attach> = {
		type: "MoveIn",
		id: brand(0),
		revision: tag,
		finalEndpoint: atomId,
	};
	const detach: Populated<Detach> = {
		type: "MoveOut",
		id: brand(0),
		revision: tag,
		finalEndpoint: atomId,
		idOverride: unattachIdOverride,
	};
	const populatedMarks: PopulatedMark[] = [
		{ count: 1, cellId, changes },
		{ type: "Insert", count: 1, cellId, changes, id: brand(0), revision: tag },
		{
			type: "MoveIn",
			count: 1,
			cellId,
			changes,
			id: brand(0),
			revision: tag,
			finalEndpoint: atomId,
		},
		{
			type: "MoveOut",
			count: 1,
			cellId,
			changes,
			id: brand(0),
			revision: tag,
			finalEndpoint: atomId,
			idOverride: unattachIdOverride,
		},
		{
			type: "Delete",
			count: 1,
			cellId,
			changes,
			id: brand(0),
			revision: tag,
			idOverride: redetachIdOverride,
		},
		{
			type: "AttachAndDetach",
			count: 1,
			cellId,
			changes,
			attach,
			detach,
		},
	];
	return populatedMarks;
}