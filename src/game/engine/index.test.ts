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
