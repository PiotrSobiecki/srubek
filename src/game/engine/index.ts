/**
 * Physics and collision. Runs at a fixed 60 steps per second; every constant is
 * in pixels per frame so a test can replay N frames and assert on positions.
 */

import type { Boss } from "@/game/boss";
import { coreOpen, damageBoss, scrapHitsBoss, stepBoss } from "@/game/boss";
import { isSolid, type Level, type PickupKind, ROWS, TILE, type Vec } from "@/game/level";

export const VIEW_W = 480;
export const VIEW_H = 256;
/** How long a visual effect stays in the world. */
export const EFFECT_FRAMES = 36;

const PHYSICS = {
	gravity: 0.25,
	maxFall: 6,
	runAccel: 0.2,
	maxRun: 2,
	friction: 0.15,
	jumpVelocity: -4.5,
	/** Gravity while the jump key is still held, for at most holdFrames. */
	holdGravity: 0.12,
	holdFrames: 14,
	stompBounce: -3,
	droneSpeed: 0.75,
	knockback: 2.5,
	dogSpeed: 0.5,
	magnetRange: 48,
	throwVx: 4,
	throwVy: 0,
	slideFriction: 0.05,
	/** Press cycle, in frames and pixels per frame. */
	pressWait: 70,
	springVelocity: -7.2,
	/** Frames standing on a trapdoor before it gives way, and how long it hangs open. */
	trapHold: 24,
	trapOpen: 120,
	pressDrop: 5,
	pressHold: 25,
	pressRise: 1,
	/** Frames of invulnerability after a hit. */
	hurtFrames: 60,
} as const;

export interface Input {
	left: boolean;
	right: boolean;
	jump: boolean;
	magnet: boolean;
	throw: boolean;
	mega: boolean;
	/** Swing whatever is in the hand. */
	attack: boolean;
}

export interface Player {
	x: number;
	y: number;
	w: number;
	h: number;
	vx: number;
	vy: number;
	onGround: boolean;
	facing: 1 | -1;
	holdLeft: number;
	jumpHeld: boolean;
	/** Sub-pixel remainders; x and y themselves stay whole pixels. */
	sx: number;
	sy: number;
	hurtLeft: number;
	/** Air jumps left; refilled on landing. */
	airJumps: number;
	/** Frames of thruster flame to draw after an air jump. */
	boostLeft: number;
	magnetHeld: boolean;
	throwHeld: boolean;
	megaHeld: boolean;
	attackHeld: boolean;
	/** Frames left of the current swing; 0 when idle. */
	swingLeft: number;
	/** The current swing already struck the boss. */
	swingHit: boolean;
}

interface PickupItem extends Vec {
	kind: PickupKind;
	taken: boolean;
}

/** A short visual, kept in the world so a test can see it and the renderer can draw it. */
interface Effect {
	kind: "burst" | "spark" | "charge" | "magnet" | "dust" | "quake";
	x: number;
	y: number;
	frame: number;
}

interface Drone {
	x: number;
	y: number;
	w: number;
	h: number;
	/** Patrol bounds in pixels, inclusive of the drone's own width. */
	minX: number;
	maxX: number;
	dir: 1 | -1;
	alive: boolean;
}

interface Scrap {
	x: number;
	y: number;
	vx: number;
	vy: number;
	state: "ground" | "held" | "thrown" | "gone";
}

interface Dog {
	x: number;
	y: number;
	w: number;
	h: number;
	dir: 1 | -1;
	alive: boolean;
}

export interface Press {
	x: number;
	y: number;
	topY: number;
	floorY: number;
	phase: "wait" | "drop" | "hold" | "rise";
	timer: number;
}

interface Shot {
	x: number;
	y: number;
	vx: number;
	vy: number;
}

/** The mega bolt ball: flies level, pierces enemies, hits a boss open or not. */
interface Mega {
	x: number;
	y: number;
	vx: number;
}

/** Something Śrubek can land on from above: a moving platform or a trapdoor. */
export interface Platform {
	kind: "mover" | "trap";
	x: number;
	y: number;
	w: number;
	h: number;
	minX: number;
	maxX: number;
	dir: 1 | -1;
	/** Pixels moved this frame, carried onto whoever rides it. */
	dx: number;
	/** Frames a trapdoor has been stood on. */
	timer: number;
	/** Frames a trapdoor stays open; 0 while shut. */
	openLeft: number;
	stood: boolean;
}

export interface World {
	level: Level;
	player: Player;
	pickups: PickupItem[];
	drones: Drone[];
	scraps: Scrap[];
	dogs: Dog[];
	presses: Press[];
	platforms: Platform[];
	boss?: Boss;
	/** Scrap fired by a boss; it hurts Śrubek and vanishes on landing. */
	shots: Shot[];
	megas: Mega[];
	/** Mirror of the state's stock, set by the caller before each step. */
	megaBalls: number;
	/** How far the hand item reaches, set by the caller from the skin. */
	meleeReach: number;
	effects: Effect[];
	camera: number;
	frame: number;
}

export type GameEvent =
	| { type: "pickup"; kind: PickupKind }
	| { type: "drone" }
	| { type: "hit" }
	| { type: "charge" }
	| { type: "fall" }
	| { type: "dog" }
	| { type: "gate" }
	| { type: "jump" }
	| { type: "airjump" }
	| { type: "pull" }
	| { type: "throw" }
	| { type: "slam" }
	| { type: "bossHit" }
	| { type: "bossDown"; boss: string }
	| { type: "megaFired" }
	| { type: "spring" }
	| { type: "swing" };

/** Pieces Śrubek carries over from the previous world, already in the pouch. */
export function carriedScrap(world: World | undefined): number {
	return world ? world.scraps.filter((s) => s.state === "held").length : 0;
}

export function createWorld(level: Level, boss?: Boss, carried = 0): World {
	const w = 12;
	const h = 16;
	const pouch: Scrap[] = Array.from({ length: carried }, () => ({
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		state: "held",
	}));
	return {
		level,
		boss,
		player: {
			x: level.spawn.x * TILE + (TILE - w) / 2,
			y: level.spawn.y * TILE + TILE - h,
			w,
			h,
			vx: 0,
			vy: 0,
			onGround: false,
			facing: 1,
			holdLeft: 0,
			jumpHeld: false,
			sx: 0,
			sy: 0,
			hurtLeft: 0,
			airJumps: 1,
			boostLeft: 0,
			magnetHeld: false,
			throwHeld: false,
			megaHeld: false,
			attackHeld: false,
			swingLeft: 0,
			swingHit: false,
		},
		pickups: level.pickups.map((n) => ({ ...n, taken: false })),
		drones: level.drones.map((d) => ({
			x: d.x * TILE + 2,
			y: d.y * TILE + 4,
			w: 12,
			h: 8,
			minX: d.x0 * TILE + 2,
			maxX: d.x1 * TILE + 2,
			dir: 1,
			alive: true,
		})),
		scraps: pouch.concat(
			level.scraps.map((s) => ({
				x: s.x * TILE + 2,
				y: s.y * TILE + 4,
				vx: 0,
				vy: 0,
				state: "ground" as const,
			})),
		),
		dogs: level.dogs.map((d) => ({
			x: d.x * TILE,
			y: d.y * TILE + 6,
			w: 16,
			h: 10,
			dir: -1,
			alive: true,
		})),
		presses: level.presses.map((p, i) => ({
			x: p.x * TILE,
			y: p.y * TILE,
			topY: p.y * TILE,
			floorY: floorBelow(level, p.x, p.y) - TILE,
			phase: "wait",
			// Staggered so a corridor of presses never drops in unison.
			timer: Math.round(PHYSICS.pressWait * level.tempo) - ((i * 23) % PHYSICS.pressWait),
		})),
		platforms: [
			...level.movers.map((m): Platform => {
				const minX = m.x0 * TILE;
				const maxX = Math.max(minX, (m.x1 - 2) * TILE);
				return {
					kind: "mover",
					x: Math.max(minX, Math.min(maxX, m.x * TILE)),
					y: m.y * TILE,
					w: 3 * TILE,
					h: 8,
					minX,
					maxX,
					dir: 1,
					dx: 0,
					timer: 0,
					openLeft: 0,
					stood: false,
				};
			}),
			...level.traps.map(
				(t): Platform => ({
					kind: "trap",
					x: t.x * TILE,
					y: t.y * TILE,
					w: TILE,
					h: 8,
					minX: t.x * TILE,
					maxX: t.x * TILE,
					dir: 1,
					dx: 0,
					timer: 0,
					openLeft: 0,
					stood: false,
				}),
			),
		],
		shots: [],
		megas: [],
		megaBalls: 0,
		meleeReach: 12,
		effects: [],
		camera: 0,
		frame: 0,
	};
}

/** Pixel y of the first solid tile at or below (tx, ty). */
function floorBelow(level: Level, tx: number, ty: number): number {
	let y = ty;
	while (y < ROWS && !isSolid(level, tx, y)) y += 1;
	return y * TILE;
}

function overlapsSolid(level: Level, x: number, y: number, w: number, h: number): boolean {
	const x0 = Math.floor(x / TILE);
	const x1 = Math.floor((x + w - 1) / TILE);
	const y0 = Math.floor(y / TILE);
	const y1 = Math.floor((y + h - 1) / TILE);
	for (let ty = y0; ty <= y1; ty++) {
		for (let tx = x0; tx <= x1; tx++) if (isSolid(level, tx, ty)) return true;
	}
	return false;
}

function overlaps(
	a: Vec & { w: number; h: number },
	bx: number,
	by: number,
	bw: number,
	bh: number,
): boolean {
	return a.x < bx + bw && a.x + a.w > bx && a.y < by + bh && a.y + a.h > by;
}

function moveX(world: World): void {
	const p = world.player;
	const dir = Math.sign(p.vx);
	// Checked before the sub-pixel step too, so vx cannot creep up against a wall.
	if (dir !== 0 && overlapsSolid(world.level, p.x + dir, p.y, p.w, p.h)) {
		p.vx = 0;
		p.sx = 0;
		return;
	}
	p.sx += p.vx;
	const whole = Math.trunc(p.sx);
	p.sx -= whole;
	for (let i = 0; i < Math.abs(whole); i++) {
		if (overlapsSolid(world.level, p.x + dir, p.y, p.w, p.h)) {
			p.vx = 0;
			p.sx = 0;
			return;
		}
		p.x += dir;
	}
}

function moveY(world: World): void {
	const p = world.player;
	p.sy += p.vy;
	const whole = Math.trunc(p.sy);
	p.sy -= whole;
	const dir = Math.sign(whole);
	for (let i = 0; i < Math.abs(whole); i++) {
		if (overlapsSolid(world.level, p.x, p.y + dir, p.w, p.h)) {
			p.vy = 0;
			p.sy = 0;
			break;
		}
		p.y += dir;
	}
	p.onGround = p.vy >= 0 && overlapsSolid(world.level, p.x, p.y + 1, p.w, p.h);
}

function steer(p: Player, input: Input): void {
	const c = PHYSICS;
	if (input.left === input.right) {
		p.vx = Math.abs(p.vx) <= c.friction ? 0 : p.vx - Math.sign(p.vx) * c.friction;
		return;
	}
	const dir = input.right ? 1 : -1;
	p.facing = dir;
	p.vx = Math.max(-c.maxRun, Math.min(c.maxRun, p.vx + dir * c.runAccel));
}

function control(p: Player, input: Input, events: GameEvent[]): void {
	const c = PHYSICS;
	steer(p, input);

	if (p.onGround) p.airJumps = 1;
	if (input.jump && !p.jumpHeld && (p.onGround || p.airJumps > 0)) {
		if (!p.onGround) {
			p.airJumps -= 1;
			p.boostLeft = 12;
		}
		events.push({ type: p.onGround ? "jump" : "airjump" });
		p.vy = c.jumpVelocity;
		p.sy = 0;
		p.holdLeft = c.holdFrames;
	}
	p.jumpHeld = input.jump;

	const holding = input.jump && p.holdLeft > 0 && p.vy < 0;
	p.vy = Math.min(c.maxFall, p.vy + (holding ? c.holdGravity : c.gravity));
	if (holding) p.holdLeft -= 1;
	else p.holdLeft = 0;
}

function moveDrones(world: World): void {
	for (const d of world.drones) {
		if (!d.alive) continue;
		d.x += d.dir * PHYSICS.droneSpeed;
		if (d.x >= d.maxX) {
			d.x = d.maxX;
			d.dir = -1;
		} else if (d.x <= d.minX) {
			d.x = d.minX;
			d.dir = 1;
		}
	}
}

const SCRAP = 12;
/** How many pieces the magnet can carry at once. */
export const SCRAP_CAPACITY = 10;
export const MEGA_SIZE = 20;
export const SWING_FRAMES = 16;
const MEGA_SPEED = 5;

function moveDogs(world: World): void {
	for (const d of world.dogs) {
		if (!d.alive) continue;
		const nextX = d.x + d.dir * PHYSICS.dogSpeed;
		const front = d.dir > 0 ? nextX + d.w : nextX - 1;
		const tx = Math.floor(front / TILE);
		const wall = isSolid(world.level, tx, Math.floor((d.y + d.h - 1) / TILE));
		const floor = isSolid(world.level, tx, Math.floor((d.y + d.h) / TILE));
		if (wall || !floor) d.dir = d.dir > 0 ? -1 : 1;
		else d.x = nextX;
	}
}

function scrapsInRange(world: World): Scrap[] {
	const p = world.player;
	const cx = p.x + p.w / 2;
	const cy = p.y + p.h / 2;
	return world.scraps.filter(
		(s) =>
			s.state === "ground" &&
			Math.hypot(s.x + SCRAP / 2 - cx, s.y + SCRAP / 2 - cy) <= PHYSICS.magnetRange,
	);
}

/** Thrown low, from the feet, so it skids along the ground into whatever walks there. */
function throwScrap(p: Player, piece: Scrap, events: GameEvent[]): void {
	piece.state = "thrown";
	piece.x = p.facing > 0 ? p.x + p.w : p.x - SCRAP;
	piece.y = p.y + p.h - SCRAP;
	piece.vx = p.facing * PHYSICS.throwVx;
	piece.vy = PHYSICS.throwVy;
	events.push({ type: "throw" });
}

/** The magnet key pulls every piece in range into the pouch; the throw key hurls one. */
function magnet(world: World, input: Input, events: GameEvent[]): void {
	const p = world.player;
	const pressed = input.magnet && !p.magnetHeld;
	p.magnetHeld = input.magnet;
	const thrown = input.throw && !p.throwHeld;
	p.throwHeld = input.throw;
	const held = world.scraps.filter((s) => s.state === "held");

	if (pressed) {
		// Every press pulses the claw, so the key visibly does something even with no scrap near.
		world.effects.push({ kind: "magnet", x: p.x + p.w / 2, y: p.y + 6, frame: world.frame });
		const room = SCRAP_CAPACITY - held.length;
		const pulled = scrapsInRange(world).slice(0, Math.max(0, room));
		for (const s of pulled) s.state = "held";
		if (pulled.length > 0) events.push({ type: "pull" });
	}

	if (thrown && held[0]) throwScrap(p, held[0], events);

	// Carried pieces ride along above the head; the renderer fans them out.
	for (const s of world.scraps) {
		if (s.state !== "held") continue;
		s.x = p.x + p.w / 2 - SCRAP / 2;
		s.y = p.y - SCRAP - 2;
	}
}

/** Lands the scrap on the tile below; returns true when it is resting on a floor. */
function landScrap(s: Scrap, ny: number): boolean {
	const falling = s.vy > 0;
	if (falling) s.y = Math.floor((ny + SCRAP) / TILE) * TILE - SCRAP;
	s.vy = 0;
	return falling;
}

/** A thrown piece flies, lands and keeps sliding; it is live until it stops. */
function flyScrap(level: Level, s: Scrap): void {
	s.vy = Math.min(PHYSICS.maxFall, s.vy + PHYSICS.gravity);
	const nx = s.x + s.vx;
	if (overlapsSolid(level, nx, s.y, SCRAP, SCRAP)) s.vx = 0;
	else s.x = nx;
	const ny = s.y + s.vy;
	let onFloor = false;
	if (overlapsSolid(level, s.x, ny, SCRAP, SCRAP)) onFloor = landScrap(s, ny);
	else s.y = ny;
	if (onFloor) {
		const f = PHYSICS.slideFriction;
		s.vx = Math.abs(s.vx) <= f ? 0 : s.vx - Math.sign(s.vx) * f;
	}
	if ((onFloor && s.vx === 0) || s.y > ROWS * TILE) s.state = "ground";
}

/** A piece that hit something shatters: it cannot be picked up again. */
function shatter(world: World, s: Scrap): void {
	s.state = "gone";
	s.vx = 0;
	world.effects.push({ kind: "spark", x: s.x + SCRAP / 2, y: s.y + SCRAP / 2, frame: world.frame });
}

function scrapHits(world: World, s: Scrap, events: GameEvent[]): void {
	for (const d of world.dogs) {
		if (!d.alive || !overlaps({ x: s.x, y: s.y, w: SCRAP, h: SCRAP }, d.x, d.y, d.w, d.h)) continue;
		d.alive = false;
		shatter(world, s);
		world.effects.push({ kind: "burst", x: d.x + d.w / 2, y: d.y + d.h / 2, frame: world.frame });
		events.push({ type: "dog" });
		return;
	}
	if (scrapHitsBoss(world, s.x, s.y, SCRAP, events)) shatter(world, s);
}

function moveScraps(world: World, events: GameEvent[]): void {
	for (const s of world.scraps) {
		if (s.state !== "thrown") continue;
		flyScrap(world.level, s);
		if (s.state === "thrown") scrapHits(world, s, events);
	}
}

function touchDogs(world: World, events: GameEvent[]): void {
	const p = world.player;
	for (const d of world.dogs) {
		if (d.alive && overlaps(p, d.x, d.y, d.w, d.h)) hurt(p, d.x + d.w / 2, events);
	}
}

/** The box in front of Śrubek that a swing sweeps through. */
function swingBox(world: World): { x: number; y: number; w: number; h: number } {
	const p = world.player;
	const reach = world.meleeReach;
	return { x: p.facing > 0 ? p.x + p.w : p.x - reach, y: p.y - 8, w: reach, h: p.h + 8 };
}

/** Every drone and dog inside the box is destroyed. */
function strikeEnemies(
	world: World,
	box: { x: number; y: number; w: number; h: number },
	events: GameEvent[],
): void {
	for (const [list, type] of [
		[world.drones, "drone"],
		[world.dogs, "dog"],
	] as const) {
		for (const d of list) {
			if (!d.alive || !overlaps(box, d.x, d.y, d.w, d.h)) continue;
			d.alive = false;
			world.effects.push({ kind: "burst", x: d.x + d.w / 2, y: d.y + d.h / 2, frame: world.frame });
			events.push({ type });
		}
	}
}

/** A swing hurts during its middle frames: wind-up and follow-through are harmless. */
function swing(world: World, input: Input, events: GameEvent[]): void {
	const p = world.player;
	const pressed = input.attack && !p.attackHeld;
	p.attackHeld = input.attack;
	if (pressed && p.swingLeft === 0) {
		p.swingLeft = SWING_FRAMES;
		p.swingHit = false;
		events.push({ type: "swing" });
	}
	if (p.swingLeft === 0) return;
	p.swingLeft -= 1;
	if (p.swingLeft > 12 || p.swingLeft < 4) return;
	const box = swingBox(world);
	strikeEnemies(world, box, events);
	const boss = world.boss;
	if (!boss?.alive || p.swingHit || !overlaps(box, boss.x, boss.y, boss.w, boss.h)) return;
	p.swingHit = true;
	// A closed weak spot only clangs; a bared one takes the hit like a stomp.
	if (coreOpen(boss)) damageBoss(boss, world, events);
	else world.effects.push({ kind: "spark", x: box.x + box.w / 2, y: p.y + 4, frame: world.frame });
}

function fireMega(world: World, input: Input, events: GameEvent[]): void {
	const p = world.player;
	const pressed = input.mega && !p.megaHeld;
	p.megaHeld = input.mega;
	if (!pressed || world.megaBalls <= 0) return;
	world.megaBalls -= 1;
	world.megas.push({
		x: p.facing > 0 ? p.x + p.w : p.x - MEGA_SIZE,
		// Bottom flush with the wheels, so it clears the floor Śrubek stands on.
		y: p.y + p.h - MEGA_SIZE,
		vx: p.facing * MEGA_SPEED,
	});
	world.effects.push({ kind: "magnet", x: p.x + p.w / 2, y: p.y + 6, frame: world.frame });
	events.push({ type: "megaFired" });
}

function moveMegas(world: World, events: GameEvent[]): void {
	world.megas = world.megas.filter((m) => {
		m.x += m.vx;
		const box = { x: m.x, y: m.y, w: MEGA_SIZE, h: MEGA_SIZE };
		for (const d of world.drones) {
			if (!d.alive || !overlaps(box, d.x, d.y, d.w, d.h)) continue;
			d.alive = false;
			world.effects.push({ kind: "burst", x: d.x + d.w / 2, y: d.y + d.h / 2, frame: world.frame });
			events.push({ type: "drone" });
		}
		for (const d of world.dogs) {
			if (!d.alive || !overlaps(box, d.x, d.y, d.w, d.h)) continue;
			d.alive = false;
			world.effects.push({ kind: "burst", x: d.x + d.w / 2, y: d.y + d.h / 2, frame: world.frame });
			events.push({ type: "dog" });
		}
		const boss = world.boss;
		if (boss?.alive && overlaps(box, boss.x, boss.y, boss.w, boss.h)) {
			damageBoss(boss, world, events, 2);
			return false;
		}
		return !overlapsSolid(world.level, m.x, m.y, MEGA_SIZE, MEGA_SIZE);
	});
}

function moveShots(world: World, events: GameEvent[]): void {
	const p = world.player;
	world.shots = world.shots.filter((s) => {
		s.vy = Math.min(PHYSICS.maxFall, s.vy + PHYSICS.gravity * 0.5);
		s.x += s.vx;
		s.y += s.vy;
		if (overlaps(p, s.x, s.y, SCRAP, SCRAP)) {
			hurt(p, s.x + SCRAP / 2, events);
			return false;
		}
		return !overlapsSolid(world.level, s.x, s.y, SCRAP, SCRAP) && s.y < ROWS * TILE;
	});
}

export function hurt(p: Player, fromX: number, events: GameEvent[]): void {
	if (p.hurtLeft > 0) return;
	p.hurtLeft = PHYSICS.hurtFrames;
	p.vx = p.x + p.w / 2 < fromX ? -PHYSICS.knockback : PHYSICS.knockback;
	p.vy = PHYSICS.stompBounce;
	events.push({ type: "hit" });
}

function touchDrones(world: World, events: GameEvent[]): void {
	const p = world.player;
	for (const d of world.drones) {
		if (!d.alive || !overlaps(p, d.x, d.y, d.w, d.h)) continue;
		const fromAbove = p.vy > 0 && p.y + p.h - p.vy <= d.y + d.h / 2;
		if (fromAbove) {
			d.alive = false;
			p.vy = PHYSICS.stompBounce;
			p.sy = 0;
			world.effects.push({ kind: "burst", x: d.x + d.w / 2, y: d.y + d.h / 2, frame: world.frame });
			events.push({ type: "drone" });
		} else {
			hurt(p, d.x + d.w / 2, events);
		}
	}
}

function movePress(p: Press, tempo: number): void {
	const c = PHYSICS;
	switch (p.phase) {
		case "wait":
			if (p.timer-- <= 0) p.phase = "drop";
			return;
		case "drop":
			p.y = Math.min(p.floorY, p.y + c.pressDrop);
			if (p.y === p.floorY) {
				p.phase = "hold";
				p.timer = c.pressHold;
			}
			return;
		case "hold":
			if (p.timer-- <= 0) p.phase = "rise";
			return;
		case "rise":
			p.y = Math.max(p.topY, p.y - c.pressRise);
			if (p.y === p.topY) {
				p.phase = "wait";
				p.timer = Math.round(c.pressWait * tempo);
			}
			return;
	}
}

function touchPresses(world: World, events: GameEvent[]): void {
	const p = world.player;
	for (const press of world.presses) {
		movePress(press, world.level.tempo);
		if (press.phase === "drop" && overlaps(p, press.x, press.y, TILE, TILE)) {
			hurt(p, press.x + TILE / 2, events);
		}
	}
}

function touchPickups(world: World, events: GameEvent[]): void {
	const p = world.player;
	for (const item of world.pickups) {
		if (item.taken || !overlaps(p, item.x * TILE, item.y * TILE, TILE, TILE)) continue;
		item.taken = true;
		world.effects.push({
			kind: "spark",
			x: item.x * TILE + 8,
			y: item.y * TILE + 8,
			frame: world.frame,
		});
		events.push({ type: "pickup", kind: item.kind });
	}
	for (const c of world.level.chargers) {
		if (!overlaps(p, c.x * TILE, c.y * TILE, TILE, TILE)) continue;
		events.push({ type: "charge" });
		if (world.frame % 6 === 0)
			world.effects.push({
				kind: "charge",
				x: c.x * TILE + 8,
				y: c.y * TILE + 4,
				frame: world.frame,
			});
	}
	for (const g of world.level.gates) {
		if (overlaps(p, g.x * TILE, (g.y - 2) * TILE, TILE, 3 * TILE)) events.push({ type: "gate" });
	}
}

function movePlatforms(world: World): void {
	for (const pl of world.platforms) {
		if (pl.kind !== "mover") continue;
		const before = pl.x;
		pl.x += pl.dir;
		if (pl.x >= pl.maxX) {
			pl.x = pl.maxX;
			pl.dir = -1;
		} else if (pl.x <= pl.minX) {
			pl.x = pl.minX;
			pl.dir = 1;
		}
		pl.dx = pl.x - before;
	}
}

/** True while a platform can be stood on (an open trapdoor cannot). */
function platformSolid(pl: Platform): boolean {
	return pl.kind === "mover" || pl.openLeft === 0;
}

/** One-way landing: falling onto a platform from above stops Śrubek on it and carries him along. */
function ridePlatforms(world: World): void {
	const p = world.player;
	for (const pl of world.platforms) {
		pl.stood = false;
		if (!platformSolid(pl) || p.vy < 0) continue;
		const bottom = p.y + p.h;
		const over = p.x + p.w > pl.x + 1 && p.x < pl.x + pl.w - 1;
		if (!over || bottom < pl.y - 1 || bottom > pl.y + 7) continue;
		p.y = pl.y - p.h;
		p.vy = 0;
		p.sy = 0;
		p.onGround = true;
		pl.stood = true;
		if (pl.dx !== 0 && !overlapsSolid(world.level, p.x + pl.dx, p.y, p.w, p.h)) p.x += pl.dx;
	}
}

function stepTraps(world: World): void {
	for (const pl of world.platforms) {
		if (pl.kind !== "trap") continue;
		if (pl.openLeft > 0) {
			pl.openLeft -= 1;
			if (pl.openLeft === 0) pl.timer = 0;
			continue;
		}
		pl.timer = pl.stood ? pl.timer + 1 : 0;
		if (pl.timer >= PHYSICS.trapHold) pl.openLeft = PHYSICS.trapOpen;
	}
}

/** Spikes hurt on touch; a spring throws Śrubek high when he lands or rolls onto it. */
function touchHazards(world: World, events: GameEvent[]): void {
	const p = world.player;
	for (const k of world.level.spikes) {
		if (overlaps(p, k.x * TILE + 1, k.y * TILE + 8, TILE - 2, 8))
			hurt(p, k.x * TILE + TILE / 2, events);
	}
	for (const j of world.level.springs) {
		if (p.vy < 0 || !overlaps(p, j.x * TILE + 1, j.y * TILE + 8, TILE - 2, 8)) continue;
		p.vy = PHYSICS.springVelocity;
		p.sy = 0;
		p.holdLeft = 0;
		p.airJumps = 1;
		p.onGround = false;
		world.effects.push({
			kind: "dust",
			x: j.x * TILE + TILE / 2,
			y: j.y * TILE + TILE,
			frame: world.frame,
		});
		events.push({ type: "spring" });
	}
}

export function step(world: World, input: Input): GameEvent[] {
	const p = world.player;
	const events: GameEvent[] = [];
	control(p, input, events);
	moveX(world);
	moveY(world);
	movePlatforms(world);
	ridePlatforms(world);
	stepTraps(world);
	moveDrones(world);
	moveDogs(world);
	magnet(world, input, events);
	fireMega(world, input, events);
	swing(world, input, events);
	// Dust kicked up by the wheels at speed.
	if (p.onGround && Math.abs(p.vx) > 1.6 && world.frame % 5 === 0) {
		world.effects.push({
			kind: "dust",
			x: p.x + p.w / 2 - p.facing * 6,
			y: p.y + p.h,
			frame: world.frame,
		});
	}
	moveScraps(world, events);
	touchDrones(world, events);
	touchDogs(world, events);
	touchPresses(world, events);
	touchPickups(world, events);
	touchHazards(world, events);
	stepBoss(world, events);
	moveShots(world, events);
	moveMegas(world, events);
	if (p.hurtLeft > 0) p.hurtLeft -= 1;
	if (p.boostLeft > 0) p.boostLeft -= 1;
	if (p.y > ROWS * TILE) events.push({ type: "fall" });
	world.effects = world.effects.filter((e) => world.frame - e.frame < EFFECT_FRAMES);

	const maxCamera = world.level.widthTiles * TILE - VIEW_W;
	world.camera = Math.max(0, Math.min(maxCamera, p.x + p.w / 2 - VIEW_W / 2));
	world.frame += 1;
	return events;
}
