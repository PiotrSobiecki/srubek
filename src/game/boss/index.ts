/**
 * Boss fights. A boss is a body, an attack and a weak spot, scaled by the level
 * number; `stepBoss` runs one frame of it against the player. The pool holds
 * every allowed combination and `pickBoss` hands out one a run has not met.
 */

import { type GameEvent, hurt, type World } from "@/game/engine";
import { ROWS, TILE } from "@/game/level";

export type BossBody =
	| "prasa"
	| "dron-matka"
	| "pies-alfa"
	| "dzwig"
	| "koparka"
	| "zgniatarka"
	| "wieza"
	| "magnes"
	| "roj"
	| "waz";
export type BossAttack =
	| "opad"
	| "drony"
	| "szarza"
	| "strzal"
	| "zamach"
	| "zgniot"
	| "laser"
	| "przyciag"
	| "chmura"
	| "pelzanie";
export type BossWeakSpot = "rdzen" | "antena" | "grzbiet";

export interface BossSpec {
	body: BossBody;
	attack: BossAttack;
	weakSpot: BossWeakSpot;
	hp: number;
	/** Frames between attacks. */
	waitFrames: number;
	/** Frames the weak spot stays bare after an attack. */
	openFrames: number;
	trackSpeed: number;
	dropSpeed: number;
	riseSpeed: number;
	chargeSpeed: number;
}

type BossPhase =
	| "track"
	| "drop"
	| "slam"
	| "rise"
	| "charge"
	| "stun"
	| "turn"
	| "volley"
	| "cool"
	| "dip"
	| "sweep"
	| "slide"
	| "beam"
	| "pull"
	| "scatter"
	| "crawl";

export interface Boss {
	spec: BossSpec;
	x: number;
	y: number;
	w: number;
	h: number;
	topY: number;
	floorY: number;
	phase: BossPhase;
	timer: number;
	hp: number;
	alive: boolean;
	dir: 1 | -1;
	/** Shots left in the current volley. */
	ammo: number;
	/** Progress of a sweep or beam, 0..1. */
	aux: number;
}

/** Which attacks and weak spots a body can carry. */
const BODIES: Record<BossBody, { attacks: BossAttack[]; weakSpots: BossWeakSpot[] }> = {
	prasa: { attacks: ["opad", "strzal"], weakSpots: ["rdzen"] },
	"dron-matka": { attacks: ["drony", "strzal"], weakSpots: ["antena"] },
	"pies-alfa": { attacks: ["szarza"], weakSpots: ["grzbiet"] },
	dzwig: { attacks: ["opad", "strzal"], weakSpots: ["rdzen", "antena"] },
	koparka: { attacks: ["zamach", "strzal"], weakSpots: ["rdzen"] },
	zgniatarka: { attacks: ["zgniot", "opad"], weakSpots: ["grzbiet"] },
	wieza: { attacks: ["laser", "drony"], weakSpots: ["antena"] },
	magnes: { attacks: ["przyciag", "strzal"], weakSpots: ["rdzen"] },
	roj: { attacks: ["chmura", "drony"], weakSpots: ["antena"] },
	waz: { attacks: ["pelzanie", "szarza"], weakSpots: ["grzbiet"] },
};

/** Bodies that live on the arena floor instead of hovering. */
const GROUNDED: readonly BossBody[] = ["pies-alfa", "koparka", "wieza", "waz"];

function grounded(spec: BossSpec): boolean {
	return GROUNDED.includes(spec.body);
}

export function bossKey(body: BossBody, attack: BossAttack, weakSpot: BossWeakSpot): string {
	return `${body}/${attack}/${weakSpot}`;
}

/** Every allowed (body, attack, weak spot) triple. */
export function bossPool(): [BossBody, BossAttack, BossWeakSpot][] {
	const out: [BossBody, BossAttack, BossWeakSpot][] = [];
	for (const [body, def] of Object.entries(BODIES) as [BossBody, (typeof BODIES)[BossBody]][]) {
		for (const attack of def.attacks)
			for (const weakSpot of def.weakSpots) out.push([body, attack, weakSpot]);
	}
	return out;
}

/** Numbers grow gently with the level so a later boss hits harder and rests less; one more hp every ten levels. */
export function makeBoss(
	body: BossBody,
	attack: BossAttack,
	weakSpot: BossWeakSpot,
	level: number,
): BossSpec {
	const k = Math.max(0, level - 1);
	return {
		body,
		attack,
		weakSpot,
		hp: 3 + Math.floor(level / 10),
		waitFrames: Math.max(40, 90 - k),
		openFrames: Math.max(40, 80 - k * 0.5),
		trackSpeed: Math.min(3, 1.2 + k * 0.03),
		dropSpeed: Math.min(9, 5 + k * 0.05),
		riseSpeed: Math.min(3, 1 + k * 0.03),
		chargeSpeed: Math.min(6, 3 + k * 0.04),
	};
}

/**
 * The boss for a level: level 1 is always the giant press; later levels take a
 * pick seeded by the level and the run, skipping anything this run has already
 * beaten until the whole pool has been seen.
 */
export function pickBoss(level: number, seen: readonly string[], seed = 0): BossSpec {
	if (level === 1) return makeBoss("prasa", "opad", "rdzen", 1);
	const pool = bossPool();
	const fresh = pool.filter(([b, a, w]) => !seen.includes(bossKey(b, a, w)));
	const choices = fresh.length > 0 ? fresh : pool;
	const idx =
		Math.floor(((Math.sin(level * 9301 + 49297 + seed) + 1) / 2) * choices.length) % choices.length;
	const [body, attack, weakSpot] = choices[idx] ?? pool[0] ?? ["prasa", "opad", "rdzen"];
	return makeBoss(body, attack, weakSpot, level);
}

const SIZES: Record<BossBody, { w: number; h: number }> = {
	prasa: { w: 48, h: 28 },
	"dron-matka": { w: 44, h: 30 },
	"pies-alfa": { w: 56, h: 26 },
	dzwig: { w: 36, h: 32 },
	koparka: { w: 60, h: 34 },
	zgniatarka: { w: 52, h: 30 },
	wieza: { w: 30, h: 60 },
	magnes: { w: 40, h: 30 },
	roj: { w: 48, h: 36 },
	waz: { w: 72, h: 22 },
};

export function createBoss(spec: BossSpec, arenaWidthTiles: number): Boss {
	const { w, h } = SIZES[spec.body];
	const topY = 12;
	const floorY = (ROWS - 2) * TILE - h;
	return {
		spec,
		x: (arenaWidthTiles * TILE) / 2 - w / 2,
		y: grounded(spec) ? floorY : topY,
		w,
		h,
		topY,
		floorY,
		phase: "track",
		timer: spec.waitFrames,
		hp: spec.hp,
		alive: true,
		dir: -1,
		ammo: 0,
		aux: 0,
	};
}

/** True while the weak spot is bare and a stomp counts. */
export function coreOpen(boss: Boss): boolean {
	return (
		boss.alive &&
		(boss.phase === "slam" ||
			boss.phase === "stun" ||
			boss.phase === "cool" ||
			boss.phase === "dip")
	);
}

// ── attacks ──────────────────────────────────────────────────────────

function arenaWidth(world: World): number {
	return world.level.widthTiles * TILE;
}

function track(boss: Boss, world: World): void {
	const p = world.player;
	const target = p.x + p.w / 2 - boss.w / 2;
	const dx = target - boss.x;
	boss.x += Math.sign(dx) * Math.min(Math.abs(dx), boss.spec.trackSpeed);
	boss.dir = dx < 0 ? -1 : 1;
	if (boss.timer-- > 0) return;
	switch (boss.spec.attack) {
		case "opad":
			boss.phase = "drop";
			break;
		case "szarza":
			boss.phase = "charge";
			break;
		case "strzal":
			boss.phase = "volley";
			boss.ammo = 3;
			boss.timer = 0;
			break;
		case "drony":
			boss.phase = "volley";
			boss.ammo = 2;
			boss.timer = 0;
			break;
		case "zamach":
			boss.phase = "sweep";
			boss.aux = 0;
			break;
		case "zgniot":
			boss.phase = "drop";
			break;
		case "laser":
			boss.phase = "beam";
			boss.aux = 0;
			break;
		case "przyciag":
			boss.phase = "pull";
			boss.timer = 80;
			boss.ammo = 3;
			break;
		case "chmura":
			boss.phase = "scatter";
			boss.aux = 0;
			break;
		case "pelzanie":
			boss.phase = "crawl";
			boss.aux = 0;
			break;
	}
}

function drop(boss: Boss, world: World, events: GameEvent[]): void {
	boss.y = Math.min(boss.floorY, boss.y + boss.spec.dropSpeed);
	if (boss.y < boss.floorY) return;
	boss.phase = boss.spec.attack === "zgniot" ? "slide" : "slam";
	boss.timer = boss.spec.attack === "zgniot" ? 70 : boss.spec.openFrames;
	world.effects.push({
		kind: "quake",
		x: boss.x + boss.w / 2,
		y: boss.y + boss.h,
		frame: world.frame,
	});
	events.push({ type: "slam" });
}

function rise(boss: Boss): void {
	boss.y = Math.max(boss.topY, boss.y - boss.spec.riseSpeed);
	if (boss.y > boss.topY) return;
	boss.phase = "track";
	boss.timer = boss.spec.waitFrames;
}

/** The dog-alpha runs at the player until it hits a wall and stuns itself. */
function charge(boss: Boss, world: World, events: GameEvent[]): void {
	boss.x += boss.dir * boss.spec.chargeSpeed;
	const left = TILE;
	const right = arenaWidth(world) - TILE - boss.w;
	if (boss.x > left && boss.x < right) return;
	boss.x = Math.max(left, Math.min(right, boss.x));
	boss.phase = "stun";
	boss.timer = boss.spec.openFrames;
	world.effects.push({
		kind: "quake",
		x: boss.x + boss.w / 2,
		y: boss.y + boss.h,
		frame: world.frame,
	});
	events.push({ type: "slam" });
}

/** Shots or baby drones, one every few frames, then a dip that bares the weak spot. */
function volley(boss: Boss, world: World, events: GameEvent[]): void {
	if (boss.timer-- > 0) return;
	boss.timer = 18;
	boss.ammo -= 1;
	const cx = boss.x + boss.w / 2;
	const cy = boss.y + boss.h;
	if (boss.spec.attack === "strzal") {
		const p = world.player;
		const dx = p.x + p.w / 2 - cx;
		const dy = p.y - cy;
		const len = Math.hypot(dx, dy) || 1;
		world.shots.push({ x: cx - 4, y: cy, vx: (dx / len) * 3, vy: Math.max(0.5, (dy / len) * 3) });
		events.push({ type: "throw" });
	} else {
		const span = arenaWidth(world);
		world.drones.push({
			x: cx - 6,
			y: cy + 8,
			w: 12,
			h: 8,
			minX: TILE + 2,
			maxX: span - TILE - 14,
			dir: boss.dir,
			alive: true,
		});
	}
	if (boss.ammo > 0) return;
	// Hovering bosses sink within jumping reach while bare; grounded ones just cool down.
	boss.phase = grounded(boss.spec) ? "cool" : "dip";
	boss.timer = boss.spec.openFrames;
}

function dip(boss: Boss): void {
	// Sink to mid height while bare, so the stomp is reachable, then climb back.
	const target = boss.floorY - 40;
	if (boss.timer > boss.spec.openFrames / 2)
		boss.y = Math.min(target, boss.y + boss.spec.dropSpeed);
	if (boss.timer-- > 0) return;
	boss.phase = "rise";
}

/** Grounded bosses face the player and count down to their attack in place. */
function waitOnGround(boss: Boss, world: World): void {
	const p = world.player;
	boss.dir = p.x + p.w / 2 < boss.x + boss.w / 2 ? -1 : 1;
	if (boss.timer-- > 0) return;
	switch (boss.spec.attack) {
		case "szarza":
			boss.phase = "charge";
			break;
		case "zamach":
			boss.phase = "sweep";
			boss.aux = 0;
			break;
		case "laser":
			boss.phase = "beam";
			boss.aux = 0;
			break;
		case "pelzanie":
			boss.phase = "crawl";
			boss.aux = 0;
			break;
		default:
			boss.phase = "volley";
			boss.ammo = boss.spec.attack === "drony" ? 2 : 3;
			boss.timer = 0;
	}
}

/** Where the excavator's bucket is during a sweep: it swings out to the far wall and back. */
export function bucketBox(
	boss: Boss,
	world: World,
): { x: number; y: number; w: number; h: number } {
	const reach = boss.dir > 0 ? arenaWidth(world) - TILE - (boss.x + boss.w) : boss.x - TILE;
	const k = Math.sin(boss.aux * Math.PI);
	const bx = boss.dir > 0 ? boss.x + boss.w + k * (reach - 16) : boss.x - 16 - k * (reach - 16);
	return { x: bx, y: boss.y + boss.h - 14, w: 16, h: 14 };
}

function sweep(boss: Boss, world: World, events: GameEvent[]): void {
	boss.aux = Math.min(1, boss.aux + 1 / 70);
	const p = world.player;
	const b = bucketBox(boss, world);
	if (p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y) {
		hurt(p, b.x + b.w / 2, events);
	}
	if (boss.aux < 1) return;
	boss.phase = "cool";
	boss.timer = boss.spec.openFrames;
	world.effects.push({
		kind: "quake",
		x: boss.x + boss.w / 2,
		y: boss.y + boss.h,
		frame: world.frame,
	});
	events.push({ type: "slam" });
}

function slide(boss: Boss, world: World, events: GameEvent[]): void {
	boss.x += boss.dir * boss.spec.chargeSpeed;
	const left = TILE;
	const right = arenaWidth(world) - TILE - boss.w;
	if (boss.x <= left || boss.x >= right) boss.dir = boss.dir > 0 ? -1 : 1;
	boss.x = Math.max(left, Math.min(right, boss.x));
	if (boss.timer-- > 0) return;
	boss.phase = "stun";
	boss.timer = boss.spec.openFrames;
	world.effects.push({
		kind: "quake",
		x: boss.x + boss.w / 2,
		y: boss.y + boss.h,
		frame: world.frame,
	});
	events.push({ type: "slam" });
}

/** The tower's beam: from its lamp down to the floor, sweeping from one side to the other. */
export function beamEnd(boss: Boss, world: World): { x: number; y: number } {
	const angle = (-0.6 + boss.aux * 1.2) * Math.PI * (boss.dir > 0 ? 1 : -1);
	const top = { x: boss.x + boss.w / 2, y: boss.y + 8 };
	const floor = (ROWS - 2) * TILE;
	const len = (floor - top.y) / Math.max(0.2, Math.cos(angle));
	return { x: Math.max(0, Math.min(arenaWidth(world), top.x + Math.sin(angle) * len)), y: floor };
}

function beam(boss: Boss, world: World, events: GameEvent[]): void {
	boss.aux = Math.min(1, boss.aux + 1 / 100);
	const p = world.player;
	const a = { x: boss.x + boss.w / 2, y: boss.y + 8 };
	const b = beamEnd(boss, world);
	// Distance from the player's centre to the beam segment.
	const cx = p.x + p.w / 2;
	const cy = p.y + p.h / 2;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const t = Math.max(
		0,
		Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / (dx * dx + dy * dy || 1)),
	);
	const dist = Math.hypot(cx - (a.x + dx * t), cy - (a.y + dy * t));
	if (dist < 8) hurt(p, cx + (boss.dir > 0 ? -1 : 1), events);
	if (boss.aux < 1) return;
	boss.phase = "cool";
	boss.timer = boss.spec.openFrames;
}

/** How far the crane magnet's field reaches, in pixels from its centre. */
export const MAGNET_REACH = 130;

/** The crane magnet drags Śrubek toward itself while dropping scrap on him. */
function pull(boss: Boss, world: World, events: GameEvent[]): void {
	const p = world.player;
	const cx = boss.x + boss.w / 2;
	const dx = cx - (p.x + p.w / 2);
	// Between friction (0.15) and run acceleration (0.2): the drag wins when Śrubek
	// stands still, driving away beats it; from the arena's edges he is out of reach.
	if (Math.abs(dx) < MAGNET_REACH) p.vx += Math.sign(dx) * 0.16;
	if (boss.timer % 25 === 0 && boss.ammo > 0) {
		boss.ammo -= 1;
		world.shots.push({ x: cx - 4, y: boss.y + boss.h, vx: 0, vy: 1 });
		events.push({ type: "throw" });
	}
	if (boss.timer-- > 0) return;
	boss.phase = grounded(boss.spec) ? "cool" : "dip";
	boss.timer = boss.spec.openFrames;
}

/** Where the swarm's drones hang around the core: spread out mid-attack, tight otherwise. */
export function swarmOffsets(boss: Boss, frame: number): { x: number; y: number }[] {
	const spread = boss.phase === "scatter" ? Math.sin(boss.aux * Math.PI) : 0;
	const out = [];
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2 + frame / 30;
		const r = 14 + spread * 70;
		// Spread drones sink toward the floor so a grounded Śrubek has to dodge.
		out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.6 + spread * 150 });
	}
	return out;
}

function scatter(boss: Boss, world: World, events: GameEvent[]): void {
	boss.aux = Math.min(1, boss.aux + 1 / 90);
	const p = world.player;
	const cx = boss.x + boss.w / 2;
	const cy = boss.y + boss.h / 2;
	for (const o of swarmOffsets(boss, world.frame)) {
		const dx = cx + o.x;
		const dy = cy + o.y;
		if (p.x < dx + 5 && p.x + p.w > dx - 5 && p.y < dy + 5 && p.y + p.h > dy - 5) {
			hurt(p, dx, events);
		}
	}
	if (boss.aux < 1) return;
	boss.phase = "dip";
	boss.timer = boss.spec.openFrames;
}

/** The conveyor snake crawls the floor toward Śrubek, hopping over him when close. */
function crawl(boss: Boss, world: World, events: GameEvent[]): void {
	const p = world.player;
	boss.aux += 1 / 110;
	boss.x += boss.dir * boss.spec.chargeSpeed * 0.6;
	const left = TILE;
	const right = arenaWidth(world) - TILE - boss.w;
	if (boss.x <= left || boss.x >= right) boss.dir = boss.dir > 0 ? -1 : 1;
	boss.x = Math.max(left, Math.min(right, boss.x));
	// Hop arc on the second half of the crawl.
	const hop = boss.aux > 0.5 ? Math.sin((boss.aux - 0.5) * 2 * Math.PI) * 50 : 0;
	boss.y = boss.floorY - Math.max(0, hop);
	if (p.x < boss.x + boss.w && p.x + p.w > boss.x && p.y < boss.y + boss.h && p.y + p.h > boss.y) {
		hurt(p, boss.x + boss.w / 2, events);
	}
	if (boss.aux < 1) return;
	boss.y = boss.floorY;
	boss.phase = "stun";
	boss.timer = boss.spec.openFrames;
	world.effects.push({
		kind: "quake",
		x: boss.x + boss.w / 2,
		y: boss.y + boss.h,
		frame: world.frame,
	});
	events.push({ type: "slam" });
}

function touch(boss: Boss, world: World, events: GameEvent[]): void {
	const p = world.player;
	const overlapping =
		p.x < boss.x + boss.w && p.x + p.w > boss.x && p.y < boss.y + boss.h && p.y + p.h > boss.y;
	if (!overlapping) return;
	if (
		boss.phase === "drop" ||
		boss.phase === "charge" ||
		boss.phase === "slide" ||
		boss.phase === "crawl"
	) {
		hurt(p, boss.x + boss.w / 2, events);
		return;
	}
	const fromAbove = p.vy > 0 && p.y + p.h - p.vy <= boss.y + 6;
	if (!coreOpen(boss) || !fromAbove) return;
	p.vy = -4.5;
	p.sy = 0;
	damageBoss(boss, world, events);
}

/** A hit on a bared weak spot, by stomp or by thrown scrap; the mega ball counts double. */
export function damageBoss(boss: Boss, world: World, events: GameEvent[], hits = 1): void {
	boss.hp -= hits;
	world.effects.push({ kind: "burst", x: boss.x + boss.w / 2, y: boss.y, frame: world.frame });
	if (boss.hp > 0) {
		// Stunned: the boss backs off right away.
		boss.phase = grounded(boss.spec) ? "turn" : "rise";
		boss.timer = boss.spec.waitFrames;
		events.push({ type: "bossHit" });
		return;
	}
	boss.alive = false;
	events.push({
		type: "bossDown",
		boss: bossKey(boss.spec.body, boss.spec.attack, boss.spec.weakSpot),
	});
}

/** A thrown piece on a bared weak spot counts like a stomp; true when it landed. */
export function scrapHitsBoss(
	world: World,
	x: number,
	y: number,
	size: number,
	events: GameEvent[],
): boolean {
	const boss = world.boss;
	if (!boss || !coreOpen(boss)) return false;
	if (x >= boss.x + boss.w || x + size <= boss.x || y >= boss.y + boss.h || y + size <= boss.y)
		return false;
	damageBoss(boss, world, events);
	return true;
}

export function stepBoss(world: World, events: GameEvent[]): void {
	const boss = world.boss;
	if (!boss || !boss.alive) return;
	switch (boss.phase) {
		case "track":
			if (grounded(boss.spec)) waitOnGround(boss, world);
			else track(boss, world);
			break;
		case "drop":
			drop(boss, world, events);
			break;
		case "slam":
		case "stun":
		case "cool":
			if (boss.timer-- <= 0) boss.phase = grounded(boss.spec) ? "turn" : "rise";
			break;
		case "sweep":
			sweep(boss, world, events);
			break;
		case "slide":
			slide(boss, world, events);
			break;
		case "beam":
			beam(boss, world, events);
			break;
		case "pull":
			pull(boss, world, events);
			break;
		case "scatter":
			scatter(boss, world, events);
			break;
		case "crawl":
			crawl(boss, world, events);
			break;
		case "rise":
			rise(boss);
			break;
		case "charge":
			charge(boss, world, events);
			break;
		case "turn":
			boss.dir = world.player.x + world.player.w / 2 < boss.x + boss.w / 2 ? -1 : 1;
			boss.phase = "track";
			boss.timer = boss.spec.waitFrames;
			break;
		case "volley":
			volley(boss, world, events);
			break;
		case "dip":
			dip(boss);
			break;
	}
	touch(boss, world, events);
}
