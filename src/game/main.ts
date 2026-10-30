/** Browser entry: keyboard in, fixed-step simulation, one render per animation frame. */

import { createAudio } from "@/game/audio";
import { createBoss, makeBoss } from "@/game/boss";
import { createWorld, type Input, step, type World } from "@/game/engine";
import { buildArena, buildLevel } from "@/game/level";
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
	KeyC: "magnet",
	KeyE: "magnet",
	KeyX: "throw",
	KeyF: "throw",
	ControlLeft: "throw",
	ArrowDown: "throw",
};

export interface Hooks {
	/** The run just ended, won or lost; the page may ask for a nick. */
	onEnd?(state: GameState): void;
	onRestart?(): void;
}

export function start(canvas: HTMLCanvasElement, hooks: Hooks = {}): void {
	const input: Input = { left: false, right: false, jump: false, magnet: false, throw: false };
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

	// shortcut: one track per theme until the generator assigns music per level in phase 10
	const audio = createAudio(query.get("theme") === "stocznia" ? 2 : 1);
	const onShortcut = (code: string): void => {
		audio.unlock();
		if (code === "KeyM") audio.toggleMute();
		if (code === "Enter" && (state.status === "over" || state.status === "won")) {
			world = createWorld(level);
			state = createState();
			hooks.onRestart?.();
		}
	};
	const onKey = (down: boolean) => (e: KeyboardEvent) => {
		// Typing a nick into the form must not steer the game.
		if (e.target instanceof HTMLInputElement) return;
		if (down) onShortcut(e.code);
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

	const arena = buildArena();
	const enterArena = (): World =>
		createWorld(arena, createBoss(makeBoss("prasa", "opad", "rdzen", 1), arena.widthTiles));

	/** Picks the world a new state calls for: the arena after the gate, a fresh one after a lost life. */
	const worldFor = (prev: GameState, next: GameState): World => {
		if (next.status === "boss" && prev.status === "playing") return enterArena();
		if (next.respawns !== prev.respawns)
			return next.status === "boss" ? enterArena() : createWorld(level);
		return world;
	};

	const tick = (): void => {
		if (state.status === "over" || state.status === "won") return;
		const events = step(world, input);
		audio.react(events);
		const next = applyEvents(state, events);
		for (const key of released) input[key] = false;
		released.clear();
		world = worldFor(state, next);
		// The early return above means any end status here is a fresh one.
		if (next.status === "over" || next.status === "won") hooks.onEnd?.(next);
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
