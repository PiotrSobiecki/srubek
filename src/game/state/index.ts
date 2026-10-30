/** Score, battery and lives. Pure: events in, new state out. */

import type { GameEvent } from "@/game/engine";

export const NUT_POINTS = 10;
export const DRONE_POINTS = 50;
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
	status: "playing" | "over";
}

export function createState(): GameState {
	return {
		points: 0,
		levelPoints: 0,
		battery: BATTERY_MAX,
		lives: LIVES_START,
		respawns: 0,
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
		status: lives > 0 ? "playing" : "over",
	};
}

function applyEvent(state: GameState, event: GameEvent): GameState {
	switch (event.type) {
		case "nut":
			return { ...state, levelPoints: state.levelPoints + NUT_POINTS };
		case "drone":
			return { ...state, levelPoints: state.levelPoints + DRONE_POINTS };
		case "charge":
			return { ...state, battery: BATTERY_MAX };
		case "hit": {
			const battery = state.battery - 1;
			return battery > 0 ? { ...state, battery } : loseLife(state);
		}
	}
}

export function applyEvents(state: GameState, events: GameEvent[]): GameState {
	let next = state;
	for (const e of events) if (next.status === "playing") next = applyEvent(next, e);
	return next;
}
