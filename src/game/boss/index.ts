/**
 * Boss fights. A boss is a body, an attack and a weak spot, scaled by the level
 * number; `stepBoss` runs one frame of it against the player. Phase 1 ships one
 * combination: the giant press that drops on Śrubek and bares its core after
 * every slam.
 */

import { type GameEvent, hurt, type World } from "@/game/engine";
import { ROWS, TILE } from "@/game/level";

export type BossBody = "prasa";
export type BossAttack = "opad";
export type BossWeakSpot = "rdzen";

export interface BossSpec {
	body: BossBody;
	attack: BossAttack;
	weakSpot: BossWeakSpot;
	hp: number;
	/** Frames hovering before the drop. */
	waitFrames: number;
	/** Frames the core stays bare after a slam. */
	openFrames: number;
	trackSpeed: number;
	dropSpeed: number;
	riseSpeed: number;
}

export interface Boss {
	spec: BossSpec;
	x: number;
	y: number;
	w: number;
	h: number;
	topY: number;
	floorY: number;
	phase: "track" | "drop" | "slam" | "rise";
	timer: number;
	hp: number;
	alive: boolean;
}

/** Numbers grow gently with the level so a later press hits harder and rests less. */
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
		hp: 3 + Math.floor(k / 20),
		waitFrames: Math.max(40, 90 - k),
		openFrames: Math.max(40, 80 - k * 0.5),
		trackSpeed: Math.min(3, 1.2 + k * 0.03),
		dropSpeed: Math.min(9, 5 + k * 0.05),
		riseSpeed: Math.min(3, 1 + k * 0.03),
	};
}

export function createBoss(spec: BossSpec, arenaWidthTiles: number): Boss {
	const w = 48;
	const h = 28;
	const topY = 12;
	return {
		spec,
		x: (arenaWidthTiles * TILE) / 2 - w / 2,
		y: topY,
		w,
		h,
		topY,
		floorY: (ROWS - 2) * TILE - h,
		phase: "track",
		timer: spec.waitFrames,
		hp: spec.hp,
		alive: true,
	};
}

function track(boss: Boss, world: World): void {
	const p = world.player;
	const target = p.x + p.w / 2 - boss.w / 2;
	const dx = target - boss.x;
	boss.x += Math.sign(dx) * Math.min(Math.abs(dx), boss.spec.trackSpeed);
	if (boss.timer-- <= 0) boss.phase = "drop";
}

function drop(boss: Boss, world: World, events: GameEvent[]): void {
	boss.y = Math.min(boss.floorY, boss.y + boss.spec.dropSpeed);
	if (boss.y < boss.floorY) return;
	boss.phase = "slam";
	boss.timer = boss.spec.openFrames;
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

/** True while the core is bare and a stomp counts. */
export function coreOpen(boss: Boss): boolean {
	return boss.alive && boss.phase === "slam";
}

function touch(boss: Boss, world: World, events: GameEvent[]): void {
	const p = world.player;
	const overlapping =
		p.x < boss.x + boss.w && p.x + p.w > boss.x && p.y < boss.y + boss.h && p.y + p.h > boss.y;
	if (!overlapping) return;
	if (boss.phase === "drop") {
		hurt(p, boss.x + boss.w / 2, events);
		return;
	}
	const fromAbove = p.vy > 0 && p.y + p.h - p.vy <= boss.y + 6;
	if (!coreOpen(boss) || !fromAbove) return;
	boss.hp -= 1;
	p.vy = -4.5;
	p.sy = 0;
	world.effects.push({ kind: "burst", x: boss.x + boss.w / 2, y: boss.y, frame: world.frame });
	if (boss.hp > 0) {
		// Stunned: the press pulls up right away.
		boss.phase = "rise";
		events.push({ type: "bossHit" });
		return;
	}
	boss.alive = false;
	events.push({ type: "bossDown" });
}

export function stepBoss(world: World, events: GameEvent[]): void {
	const boss = world.boss;
	if (!boss || !boss.alive) return;
	switch (boss.phase) {
		case "track":
			track(boss, world);
			break;
		case "drop":
			drop(boss, world, events);
			break;
		case "slam":
			if (boss.timer-- <= 0) boss.phase = "rise";
			break;
		case "rise":
			rise(boss);
			break;
	}
	touch(boss, world, events);
}
