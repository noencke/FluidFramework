/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, ICodecOptions } from "../../codec";
import {
	ChangeFamily,
	ChangeRebaser,
	TaggedChange,
	SchemaData,
	EditBuilder,
	Delta,
	ReadonlyRepairDataStore,
} from "../../core";
import { makeSchemaChangeCodecFamily } from "./schemaChangeCodecs";
import { SchemaChange } from "./schemaChangeTypes";

export class SchemaEditor extends EditBuilder<SchemaChange> {
	public setStoredSchema(schema: SchemaData): void {
		this.applyChange({ newSchema: schema });
	}
}

/**
 * Handles changes to the stored document schema.
 */
export class SchemaChangeFamily
	implements ChangeFamily<SchemaEditor, SchemaChange>, ChangeRebaser<SchemaChange>
{
	public readonly codecs: ICodecFamily<SchemaChange>;

	public constructor(codecOptions: ICodecOptions) {
		this.codecs = makeSchemaChangeCodecFamily(codecOptions);
	}

	public buildEditor(changeReceiver: (change: SchemaChange) => void): SchemaEditor {
		return new SchemaEditor(this, changeReceiver);
	}

	public compose(changes: TaggedChange<SchemaChange>[]): SchemaChange {
		// Schema changes overwrite each other, so composing multiple together doesn't really make sense; choose the last one.
		return changes[changes.length - 1].change;
	}

	public invert(
		change: TaggedChange<SchemaChange>,
		isRollback: boolean,
		repairStore?: ReadonlyRepairDataStore,
	): SchemaChange {
		// The tag of the inverted revision can be used as a key in the schema store to lookup the previous schema
		return { newSchema: change.revision };
	}

	public rebase(change: SchemaChange, over: TaggedChange<SchemaChange>): SchemaChange {
		// For now, always conflict when attempting to rebase schema changes.
		return {};
	}

	public intoDelta(change: SchemaChange): Delta.Root {
		// TODO: This is correct, technically, since schema changes don't change the forest, but it's strange to require this to be implemented here.
		return new Map();
	}

	public get rebaser(): ChangeRebaser<SchemaChange> {
		return this;
	}
}
