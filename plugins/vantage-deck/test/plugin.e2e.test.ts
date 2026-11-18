/**
 * End to end: the built plugin (bin/plugin.js, with the real @elgato/streamdeck SDK) between a stand-in Stream Deck app
 * and a stand-in Vantage. Keys draw what Vantage sends, each in its own place, and a press reaches Vantage.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { KEYS, type Key } from "../src/board";
import { FACES } from "../src/face";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SD_PLUGIN = path.join(ROOT, "com.runplaywin.firstpass-vantage.sdPlugin");
const ACTION = "com.runplaywin.firstpass-vantage.key";

// any: each Stream Deck message has a payload of its own shape, and each check reads only what it expects.
type Msg = { event: string; context?: string; payload?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const freePort = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const s = createServer();
		s.once("error", reject);
		s.listen(0, "127.0.0.1", () => {
			const { port } = s.address() as { port: number };
			s.close(() => resolve(port));
		});
	});

async function until<T>(find: () => T | undefined | false, what: string, ms = 10_000): Promise<T> {
	const end = Date.now() + ms;
	for (;;) {
		const found = find();
		if (found) return found;
		if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
		await new Promise((r) => setTimeout(r, 20));
	}
}

const svgOf = (m: Msg): string => decodeURIComponent(String(m.payload?.image ?? "").slice("data:image/svg+xml,".length));

const keyEvent = (event: string, context: string, column: number, row: number) => ({
	event,
	action: ACTION,
	context,
	device: "XL",
	payload: { controller: "Keypad", coordinates: { column, row }, isInMultiAction: false, settings: {}, state: 0 },
});

const keys = (): Key[] => Array.from({ length: KEYS }, (_, i) => ({ id: `k${i}`, title: `Key ${i}`, look: "plain" as const }));

let deckServer: WebSocketServer;
let deck: WebSocket;
let plugin: ChildProcess;
let vantagePort: number;
const received: Msg[] = [];
const send = (m: object) => deck.send(JSON.stringify(m));
const images = (context: string) => received.filter((m) => m.event === "setImage" && m.context === context);

beforeAll(async () => {
	execFileSync("pnpm", ["exec", "rollup", "-c"], { cwd: ROOT, stdio: "ignore" });
	vantagePort = await freePort();
	deckServer = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await new Promise((r) => deckServer.once("listening", r));
	const deckPort = (deckServer.address() as { port: number }).port;
	const connected = new Promise<WebSocket>((resolve) => deckServer.once("connection", resolve));
	const info = {
		application: { font: "", language: "en", platform: "mac", platformVersion: "14.0", version: "7.1.0.21000" },
		colors: {},
		devicePixelRatio: 2,
		devices: [{ id: "XL", name: "Stream Deck XL", size: { columns: 8, rows: 4 }, type: 2 }],
		plugin: { uuid: "com.runplaywin.firstpass-vantage", version: "0.1.0.0" },
	};
	plugin = spawn(
		process.execPath,
		[path.join(SD_PLUGIN, "bin", "plugin.js"), "-port", String(deckPort), "-pluginUUID", "PLUGIN", "-registerEvent", "registerPlugin", "-info", JSON.stringify(info)],
		{ cwd: SD_PLUGIN, env: { ...process.env, VANTAGE_DECK_PORT: String(vantagePort) }, stdio: ["ignore", "ignore", "inherit"] },
	);
	deck = await connected;
	deck.on("message", (d) => received.push(JSON.parse(d.toString()) as Msg));
	await until(() => received.find((m) => m.event === "registerPlugin"), "the plugin to register");
}, 60_000);

afterAll(async () => {
	plugin?.kill();
	for (const c of deckServer?.clients ?? []) c.terminate();
	await new Promise((r) => (deckServer ? deckServer.close(r) : r(null)));
});

async function connectVantage(): Promise<{ socket: WebSocket; messages: Msg[] }> {
	// The plugin starts listening a moment after it registers.
	for (let i = 0; ; i++) {
		try {
			const socket = new WebSocket(`ws://127.0.0.1:${vantagePort}`);
			const messages: Msg[] = [];
			socket.on("message", (d) => messages.push(JSON.parse(d.toString()) as Msg));
			await new Promise<void>((resolve, reject) => {
				socket.once("open", () => resolve());
				socket.once("error", reject);
			});
			return { socket, messages };
		} catch (e) {
			if (i > 100) throw e;
			await new Promise((r) => setTimeout(r, 50));
		}
	}
}

describe("the plugin between Stream Deck and Vantage", () => {
	it("draws, presses and goes dark again", async () => {
		// Before Vantage is open: the first key says so and the others are dark.
		send(keyEvent("willAppear", "A", 0, 0));
		send(keyEvent("willAppear", "B", 1, 1));
		send(keyEvent("willAppear", "C", 7, 3));
		const idle = await until(() => images("A")[0], "the first key's reminder");
		expect(svgOf(idle)).toContain(">Open</text>");
		expect(svgOf(idle)).toContain(">Vantage</text>");
		const dark = await until(() => images("B")[0], "a dark key");
		expect(svgOf(dark)).toContain(`fill="${FACES.off.body}"`);

		// A press with no Vantage does nothing at all.
		send(keyEvent("keyDown", "B", 1, 1));

		// Vantage connects and says what the keys are: each key shows the one for its place.
		const vantage = await connectVantage();
		const sent = keys();
		sent[9] = { id: "action:Goal", title: "Goal", look: "lit" };
		sent[31] = { id: "", title: "End\nquarter", look: "off" };
		vantage.socket.send(JSON.stringify({ v: 1, type: "keys", keys: sent }));
		await until(() => images("A").find((m) => svgOf(m).includes(">Key 0</text>")), "key 0");
		const goal = await until(() => images("B").find((m) => svgOf(m).includes(">Goal</text>")), "the Goal key at column 2, row 2");
		expect(svgOf(goal)).toContain(`fill="${FACES.lit.body}"`);
		await until(() => images("C").find((m) => svgOf(m).includes(">quarter</text>")), "key 31");

		// A press tells Vantage which key, by its id.
		send(keyEvent("keyDown", "B", 1, 1));
		const press = await until(() => vantage.messages.find((m) => m.event === undefined && (m as { type?: string }).type === "press"), "the press");
		expect(press).toEqual({ v: 1, type: "press", id: "action:Goal" });

		// A key that is off reports nothing.
		send(keyEvent("keyDown", "C", 7, 3));
		send(keyEvent("keyDown", "A", 0, 0));
		await until(() => vantage.messages.filter((m) => (m as { type?: string }).type === "press").length === 2, "the second press");
		expect(vantage.messages.filter((m) => (m as { type?: string }).type === "press").map((m) => (m as { id?: string }).id)).toEqual(["action:Goal", "k0"]);

		// The same keys sent again redraw nothing; a change redraws only the key that changed.
		const before = { a: images("A").length, b: images("B").length };
		const next = sent.map((k) => ({ ...k }));
		next[9] = { id: "action:Goal", title: "Goal", look: "selected" };
		vantage.socket.send(JSON.stringify({ v: 1, type: "keys", keys: sent }));
		vantage.socket.send(JSON.stringify({ v: 1, type: "keys", keys: next }));
		await until(() => images("B").find((m) => svgOf(m).includes(`fill="${FACES.selected.body}"`)), "Goal selected");
		expect(images("B").length).toBe(before.b + 1);
		expect(images("A").length).toBe(before.a);

		// A key taken off the deck is no longer drawn.
		send(keyEvent("willDisappear", "A", 0, 0));

		// Vantage closes: the deck goes dark, and a press shows nothing and sends nothing.
		vantage.socket.close();
		await until(() => images("B").find((m, i, all) => i === all.length - 1 && svgOf(m).includes(`fill="${FACES.off.body}"`)), "the deck to go dark");
		expect(images("A").length).toBe(before.a);
		expect(received.some((m) => m.event === "showAlert")).toBe(false);
	}, 30_000);
});
