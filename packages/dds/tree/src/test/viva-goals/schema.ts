/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, type ValidateRecursiveSchema } from "../../simple-tree/index.js";

const sf = new SchemaFactory("Viva Goals Serialization Testing");

export class Attachment extends sf.object("Attachments", {
	id: sf.string,
	attachmentName: sf.string,
	attachmentType: sf.string,
	attachmentMode: sf.string,
	attachmentId: sf.string, // File ID present in same the container.
	createdBy: sf.string,
	lastUpdatedAt: sf.string,
	lastUpdatedBy: sf.string,
}) {}

export class CheckIn extends sf.object("CheckIn", {
	id: sf.string,
	tenantId: sf.string,
	status: sf.string,
	value: sf.number, // In CGS we are storing as float. We dont have float in fluid schema.
	unit: sf.string,
	note: sf.string,
	mode: sf.string,
	checkInDate: sf.string, // Need to know difference between checkInDate and createdAt
	createdAt: sf.string,
	createdBy: sf.string,
	lastUpdatedAt: sf.string,
	lastUpdatedBy: sf.string,
	attachments: sf.array(Attachment),

	// Inline image attachments will be stored as urls in the value field.
}) {}

export class Comment extends sf.object("Comment", {
	id: sf.string,
	tenantId: sf.string,
	note: sf.string,
	parentId: sf.string,
	createdAt: sf.string,
	createdBy: sf.string,
	lastUpdatedAt: sf.string,
	lastUpdatedBy: sf.string,

	// We should not support nested comments because in fluid, we cannot assign sf.array(Comment). If we support it, it will be difficult to maintain the hierarchy
}) {}

export class CustomProperty extends sf.object("CustomProperty", {
	dataType: sf.string,
	numbericValue: sf.optional(sf.number),
	stringValue: sf.optional(sf.string),

	// In CGS we are supporting binary value. Need to check on the use case of binary value. We cannot store binary value in fluid schema. We can maybe store it as string.
}) {}

export class SubGoals extends sf.arrayRecursive("SubGoal", [() => Goal]) {}

export class Goal extends sf.objectRecursive("Goal", {
	id: sf.string,
	tenantId: sf.string,
	title: sf.string,
	description: sf.optional(sf.string),
	owners: sf.array(sf.string),
	startDate: sf.optional(sf.string),
	endDate: sf.optional(sf.string),
	createdAt: sf.string,
	createdBy: sf.string,
	lastUpdatedAt: sf.string,
	lastUpdatedBy: sf.string,
	fluidDocId: sf.string,
	storageContainerId: sf.string,
	customProperties: sf.map(CustomProperty),
	checkIns: sf.array(CheckIn),
	comments: sf.array(Comment),
	subGoals: SubGoals,
}) {}

{
	type _check = ValidateRecursiveSchema<typeof Goal>;
}

export class GoalList extends sf.object("GoalList", {
	id: sf.string,
	title: sf.string,
	description: sf.optional(sf.string),
	topLevelGoals: sf.array(Goal),
	customColumns: sf.optional(sf.array(sf.string)), // this will be a stringified json or array of strings based on business use case

	// In customProperties, the list of custom columns will be a stringified json (similar to what we have in vnext).
}) {}

// TODO: Commenting this out because all this data is already contained in a "Goal".
// I added "checkins" and "comments" to the Goal schema.

// export class GoalDetails extends sf.object("GoalDetails", {
// 	id: sf.string,
// 	tenantId: sf.string,
// 	title: sf.string,
// 	description: sf.optional(sf.string),
// 	owners: sf.array(sf.string),
// 	subGoals: sf.array(SubGoals),
// 	startDate: sf.optional(sf.string),
// 	endDate: sf.optional(sf.string),
// 	createdAt: sf.string,
// 	createdBy: sf.string,
// 	lastUpdatedAt: sf.string,
// 	lastUpdatedBy: sf.string,
// 	customColumns: sf.map(CustomProperty),
// 	checkIns: sf.array(CheckIn),
// 	comments: sf.array(Comment),
// }) {}
