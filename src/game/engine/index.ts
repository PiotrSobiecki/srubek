/**
 * Physics and collision. Runs at a fixed 60 steps per second; every constant is
 * in pixels per frame so a test can replay N frames and assert on positions.
 */

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
}

interface PickupItem extends Vec {
	kind: PickupKind;
	taken: boolean;
}

/** A short visual, kept in the world so a test can see it and the renderer can draw it. */
interface Effect {
	kind: "burst" | "spark" | "charge";
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
	state: "ground" | "held" | "thrown";
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

export interface World {
	level: Level;
	player: Player;
	pickups: PickupItem[];
	drones: Drone[];
	scraps: Scrap[];
	dogs: Dog[];
	presses: Press[];
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
	| { type: "gate" };

export function createWorld(level: Level): World {
	const w = 12;
	const h = 16;
	return {
		level,
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
		scraps: level.scraps.map((s) => ({
			x: s.x * TILE + 4,
			y: s.y * TILE + 8,
			vx: 0,
			vy: 0,
			state: "ground",
		})),
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
			timer: PHYSICS.pressWait - ((i * 23) % PHYSICS.pressWait),
		})),
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

function control(p: Player, input: Input): void {
	const c = PHYSICS;
	steer(p, input);

	if (p.onGround) p.airJumps = 1;
	if (input.jump && !p.jumpHeld && (p.onGround || p.airJumps > 0)) {
		if (!p.onGround) {
			p.airJumps -= 1;
			p.boostLeft = 12;
		}
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

const SCRAP = 8;

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

function nearestScrap(world: World): Scrap | undefined {
	const p = world.player;
	const cx = p.x + p.w / 2;
	const cy = p.y + p.h / 2;
	let best: Scrap | undefined;
	let bestD: number = PHYSICS.magnetRange;
	for (const s of world.scraps) {
		if (s.state !== "ground") continue;
		const d = Math.hypot(s.x + SCRAP / 2 - cx, s.y + SCRAP / 2 - cy);
		if (d <= bestD) {
			best = s;
			bestD = d;
		}
	}
	return best;
}

/** One press pulls the nearest scrap in; the next press throws it the way Śrubek faces. */
function magnet(world: World, input: Input): void {
	const p = world.player;
	const pressed = input.magnet && !p.magnetHeld;
	p.magnetHeld = input.magnet;
	const held = world.scraps.find((s) => s.state === "held");
	if (held) {
		held.x = p.x + p.w / 2 - SCRAP / 2;
		held.y = p.y - SCRAP - 2;
		if (pressed) {
			// Thrown low, from the feet, so it skids along the ground into whatever walks there.
			held.state = "thrown";
			held.x = p.facing > 0 ? p.x + p.w : p.x - SCRAP;
			held.y = p.y + p.h - SCRAP;
			held.vx = p.facing * PHYSICS.throwVx;
			held.vy = PHYSICS.throwVy;
		}
		return;
	}
	if (!pressed) return;
	const target = nearestScrap(world);
	if (target) target.state = "held";
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

function scrapHitsDog(world: World, s: Scrap, events: GameEvent[]): void {
	for (const d of world.dogs) {
		if (!d.alive || !overlaps({ x: s.x, y: s.y, w: SCRAP, h: SCRAP }, d.x, d.y, d.w, d.h)) continue;
		d.alive = false;
		s.state = "ground";
		s.vx = 0;
		world.effects.push({ kind: "burst", x: d.x + d.w / 2, y: d.y + d.h / 2, frame: world.frame });
		events.push({ type: "dog" });
	}
}

function moveScraps(world: World, events: GameEvent[]): void {
	for (const s of world.scraps) {
		if (s.state !== "thrown") continue;
		flyScrap(world.level, s);
		if (s.state === "thrown") scrapHitsDog(world, s, events);
	}
}

function touchDogs(world: World, events: GameEvent[]): void {
	const p = world.player;
	for (const d of world.dogs) {
		if (d.alive && overlaps(p, d.x, d.y, d.w, d.h)) hurt(p, d.x + d.w / 2, events);
	}
}

function hurt(p: Player, fromX: number, events: GameEvent[]): void {
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

function movePress(p: Press): void {
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
				p.timer = c.pressWait;
			}
			return;
	}
}

function touchPresses(world: World, events: GameEvent[]): void {
	const p = world.player;
	for (const press of world.presses) {
		movePress(press);
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

export function step(world: World, input: Input): GameEvent[] {
	const p = world.player;
	control(p, input);
	moveX(world);
	moveY(world);
	moveDrones(world);
	moveDogs(world);
	magnet(world, input);

	const events: GameEvent[] = [];
	moveScraps(world, events);
	touchDrones(world, events);
	touchDogs(world, events);
	touchPresses(world, events);
	touchPickups(world, events);
	if (p.hurtLeft > 0) p.hurtLeft -= 1;
	if (p.boostLeft > 0) p.boostLeft -= 1;
	if (p.y > ROWS * TILE) events.push({ type: "fall" });
	world.effects = world.effects.filter((e) => world.frame - e.frame < EFFECT_FRAMES);

	const maxCamera = world.level.widthTiles * TILE - VIEW_W;
	world.camera = Math.max(0, Math.min(maxCamera, p.x + p.w / 2 - VIEW_W / 2));
	world.frame += 1;
	return events;
}
