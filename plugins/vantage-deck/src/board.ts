/**
 * What the 32 keys say, as Vantage last told us, and what a press of each one means.
 *
 * Vantage decides the layout (apps/vantage/src/game/deck.ts). The plugin knows nothing about netball: it holds the
 * labels, draws them, and reports the id of the key that was pressed.
 */

export const COLUMNS = 8;
export const ROWS = 4;
export const KEYS = COLUMNS * ROWS;

export const LOOKS = ["lit", "plain", "dim", "selected", "alert", "info", "off"] as const;
export type Look = (typeof LOOKS)[number];

export type Key = {
	/** What a press means to Vantage; "" for a key that does nothing. */
	id: string;
	/** Up to two short lines, split by a line break. */
	title: string;
	look: Look;
};

/** Longest id or title we accept, so a confused sender can't fill the plugin's memory or a key's image. */
const MAX_TEXT = 64;

/** A key's place on the deck, counted left to right and top to bottom from 0, or null when it is off the 8 by 4 grid. */
export function slotOf(coordinates: { column: number; row: number } | undefined): number | null {
	if (!coordinates) return null;
	const { column, row } = coordinates;
	if (!Number.isInteger(column) || !Number.isInteger(row)) return null;
	if (column < 0 || column >= COLUMNS || row < 0 || row >= ROWS) return null;
	return row * COLUMNS + column;
}

/** The keys in a message from Vantage, or null when it isn't exactly 32 well-formed keys. */
export function readKeys(value: unknown): Key[] | null {
	if (!Array.isArray(value) || value.length !== KEYS) return null;
	const keys: Key[] = [];
	for (const item of value) {
		if (typeof item !== "object" || item === null) return null;
		const { id, title, look } = item as Record<string, unknown>;
		if (typeof id !== "string" || typeof title !== "string" || typeof look !== "string") return null;
		if (id.length > MAX_TEXT || title.length > MAX_TEXT) return null;
		if (!(LOOKS as readonly string[]).includes(look)) return null;
		keys.push({ id, title, look: look as Look });
	}
	return keys;
}

/** What the deck shows while Vantage isn't connected: dark keys, with a reminder on the first one. */
export function idleKey(slot: number): Key {
	return slot === 0 ? { id: "", title: "Open\nVantage", look: "info" } : { id: "", title: "", look: "off" };
}

export class Board {
	private keys: Key[] | null = null;
	private readonly listeners = new Set<() => void>();

	/** Sets what the keys say; null when Vantage has gone. */
	set(keys: Key[] | null): void {
		this.keys = keys;
		for (const listener of this.listeners) listener();
	}

	get connected(): boolean {
		return this.keys !== null;
	}

	keyAt(slot: number): Key {
		return this.keys?.[slot] ?? idleKey(slot);
	}

	/** The id to report for a press of this slot, or null when the key does nothing right now. */
	pressAt(slot: number): string | null {
		const key = this.keys?.[slot];
		return key && key.id && key.look !== "off" ? key.id : null;
	}

	/** Calls back whenever the keys change. Returns a function that stops it. */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
