/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IJsonCodec, ICodecOptions, ICodecFamily, makeCodecFamily } from "../../codec";
import { FieldKindIdentifier } from "../../core";
import { FieldKindWithEditor } from "./fieldKind";
import { makeModularChangeCodec } from "./modularChangeCodecs";
import { ModularChangeset } from "./modularChangeTypes";
import { makeSchemaChangeCodec } from "./schemaChangeCodecs";
import { SchemaChange } from "./schemaChangeTypes";
import { SharedTreeChange } from "./sharedTreeChangeTypes";

export interface EncodedSharedTreeChange {
	readonly modularChange?: IJsonCodec<ModularChangeset>;
	readonly schemaChange?: IJsonCodec<SchemaChange>;
}

function makeSharedTreeChangeCodec(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<SharedTreeChange, EncodedSharedTreeChange, unknown> {
	const schemaChangeCodec = makeSchemaChangeCodec({ jsonValidator: validator });
	const modularChangeCodec = makeModularChangeCodec(fieldKinds, { jsonValidator: validator });
	return {
		encode: (schemaChange) => {},
		decode: (obj) => {},
	};
}

export function makeSharedTreeChangeCodecFamily(
	options: ICodecOptions,
): ICodecFamily<SharedTreeChange> {
	return makeCodecFamily([[0, makeSharedTreeChangeCodec(options)]]);
}
