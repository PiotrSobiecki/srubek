/** Browser entry: keyboard in, fixed-step simulation, one render per animation frame. */

import { createWorld, type Input, step, type World } from "@/game/engine";
import { buildLevel } from "@/game/level";
import { createRenderer } from "@/game/render";
import { applyEvents, createState, type GameState } from "@/game/state";

const STEP_MS = 1000 / 60;

const KEYS: Record<string, keyof Input> = {
	ArrowLeft: "left",
	KeyA: "left",
	ArrowRight: "right",
	KeyD: "right",
	Space: "jump",
	ArrowUp: "jump",
	KeyW: "jump",
	KeyE: "magnet",
	KeyX: "magnet",
	ShiftLeft: "magnet",
	ArrowDown: "magnet",
	KeyS: "magnet",
};

export function start(canvas: HTMLCanvasElement): void {
	const input: Input = { left: false, right: false, jump: false, magnet: false };
	const level = buildLevel(1);
	// ?x=<tile> starts Śrubek deeper in the level, for looking at a section without replaying it.
	const query = new URLSearchParams(location.search);
	const startTile = Number(query.get("x"));
	if (Number.isFinite(startTile) && startTile > 0) level.spawn = { ...level.spawn, x: startTile };
	let world: World = createWorld(level);
	let state: GameState = createState();
	// shortcut: ?theme=stocznia previews the second backdrop until the generator picks themes in phase 10
	const render = createRenderer(
		canvas,
		query.get("theme") === "stocznia" ? "stocznia" : "zlomowisko",
	);

	const onKey = (down: boolean) => (e: KeyboardEvent) => {
		if (down && state.status === "over" && e.code === "Enter") {
			world = createWorld(level);
			state = createState();
		}
		const key = KEYS[e.code];
		if (!key) return;
		// A release waits for the next step, so even a tap shorter than a frame registers.
		if (down) input[key] = true;
		else released.add(key);
		e.preventDefault();
	};
	const released = new Set<keyof Input>();
	window.addEventListener("keydown", onKey(true));
	window.addEventListener("keyup", onKey(false));

	const tick = (): void => {
		if (state.status === "over") return;
		const next = applyEvents(state, step(world, input));
		for (const key of released) input[key] = false;
		released.clear();
		if (next.respawns !== state.respawns) world = createWorld(level);
		state = next;
	};

	let last = performance.now();
	let acc = 0;
	const frame = (now: number): void => {
		// Cap the catch-up so a background tab does not fast-forward the game.
		acc = Math.min(acc + (now - last), STEP_MS * 5);
		last = now;
		while (acc >= STEP_MS) {
			tick();
			acc -= STEP_MS;
		}
		render(world, state);
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}
