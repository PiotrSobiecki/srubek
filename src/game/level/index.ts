/**
 * Level layout. A level is a row-major grid of tile characters built by joining
 * named segments side by side. Nothing here knows about physics or drawing.
 *
 *   `#` scrap ground   `=` metal platform   `P` spawn   `.` air
 *   pickups: `o` nut   `b` bolt   `z` gear   `e` energy cell   `l` extra life
 *   `v` drone, patrolling the run of `-` it sits in   `c` charger
 *   `s` scrap the magnet can throw   `w` dog-machine walking its platform
 *   `^` press resting under a ceiling, dropping to the floor below   `g` factory gate
 */

export const TILE = 16;
export const ROWS = 16;

export interface Vec {
	x: number;
	y: number;
}

/** A drone and the tile span it patrols, inclusive. */
interface DroneSpec extends Vec {
	x0: number;
	x1: number;
}

export type SegmentName = "nuts" | "drones" | "gap" | "dog" | "presses";

export type PickupKind = "nut" | "bolt" | "gear" | "cell" | "life";

export type Theme = "zlomowisko" | "stocznia";

interface Pickup extends Vec {
	kind: PickupKind;
}

export interface Level {
	rows: string[];
	widthTiles: number;
	spawn: Vec;
	pickups: Pickup[];
	drones: DroneSpec[];
	chargers: Vec[];
	scraps: Vec[];
	dogs: Vec[];
	presses: Vec[];
	gates: Vec[];
	segments: SegmentName[];
	/** Press cycle multiplier: 1 at the start, shorter as levels harden. */
	tempo: number;
	theme: Theme;
}

const SEGMENTS: Record<SegmentName, string[]> = {
	nuts: [
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"........................o...................................",
		".......................===.............o.o.o................",
		"...............b.b....................=====.................",
		"..............====...........z..................o...b...o...",
		"...........................=====...............=========....",
		"......o.o...................................................",
		"......====..................................................",
		"............................................................",
		"....P.............................................###.......",
		"############################################################",
		"############################################################",
	],
	drones: [
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................z...............................",
		".........................---v---............................",
		"......................=====.....=====.......................",
		"..............b.b..........................o.e..............",
		"...........---v-----..............-----v----................",
		"..............................................o.o.o.........",
		"...........................................---v---..........",
		"....o...............................................=====...",
		"...===...................................................c..",
		"..............---v---...###......---v---................===.",
		"############################################################",
		"############################################################",
	],
	gap: [
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		".......................b.b.....................o.z.o........",
		"............................................................",
		"....e.......................................................",
		"...===......................................................",
		"####################........##################.........#####",
		"####################........##################.........#####",
	],
	dog: [
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		".................................b.z.b......................",
		"................................=======.....................",
		"....o.o.....................................................",
		"...=====............................................s.......",
		"..........s...s.........w.................#.....w.........#.",
		"############################################################",
		"############################################################",
	],
	presses: [
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"........=================================...................",
		"..........^......^......^......^......^....................#",
		"...........................................................#",
		"...........................................................#",
		".............o......z......e......o.............c..........#",
		"...................................................=====g..#",
		"############################################################",
		"############################################################",
	],
};

const PICKUP_CHARS: Record<string, PickupKind | undefined> = {
	o: "nut",
	b: "bolt",
	z: "gear",
	e: "cell",
	l: "life",
};

function trackSpan(row: string, x: number): [number, number] {
	const onTrack = (i: number) => row[i] === "-" || row[i] === "v";
	let x0 = x;
	let x1 = x;
	while (onTrack(x0 - 1)) x0 -= 1;
	while (onTrack(x1 + 1)) x1 += 1;
	return [x0, x1];
}

/** Parse rows into a level. Exported for tests that need hand-made grids. */
export function levelFromRows(rows: string[], segments: SegmentName[] = []): Level {
	const pickups: Pickup[] = [];
	const drones: DroneSpec[] = [];
	const chargers: Vec[] = [];
	const scraps: Vec[] = [];
	const dogs: Vec[] = [];
	const presses: Vec[] = [];
	const gates: Vec[] = [];
	let spawn: Vec = { x: 1, y: 1 };
	const lists: Record<string, Vec[]> = {
		c: chargers,
		s: scraps,
		w: dogs,
		"^": presses,
		g: gates,
	};
	rows.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			const c = row[x] ?? ".";
			lists[c]?.push({ x, y });
			const kind = PICKUP_CHARS[c];
			if (kind) pickups.push({ x, y, kind });
			if (c === "P") spawn = { x, y };
			if (c === "v") {
				const [x0, x1] = trackSpan(row, x);
				drones.push({ x, y, x0, x1 });
			}
		}
	});
	return {
		rows,
		widthTiles: rows[0]?.length ?? 0,
		spawn,
		pickups,
		drones,
		chargers,
		scraps,
		dogs,
		presses,
		gates,
		segments,
		tempo: 1,
		theme: "zlomowisko",
	};
}

export function isSolid(level: Level, tx: number, ty: number): boolean {
	if (tx < 0 || tx >= level.widthTiles) return true;
	const c = level.rows[ty]?.[tx];
	return c === "#" || c === "=";
}

/** One screen wide, walled on both sides: where the boss is fought. */
export function buildArena(): Level {
	const width = 30;
	const rows = Array.from({ length: ROWS }, (_, y) => {
		if (y >= ROWS - 2) return "#".repeat(width);
		const inner = y === ROWS - 3 ? `...P${".".repeat(width - 6)}` : ".".repeat(width - 2);
		return `#${inner}#`;
	});
	return levelFromRows(rows, []);
}

/** Deterministic 0..1 stream from a seed (mulberry32). */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * 0 at level 1, 1 from level 100 on. Squared so the first fifty levels stay
 * gentle and the climb comes between 50 and 100.
 */
export function difficulty(n: number): number {
	const t = Math.min(1, Math.max(0, (n - 1) / 99));
	return t * t;
}

/** Extra hazards a segment gains as difficulty rises, in the order they are added. */
const HARDER: Record<SegmentName, { x: number; y: number; c: string }[]> = {
	nuts: [],
	drones: [
		{ x: 30, y: 12, c: "v" },
		{ x: 50, y: 11, c: "v" },
		{ x: 8, y: 10, c: "v" },
		{ x: 40, y: 7, c: "v" },
	],
	gap: [{ x: 28, y: 14, c: "." }],
	dog: [
		{ x: 36, y: 13, c: "w" },
		{ x: 56, y: 13, c: "w" },
		{ x: 18, y: 13, c: "w" },
	],
	presses: [
		{ x: 14, y: 9, c: "^" },
		{ x: 21, y: 9, c: "^" },
		{ x: 28, y: 9, c: "^" },
	],
};

function setChar(rows: string[], x: number, y: number, c: string): void {
	const row = rows[y];
	if (row === undefined) return;
	rows[y] = row.slice(0, x) + c + row.slice(x + 1);
}

/** A lone drone needs a track, a dog needs scrap nearby, a widened pit goes two rows deep. */
function addCompanions(rows: string[], e: { x: number; y: number; c: string }): void {
	if (e.c === "v") {
		for (let dx = -3; dx <= 3; dx++) if (dx !== 0) setChar(rows, e.x + dx, e.y, "-");
	}
	if (e.c === "w") setChar(rows, e.x - 4, e.y, "s");
	if (e.c === ".") setChar(rows, e.x, e.y + 1, ".");
}

function harden(name: SegmentName, d: number): string[] {
	const rows = [...(SEGMENTS[name] ?? [])];
	const extras = HARDER[name];
	const count = Math.round(d * extras.length);
	for (const e of extras.slice(0, count)) {
		setChar(rows, e.x, e.y, e.c);
		addCompanions(rows, e);
	}
	return rows;
}

/** Levels past the first shuffle the four teaching segments; the presses and the gate stay last. */
function segmentOrder(n: number): SegmentName[] {
	const pool: SegmentName[] = ["nuts", "drones", "gap", "dog"];
	if (n === 1) return [...pool, "presses"];
	const next = rng(n * 7919);
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		const a = pool[i];
		const b = pool[j];
		if (a !== undefined && b !== undefined) {
			pool[i] = b;
			pool[j] = a;
		}
	}
	return [...pool, "presses"];
}

/** Roughly one level in seven carries an extra life, decided by the level number alone. */
export function hasExtraLife(n: number): boolean {
	return n > 1 && rng(n * 104729)() < 0.15;
}

export function buildLevel(n: number): Level {
	const d = difficulty(n);
	const names = segmentOrder(n);
	const parts = names.map((name) => harden(name, d));
	if (hasExtraLife(n)) {
		const nuts = parts[names.indexOf("nuts")];
		if (nuts) setChar(nuts, 20, 12, "l");
	}
	const rows = Array.from({ length: ROWS }, (_, y) => parts.map((p) => p[y] ?? "").join(""));
	const level = levelFromRows(rows, names);
	level.tempo = 1 - 0.45 * d;
	level.theme = n % 2 === 0 ? "stocznia" : "zlomowisko";
	return level;
}
