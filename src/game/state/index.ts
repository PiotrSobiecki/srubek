/** Score and progress. Pure: events in, new state out. */

import type { GameEvent } from "@/game/engine";

export const NUT_POINTS = 10;

export interface GameState {
	points: number;
}

export function createState(): GameState {
	return { points: 0 };
}

export function applyEvents(state: GameState, events: GameEvent[]): GameState {
	let points = state.points;
	for (const e of events) if (e.type === "nut") points += NUT_POINTS;
	return { ...state, points };
}
