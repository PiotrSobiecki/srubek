import { MAX_GAP, MAX_SPIKES, MAX_STEP, proceduralSegment, STRIP } from "./chunks";
import {
	buildLevel,
	difficulty,
	hasExtraLife,
	isSolid,
	type Level,
	levelFromRows,
	ROWS,
} from "./index";

describe("buildLevel(1)", () => {
	const level = buildLevel(1);

	it("joins the five segments of level 1", () => {
		expect(level.segments).toEqual(["nuts", "drones", "gap", "dog", "presses"]);
		expect(level.presses.length).toBeGreaterThanOrEqual(3);
		expect(level.gates).toHaveLength(1);
		expect(level.chargers.length).toBe(2);
		const kinds = new Set(level.pickups.map((p) => p.kind));
		expect([...kinds].sort()).toEqual(["bolt", "cell", "gear", "nut"]);
		expect(level.pickups.length).toBeGreaterThan(20);
		expect(level.drones.length).toBeGreaterThanOrEqual(3);
	});

	it("gives every drone a track wider than itself", () => {
		for (const d of level.drones) {
			expect(d.x0).toBeLessThan(d.x1);
			expect(d.x).toBeGreaterThanOrEqual(d.x0);
			expect(d.x).toBeLessThanOrEqual(d.x1);
		}
	});

	it("has a rectangular grid of ROWS rows", () => {
		expect(level.rows).toHaveLength(ROWS);
		for (const row of level.rows) expect(row).toHaveLength(level.widthTiles);
	});

	it("spawns on solid ground", () => {
		expect(isSolid(level, level.spawn.x, level.spawn.y)).toBe(false);
		expect(isSolid(level, level.spawn.x, level.spawn.y + 1)).toBe(true);
	});
});

describe("levelFromRows", () => {
	it("treats the outside of the grid as walls, except below", () => {
		const level = levelFromRows(["P.", "##"]);
		expect(isSolid(level, -1, 0)).toBe(true);
		expect(isSolid(level, 2, 0)).toBe(true);
		expect(isSolid(level, 0, 5)).toBe(false);
	});
});

/** How hard a level is, as the generator sees it: more hazards, faster presses, wider pits. */
function measure(level: Level): number {
	const bottom = level.rows[ROWS - 1] ?? "";
	const widest = Math.max(0, ...bottom.split("#").map((g) => g.length));
	return (
		level.drones.length +
		level.dogs.length * 2 +
		level.presses.length +
		widest +
		(1 - level.tempo) * 10
	);
}

describe("generator", () => {
	it("is deterministic per level number and shuffles later levels", () => {
		expect(buildLevel(7).rows).toEqual(buildLevel(7).rows);
		const orders = new Set([2, 3, 4, 5, 6, 7, 8].map((n) => buildLevel(n).segments.join(",")));
		expect(orders.size).toBeGreaterThan(1);
		for (const n of [2, 3, 4]) expect(buildLevel(n).segments.at(-1)).toBe("presses");
	});

	it("builds a hundred levels that all end at a gate", () => {
		for (let n = 1; n <= 100; n++) {
			const level = buildLevel(n);
			expect(level.gates).toHaveLength(1);
			expect(level.rows).toHaveLength(ROWS);
		}
	});

	it("gets harder up to level 100 and stays flat after", () => {
		// Segments vary per level, so compare windows rather than neighbours.
		const window = (from: number) => {
			let sum = 0;
			for (let n = from; n < from + 10; n++) sum += measure(buildLevel(n));
			return sum;
		};
		expect(window(1)).toBeLessThan(window(45));
		expect(window(45)).toBeLessThan(window(90));
		let lastTempo = 2;
		for (let n = 1; n <= 100; n++) {
			const t = buildLevel(n).tempo;
			expect(t).toBeLessThanOrEqual(lastTempo);
			lastTempo = t;
		}
		expect(buildLevel(140).tempo).toBe(buildLevel(100).tempo);
		expect(difficulty(50)).toBeLessThan(0.3);
		expect(difficulty(100)).toBe(1);
	});

	it("varies the segment set and mirrors some, and always starts at the left edge on solid-ish ground", () => {
		const sets = new Set<string>();
		for (let n = 2; n <= 40; n++) {
			const level = buildLevel(n);
			sets.add(level.segments.join(","));
			expect(level.spawn.x).toBe(1);
			expect(isSolid(level, 1, 12)).toBe(false);
			// Something solid within four rows below the spawn.
			expect([13, 14, 15].some((y) => isSolid(level, 1, y))).toBe(true);
		}
		expect(sets.size).toBeGreaterThan(8);
		const usesNew = [...Array(40).keys()].some((i) => {
			const s = buildLevel(i + 2).segments;
			return s.includes("towers") || s.includes("bridge");
		});
		expect(usesNew).toBe(true);
	});

	it("drops an extra life in roughly one level in seven", () => {
		let withLife = 0;
		for (let n = 2; n <= 1001; n++) if (hasExtraLife(n)) withLife += 1;
		expect(withLife).toBeGreaterThan(80);
		expect(withLife).toBeLessThan(230);
		expect(hasExtraLife(1)).toBe(false);
		const n = [...Array(60).keys()].map((i) => i + 2).find((i) => hasExtraLife(i));
		if (n) expect(buildLevel(n).pickups.some((p) => p.kind === "life")).toBe(true);
	});
});

describe("chunk generator", () => {
	/** Top of the ground in a column, or undefined over a pit. */
	function groundTop(rows: string[], x: number): number | undefined {
		for (let y = 9; y < ROWS; y++) if (rows[y]?.[x] === "#") return y;
		return undefined;
	}

	const cases: [number, number][] = [];
	for (let seed = 1; seed <= 300; seed++) cases.push([seed, (seed % 3) / 2]);

	function expectEnds(rows: string[]): void {
		for (const x of [0, 1, 2, STRIP - 3, STRIP - 2, STRIP - 1]) {
			expect(groundTop(rows, x)).toBe(14);
			expect(rows[13]?.[x]).toBe(".");
		}
	}

	function expectSteps(rows: string[]): void {
		for (let x = 1; x < STRIP; x++) {
			const a = groundTop(rows, x - 1);
			const b = groundTop(rows, x);
			if (a === undefined || b === undefined) continue;
			expect(Math.abs(a - b)).toBeLessThanOrEqual(MAX_STEP);
		}
	}

	function expectHazardsGrounded(rows: string[]): void {
		for (const run of (rows[13] ?? "").match(/k+/g) ?? []) {
			expect(run.length).toBeLessThanOrEqual(MAX_SPIKES);
		}
		for (let x = 0; x < STRIP; x++) {
			const c = rows[13]?.[x];
			if (c === "k" || c === "j") expect(rows[14]?.[x]).toBe("#");
		}
	}

	it.each(cases)("strip %i at difficulty %f keeps the passability rules", (seed, d) => {
		const rows = proceduralSegment(seed, d);
		expect(rows).toHaveLength(ROWS);
		for (const row of rows) expect(row).toHaveLength(STRIP);
		// Level floor and clear air at both ends, so strips join and mirror.
		expectEnds(rows);
		for (const pit of (rows[ROWS - 1] ?? "").split("#"))
			expect(pit.length).toBeLessThanOrEqual(MAX_GAP);
		expectSteps(rows);
		expectHazardsGrounded(rows);
	});

	it("is the same for the same seed and differs between seeds", () => {
		expect(proceduralSegment(5, 0.5)).toEqual(proceduralSegment(5, 0.5));
		const distinct = new Set([1, 2, 3, 4, 5, 6].map((s) => proceduralSegment(s, 0.5).join("")));
		expect(distinct.size).toBe(6);
	});

	it("puts every new obstacle into real levels and keeps all pits crossable", () => {
		const seen = { spikes: 0, springs: 0, traps: 0, movers: 0 };
		for (let n = 2; n <= 150; n++) {
			const level = buildLevel(n);
			seen.spikes += level.spikes.length;
			seen.springs += level.springs.length;
			seen.traps += level.traps.length;
			seen.movers += level.movers.length;
			const bottom = level.rows[ROWS - 1] ?? "";
			for (const pit of bottom.split("#")) expect(pit.length).toBeLessThanOrEqual(MAX_GAP);
			expect(level.segments.filter((s) => s === "losowy")).toHaveLength(2);
		}
		for (const count of Object.values(seen)) expect(count).toBeGreaterThan(5);
	});

	it("rotates through the three themes", () => {
		expect([1, 2, 3, 4].map((n) => buildLevel(n).theme)).toEqual([
			"zlomowisko",
			"stocznia",
			"fabryka",
			"zlomowisko",
		]);
	});
});
