/** Browser entry: keyboard in, fixed-step simulation, one render per animation frame. */

import { createWorld, type Input, step } from "@/game/engine";
import { buildLevel } from "@/game/level";
import { createRenderer } from "@/game/render";
import { applyEvents, createState } from "@/game/state";

const STEP_MS = 1000 / 60;

const KEYS: Record<string, keyof Input> = {
	ArrowLeft: "left",
	KeyA: "left",
	ArrowRight: "right",
	KeyD: "right",
	Space: "jump",
	ArrowUp: "jump",
	KeyW: "jump",
};

export function start(canvas: HTMLCanvasElement): void {
	const input: Input = { left: false, right: false, jump: false };
	const onKey = (down: boolean) => (e: KeyboardEvent) => {
		const key = KEYS[e.code];
		if (!key) return;
		input[key] = down;
		e.preventDefault();
	};
	window.addEventListener("keydown", onKey(true));
	window.addEventListener("keyup", onKey(false));

	const world = createWorld(buildLevel(1));
	let state = createState();
	const render = createRenderer(canvas);

	let last = performance.now();
	let acc = 0;
	const frame = (now: number): void => {
		// Cap the catch-up so a background tab does not fast-forward the game.
		acc = Math.min(acc + (now - last), STEP_MS * 5);
		last = now;
		while (acc >= STEP_MS) {
			state = applyEvents(state, step(world, input));
			acc -= STEP_MS;
		}
		render(world, state);
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}
