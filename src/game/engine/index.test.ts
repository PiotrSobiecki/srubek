import { buildLevel, levelFromRows, ROWS, TILE } from "@/game/level";
import { carriedScrap, createWorld, type Input, SCRAP_CAPACITY, step, type World } from "./index";

const IDLE: Input = {
	left: false,
	right: false,
	jump: false,
	magnet: false,
	throw: false,
	mega: false,
	attack: false,
};

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
		let sparkled = false;
		for (let i = 0; i < 300; i++) {
			events.push(...step(world, { ...IDLE, right: true }));
			sparkled ||= world.effects.some((e) => e.kind === "spark");
		}
		expect(events).toEqual([{ type: "pickup", kind: "nut" }]);
		expect(world.pickups.every((n) => n.taken)).toBe(true);
		expect(sparkled).toBe(true);
		expect(world.effects).toEqual([]);
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
		expect(world.effects.some((e) => e.kind === "burst")).toBe(true);
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

describe("air jump", () => {
	function reach(world: World, press: number[]): number {
		settle(world);
		const start = world.player.x;
		let airborne = false;
		for (let i = 0; i < 300; i++) {
			const jump = press.some((at) => i >= at && i < at + 30);
			step(world, { ...IDLE, right: true, jump });
			if (!world.player.onGround) airborne = true;
			else if (airborne) break;
		}
		return world.player.x - start;
	}

	it("is granted once per flight and refilled on landing", () => {
		const world = createWorld(FLAT);
		settle(world);
		step(world, { ...IDLE, jump: true });
		run(world, IDLE, 5);
		const before = world.player.vy;
		step(world, { ...IDLE, jump: true });
		expect(world.player.vy).toBeLessThan(before);
		run(world, IDLE, 5);
		const again = world.player.vy;
		step(world, { ...IDLE, jump: true });
		expect(world.player.vy).toBeGreaterThan(again);
		run(world, IDLE, 120);
		expect(world.player.onGround).toBe(true);
		expect(world.player.airJumps).toBe(1);
	});

	it("is what crosses the gap in level 1", () => {
		const level = buildLevel(1);
		const bottom = level.rows[ROWS - 1] ?? "";
		const gaps = bottom.split("#").filter((s) => s.length > 0);
		expect(gaps.length).toBeGreaterThan(0);
		const widest = Math.max(...gaps.map((g) => g.length)) * TILE;
		const single = reach(createWorld(FLAT), [0]);
		const double = reach(createWorld(FLAT), [0, 36]);
		expect(single).toBeLessThan(widest - 12);
		expect(double).toBeGreaterThan(widest + 4);
	});

	it("falling out of the level reports a fall", () => {
		const world = createWorld(FLAT);
		world.level = levelFromRows(["P...", "...."]);
		const events = [];
		for (let i = 0; i < 120; i++) events.push(...step(world, IDLE));
		expect(events).toContainEqual({ type: "fall" });
	});
});

describe("magnet and dog-machine", () => {
	// Scrap next to Śrubek, dog 10 tiles right, another scrap far away.
	const YARD = levelFromRows([
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"..P.s.......w.....s.",
		"####################",
	]);
	const MAGNET: Input = { ...IDLE, magnet: true };

	function tap(world: World, input: Input): void {
		step(world, input);
		step(world, IDLE);
	}

	const THROW: Input = { ...IDLE, throw: true };

	it("pulls the nearest scrap in range and leaves the far one alone", () => {
		const world = createWorld(YARD);
		settle(world);
		tap(world, MAGNET);
		const states = world.scraps.map((s) => s.state);
		expect(states).toEqual(["held", "ground"]);
		const held = world.scraps[0];
		if (!held) throw new Error("no scrap");
		expect(held.y).toBeLessThan(world.player.y);
	});

	it("does nothing when no scrap is in range", () => {
		const world = createWorld(YARD);
		world.scraps[0]?.state === "ground" && world.scraps.shift();
		settle(world);
		tap(world, MAGNET);
		expect(world.scraps.every((s) => s.state === "ground")).toBe(true);
	});

	it("throws the held scrap into the dog, which dies for points; the piece shatters", () => {
		const world = createWorld(YARD);
		settle(world);
		tap(world, MAGNET);
		const events = [];
		tap(world, THROW);
		for (let i = 0; i < 90; i++) events.push(...step(world, IDLE));
		expect(events).toContainEqual({ type: "dog" });
		expect(world.dogs[0]?.alive).toBe(false);
		expect(world.scraps[0]?.state).toBe("gone");
	});

	it("hurts Śrubek when stomped instead of dying, and walks its platform", () => {
		const world = createWorld(YARD);
		const dog = world.dogs[0];
		if (!dog) throw new Error("no dog");
		settle(world);
		const startX = dog.x;
		run(world, IDLE, 60);
		expect(dog.x).not.toBe(startX);
		expect(dog.alive).toBe(true);
		world.player.x = Math.round(dog.x) + 2;
		world.player.y = dog.y - world.player.h - 2;
		world.player.vy = 2;
		const events = [];
		for (let i = 0; i < 10; i++) events.push(...step(world, IDLE));
		expect(events).toContainEqual({ type: "hit" });
		expect(dog.alive).toBe(true);
	});

	it("carries at most SCRAP_CAPACITY pieces and throws them one at a time", () => {
		const row = `..P${"s".repeat(14)}...`;
		const world = createWorld(levelFromRows([".".repeat(20), row, "#".repeat(20)]));
		settle(world);
		// Roll along the row, pressing the magnet every few frames.
		for (let i = 0; i < 240; i++) step(world, { ...IDLE, right: true, magnet: i % 8 === 0 });
		const held = () => world.scraps.filter((s) => s.state === "held").length;
		expect(held()).toBe(SCRAP_CAPACITY);
		expect(world.scraps.filter((s) => s.state === "ground").length).toBeGreaterThan(0);
		tap(world, THROW);
		expect(held()).toBe(SCRAP_CAPACITY - 1);
	});

	it("level 1 puts scrap in front of every dog", () => {
		const level = buildLevel(1);
		expect(level.dogs.length).toBeGreaterThanOrEqual(1);
		for (const dog of level.dogs) {
			expect(level.scraps.some((s) => s.x < dog.x && dog.x - s.x < 40)).toBe(true);
		}
	});
});

describe("presses and the gate", () => {
	const HALL = levelFromRows([
		"....................",
		"....................",
		"....====............",
		"....^...............",
		"....................",
		"....................",
		"..P..............g..",
		"####################",
	]);

	it("drop on a fixed cycle and come back up", () => {
		const world = createWorld(HALL);
		const press = world.presses[0];
		if (!press) throw new Error("no press");
		expect(press.floorY).toBe(6 * TILE);
		const phases = new Set<string>();
		let bottomAt = -1;
		for (let i = 0; i < 400; i++) {
			step(world, IDLE);
			phases.add(press.phase);
			if (press.y === press.floorY && bottomAt < 0) bottomAt = i;
		}
		expect([...phases].sort()).toEqual(["drop", "hold", "rise", "wait"]);
		expect(bottomAt).toBeGreaterThan(0);
		expect(press.y).toBeGreaterThanOrEqual(press.topY);
	});

	it("hurt only while dropping", () => {
		const world = createWorld(HALL);
		const press = world.presses[0];
		if (!press) throw new Error("no press");
		settle(world);
		world.player.x = press.x + 2;
		const hits = (frames: number) => {
			const events = [];
			for (let i = 0; i < frames; i++) events.push(...step(world, IDLE));
			return events.filter((e) => e.type === "hit").length;
		};
		// Resting at the top: nothing.
		expect(hits(10)).toBe(0);
		// Through one full drop: exactly one hit (then the grace period).
		expect(hits(120)).toBe(1);
		// Parked at the bottom on top of Śrubek, then rising: still nothing new.
		world.player.hurtLeft = 0;
		press.phase = "hold";
		press.y = press.floorY;
		press.timer = 30;
		expect(hits(30)).toBe(0);
	});

	it("the gate reports once Śrubek touches it", () => {
		const world = createWorld(HALL);
		const events = [];
		for (let i = 0; i < 400; i++) events.push(...step(world, { ...IDLE, right: true }));
		expect(events).toContainEqual({ type: "gate" });
	});
});

describe("feedback for the player", () => {
	it("reports jumps, air jumps and magnet presses as events", () => {
		const world = createWorld(FLAT);
		settle(world);
		expect(step(world, { ...IDLE, jump: true })).toContainEqual({ type: "jump" });
		run(world, IDLE, 4);
		expect(step(world, { ...IDLE, jump: true })).toContainEqual({ type: "airjump" });
		run(world, IDLE, 120);
		step(world, { ...IDLE, magnet: true });
		expect(world.effects.some((e) => e.kind === "magnet")).toBe(true);
	});

	it("kicks up dust only while rolling fast on the ground", () => {
		const world = createWorld(FLAT);
		settle(world);
		run(world, IDLE, 30);
		expect(world.effects.some((e) => e.kind === "dust")).toBe(false);
		run(world, { ...IDLE, right: true }, 40);
		expect(world.effects.some((e) => e.kind === "dust")).toBe(true);
	});
});

describe("press tempo", () => {
	it("drops sooner when the level's tempo is shorter", () => {
		const firstDrop = (tempo: number): number => {
			const level = levelFromRows([
				"....====....",
				"....^.......",
				"............",
				"..P.........",
				"############",
			]);
			level.tempo = tempo;
			const world = createWorld(level);
			for (let i = 0; i < 400; i++) {
				step(world, IDLE);
				if (world.presses[0]?.phase === "drop") return i;
			}
			return 400;
		};
		expect(firstDrop(0.5)).toBeLessThan(firstDrop(1));
	});
});

describe("carried pouch and the mega ball", () => {
	it("starts a new world with the carried pieces already in the pouch", () => {
		const world = createWorld(FLAT, undefined, 4);
		expect(world.scraps.filter((s) => s.state === "held")).toHaveLength(4);
		expect(carriedScrap(world)).toBe(4);
	});

	it("fires a mega ball only from stock, and it mows down a drone in its path", () => {
		const world = createWorld(
			levelFromRows([
				"....................",
				"....................",
				"....................",
				"....................",
				"....................",
				"....................",
				"..P....---v---......",
				"####################",
			]),
		);
		settle(world);
		expect(step(world, { ...IDLE, mega: true })).not.toContainEqual({ type: "megaFired" });
		step(world, IDLE);
		world.megaBalls = 1;
		expect(step(world, { ...IDLE, mega: true })).toContainEqual({ type: "megaFired" });
		expect(world.megaBalls).toBe(0);
		const events: ReturnType<typeof step> = [];
		for (let i = 0; i < 60; i++) events.push(...step(world, IDLE));
		expect(events).toContainEqual({ type: "drone" });
		expect(world.megas).toHaveLength(0);
	});
});

describe("obstacles", () => {
	const COURSE = levelFromRows([
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....m____...........",
		"..P......k..j.......",
		"####...######tt#####",
		"####...######..#####",
	]);

	it("spikes hurt on touch", () => {
		const world = createWorld(COURSE);
		world.player.x = 9 * TILE + 2;
		world.player.y = 14 * TILE - world.player.h;
		expect(step(world, IDLE)).toContainEqual({ type: "hit" });
	});

	it("a spring throws Śrubek far higher than a jump", () => {
		const world = createWorld(COURSE);
		world.player.x = 12 * TILE + 2;
		world.player.y = 14 * TILE - world.player.h - 2;
		world.player.vy = 1;
		const ground = 14 * TILE - world.player.h;
		let top = ground;
		const events = [];
		for (let i = 0; i < 80; i++) {
			events.push(...step(world, IDLE));
			top = Math.min(top, world.player.y);
		}
		expect(events).toContainEqual({ type: "spring" });
		expect(ground - top).toBeGreaterThan(5 * TILE);
	});

	it("a moving platform travels its track and carries a rider", () => {
		const world = createWorld(COURSE);
		const pl = world.platforms.find((p) => p.kind === "mover");
		if (!pl) throw new Error("no mover");
		const xs = new Set<number>();
		const p = world.player;
		p.x = pl.x + 10;
		p.y = pl.y - p.h - 1;
		p.vy = 1;
		const start = p.x;
		for (let i = 0; i < 20; i++) {
			step(world, IDLE);
			xs.add(pl.x);
		}
		expect(xs.size).toBeGreaterThan(5);
		expect(p.onGround).toBe(true);
		expect(p.y + p.h).toBe(pl.y);
		expect(p.x).not.toBe(start);
		expect(pl.x).toBeGreaterThanOrEqual(pl.minX);
		expect(pl.x).toBeLessThanOrEqual(pl.maxX);
	});

	it("a trapdoor holds a walker but gives way under one who stands still, then shuts", () => {
		const world = createWorld(COURSE);
		const traps = world.platforms.filter((p) => p.kind === "trap");
		expect(traps).toHaveLength(2);
		const trap = traps[0];
		if (!trap) throw new Error("no trap");
		const p = world.player;
		p.x = trap.x + 2;
		p.y = trap.y - p.h;
		for (let i = 0; i < 10; i++) step(world, IDLE);
		expect(p.onGround).toBe(true);
		for (let i = 0; i < 30; i++) step(world, IDLE);
		expect(trap.openLeft).toBeGreaterThan(0);
		expect(p.y + p.h).toBeGreaterThan(trap.y + 8);
		for (let i = 0; i < 150; i++) step(world, IDLE);
		expect(trap.openLeft).toBe(0);
	});
});

describe("melee swing", () => {
	const RANGE = levelFromRows([
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"....................",
		"..P.w...............",
		"####################",
	]);
	const SWING: Input = { ...IDLE, attack: true };

	it("destroys a dog within reach, once per press", () => {
		const world = createWorld(RANGE);
		world.meleeReach = 24;
		settle(world);
		const dog = world.dogs[0];
		if (!dog) throw new Error("no dog");
		dog.x = world.player.x + world.player.w + 6;
		const events = [...step(world, SWING)];
		for (let i = 0; i < 20; i++) events.push(...step(world, SWING));
		expect(events.filter((e) => e.type === "swing")).toHaveLength(1);
		expect(events).toContainEqual({ type: "dog" });
		expect(dog.alive).toBe(false);
	});

	it("misses what is beyond the item's reach", () => {
		const world = createWorld(RANGE);
		world.meleeReach = 10;
		settle(world);
		const dog = world.dogs[0];
		if (!dog) throw new Error("no dog");
		dog.x = world.player.x + world.player.w + 30;
		step(world, SWING);
		run(world, IDLE, 20);
		expect(dog.alive).toBe(true);
	});
});
