/**
 * Procedural segments: a 60-tile strip assembled from small chunks on a grid.
 * Every chunk starts and ends on the base floor (row 14) and keeps to the
 * rules that make a strip passable: pits at most MAX_GAP wide, steps at most
 * MAX_STEP tiles, spike beds at most MAX_SPIKES wide.
 */

export const STRIP = 60;
const ROWS = 16;
const FLOOR = 14;

export const MAX_GAP = 9;
export const MAX_STEP = 2;
export const MAX_SPIKES = 4;

/** Deterministic 0..1 stream from a seed (mulberry32). */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

class Strip {
	readonly g: string[][] = Array.from({ length: ROWS }, () => Array<string>(STRIP).fill("."));

	put(x: number, y: number, c: string): void {
		const row = this.g[y];
		if (row && x >= 0 && x < STRIP) row[x] = c;
	}

	/** Solid ground from `top` down to the bottom of the strip. */
	ground(x: number, top = FLOOR): void {
		for (let y = top; y < ROWS; y++) this.put(x, y, "#");
	}

	rows(): string[] {
		return this.g.map((r) => r.join(""));
	}
}

interface Chunk {
	/** Columns the chunk needs at most. */
	width: number;
	/** How likely it is at difficulty d (0..1). */
	weight(d: number): number;
	build(s: Strip, x: number, d: number, next: () => number): number;
}

const between = (next: () => number, lo: number, hi: number): number =>
	lo + Math.floor(next() * (hi - lo + 1));

const CHUNKS: Chunk[] = [
	{
		// Flat run with a line of nuts or bolts.
		width: 7,
		weight: () => 1,
		build(s, x, _d, next) {
			const w = between(next, 4, 7);
			const pickup = next() < 0.3 ? "b" : "o";
			for (let i = 0; i < w; i++) {
				s.ground(x + i);
				if (i % 2 === 1) s.put(x + i, FLOOR - 2, pickup);
			}
			return x + w;
		},
	},
	{
		// Two staggered platforms with a gear on the high one.
		width: 9,
		weight: () => 0.8,
		build(s, x) {
			for (let i = 0; i < 9; i++) s.ground(x + i);
			for (let i = 1; i <= 3; i++) s.put(x + i, 11, "=");
			for (let i = 5; i <= 7; i++) s.put(x + i, 8, "=");
			s.put(x + 2, 10, "o");
			s.put(x + 6, 7, "z");
			return x + 9;
		},
	},
	{
		// Stairs up one tile at a time and back down.
		width: 10,
		weight: () => 0.8,
		build(s, x) {
			const tops = [13, 13, 12, 12, 11, 11, 12, 12, 13, 13];
			tops.forEach((top, i) => {
				s.ground(x + i, top);
				if (i % 2 === 0) s.put(x + i, top - 2, "o");
			});
			return x + tops.length;
		},
	},
	{
		// A pit; wider with difficulty, an arc of nuts above it.
		width: 2 + 8,
		weight: (d) => 0.6 + d,
		build(s, x, d, next) {
			const gw = Math.min(8, Math.max(3, 3 + Math.round(d * 4) + between(next, 0, 1)));
			s.ground(x);
			for (let i = 1; i <= gw; i++) s.put(x + i, i === 1 || i === gw ? 11 : 10, "o");
			s.ground(x + gw + 1);
			return x + gw + 2;
		},
	},
	{
		// A wide pit crossed on a moving platform.
		width: 2 + MAX_GAP,
		weight: (d) => 0.4 + d * 0.6,
		build(s, x, _d, next) {
			const gw = between(next, 7, MAX_GAP);
			s.ground(x);
			s.put(x + 1, 12, "m");
			for (let i = 2; i <= gw; i++) s.put(x + i, 12, "_");
			s.put(x + Math.ceil(gw / 2), 9, "b");
			s.ground(x + gw + 1);
			return x + gw + 2;
		},
	},
	{
		// A bed of spikes to jump over, nuts tempting a low hop.
		width: 4 + MAX_SPIKES,
		weight: (d) => 0.3 + d,
		build(s, x, d, next) {
			const sw = Math.min(MAX_SPIKES, 2 + Math.round(d * 2) + between(next, 0, 1));
			const w = sw + 4;
			for (let i = 0; i < w; i++) s.ground(x + i);
			for (let i = 0; i < sw; i++) {
				s.put(x + 2 + i, FLOOR - 1, "k");
				s.put(x + 2 + i, FLOOR - 4, "o");
			}
			return x + w;
		},
	},
	{
		// A pit bridged by trapdoors that give way under a slow walker.
		width: 2 + 6,
		weight: (d) => 0.3 + d * 0.7,
		build(s, x, _d, next) {
			const gw = between(next, 4, 6);
			s.ground(x);
			for (let i = 1; i <= gw; i++) s.put(x + i, FLOOR, "t");
			s.ground(x + gw + 1);
			return x + gw + 2;
		},
	},
	{
		// A spring that throws Śrubek up to a ledge with a prize.
		width: 8,
		weight: () => 0.5,
		build(s, x, _d, next) {
			for (let i = 0; i < 8; i++) s.ground(x + i);
			s.put(x + 1, FLOOR - 1, "j");
			for (let i = 3; i <= 6; i++) s.put(x + i, 9, "=");
			s.put(x + 4, 8, next() < 0.5 ? "z" : "e");
			s.put(x + 5, 8, "o");
			return x + 8;
		},
	},
	{
		// Flat ground under a drone's patrol.
		width: 8,
		weight: (d) => 0.2 + d,
		build(s, x, _d, next) {
			const row = next() < 0.5 ? 11 : 12;
			for (let i = 0; i < 8; i++) {
				s.ground(x + i);
				if (i >= 1 && i <= 6) s.put(x + i, row, i === 3 ? "v" : "-");
			}
			return x + 8;
		},
	},
	{
		// A dog-machine with scrap lying ready in front of it.
		width: 9,
		weight: (d) => 0.15 + d,
		build(s, x) {
			for (let i = 0; i < 9; i++) s.ground(x + i);
			s.put(x + 1, FLOOR - 1, "s");
			s.put(x + 7, FLOOR - 1, "w");
			return x + 9;
		},
	},
];

function pick(next: () => number, d: number, room: number): Chunk | undefined {
	const fits = CHUNKS.filter((c) => c.width <= room);
	const total = fits.reduce((sum, c) => sum + c.weight(d), 0);
	let r = next() * total;
	for (const c of fits) {
		r -= c.weight(d);
		if (r <= 0) return c;
	}
	return fits.at(-1);
}

/** A passable 60×16 strip; the same seed and difficulty always give the same strip. */
export function proceduralSegment(seed: number, d: number): string[] {
	const next = rng(seed);
	const s = new Strip();
	let x = 0;
	// Level ground at both ends, so strips join anything and mirror cleanly.
	for (; x < 3; x++) s.ground(x);
	const end = STRIP - 4;
	for (;;) {
		const chunk = pick(next, d, end - x);
		if (!chunk) break;
		x = chunk.build(s, x, d, next);
	}
	for (; x < STRIP; x++) s.ground(x);
	return s.rows();
}
