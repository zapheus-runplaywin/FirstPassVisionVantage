import type { IncomingMessage } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

import { type Board, readKeys } from "./board";

/**
 * Where Vantage finds the plugin: a WebSocket on this computer only. Vantage (apps/vantage/src/lib/deck.ts) connects,
 * sends what the keys say whenever that changes, and is told which key was pressed.
 *
 *   Vantage to plugin: { "v": 1, "type": "keys", "keys": [32 of { "id", "title", "look" }] }
 *   plugin to Vantage: { "v": 1, "type": "press", "id": "<the pressed key's id>" }
 *
 * It listens on 127.0.0.1, so nothing off this computer can reach it, and refuses web pages from other sites: the keys
 * carry players' names, and a press records an event.
 */
export const PORT = 38427;
export const HOST = "127.0.0.1";
export const PROTOCOL = 1;
/** Far more than 32 short labels need. */
const MAX_MESSAGE = 32 * 1024;
/** Close code for a Vantage replaced by a newer one. */
export const REPLACED = 4000;

/** Whether a connection may come from this Origin: none at all (an app), or this computer itself. */
export function originAllowed(origin: string | undefined): boolean {
	if (origin === undefined || origin === "") return true;
	try {
		const host = new URL(origin).hostname;
		return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
	} catch {
		return false;
	}
}

export type Hub = {
	/** Tells Vantage a key was pressed. False when no Vantage is connected. */
	press(id: string): boolean;
	/** The port being listened on (the one asked for, or the one the system gave for 0). */
	port(): number;
	close(): Promise<void>;
};

export function startHub(board: Board, opts: { port?: number; log?: (message: string) => void } = {}): Promise<Hub> {
	const log = opts.log ?? (() => {});
	let current: WebSocket | null = null;

	return new Promise((resolve, reject) => {
		const server = new WebSocketServer({
			host: HOST,
			port: opts.port ?? PORT,
			maxPayload: MAX_MESSAGE,
			verifyClient: (info: { origin: string; req: IncomingMessage }) => originAllowed(info.req.headers.origin),
		});
		server.once("error", reject);
		server.once("listening", () => {
			server.off("error", reject);
			server.on("error", (e) => log(`Vantage link error: ${e.message}`));
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : (opts.port ?? PORT);
			resolve({
				press(id) {
					if (!current || current.readyState !== WebSocket.OPEN) return false;
					current.send(JSON.stringify({ v: PROTOCOL, type: "press", id }));
					return true;
				},
				port: () => port,
				close: () =>
					new Promise<void>((done) => {
						for (const client of server.clients) client.terminate();
						server.close(() => done());
					}),
			});
		});

		server.on("connection", (socket) => {
			// One Vantage at a time: the newest one has the deck.
			const previous = current;
			current = socket;
			previous?.close(REPLACED, "Another Vantage connected");
			log("Vantage connected");
			socket.send(JSON.stringify({ v: PROTOCOL, type: "hello" }));

			socket.on("message", (data, isBinary) => {
				if (socket !== current || isBinary) return;
				let message: unknown;
				try {
					message = JSON.parse(data.toString());
				} catch {
					return;
				}
				if (typeof message !== "object" || message === null) return;
				const { type, keys } = message as Record<string, unknown>;
				if (type !== "keys") return;
				const read = readKeys(keys);
				if (read) board.set(read);
				else log("Ignored a keys message that wasn't 32 well-formed keys");
			});
			socket.on("error", (e) => log(`Vantage link error: ${e.message}`));
			socket.on("close", () => {
				if (socket !== current) return;
				current = null;
				board.set(null);
				log("Vantage disconnected");
			});
		});
	});
}
