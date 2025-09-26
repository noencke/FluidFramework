/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree";

import { Emails } from "../domains/index.js";
import { scoreSymbol, type LLMIntegrationTest, type ScorableVerboseTree } from "../utils.js";

const sf = new SchemaFactory(undefined);

// We expect the model to invoke the exposed `load` method on the Emails array with the search term "bacon".
// Scoring: award full credit if at least 5 emails mentioning the term (subject or body) are loaded.
// Partial credit is proportional to how many qualifying emails are present (up to 5 needed for 100%).
const expected: ScorableVerboseTree = {
	type: "com.microsoft.fluid.tree-agent.email.EmailSearch",
	[scoreSymbol]: (actual): number => {
		if (typeof actual !== "object" || actual === null || !Array.isArray(actual.fields)) {
			return 0;
		}

		let qualifying = 0;
		for (const email of actual.fields) {
			if (
				typeof email === "object" &&
				email !== null &&
				!Array.isArray(email.fields) &&
				email.type === "com.microsoft.fluid.tree-agent.email.Email"
			) {
				const subject = String(email.fields.subject ?? "").toLowerCase();
				const body = String(email.fields.body ?? "").toLowerCase();
				if (subject.includes("bacon") || body.includes("bacon")) {
					qualifying += 1;
				}
			}
		}
		// Need at least 5 to score 1.0; otherwise linear scale.
		return Math.min(qualifying / 5, 1);
	},
};

/**
 * Scenario: Populate the Emails array by searching for emails related to the term "bacon" using the `load` method.
 */
export const emailSearchTest = {
	name: "Email search (bacon)",
	schema: [sf.string, Emails],
	initialTree: () => {
		const emails = new Emails();
		const emails2 = new Emails([]);
		console.log(emails === emails2); // To use the variable and avoid lint error.
		return "";
	},
	prompt:
		"Search for and load all emails containing the keyword 'bacon'. Then give me a summary of how the bacon project is progressing.",
	expected,
} as const satisfies LLMIntegrationTest<[typeof sf.string, typeof Emails]>;
