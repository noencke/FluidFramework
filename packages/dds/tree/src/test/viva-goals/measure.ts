/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluid-internal/client-utils";
import { TestTreeProviderLite } from "../utils.js";
import { TreeViewConfiguration } from "../../simple-tree/index.js";
import { GoalList } from "./schema.js";
import { createGoals, type GoalCreationParameters } from "./create.js";
import { ForestType, SharedTreeFactory } from "../../shared-tree/index.js";

const testCases: {
	title: string;
	params: GoalCreationParameters;
}[] = [
	{
		title: "Single Goal",
		params: {
			goalCount: 1,
			subGoalCount: 1,
			goalTitleLength: 80,
			ownersPerGoal: 1,
			checkinsPerGoal: 0,
			commentsPerGoal: 0,
		},
	},
	{
		title: "P75",
		params: {
			goalCount: 500,
			subGoalCount: 1,
			goalTitleLength: 80,
			ownersPerGoal: 1,
			checkinsPerGoal: 15,
			commentsPerGoal: 10,
		},
	},
	{
		title: "P95",
		params: {
			goalCount: 5000,
			subGoalCount: 1,
			goalTitleLength: 80,
			ownersPerGoal: 1,
			checkinsPerGoal: 100,
			commentsPerGoal: 100,
		},
	},
];

describe("Viva Goals Document Size", () => {
	for (const { title, params } of testCases) {
		it(title, async () => {
			const provider = new TestTreeProviderLite(
				1,
				new SharedTreeFactory({
					forest: ForestType.Optimized,
				}),
			);
			const [tree] = provider.trees;
			const view = tree.viewWith(new TreeViewConfiguration({ schema: GoalList }));
			const goals = createGoals(params);

			let running = true;
			void goals.then((goalList) => {
				view.initialize(goalList);
				provider.processMessages();
				const { summary } = tree.getAttachSummary(true);
				const summaryString = JSON.stringify(summary);
				const summarySize = IsoBuffer.from(summaryString).byteLength;

				const jsonString = JSON.stringify(view.root);
				const jsonSize = IsoBuffer.from(jsonString).byteLength;

				running = false;

				debugger;
			});

			function log() {
				console.log(goals.progress);
				if (running) {
					setTimeout(() => {
						log();
					}, 10000);
				}
			}

			log();

			await goals;
		});
	}
});
