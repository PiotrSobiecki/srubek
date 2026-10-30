import { levelFromRows, TILE } from "@/game/level";
import { createWorld, type Input, step, type World } from "./index";

const IDLE: Input = { left: false, right: false, jump: false };

// 20 tiles wide, wall on the right edge comes from the grid border.
const FLAT = levelFromRows([
	"....................",
	"....................",
	"....................",
	"....................",
	"....................",
	"....................",
	"..P.........o.......",
	"####################",
]);

function run(world: World, input: Input, frames: number): void {
	for (let i = 0; i < frames; i++) step(world, input);
}

function settle(world: World): void {
	run(world, IDLE, 5);
}

describe("running", () => {
	it("moves right and stops at the wall", () => {
		const world = createWorld(FLAT);
		settle(world);
		const start = world.player.x;
		run(world, { ...IDLE, right: true }, 30);
		expect(world.player.x).toBeGreaterThan(start + 20);
		run(world, { ...IDLE, right: true }, 600);
		expect(world.player.x + world.player.w).toBe(FLAT.widthTiles * TILE);
		expect(world.player.vx).toBe(0);
	});

	it("slows to a stop with no input", () => {
		const world = createWorld(FLAT);
		settle(world);
		run(world, { ...IDLE, right: true }, 30);
		run(world, IDLE, 60);
		expect(world.player.vx).toBe(0);
	});
});

describe("jumping", () => {
	function apex(holdFrames: number): number {
		const world = createWorld(FLAT);
		settle(world);
		const ground = world.player.y;
		let top = ground;
		for (let i = 0; i < 90; i++) {
			step(world, { ...IDLE, jump: i < holdFrames });
			top = Math.min(top, world.player.y);
		}
		return ground - top;
	}

	it("jumps higher the longer the key is held, within 2 to 5 tiles", () => {
		const short = apex(1);
		const long = apex(30);
		expect(long).toBeGreaterThan(short + TILE / 2);
		expect(short).toBeGreaterThanOrEqual(2 * TILE);
		expect(long).toBeLessThanOrEqual(5 * TILE);
	});

	it("does not jump again while the key stays held", () => {
		const world = createWorld(FLAT);
		settle(world);
		const ground = world.player.y;
		run(world, { ...IDLE, jump: true }, 120);
		expect(world.player.y).toBe(ground);
		expect(world.player.onGround).toBe(true);
	});
});

describe("landing", () => {
	it("never sinks into the floor from any fall speed", () => {
		const world = createWorld(FLAT);
		world.player.y = 0;
		world.player.vy = 50;
		run(world, IDLE, 60);
		expect(world.player.y + world.player.h).toBe(7 * TILE);
		expect(world.player.onGround).toBe(true);
	});
});

describe("nuts", () => {
	it("are collected once and reported as events", () => {
		const world = createWorld(FLAT);
		settle(world);
		const events = [];
		for (let i = 0; i < 300; i++) events.push(...step(world, { ...IDLE, right: true }));
		expect(events).toEqual([{ type: "nut" }]);
		expect(world.nuts.every((n) => n.taken)).toBe(true);
	});
});

describe("drones", () => {
	// Drone patrols tiles 4..10 in row 5; charger at the far right.
	const DRONES = levelFromRows([
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....---v---.........",
		"....................",
		"..P.............=c..",
		"####################",
	]);

	it("patrol their track and turn at both ends", () => {
		const world = createWorld(DRONES);
		const d = world.drones[0];
		if (!d) throw new Error("no drone");
		const seen = new Set<number>();
		for (let i = 0; i < 400; i++) {
			step(world, IDLE);
			seen.add(d.dir);
			expect(d.x).toBeGreaterThanOrEqual(d.minX);
			expect(d.x).toBeLessThanOrEqual(d.maxX);
		}
		expect([...seen].sort()).toEqual([-1, 1]);
	});

	it("die when stomped from above, bouncing the player", () => {
		const world = createWorld(DRONES);
		const d = world.drones[0];
		if (!d) throw new Error("no drone");
		settle(world);
		world.player.x = Math.round(d.x);
		world.player.y = d.y - world.player.h - 4;
		world.player.vy = 2;
		world.player.sy = 0;
		const events = [];
		for (let i = 0; i < 10 && d.alive; i++) events.push(...step(world, IDLE));
		expect(events).toContainEqual({ type: "drone" });
		expect(d.alive).toBe(false);
		expect(world.player.vy).toBeLessThan(0);
	});

	it("hurt the player once on side contact, then grant a grace period", () => {
		const world = createWorld(DRONES);
		const d = world.drones[0];
		if (!d) throw new Error("no drone");
		world.player.x = Math.round(d.x) + d.w;
		world.player.y = d.y - 4;
		world.player.vy = 0;
		const first = step(world, IDLE);
		expect(first).toContainEqual({ type: "hit" });
		expect(d.alive).toBe(true);
		const later = [];
		for (let i = 0; i < 30; i++) later.push(...step(world, IDLE));
		expect(later.filter((e) => e.type === "hit")).toEqual([]);
	});

	it("report the charger every frame the player stands on it", () => {
		const world = createWorld(DRONES);
		world.player.x = 17 * TILE + 2;
		world.player.y = 7 * TILE;
		settle(world);
		expect(step(world, IDLE)).toContainEqual({ type: "charge" });
	});
});
