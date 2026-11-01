/**
 * The most points a run can hold after reaching a given level. Shared by the
 * game (to show it) and the scores endpoint (to refuse the impossible), so both
 * sides agree without either trusting the other.
 */

import { pickBoss } from "@/game/boss";
import { buildLevel } from "@/game/level";
import {
	BOLT_POINTS,
	BOSS_HIT_POINTS,
	BOSS_POINTS,
	DOG_POINTS,
	DRONE_POINTS,
	GEAR_POINTS,
	NUT_POINTS,
} from "@/game/state";

const PICKUP_POINTS = {
	nut: NUT_POINTS,
	bolt: BOLT_POINTS,
	gear: GEAR_POINTS,
	cell: 0,
	life: 0,
} as const;

/** Everything one level and its boss can pay out. */
function levelMax(n: number, seed: number): number {
	const level = buildLevel(n, seed);
	const pickups = level.pickups.reduce((sum, p) => sum + PICKUP_POINTS[p.kind], 0);
	const enemies = level.drones.length * DRONE_POINTS + level.dogs.length * DOG_POINTS;
	const boss = (pickBoss(n, []).hp - 1) * BOSS_HIT_POINTS + BOSS_POINTS;
	return pickups + enemies + boss;
}

/** `seed` is the run's: its levels are what the player could collect from. */
export function maxScore(level: number, seed = 0): number {
	let total = 0;
	for (let n = 1; n <= Math.max(1, level); n++) total += levelMax(n, seed);
	return total;
}
