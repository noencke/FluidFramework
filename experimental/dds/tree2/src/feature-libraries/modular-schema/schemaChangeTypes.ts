/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag, SchemaData } from "../../core";

export interface SchemaChange {
	/**
	 * If this property is an object, then it is a {@link SchemaData} containing the new stored schema for the document.
	 * If this property is a {@link RevisionTag}, then it is a key which maps to the new stored schema for the document.
	 * If this property is undefined, then processing it should do nothing (e.g. because it is the result of a conflict).
	 */
	readonly newSchema?: SchemaData | RevisionTag;
}
