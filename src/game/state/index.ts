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
	/** `boss` means the gate was reached and the arena is on. */
	status: "playing" | "boss" | "over";
}

export function createState(): GameState {
	return {
		points: 0,
		levelPoints: 0,
		battery: BATTERY_MAX,
		lives: LIVES_START,
		respawns: 0,
		level: 1,
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
		case "bolt":
			return { ...state, levelPoints: state.levelPoints + BOLT_POINTS };
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
			// The level is banked and the next one starts fresh.
			return {
				...state,
				points: state.points + state.levelPoints + BOSS_POINTS,
				levelPoints: 0,
				level: state.level + 1,
				battery: BATTERY_MAX,
				status: "playing",
			};
		case "slam":
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

export function applyEvents(state: GameState, events: GameEvent[]): GameState {
	let next = state;
	for (const e of events) {
		if (next.status === "playing" || next.status === "boss") next = applyEvent(next, e);
	}
	return next;
}
