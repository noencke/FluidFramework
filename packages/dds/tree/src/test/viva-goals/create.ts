/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CheckIn, GoalList, Goal, SubGoals, Comment } from "./schema.js";

export interface GoalCreationParameters {
	goalCount: number;
	subGoalCount: number;
	goalTitleLength: number;
	ownersPerGoal: number;
	checkinsPerGoal: number;
	commentsPerGoal: number;
}

export function createGoals(
	params: GoalCreationParameters,
): Promise<GoalList> & { progress: number } {
	let i = 0;
	const promise = new Promise((resolve) => {
		const goals: Goal[] = [];
		while (i < params.goalCount) {
			goals.push(createGoal(params, false));
			i += 1;
		}

		resolve(
			new GoalList({
				id: randomId(),
				title: randomString(params.goalTitleLength),
				description: handle(),
				topLevelGoals: goals,
				customColumns: [], // TODO
			}),
		);
	});

	void Object.defineProperty(promise, "progress", { get: () => i / params.goalCount });
	return promise as Promise<GoalList> & { progress: number };
}

function createGoal(params: GoalCreationParameters, isSubgoal: boolean): Goal {
	return new Goal({
		id: randomId(),
		title: randomString(params.goalTitleLength),
		description: handle(),
		createdBy: randomId(),
		lastUpdatedBy: randomId(),
		startDate: randomDate(),
		endDate: randomDate(),
		owners: repeat(params.ownersPerGoal, randomId),
		createdAt: randomDate(),
		lastUpdatedAt: randomDate(),
		fluidDocId: randomId(),
		storageContainerId: randomId(),
		tenantId: randomId(),
		subGoals: new SubGoals(
			isSubgoal ? [] : repeat(params.subGoalCount, () => createGoal(params, true)),
		),
		checkIns: repeat(params.checkinsPerGoal, () => createCheckin(params)),
		comments: repeat(params.commentsPerGoal, () => createComment(params)),
		customProperties: {}, // TODO
	});
}

function createCheckin(_params: GoalCreationParameters): CheckIn {
	return new CheckIn({
		id: randomId(),
		value: randomInt(),
		status: randomString(10), // Status is things like "ON_TRACK" and "AT_RISK"
		createdAt: randomDate(),
		lastUpdatedAt: randomDate(),
		createdBy: randomId(),
		lastUpdatedBy: randomId(),
		note: handle(),
		mode: randomString(10), // Mode is things like "MANUAL"
		tenantId: randomId(),
		unit: randomString(10), // Not sure what this is
		checkInDate: randomDate(),
		attachments: [], // TODO: attachments
	});
}

function createComment(_params: GoalCreationParameters): Comment {
	return new Comment({
		id: randomId(),
		createdAt: randomDate(),
		lastUpdatedAt: randomDate(),
		createdBy: randomId(),
		lastUpdatedBy: randomId(),
		note: handle(),
		parentId: randomId(),
		tenantId: randomId(),
	});
}

function randomDate(): string {
	const start = new Date(2024, 0, 1);
	return new Date(
		start.getTime() + Math.random() * (Date.now() - start.getTime()),
	).toISOString();
}

function randomId(): string {
	return randomString(36);
}

function handle(): string {
	return randomId();
}

function randomInt(): number {
	return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

function randomBool(): boolean {
	return Math.random() < 0.5;
}

function randomString(length: number): string {
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 \n";
	let str = "";
	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * characters.length);
		str += characters[randomIndex] ?? characters[0]; // It's technically possible that randomIndex is out of bounds: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#examples
	}
	return str;
}

function repeat<T>(n: number, makeItem: () => T): T[] {
	const items = [];
	for (let i = 0; i < n; i++) {
		items.push(makeItem());
	}
	return items;
}
