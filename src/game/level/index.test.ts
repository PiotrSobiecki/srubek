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

	it("gets harder monotonically up to level 100 and stays flat after", () => {
		let last = -1;
		for (let n = 1; n <= 100; n++) {
			const m = measure(buildLevel(n));
			expect(m).toBeGreaterThanOrEqual(last);
			last = m;
		}
		expect(measure(buildLevel(100))).toBeGreaterThan(measure(buildLevel(1)));
		expect(measure(buildLevel(140))).toBe(measure(buildLevel(100)));
		expect(difficulty(50)).toBeLessThan(0.3);
		expect(difficulty(100)).toBe(1);
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
