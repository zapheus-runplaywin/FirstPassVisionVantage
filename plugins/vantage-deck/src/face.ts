import type { Key, Look } from "./board";

/**
 * How a key is drawn: its body colour says what kind of key it is right now, matching the buttons on Vantage's screen.
 * White is what the rules of netball expect next, slate works, near-black with grey text works but looks wrong for the
 * state of play, gold is already chosen, orange wants attention (the clock is stopped, mark a moment, press again),
 * navy with a border only shows something, and black does nothing.
 */
export const FACES: Record<Look, { body: string; text: string; border?: string }> = {
	lit: { body: "#ffffff", text: "#0f172a" },
	plain: { body: "#1e293b", text: "#ffffff" },
	dim: { body: "#0b1220", text: "#64748b" },
	selected: { body: "#f1c40f", text: "#0f172a" },
	alert: { body: "#fa5c00", text: "#ffffff" },
	info: { body: "#0f172a", text: "#e2e8f0", border: "#334155" },
	off: { body: "#000000", text: "#334155" },
};

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The largest type that fits the longest line across a 144-pixel key. */
export function fontSize(lines: readonly string[]): number {
	const longest = Math.max(1, ...lines.map((l) => l.length));
	if (longest <= 4) return 40;
	if (longest <= 5) return 36;
	if (longest <= 6) return 32;
	if (longest <= 8) return 26;
	if (longest <= 10) return 22;
	return 18;
}

/** The key as an SVG picture, 144 pixels square. */
export function faceSvg(key: Key): string {
	const face = FACES[key.look];
	const lines = key.title.split("\n").slice(0, 2);
	const size = fontSize(lines);
	const gap = size * 1.15;
	const first = 72 - ((lines.length - 1) * gap) / 2 + size * 0.35;
	const text = lines
		.map((line, i) => `<text x="72" y="${(first + i * gap).toFixed(1)}" font-size="${size}" font-weight="${i === 0 ? 800 : 600}">${esc(line)}</text>`)
		.join("");
	const border = face.border ? `<rect x="3" y="3" width="138" height="138" rx="14" fill="none" stroke="${face.border}" stroke-width="3"/>` : "";
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" rx="16" fill="${face.body}"/>${border}` +
		`<g fill="${face.text}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" text-anchor="middle">${text}</g></svg>`
	);
}

/** The picture in the form Stream Deck's setImage takes. */
export function faceUrl(key: Key): string {
	return `data:image/svg+xml,${encodeURIComponent(faceSvg(key))}`;
}
