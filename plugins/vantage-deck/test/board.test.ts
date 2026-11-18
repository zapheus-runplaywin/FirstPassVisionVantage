import { describe, expect, it } from "vitest";

import { Board, idleKey, KEYS, type Key, readKeys, slotOf } from "../src/board";

const keys = (): Key[] => Array.from({ length: KEYS }, (_, i) => ({ id: `k${i}`, title: `Key ${i}`, look: "plain" as const }));

describe("slotOf", () => {
	it("counts left to right, top to bottom", () => {
		expect(slotOf({ column: 0, row: 0 })).toBe(0);
		expect(slotOf({ column: 7, row: 0 })).toBe(7);
		expect(slotOf({ column: 0, row: 1 })).toBe(8);
		expect(slotOf({ column: 7, row: 3 })).toBe(31);
	});

	it("has no place for a key off the 8 by 4 grid or with no coordinates (a multi action)", () => {
		expect(slotOf(undefined)).toBeNull();
		expect(slotOf({ column: 8, row: 0 })).toBeNull();
		expect(slotOf({ column: 0, row: 4 })).toBeNull();
		expect(slotOf({ column: -1, row: 0 })).toBeNull();
		expect(slotOf({ column: 1.5, row: 0 })).toBeNull();
	});
});

describe("readKeys", () => {
	it("accepts exactly 32 well-formed keys", () => {
		expect(readKeys(keys())).toEqual(keys());
	});

	it("drops anything extra a key carries", () => {
		const sent = keys().map((k) => ({ ...k, extra: "x" }));
		expect(readKeys(sent)).toEqual(keys());
	});

	it("refuses the wrong number of keys, the wrong shapes, unknown looks and oversized text", () => {
		expect(readKeys(null)).toBeNull();
		expect(readKeys("keys")).toBeNull();
		expect(readKeys(keys().slice(1))).toBeNull();
		expect(readKeys([...keys(), keys()[0]])).toBeNull();
		const bad = (change: (k: Record<string, unknown>) => void) => {
			const sent: Record<string, unknown>[] = keys();
			change(sent[5]!);
			return readKeys(sent);
		};
		expect(bad((k) => (k.id = 5))).toBeNull();
		expect(bad((k) => delete k.title)).toBeNull();
		expect(bad((k) => (k.look = "sparkly"))).toBeNull();
		expect(bad((k) => (k.title = "x".repeat(65)))).toBeNull();
		expect(bad((k) => (k.id = "x".repeat(65)))).toBeNull();
		const withNull: unknown[] = keys();
		withNull[3] = null;
		expect(readKeys(withNull)).toBeNull();
	});
});

describe("Board", () => {
	it("shows a reminder on the first key and nothing else while Vantage isn't connected", () => {
		const board = new Board();
		expect(board.connected).toBe(false);
		expect(board.keyAt(0)).toEqual({ id: "", title: "Open\nVantage", look: "info" });
		expect(board.keyAt(17)).toEqual(idleKey(17));
		expect(board.keyAt(17).look).toBe("off");
		expect(board.pressAt(0)).toBeNull();
	});

	it("shows Vantage's keys and reports their ids", () => {
		const board = new Board();
		board.set(keys());
		expect(board.connected).toBe(true);
		expect(board.keyAt(9).title).toBe("Key 9");
		expect(board.pressAt(9)).toBe("k9");
	});

	it("reports nothing for a key that is off or only shows something", () => {
		const board = new Board();
		const sent = keys();
		sent[1] = { id: "k1", title: "Off", look: "off" };
		sent[2] = { id: "", title: "Score", look: "info" };
		board.set(sent);
		expect(board.pressAt(1)).toBeNull();
		expect(board.pressAt(2)).toBeNull();
		expect(board.pressAt(99)).toBeNull();
	});

	it("tells its listeners about every change, until they stop listening, and goes dark when Vantage leaves", () => {
		const board = new Board();
		let calls = 0;
		const stop = board.subscribe(() => calls++);
		board.set(keys());
		board.set(null);
		expect(calls).toBe(2);
		expect(board.pressAt(9)).toBeNull();
		expect(board.keyAt(9).look).toBe("off");
		stop();
		board.set(keys());
		expect(calls).toBe(2);
	});
});
