import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { Board, KEYS, type Key } from "../src/board";
import { HOST, type Hub, originAllowed, REPLACED, startHub } from "../src/hub";

const keys = (title = "Key"): Key[] => Array.from({ length: KEYS }, (_, i) => ({ id: `k${i}`, title: `${title} ${i}`, look: "plain" as const }));

let hub: Hub | null = null;
const sockets: WebSocket[] = [];
afterEach(async () => {
	for (const s of sockets.splice(0)) s.terminate();
	await hub?.close();
	hub = null;
});

async function start(board: Board): Promise<Hub> {
	hub = await startHub(board, { port: 0 });
	return hub;
}

/** A stand-in for Vantage: connects and collects what the plugin sends. */
function vantage(port: number, headers: Record<string, string> = {}) {
	const socket = new WebSocket(`ws://${HOST}:${port}`, { headers });
	sockets.push(socket);
	const messages: unknown[] = [];
	socket.on("message", (d) => messages.push(JSON.parse(d.toString())));
	const opened = new Promise<void>((resolve, reject) => {
		socket.once("open", () => resolve());
		socket.once("error", reject);
	});
	const closed = new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
	return { socket, messages, opened, closed };
}

const until = async (check: () => boolean, what: string): Promise<void> => {
	for (let i = 0; i < 200; i++) {
		if (check()) return;
		await new Promise((r) => setTimeout(r, 10));
	}
	throw new Error(`Timed out waiting for ${what}`);
};

describe("originAllowed", () => {
	it("lets in apps (no Origin) and this computer", () => {
		expect(originAllowed(undefined)).toBe(true);
		expect(originAllowed("")).toBe(true);
		expect(originAllowed("http://127.0.0.1:38427")).toBe(true);
		expect(originAllowed("http://localhost:8081")).toBe(true);
	});

	it("refuses web pages from anywhere else", () => {
		expect(originAllowed("https://example.com")).toBe(false);
		expect(originAllowed("https://127.0.0.1.example.com")).toBe(false);
		expect(originAllowed("http://192.168.1.20")).toBe(false);
		expect(originAllowed("null")).toBe(false);
		expect(originAllowed("not a url")).toBe(false);
	});
});

describe("the link to Vantage", () => {
	it("listens on this computer only", () => {
		expect(HOST).toBe("127.0.0.1");
	});

	it("greets Vantage, shows the keys it sends, and reports presses back", async () => {
		const board = new Board();
		const h = await start(board);
		const v = vantage(h.port());
		await v.opened;
		await until(() => v.messages.length === 1, "the greeting");
		expect(v.messages[0]).toEqual({ v: 1, type: "hello" });

		v.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys() }));
		await until(() => board.connected, "the keys");
		expect(board.keyAt(8).title).toBe("Key 8");

		expect(h.press("k8")).toBe(true);
		await until(() => v.messages.length === 2, "the press");
		expect(v.messages[1]).toEqual({ v: 1, type: "press", id: "k8" });
	});

	it("follows the keys as they change", async () => {
		const board = new Board();
		const h = await start(board);
		const v = vantage(h.port());
		await v.opened;
		v.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys("First") }));
		await until(() => board.keyAt(0).title === "First 0", "the first keys");
		v.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys("Second") }));
		await until(() => board.keyAt(0).title === "Second 0", "the second keys");
	});

	it("ignores messages that aren't 32 well-formed keys, and keeps what it had", async () => {
		const board = new Board();
		const h = await start(board);
		const v = vantage(h.port());
		await v.opened;
		v.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys() }));
		await until(() => board.connected, "the keys");
		v.socket.send("not json");
		v.socket.send("null");
		v.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys().slice(2) }));
		v.socket.send(JSON.stringify({ v: 1, type: "something else", keys: keys("Other") }));
		v.socket.send(Buffer.from([1, 2, 3]));
		v.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys("Last") }));
		await until(() => board.keyAt(0).title === "Last 0", "the last keys");
		expect(board.keyAt(5).title).toBe("Last 5");
	});

	it("goes dark when Vantage closes, and can't deliver a press", async () => {
		const board = new Board();
		const h = await start(board);
		expect(h.press("k1")).toBe(false);
		const v = vantage(h.port());
		await v.opened;
		v.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys() }));
		await until(() => board.connected, "the keys");
		v.socket.close();
		await until(() => !board.connected, "the board to clear");
		expect(h.press("k1")).toBe(false);
		expect(board.keyAt(0).title).toBe("Open\nVantage");
	});

	it("gives the deck to the newest Vantage and closes the older one", async () => {
		const board = new Board();
		const h = await start(board);
		const first = vantage(h.port());
		await first.opened;
		first.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys("First") }));
		await until(() => board.connected, "the first keys");

		const second = vantage(h.port());
		await second.opened;
		expect(await first.closed).toBe(REPLACED);
		second.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys("Second") }));
		await until(() => board.keyAt(0).title === "Second 0", "the second keys");
		// The older one closing must not clear the newer one's keys.
		await new Promise((r) => setTimeout(r, 50));
		expect(board.connected).toBe(true);

		h.press("k3");
		await until(() => second.messages.length === 2, "the press");
		expect(first.messages).toEqual([{ v: 1, type: "hello" }]);
	});

	it("refuses a web page from another site", async () => {
		const board = new Board();
		const h = await start(board);
		const page = vantage(h.port(), { Origin: "https://example.com" });
		await expect(page.opened).rejects.toThrow();
		const own = vantage(h.port(), { Origin: `http://${HOST}:${h.port()}` });
		await own.opened;
	});

	it("refuses a message far larger than 32 labels", async () => {
		const board = new Board();
		const h = await start(board);
		const v = vantage(h.port());
		await v.opened;
		v.socket.send(JSON.stringify({ v: 1, type: "keys", keys: keys(), padding: "x".repeat(64 * 1024) }));
		expect(await v.closed).toBe(1009);
		expect(board.connected).toBe(false);
	});

	it("says so when the port is already taken", async () => {
		const h = await start(new Board());
		await expect(startHub(new Board(), { port: h.port() })).rejects.toThrow(/EADDRINUSE/);
	});
});
