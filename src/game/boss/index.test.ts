import { createWorld, type Input, step, type World } from "@/game/engine";
import { buildArena } from "@/game/level";
import {
	type Boss,
	type BossAttack,
	type BossBody,
	type BossWeakSpot,
	bossKey,
	bossPool,
	coreOpen,
	createBoss,
	makeBoss,
	pickBoss,
} from "./index";

const IDLE: Input = {
	left: false,
	right: false,
	jump: false,
	magnet: false,
	throw: false,
	mega: false,
};

function arena(body: BossBody, attack: BossAttack, weak: BossWeakSpot, level = 1): [World, Boss] {
	const lvl = buildArena();
	const boss = createBoss(makeBoss(body, attack, weak, level), lvl.widthTiles);
	return [createWorld(lvl, boss), boss];
}

function run(world: World, frames: number, input = IDLE) {
	const events = [];
	for (let i = 0; i < frames; i++) events.push(...step(world, input));
	return events;
}

/** Park Śrubek on top of the boss, falling, as a stomp would. */
function stomp(world: World, boss: Boss): void {
	world.player.x = boss.x + boss.w / 2 - world.player.w / 2;
	world.player.y = boss.y - world.player.h - 2;
	world.player.vy = 3;
	world.player.sy = 0;
	world.player.hurtLeft = 0;
}

function openUp(world: World, boss: Boss): void {
	for (let i = 0; i < 1200 && !coreOpen(boss); i++) step(world, IDLE);
	expect(coreOpen(boss)).toBe(true);
}

describe("the pool", () => {
	it("holds only allowed body–attack pairs and all ten bodies", () => {
		const pool = bossPool();
		expect(pool.length).toBeGreaterThanOrEqual(19);
		expect(new Set(pool.map(([b]) => b)).size).toBe(10);
		const only: Partial<Record<BossAttack, BossBody[]>> = {
			szarza: ["pies-alfa", "waz"],
			drony: ["dron-matka", "wieza", "roj"],
			laser: ["wieza"],
			zamach: ["koparka"],
			przyciag: ["magnes"],
			pelzanie: ["waz"],
		};
		for (const [body, attack] of pool) {
			const allowed = only[attack];
			if (allowed) expect(allowed).toContain(body);
		}
	});

	it("never repeats a boss in one run until the pool is spent", () => {
		const seen: string[] = [];
		const pool = bossPool();
		for (let level = 2; level < 2 + pool.length; level++) {
			const b = pickBoss(level, seen);
			const key = bossKey(b.body, b.attack, b.weakSpot);
			expect(seen).not.toContain(key);
			seen.push(key);
		}
		expect(new Set(seen).size).toBe(pool.length);
		// Spent: a pick still comes back, from the full pool.
		expect(pickBoss(50, seen).hp).toBeGreaterThan(0);
	});

	it("gives level 1 the press and scales later picks", () => {
		expect(pickBoss(1, []).body).toBe("prasa");
		const a = makeBoss("prasa", "opad", "rdzen", 1);
		const b = makeBoss("prasa", "opad", "rdzen", 60);
		expect(b.hp).toBeGreaterThan(a.hp);
		expect(b.dropSpeed).toBeGreaterThan(a.dropSpeed);
		expect(b.waitFrames).toBeLessThan(a.waitFrames);
		expect(b.openFrames).toBeGreaterThanOrEqual(40);
	});
});

describe("prasa-olbrzym / opad", () => {
	it("tracks, drops, slams and bares the core only after the slam", () => {
		const [world, boss] = arena("prasa", "opad", "rdzen");
		world.player.x = 40;
		const phases = new Set<string>();
		let slammed = false;
		for (let i = 0; i < 600; i++) {
			const events = step(world, IDLE);
			phases.add(boss.phase);
			if (events.some((e) => e.type === "slam")) slammed = true;
		}
		expect([...phases].sort()).toEqual(["drop", "rise", "slam", "track"]);
		expect(slammed).toBe(true);
	});

	it("takes a stomp only while the core is bare and falls after hp stomps", () => {
		const [world, boss] = arena("prasa", "opad", "rdzen");
		stomp(world, boss);
		expect(run(world, 3).some((e) => e.type === "bossHit")).toBe(false);
		const events = [];
		for (let i = 0; i < boss.spec.hp; i++) {
			boss.phase = "slam";
			boss.y = boss.floorY;
			boss.timer = boss.spec.openFrames;
			stomp(world, boss);
			events.push(...run(world, 3));
		}
		expect(events.filter((e) => e.type === "bossHit")).toHaveLength(boss.spec.hp - 1);
		const down = events.filter((e) => e.type === "bossDown");
		expect(down).toHaveLength(1);
		expect(down[0]).toEqual({ type: "bossDown", boss: "prasa/opad/rdzen" });
		expect(boss.alive).toBe(false);
	});

	it("hurts Śrubek caught under the drop", () => {
		const [world, boss] = arena("prasa", "opad", "rdzen");
		boss.phase = "drop";
		boss.y = boss.floorY - 20;
		world.player.x = boss.x + 10;
		world.player.y = boss.floorY + boss.h - world.player.h;
		expect(run(world, 10).some((e) => e.type === "hit")).toBe(true);
	});
});

describe("dron-matka / drony", () => {
	it("releases baby drones, then dips with the antenna bare", () => {
		const [world, boss] = arena("dron-matka", "drony", "antena");
		const before = world.drones.length;
		openUp(world, boss);
		expect(world.drones.length).toBeGreaterThan(before);
		expect(boss.phase).toBe("dip");
		// Let it sink to its bared height before stomping.
		run(world, 38);
		expect(boss.y).toBeGreaterThan(boss.topY);
		stomp(world, boss);
		expect(run(world, 3).some((e) => e.type === "bossHit")).toBe(true);
	});
});

describe("pies-alfa / szarza", () => {
	it("charges across the arena, stuns at the wall and takes a stomp on the back", () => {
		const [world, boss] = arena("pies-alfa", "szarza", "grzbiet");
		expect(boss.y).toBe(boss.floorY);
		const startX = boss.x;
		openUp(world, boss);
		expect(boss.phase).toBe("stun");
		expect(boss.x).not.toBe(startX);
		stomp(world, boss);
		expect(run(world, 3).some((e) => e.type === "bossHit")).toBe(true);
	});

	it("hurts Śrubek standing in the charge", () => {
		const [world, boss] = arena("pies-alfa", "szarza", "grzbiet");
		boss.phase = "charge";
		boss.dir = -1;
		world.player.x = boss.x - 20;
		world.player.y = boss.floorY + boss.h - world.player.h;
		expect(run(world, 20).some((e) => e.type === "hit")).toBe(true);
	});
});

describe("dzwig / strzal", () => {
	it("fires a volley of scrap at Śrubek, then cools with the core bare", () => {
		const [world, boss] = arena("dzwig", "strzal", "rdzen");
		let fired = 0;
		for (let i = 0; i < 1200 && !coreOpen(boss); i++) {
			fired += step(world, IDLE).filter((e) => e.type === "throw").length;
		}
		expect(fired).toBe(3);
		expect(boss.phase).toBe("cool");
	});

	it("shots hurt Śrubek and vanish on the floor", () => {
		const [world] = arena("dzwig", "strzal", "rdzen");
		const p = world.player;
		world.shots.push({ x: p.x, y: p.y - 30, vx: 0, vy: 2 });
		expect(run(world, 30).some((e) => e.type === "hit")).toBe(true);
		world.shots.push({ x: 200, y: 100, vx: 0, vy: 2 });
		run(world, 200);
		expect(world.shots).toHaveLength(0);
	});
});

describe("scrap and the mega ball against a boss", () => {
	it("a thrown piece on the bared core counts and shatters", () => {
		const [world, boss] = arena("prasa", "opad", "rdzen");
		boss.phase = "slam";
		boss.y = boss.floorY;
		boss.timer = boss.spec.openFrames;
		world.scraps.push({ x: boss.x - 30, y: boss.y + 4, vx: 4, vy: 0, state: "thrown" });
		const events = run(world, 20);
		expect(events.some((e) => e.type === "bossHit")).toBe(true);
		expect(world.scraps[0]?.state).toBe("gone");
	});

	it("a mega ball hurts the boss even with the core closed", () => {
		const [world, boss] = arena("prasa", "opad", "rdzen");
		boss.phase = "drop";
		boss.y = boss.floorY - 10;
		world.megas.push({ x: boss.x - 40, y: boss.y + 4, vx: 5 });
		const events = run(world, 20);
		expect(events.some((e) => e.type === "bossHit")).toBe(true);
		expect(world.megas).toHaveLength(0);
	});
});

describe("koparka / zamach", () => {
	it("stands on the floor and swings the bucket across, hurting what it meets", () => {
		const [world, boss] = arena("koparka", "zamach", "rdzen");
		expect(boss.y).toBe(boss.floorY);
		const p = world.player;
		p.x = boss.x - 60;
		p.y = boss.floorY + boss.h - p.h;
		let hit = false;
		for (let i = 0; i < 400 && !hit; i++) {
			hit = step(world, IDLE).some((e) => e.type === "hit");
		}
		expect(hit).toBe(true);
		expect(boss.phase).toBe("sweep");
		openUp(world, boss);
		expect(boss.phase).toBe("cool");
	});
});

describe("zgniatarka / zgniot", () => {
	it("drops, slides along the floor and then stuns with its back bare", () => {
		const [world, boss] = arena("zgniatarka", "zgniot", "grzbiet");
		world.player.x = 400;
		const phases = new Set<string>();
		for (let i = 0; i < 500 && !coreOpen(boss); i++) {
			step(world, IDLE);
			phases.add(boss.phase);
		}
		expect(phases.has("slide")).toBe(true);
		expect(boss.phase).toBe("stun");
	});

	it("hurts Śrubek in the slide", () => {
		const [world, boss] = arena("zgniatarka", "zgniot", "grzbiet");
		boss.phase = "slide";
		boss.y = boss.floorY;
		boss.timer = 70;
		boss.dir = -1;
		world.player.x = boss.x - 20;
		world.player.y = boss.floorY + boss.h - world.player.h;
		expect(run(world, 20).some((e) => e.type === "hit")).toBe(true);
	});
});

describe("wieża / laser", () => {
	it("sweeps a beam over the floor that burns Śrubek, then cools with the antenna bare", () => {
		const [world, boss] = arena("wieza", "laser", "antena");
		expect(boss.y).toBe(boss.floorY);
		world.player.x = boss.x + boss.w + 60;
		world.player.y = boss.floorY + boss.h - world.player.h;
		let hit = false;
		for (let i = 0; i < 400 && !hit; i++) hit = step(world, IDLE).some((e) => e.type === "hit");
		expect(hit).toBe(true);
		openUp(world, boss);
		expect(boss.phase).toBe("cool");
	});
});

describe("magnes / przyciag", () => {
	it("drags Śrubek toward itself and drops scrap, then cools", () => {
		const [world, boss] = arena("magnes", "przyciag", "rdzen");
		const p = world.player;
		p.x = boss.x - 120;
		p.y = boss.floorY + boss.h - p.h;
		const startX = p.x;
		let dropped = 0;
		for (let i = 0; i < 400 && !coreOpen(boss); i++) {
			dropped += step(world, IDLE).filter((e) => e.type === "throw").length;
		}
		expect(p.x).toBeGreaterThan(startX);
		expect(dropped).toBeGreaterThan(0);
		expect(boss.phase).toBe("cool");
	});
});

describe("rój / chmura", () => {
	it("spreads its drones wide, hurting on contact, then dips", () => {
		const [world, boss] = arena("roj", "chmura", "antena");
		world.player.x = boss.x + boss.w / 2 - world.player.w / 2 + 50;
		world.player.y = boss.floorY + boss.h - world.player.h;
		let hit = false;
		for (let i = 0; i < 400 && !hit; i++) hit = step(world, IDLE).some((e) => e.type === "hit");
		expect(hit).toBe(true);
		openUp(world, boss);
		expect(boss.phase).toBe("dip");
	});
});

describe("wąż / pełzanie", () => {
	it("crawls along the floor, hops and then stuns with its back bare", () => {
		const [world, boss] = arena("waz", "pelzanie", "grzbiet");
		expect(boss.y).toBe(boss.floorY);
		world.player.x = 400;
		let lifted = false;
		for (let i = 0; i < 600 && !coreOpen(boss); i++) {
			step(world, IDLE);
			if (boss.y < boss.floorY) lifted = true;
		}
		expect(lifted).toBe(true);
		expect(boss.phase).toBe("stun");
		expect(boss.y).toBe(boss.floorY);
	});
});
