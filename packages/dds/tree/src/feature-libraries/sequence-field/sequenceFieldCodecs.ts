/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IJsonCodec, makeCodecFamily, type ICodecFamily } from "../../codec/index.js";
import { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../../core/index.js";

import { Changeset, type MarkList } from "./types.js";
import { FieldChangeEncodingContext } from "../index.js";
import { makeV1Codec } from "./sequenceFieldCodecV1.js";

export const sequenceFieldChangeCodecFactory = (
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): ICodecFamily<MarkList, FieldChangeEncodingContext> =>
	makeCodecFamily<Changeset, FieldChangeEncodingContext>([[1, makeV1Codec(revisionTagCodec)]]);
