import streamDeck from "@elgato/streamdeck";

import { Board } from "./board";
import { type Hub, PORT, startHub } from "./hub";
import { VantageKey } from "./key";

streamDeck.logger.setLevel("info");
const logger = streamDeck.logger.createScope("Vantage");

const board = new Board();
let hub: Hub | null = null;

/** The port Vantage looks for. Tests move it so they can run beside a real Stream Deck. */
const port = Number(process.env.VANTAGE_DECK_PORT) || PORT;

/** How long to wait before trying the port again when something else has it. */
const RETRY_MS = 5000;

function listen(): void {
	startHub(board, { port, log: (m) => logger.info(m) }).then(
		(started) => {
			hub = started;
			logger.info(`Waiting for Vantage on port ${port}`);
		},
		(e: unknown) => {
			logger.error(`Couldn't listen on port ${port} (${e instanceof Error ? e.message : String(e)}). Trying again shortly.`);
			setTimeout(listen, RETRY_MS);
		},
	);
}

streamDeck.actions.registerAction(new VantageKey(board, () => hub));
listen();
streamDeck.connect();
