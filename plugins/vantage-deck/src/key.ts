import streamDeck, { action, type KeyDownEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { type Board, slotOf } from "./board";
import { faceUrl } from "./face";
import type { Hub } from "./hub";

const logger = streamDeck.logger.createScope("Key");

/**
 * The one action this plugin has. Put it on every key of a Stream Deck XL: each key works out which of the 32 it is
 * from where it sits, so there is nothing to set on any of them.
 */
@action({ UUID: "com.runplaywin.firstpass-vantage.key" })
export class VantageKey extends SingletonAction {
	/** The keys on screen now, and the picture each one last showed. */
	private readonly shown = new Map<string, { key: KeyDownEvent["action"]; slot: number; drawn: string }>();

	constructor(
		private readonly board: Board,
		private readonly hub: () => Hub | null,
	) {
		super();
		board.subscribe(() => this.drawAll());
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) return;
		const slot = slotOf(ev.action.coordinates);
		// In a multi action, or off the 8 by 4 grid, there is no place to draw.
		if (slot === null) return;
		this.shown.set(ev.action.id, { key: ev.action, slot, drawn: "" });
		this.draw(ev.action.id);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.shown.delete(ev.action.id);
	}

	override onKeyDown(ev: KeyDownEvent): void {
		const slot = this.shown.get(ev.action.id)?.slot ?? null;
		const id = slot === null ? null : this.board.pressAt(slot);
		// A key that does nothing right now stays quiet; a press that can't be delivered shows the alert triangle.
		if (id === null) return;
		if (!this.hub()?.press(id)) {
			logger.warn(`Couldn't tell Vantage about ${id}`);
			void ev.action.showAlert();
		}
	}

	private drawAll(): void {
		for (const id of this.shown.keys()) this.draw(id);
	}

	private draw(id: string): void {
		const entry = this.shown.get(id);
		if (!entry) return;
		const image = faceUrl(this.board.keyAt(entry.slot));
		if (image === entry.drawn) return;
		entry.drawn = image;
		void entry.key.setImage(image);
	}
}
