import { describe, expect, it } from "vitest";

import { LOOKS } from "../src/board";
import { FACES, faceSvg, faceUrl, fontSize } from "../src/face";

describe("faceSvg", () => {
	it("draws both lines, the first heavier", () => {
		const svg = faceSvg({ id: "pick:us:GS", title: "GS\nLee", look: "plain" });
		expect(svg).toContain('font-weight="800">GS</text>');
		expect(svg).toContain('font-weight="600">Lee</text>');
		expect(svg).toContain(`fill="${FACES.plain.body}"`);
	});

	it("gives every look its own body colour", () => {
		const bodies = LOOKS.map((look) => FACES[look].body);
		expect(new Set(bodies).size).toBe(LOOKS.length);
		for (const look of LOOKS) expect(faceSvg({ id: "", title: "x", look })).toContain(`fill="${FACES[look].body}"`);
	});

	it("outlines a key that only shows something", () => {
		expect(faceSvg({ id: "", title: "Ball\nStorm", look: "info" })).toContain("stroke=");
		expect(faceSvg({ id: "undo", title: "Undo", look: "plain" })).not.toContain("stroke=");
	});

	it("keeps names from breaking the picture", () => {
		const svg = faceSvg({ id: "x", title: `O'Brien & <Co>\n"Jo"`, look: "plain" });
		expect(svg).toContain("O'Brien &amp; &lt;Co&gt;");
		expect(svg).toContain("&quot;Jo&quot;");
		expect(svg).not.toContain("<Co>");
	});

	it("draws at most two lines, and a blank key with no text", () => {
		expect(faceSvg({ id: "x", title: "a\nb\nc", look: "plain" }).match(/<text/g)).toHaveLength(2);
		expect(faceSvg({ id: "", title: "", look: "off" })).toContain("<text");
	});

	it("centres one line, and stacks two around the middle", () => {
		const one = faceSvg({ id: "x", title: "Goal", look: "lit" });
		const y = Number(/y="([\d.]+)"/.exec(one)?.[1]);
		expect(y).toBeGreaterThan(72);
		expect(y).toBeLessThan(100);
		const ys = [...faceSvg({ id: "x", title: "Goal\nMiss", look: "lit" }).matchAll(/y="([\d.]+)"/g)].map((m) => Number(m[1]));
		expect(ys[0]).toBeLessThan(72);
		expect(ys[1]).toBeGreaterThan(72);
	});
});

describe("fontSize", () => {
	it("shrinks as the longest line grows, and always fits 144 pixels", () => {
		const sizes = [2, 4, 6, 8, 10, 13].map((n) => fontSize(["x".repeat(n)]));
		expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
		// Bold Helvetica averages about 0.6 of its size per character.
		for (const n of [1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) expect(fontSize(["x".repeat(n)]) * 0.6 * n).toBeLessThanOrEqual(150);
		expect(fontSize(["Q1 06:12", "Stop"])).toBe(26);
	});
});

describe("faceUrl", () => {
	it("is an SVG data URL Stream Deck can show", () => {
		const url = faceUrl({ id: "x", title: "Won it", look: "lit" });
		expect(url.startsWith("data:image/svg+xml,")).toBe(true);
		expect(decodeURIComponent(url.slice("data:image/svg+xml,".length))).toBe(faceSvg({ id: "x", title: "Won it", look: "lit" }));
	});
});
