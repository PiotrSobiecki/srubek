/** Score, battery and lives. Pure: events in, new state out. */

import type { GameEvent } from "@/game/engine";
import type { PickupKind } from "@/game/level";

export const NUT_POINTS = 10;
export const BOLT_POINTS = 5;
export const GEAR_POINTS = 25;
export const DRONE_POINTS = 50;
export const DOG_POINTS = 100;
export const BOSS_HIT_POINTS = 100;
export const BOSS_POINTS = 500;
/** Bolts it takes to forge one mega bolt ball. */
export const BOLTS_PER_MEGA = 10;
export const BATTERY_MAX = 3;
export const LIVES_START = 3;

export interface GameState {
	/** Points banked from finished levels. */
	points: number;
	/** Points of the level in progress; lost with a life. */
	levelPoints: number;
	battery: number;
	lives: number;
	/** Bumps each time a life is lost, so the caller knows to respawn. */
	respawns: number;
	/** Level in progress, counted from 1 and never capped. */
	level: number;
	/** Keys of bosses beaten this run, so none repeats until the pool is spent. */
	bossesSeen: string[];
	/** Bolts gathered toward the next mega ball. */
	bolts: number;
	megaBalls: number;
	/** Picks this run's level layouts, looks and bosses. */
	seed: number;
	/** `boss` means the gate was reached and the arena is on. */
	/** `cleared` is the pause after a beaten boss; Enter moves on. */
	status: "playing" | "boss" | "cleared" | "over";
}

export function createState(seed = 0): GameState {
	return {
		points: 0,
		levelPoints: 0,
		battery: BATTERY_MAX,
		lives: LIVES_START,
		respawns: 0,
		level: 1,
		bossesSeen: [],
		bolts: 0,
		megaBalls: 0,
		seed,
		status: "playing",
	};
}

export function totalPoints(state: GameState): number {
	return state.points + state.levelPoints;
}

function loseLife(state: GameState): GameState {
	const lives = state.lives - 1;
	return {
		...state,
		lives,
		levelPoints: 0,
		battery: BATTERY_MAX,
		respawns: state.respawns + 1,
		status: lives > 0 ? state.status : "over",
	};
}

function pickUp(state: GameState, kind: PickupKind): GameState {
	switch (kind) {
		case "nut":
			return { ...state, levelPoints: state.levelPoints + NUT_POINTS };
		case "bolt": {
			const bolts = state.bolts + 1;
			const forged = bolts >= BOLTS_PER_MEGA;
			return {
				...state,
				levelPoints: state.levelPoints + BOLT_POINTS,
				bolts: forged ? 0 : bolts,
				megaBalls: forged ? state.megaBalls + 1 : state.megaBalls,
			};
		}
		case "gear":
			return { ...state, levelPoints: state.levelPoints + GEAR_POINTS };
		case "cell":
			return { ...state, battery: Math.min(BATTERY_MAX, state.battery + 1) };
		case "life":
			return { ...state, lives: state.lives + 1 };
	}
}

function applyEvent(state: GameState, event: GameEvent): GameState {
	switch (event.type) {
		case "pickup":
			return pickUp(state, event.kind);
		case "drone":
			return { ...state, levelPoints: state.levelPoints + DRONE_POINTS };
		case "dog":
			return { ...state, levelPoints: state.levelPoints + DOG_POINTS };
		case "charge":
			return { ...state, battery: BATTERY_MAX };
		case "fall":
			return loseLife(state);
		case "gate":
			return { ...state, status: "boss" };
		case "bossHit":
			return { ...state, levelPoints: state.levelPoints + BOSS_HIT_POINTS };
		case "bossDown":
			// The level is banked; the run waits on the cleared screen until Enter.
			return {
				...state,
				points: state.points + state.levelPoints + BOSS_POINTS,
				levelPoints: 0,
				bossesSeen: [...state.bossesSeen, event.boss],
				battery: BATTERY_MAX,
				status: "cleared",
			};
		case "slam":
		case "spring":
		case "swing":
			return state;
		case "megaFired":
			return { ...state, megaBalls: Math.max(0, state.megaBalls - 1) };
		case "jump":
		case "airjump":
		case "pull":
		case "throw":
			return state;
		case "hit": {
			const battery = state.battery - 1;
			return battery > 0 ? { ...state, battery } : loseLife(state);
		}
	}
}

/** Leaves the cleared screen for the next level. */
export function nextLevel(state: GameState): GameState {
	if (state.status !== "cleared") return state;
	return { ...state, level: state.level + 1, status: "playing" };
}

export function applyEvents(state: GameState, events: GameEvent[]): GameState {
	let next = state;
	for (const e of events) {
		if (next.status === "playing" || next.status === "boss") next = applyEvent(next, e);
	}
	return next;
}
