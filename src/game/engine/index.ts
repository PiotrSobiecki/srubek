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
}

interface Nut extends Vec {
	taken: boolean;
}

export interface World {
	level: Level;
	player: Player;
	nuts: Nut[];
	camera: number;
	frame: number;
}

export type GameEvent = { type: "nut" };

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
		},
		nuts: level.nuts.map((n) => ({ ...n, taken: false })),
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

function collectNuts(world: World, events: GameEvent[]): void {
	const p = world.player;
	for (const nut of world.nuts) {
		if (nut.taken) continue;
		const nx = nut.x * TILE;
		const ny = nut.y * TILE;
		if (p.x < nx + TILE && p.x + p.w > nx && p.y < ny + TILE && p.y + p.h > ny) {
			nut.taken = true;
			events.push({ type: "nut" });
		}
	}
}

export function step(world: World, input: Input): GameEvent[] {
	const p = world.player;
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

	moveX(world);
	moveY(world);

	const events: GameEvent[] = [];
	collectNuts(world, events);

	const maxCamera = world.level.widthTiles * TILE - VIEW_W;
	world.camera = Math.max(0, Math.min(maxCamera, p.x + p.w / 2 - VIEW_W / 2));
	world.frame += 1;
	return events;
}
