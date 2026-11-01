/**
 * Level layout. A level is a row-major grid of tile characters built by joining
 * named segments side by side. Nothing here knows about physics or drawing.
 *
 *   `#` scrap ground   `=` metal platform   `P` spawn   `.` air
 *   pickups: `o` nut   `b` bolt   `z` gear   `e` energy cell   `l` extra life
 *   `v` drone, patrolling the run of `-` it sits in   `c` charger
 *   `s` scrap the magnet can throw   `w` dog-machine walking its platform
 *   `^` press resting under a ceiling, dropping to the floor below   `g` factory gate
 *   `k` spikes   `j` spring   `t` trapdoor   `m` moving platform on its run of `_`
 */

import { proceduralSegment, rng } from "./chunks";

export const TILE = 16;
export const ROWS = 16;

export interface Vec {
	x: number;
	y: number;
}

/** A drone or moving platform and the tile span it travels, inclusive. */
interface DroneSpec extends Vec {
	x0: number;
	x1: number;
}

/** Hand-made segments; `losowy` is a strip built by the chunk generator. */
type HandMade = "nuts" | "drones" | "gap" | "dog" | "towers" | "bridge" | "presses";
export type SegmentName = HandMade | "losowy";

export type PickupKind = "nut" | "bolt" | "gear" | "cell" | "life";

export type Theme = "zlomowisko" | "stocznia" | "fabryka";

const THEMES: readonly Theme[] = ["zlomowisko", "stocznia", "fabryka"];

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
	spikes: Vec[];
	springs: Vec[];
	traps: Vec[];
	movers: DroneSpec[];
	segments: SegmentName[];
	/** Press cycle multiplier: 1 at the start, shorter as levels harden. */
	tempo: number;
	/** Skyline, decor and ground family. */
	theme: Theme;
	/** 0..1 pick of the sky palette. */
	sky: number;
	/** Degrees the skyline's colours are turned on the colour wheel. */
	hue: number;
}

const SEGMENTS: Record<HandMade, string[]> = {
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
	towers: [
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"..........................................o.................",
		".....................=====..............====................",
		"...............o.........................................b..",
		"............=====...............b.b....................====.",
		"..................................====......................",
		".......o.o.................................z................",
		".....=====..............-----v-----......=====..............",
		"............................................................",
		"...........---v---.............s............w...............",
		"############################################################",
		"############################################################",
	],
	bridge: [
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"............................................................",
		"..............o...o...o...o...o.............................",
		"............===========================.....................",
		"............................................................",
		".........b..........................................b.......",
		"...........................................s....w...........",
		"########........######....###########.....##################",
		"########........######....###########.....##################",
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

function trackSpan(row: string, x: number, marks = "-v"): [number, number] {
	const onTrack = (i: number) => marks.includes(row[i] ?? "#");
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
	const spikes: Vec[] = [];
	const springs: Vec[] = [];
	const traps: Vec[] = [];
	const movers: DroneSpec[] = [];
	let spawn: Vec = { x: 1, y: 1 };
	const lists: Record<string, Vec[]> = {
		c: chargers,
		s: scraps,
		w: dogs,
		"^": presses,
		g: gates,
		k: spikes,
		j: springs,
		t: traps,
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
			if (c === "m") {
				const [x0, x1] = trackSpan(row, x, "_m");
				movers.push({ x, y, x0, x1 });
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
		spikes,
		springs,
		traps,
		movers,
		segments,
		tempo: 1,
		theme: "zlomowisko",
		sky: 0,
		hue: 0,
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

/**
 * 0 at level 1, 1 from level 100 on. Squared so the first fifty levels stay
 * gentle and the climb comes between 50 and 100.
 */
export function difficulty(n: number): number {
	const t = Math.min(1, Math.max(0, (n - 1) / 99));
	return t * t;
}

/** Extra hazards a segment gains as difficulty rises, in the order they are added. */
const HARDER: Record<HandMade, { x: number; y: number; c: string }[]> = {
	nuts: [],
	towers: [
		{ x: 50, y: 13, c: "v" },
		{ x: 30, y: 9, c: "v" },
	],
	bridge: [
		{ x: 20, y: 9, c: "v" },
		{ x: 56, y: 13, c: "w" },
	],
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

function harden(name: HandMade, d: number): string[] {
	const rows = [...(SEGMENTS[name] ?? [])];
	const extras = HARDER[name];
	const count = Math.round(d * extras.length);
	for (const e of extras.slice(0, count)) {
		setChar(rows, e.x, e.y, e.c);
		addCompanions(rows, e);
	}
	return rows;
}

function shuffle<T>(items: T[], next: () => number): void {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		const a = items[i];
		const b = items[j];
		if (a !== undefined && b !== undefined) {
			items[i] = b;
			items[j] = a;
		}
	}
}

/**
 * Level 1 opens on the nuts, then the drones, the gap and the dog in a
 * run-seeded order, never mirrored so scrap still lies before the dog. Later
 * levels draw two of the six open hand-made segments and two generated strips,
 * shuffled and each possibly mirrored. The presses and the gate stay last.
 */
function segmentOrder(n: number, seed: number): { names: SegmentName[]; mirrored: boolean[] } {
	const teach: HandMade[] = ["drones", "gap", "dog"];
	const next = rng(n * 7919 + seed);
	if (n === 1) {
		shuffle(teach, next);
		const names: SegmentName[] = ["nuts", ...teach, "presses"];
		return { names, mirrored: names.map(() => false) };
	}
	const pool: HandMade[] = ["nuts", ...teach, "towers", "bridge"];
	shuffle(pool, next);
	const open: SegmentName[] = [...pool.slice(0, 2), "losowy", "losowy"];
	shuffle(open, next);
	const names: SegmentName[] = [...open, "presses"];
	const mirrored = names.map((name) => name !== "presses" && next() < 0.5);
	return { names, mirrored };
}

/** Puts the extra life over the first open patch of floor it finds. */
function placeLife(rows: string[]): void {
	for (let x = 12; x < 50; x++) {
		const clear = rows[12]?.[x] === "." && rows[13]?.[x] === ".";
		if (clear && rows[14]?.[x] === "#") {
			setChar(rows, x, 12, "l");
			return;
		}
	}
}

function mirror(rows: string[]): string[] {
	return rows.map((row) => [...row].reverse().join(""));
}

/** Roughly one level in seven carries an extra life, decided by the level number and run seed. */
export function hasExtraLife(n: number, seed = 0): boolean {
	return n > 1 && rng(n * 104729 + seed)() < 0.15;
}

/**
 * Level n of the run started with `seed`: the layout and look change from run
 * to run, the difficulty depends on n alone. One seed always gives the same
 * level, so the score check on the server can rebuild it.
 */
export function buildLevel(n: number, seed = 0): Level {
	const d = difficulty(n);
	const { names, mirrored } = segmentOrder(n, seed);
	const parts = names.map((name, i) => {
		const rows =
			name === "losowy" ? proceduralSegment(n * 1009 + i * 97 + seed, d) : harden(name, d);
		return mirrored[i] ? mirror(rows) : rows;
	});
	if (hasExtraLife(n, seed)) {
		const first = parts[0];
		if (first) placeLife(first);
	}
	const rows = Array.from({ length: ROWS }, (_, y) => parts.map((p) => p[y] ?? "").join(""));
	const level = levelFromRows(rows, names);
	// Every run starts at the left edge, whatever segment landed there.
	if (n > 1) level.spawn = { x: 1, y: 12 };
	level.tempo = 1 - 0.45 * d;
	const look = rng(n * 6151 + seed);
	level.theme = THEMES[Math.floor(look() * THEMES.length)] ?? "zlomowisko";
	level.sky = look();
	level.hue = Math.floor(look() * 360);
	return level;
}
