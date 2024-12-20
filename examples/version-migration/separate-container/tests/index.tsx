/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IMigratableModel,
	IMigrationTool,
	IVersionedModel,
	MigratableSessionStorageModelLoader,
	Migrator,
} from "@fluid-example/migration-tools/internal";

import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { inventoryListDataTransformationCallback } from "../src/dataTransform.js";
import { DemoCodeLoader } from "../src/demoCodeLoader.js";
import type { IInventoryListAppModel } from "../src/modelInterfaces.js";
import { DebugView, InventoryListAppView } from "../src/view/index.js";

const updateTabForId = (id: string) => {
	// Update the URL with the actual ID
	location.hash = id;

	// Put the ID in the tab title
	document.title = id;
};

const isIInventoryListAppModel = (
	model: IVersionedModel,
): model is IInventoryListAppModel & IMigratableModel => {
	return model.version === "one" || model.version === "two";
};

const getUrlForContainerId = (containerId: string) => `/#${containerId}`;

// Store the migrators on the window so our tests can more easily observe the migration happening
// eslint-disable-next-line @typescript-eslint/dot-notation
window["migrators"] = [];

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement) {
	const searchParams = new URLSearchParams(location.search);
	const testMode = searchParams.get("testMode") !== null;
	const modelLoader = new MigratableSessionStorageModelLoader<
		IInventoryListAppModel & IMigratableModel
	>(new DemoCodeLoader(testMode));
	let id: string;
	let model: IMigratableModel;
	let migrationTool: IMigrationTool;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await modelLoader.createDetached("one");
		model = createResponse.model;
		migrationTool = createResponse.migrationTool;
		// Should be the same as the uuid we generated above.
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		const loadResponse = await modelLoader.loadExisting(id);
		model = loadResponse.model;
		migrationTool = loadResponse.migrationTool;
	}

	const appDiv = document.createElement("div");
	const debugDiv = document.createElement("div");

	const appRoot = createRoot(appDiv);
	const debugRoot = createRoot(debugDiv);

	const render = (model: IVersionedModel, migrationTool: IMigrationTool) => {
		// This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
		// versions, we could check its version here and select the appropriate view.  Or we could even write ourselves a
		// view code loader to pull in the view dynamically based on the version we discover.
		if (isIInventoryListAppModel(model)) {
			appRoot.render(createElement(InventoryListAppView, { model, migrationTool }));

			// The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
			debugRoot.render(
				createElement(DebugView, {
					model,
					migrationTool,
					getUrlForContainerId,
				}),
			);
		} else {
			throw new Error(`Don't know how to render version ${model.version}`);
		}
	};

	const migrator = new Migrator(
		modelLoader,
		model,
		migrationTool,
		id,
		inventoryListDataTransformationCallback,
	);
	migrator.events.on("migrated", () => {
		model.dispose();
		render(migrator.currentModel, migrationTool);
		updateTabForId(migrator.currentModelId);
		model = migrator.currentModel;
	});

	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["migrators"].push(migrator);

	// update the browser URL and the window title with the actual container ID
	updateTabForId(id);
	// Render it
	render(model, migrationTool);

	element.append(appDiv, debugDiv);

	// Setting "fluidStarted" is just for our test automation
	// eslint-disable-next-line @typescript-eslint/dot-notation
	window["fluidStarted"] = true;
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup() {
	const leftElement = document.getElementById("sbs-left") as HTMLDivElement;
	if (leftElement === null) {
		throw new Error("sbs-left does not exist");
	}
	await createContainerAndRenderInElement(leftElement);
	const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
	if (rightElement === null) {
		throw new Error("sbs-right does not exist");
	}
	await createContainerAndRenderInElement(rightElement);
}

setup().catch((e) => {
	console.error(e);
	console.log(
		"%cThere were issues setting up and starting the in memory Fluid Server",
		"font-size:30px",
	);
});
