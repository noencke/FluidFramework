/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag } from "../../core";
import { ICodecFamily, ICodecOptions, IJsonCodec, makeCodecFamily } from "../../codec";
import { makeSchemaCodec } from "../schemaIndexFormat";
import { SchemaChange } from "./schemaChangeTypes";

interface DataEncodedSchemaChange {
	schemaData: ReturnType<ReturnType<typeof makeSchemaCodec>["encode"]>;
}

interface TagEncodedSchemaChange {
	schemaTag: RevisionTag;
}

interface EmptyEncodedSchemaChange {}

export type EncodedSchemaChange =
	| DataEncodedSchemaChange
	| TagEncodedSchemaChange
	| EmptyEncodedSchemaChange;

function isDataEncodedSchemaChange(change: EncodedSchemaChange): change is DataEncodedSchemaChange {
	return (change as DataEncodedSchemaChange).schemaData !== undefined;
}

function isTagEncodedSchemaChange(change: EncodedSchemaChange): change is TagEncodedSchemaChange {
	return (change as TagEncodedSchemaChange).schemaTag !== undefined;
}

function makeSchemaChangeCodec({
	jsonValidator: validator,
}: ICodecOptions): IJsonCodec<SchemaChange> {
	const schemaCodec = makeSchemaCodec({ jsonValidator: validator });
	return {
		encode: (schemaChange) => {
			if (typeof schemaChange.newSchema === "object") {
				return { schemaData: schemaCodec.encode(schemaChange.newSchema) };
			}
			return {
				schemaTag: schemaChange.newSchema,
			};
		},
		decode: (obj) => {
			const encodedSchemaChange = obj as unknown as EncodedSchemaChange;
			if (isDataEncodedSchemaChange(encodedSchemaChange)) {
				return {
					newSchema: schemaCodec.decode(encodedSchemaChange.schemaData),
				};
			}
			if (isTagEncodedSchemaChange(encodedSchemaChange)) {
				return {
					newSchema: encodedSchemaChange.schemaTag,
				};
			}
			return {};
		},
	};
}

export function makeSchemaChangeCodecFamily(options: ICodecOptions): ICodecFamily<SchemaChange> {
	return makeCodecFamily([[0, makeSchemaChangeCodec(options)]]);
}
