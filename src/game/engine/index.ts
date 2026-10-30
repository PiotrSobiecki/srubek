/**
 * Physics and collision. Runs at a fixed 60 steps per second; every constant is
 * in pixels per frame so a test can replay N frames and assert on positions.
 */

import { isSolid, type Level, TILE, type Vec } from "@/game/level";

export const VIEW_W = 480;
export const VIEW_H = 256;

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
	/** Frames of invulnerability after a hit. */
	hurtFrames: 60,
} as const;

export interface Input {
	left: boolean;
	right: boolean;
	jump: boolean;
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
}

interface Nut extends Vec {
	taken: boolean;
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

export interface World {
	level: Level;
	player: Player;
	nuts: Nut[];
	drones: Drone[];
	camera: number;
	frame: number;
}

export type GameEvent = { type: "nut" } | { type: "drone" } | { type: "hit" } | { type: "charge" };

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
		},
		nuts: level.nuts.map((n) => ({ ...n, taken: false })),
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
		camera: 0,
		frame: 0,
	};
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

function control(p: Player, input: Input): void {
	const c = PHYSICS;
	if (input.left === input.right) {
		p.vx = Math.abs(p.vx) <= c.friction ? 0 : p.vx - Math.sign(p.vx) * c.friction;
	} else {
		const dir = input.right ? 1 : -1;
		p.facing = dir;
		p.vx = Math.max(-c.maxRun, Math.min(c.maxRun, p.vx + dir * c.runAccel));
	}

	if (input.jump && !p.jumpHeld && p.onGround) {
		p.vy = c.jumpVelocity;
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
			events.push({ type: "drone" });
		} else {
			hurt(p, d.x + d.w / 2, events);
		}
	}
}

function touchPickups(world: World, events: GameEvent[]): void {
	const p = world.player;
	for (const nut of world.nuts) {
		if (nut.taken || !overlaps(p, nut.x * TILE, nut.y * TILE, TILE, TILE)) continue;
		nut.taken = true;
		events.push({ type: "nut" });
	}
	for (const c of world.level.chargers) {
		if (overlaps(p, c.x * TILE, c.y * TILE, TILE, TILE)) events.push({ type: "charge" });
	}
}

export function step(world: World, input: Input): GameEvent[] {
	const p = world.player;
	control(p, input);
	moveX(world);
	moveY(world);
	moveDrones(world);

	const events: GameEvent[] = [];
	touchDrones(world, events);
	touchPickups(world, events);
	if (p.hurtLeft > 0) p.hurtLeft -= 1;

	const maxCamera = world.level.widthTiles * TILE - VIEW_W;
	world.camera = Math.max(0, Math.min(maxCamera, p.x + p.w / 2 - VIEW_W / 2));
	world.frame += 1;
	return events;
}
