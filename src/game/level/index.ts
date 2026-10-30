/**
 * Level layout. A level is a row-major grid of tile characters built by joining
 * named segments side by side. Nothing here knows about physics or drawing.
 *
 *   `#` scrap ground   `=` metal platform   `o` nut   `P` spawn   `.` air
 */

export const TILE = 16;
export const ROWS = 16;

export interface Vec {
	x: number;
	y: number;
}

export type SegmentName = "nuts";

export interface Level {
	rows: string[];
	widthTiles: number;
	spawn: Vec;
	nuts: Vec[];
	segments: SegmentName[];
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
		"...............o.o....................=====.................",
		"..............====...........o..................o...o...o...",
		"...........................=====...............=========....",
		"......o.o...................................................",
		"......====..................................................",
		"...........................................................#",
		"....P.............................................###......#",
		"############################################################",
		"############################################################",
	],
};

/** Parse rows into a level. Exported for tests that need hand-made grids. */
export function levelFromRows(rows: string[], segments: SegmentName[] = []): Level {
	const nuts: Vec[] = [];
	let spawn: Vec = { x: 1, y: 1 };
	rows.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			const c = row[x];
			if (c === "o") nuts.push({ x, y });
			if (c === "P") spawn = { x, y };
		}
	});
	return { rows, widthTiles: rows[0]?.length ?? 0, spawn, nuts, segments };
}

export function isSolid(level: Level, tx: number, ty: number): boolean {
	if (tx < 0 || tx >= level.widthTiles) return true;
	const c = level.rows[ty]?.[tx];
	return c === "#" || c === "=";
}

export function buildLevel(n: number): Level {
	// shortcut: only level 1 exists, generator arrives in phase 10
	if (n !== 1) return buildLevel(1);
	const names: SegmentName[] = ["nuts"];
	const rows = Array.from({ length: ROWS }, (_, y) =>
		names.map((name) => SEGMENTS[name][y] ?? "").join(""),
	);
	return levelFromRows(rows, names);
}
