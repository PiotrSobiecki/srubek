import { buildLevel, isSolid, levelFromRows, ROWS } from "./index";

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
