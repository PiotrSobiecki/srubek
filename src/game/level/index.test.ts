import { buildLevel, isSolid, levelFromRows, ROWS } from "./index";

describe("buildLevel(1)", () => {
	const level = buildLevel(1);

	it("is the first segment only, with nuts to collect", () => {
		expect(level.segments).toEqual(["nuts"]);
		expect(level.nuts.length).toBeGreaterThan(5);
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
