import { createWorld, type Input, step, type World } from "@/game/engine";
import { buildArena } from "@/game/level";
import { type Boss, coreOpen, createBoss, makeBoss } from "./index";

const IDLE: Input = { left: false, right: false, jump: false, magnet: false, throw: false };

function arena(level = 1): [World, Boss] {
	const lvl = buildArena();
	const boss = createBoss(makeBoss("prasa", "opad", "rdzen", level), lvl.widthTiles);
	return [createWorld(lvl, boss), boss];
}

function run(world: World, frames: number, input = IDLE) {
	const events = [];
	for (let i = 0; i < frames; i++) events.push(...step(world, input));
	return events;
}

/** Park Śrubek on top of the press head, falling, as a stomp would. */
function stomp(world: World, boss: Boss): void {
	world.player.x = boss.x + boss.w / 2 - world.player.w / 2;
	world.player.y = boss.y - world.player.h - 2;
	world.player.vy = 3;
	world.player.sy = 0;
	world.player.hurtLeft = 0;
}

describe("prasa-olbrzym", () => {
	it("cycles track, drop, slam, rise and bares the core only after the slam", () => {
		const [world, boss] = arena();
		world.player.x = 40;
		const phases = new Set<string>();
		let openFrames = 0;
		let slammed = false;
		for (let i = 0; i < 600; i++) {
			const events = step(world, IDLE);
			phases.add(boss.phase);
			if (coreOpen(boss)) openFrames += 1;
			if (events.some((e) => e.type === "slam")) slammed = true;
		}
		expect([...phases].sort()).toEqual(["drop", "rise", "slam", "track"]);
		expect(slammed).toBe(true);
		expect(openFrames).toBeGreaterThan(0);
	});

	it("follows Śrubek while hovering", () => {
		const [world, boss] = arena();
		world.player.x = 400;
		const before = boss.x;
		run(world, 20);
		expect(boss.x).toBeGreaterThan(before);
	});

	it("takes a stomp only while the core is bare", () => {
		const [world, boss] = arena();
		// Hovering: a stomp does nothing.
		stomp(world, boss);
		expect(run(world, 3).some((e) => e.type === "bossHit")).toBe(false);
		expect(boss.hp).toBe(boss.spec.hp);
		// Slammed: the same stomp lands.
		boss.phase = "slam";
		boss.y = boss.floorY;
		boss.timer = boss.spec.openFrames;
		stomp(world, boss);
		expect(run(world, 3).some((e) => e.type === "bossHit")).toBe(true);
		expect(boss.hp).toBe(boss.spec.hp - 1);
		expect(boss.phase).toBe("rise");
	});

	it("falls after hp stomps and reports it once", () => {
		const [world, boss] = arena();
		const events = [];
		for (let i = 0; i < boss.spec.hp; i++) {
			boss.phase = "slam";
			boss.y = boss.floorY;
			boss.timer = boss.spec.openFrames;
			stomp(world, boss);
			events.push(...run(world, 3));
		}
		expect(events.filter((e) => e.type === "bossHit")).toHaveLength(boss.spec.hp - 1);
		expect(events.filter((e) => e.type === "bossDown")).toHaveLength(1);
		expect(boss.alive).toBe(false);
		expect(run(world, 60)).toEqual([]);
	});

	it("hurts Śrubek caught under the drop", () => {
		const [world, boss] = arena();
		boss.phase = "drop";
		boss.y = boss.floorY - 20;
		world.player.x = boss.x + 10;
		world.player.y = boss.floorY + boss.h - world.player.h;
		expect(run(world, 10).some((e) => e.type === "hit")).toBe(true);
	});

	it("scales with the level number without breaking the rhythm", () => {
		const a = makeBoss("prasa", "opad", "rdzen", 1);
		const b = makeBoss("prasa", "opad", "rdzen", 60);
		expect(b.hp).toBeGreaterThan(a.hp);
		expect(b.dropSpeed).toBeGreaterThan(a.dropSpeed);
		expect(b.waitFrames).toBeLessThan(a.waitFrames);
		expect(b.openFrames).toBeGreaterThanOrEqual(40);
	});
});
