/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import {
	handleIncomingMessage,
	ISourcedDebuggerMessage,
	InboundHandlers,
	ITimestampedTelemetryEvent,
	TelemetryHistoryMessage,
	TelemetryEventMessage,
} from "@fluid-tools/client-debugger";
import { _TelemetryView } from "@fluid-tools/client-debugger-view";
import { extensionMessageSource } from "../messaging";
import { useMessageRelay } from "./MessageRelayContext";

const loggingContext = "EXTENSION(DebuggerPanel:Telemetry)";

/**
 * Displays telemetry events generated by FluidFramework in the application.
 *
 * @remarks Must be run under a {@link MessageRelayContext}.
 */
export function TelemetryView(): React.ReactElement {
	const messageRelay = useMessageRelay();

	const [telemetryEvents, setTelemetryEvents] = React.useState<ITimestampedTelemetryEvent[]>([]);

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to telemetry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["TELEMETRY_EVENT"]: (untypedMessage) => {
				const message: TelemetryEventMessage = untypedMessage as TelemetryEventMessage;
				setTelemetryEvents((currentEvents) => [...message.data.contents, ...currentEvents]);
				return true;
			},
			["TELEMETRY_HISTORY"]: (untypedMessage) => {
				const message: TelemetryHistoryMessage = untypedMessage as TelemetryHistoryMessage;
				setTelemetryEvents(message.data.contents);
				return true;
			},
		};

		/**
		 * Event handler for messages coming from the Message Relay
		 */
		function messageHandler(message: Partial<ISourcedDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// Request all log history
		messageRelay.postMessage({
			source: extensionMessageSource,
			type: "GET_TELEMETRY_HISTORY",
			data: undefined,
		});

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay, setTelemetryEvents]);

	return <_TelemetryView telemetryEvents={telemetryEvents}></_TelemetryView>;
}
