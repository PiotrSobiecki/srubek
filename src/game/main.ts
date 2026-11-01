/** Browser entry: keyboard in, fixed-step simulation, one render per animation frame. */

import { createAudio } from "@/game/audio";
import {
	type BossAttack,
	type BossBody,
	type BossWeakSpot,
	createBoss,
	makeBoss,
	pickBoss,
} from "@/game/boss";
import { carriedScrap, createWorld, type Input, step, VIEW_W, type World } from "@/game/engine";
import { buildArena, buildLevel, type Level } from "@/game/level";
import { type BoardRow, createRenderer } from "@/game/render";
import { applyEvents, createState, type GameState, nextLevel } from "@/game/state";
import { type Bindings, DEFAULT_BINDINGS } from "@/keys";
import { DEFAULT_SKIN, HAND_REACH, type Skin } from "@/skin";

const STEP_MS = 1000 / 60;

/** Key code to control, flattened from the bindings. */
function keyMap(bindings: Bindings): Map<string, keyof Input> {
	return new Map(
		(Object.entries(bindings) as [keyof Input, string[]][]).flatMap(([action, codes]) =>
			codes.map((code) => [code, action] as const),
		),
	);
}

/** Every run gets its own seed, so its levels, looks and bosses differ from the last run's. */
function newSeed(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

export interface Hooks {
	/** The run just ended, won or lost; the page may ask for a nick. */
	onEnd?(state: GameState): void;
	onRestart?(): void;
}

export interface Game {
	/** The page hands in the leaderboard; the end screen draws it. */
	setBoard(rows: readonly BoardRow[]): void;
	/** Press or release a control from outside the keyboard (touch pad, mouse). */
	press(key: keyof Input, down: boolean): void;
	/** What Enter does: restart after a loss, move on after a boss. */
	enter(): void;
	/** Change Śrubek's look; takes effect on the next frame. */
	setSkin(skin: Skin): void;
	/** Steer toward a point on the canvas (0..1 of its width), or stop steering. */
	pointAt(fraction: number | undefined): void;
	/** Freeze the simulation (menu open); drawing continues. */
	setPaused(paused: boolean): void;
	/** Which keys drive which control. */
	setKeys(bindings: Bindings): void;
}

export function start(canvas: HTMLCanvasElement, hooks: Hooks = {}): Game {
	let board: readonly BoardRow[] = [];
	let skin: Skin = DEFAULT_SKIN;
	let pointer: number | undefined;
	let paused = false;
	let keys = keyMap(DEFAULT_BINDINGS);
	const input: Input = {
		left: false,
		right: false,
		jump: false,
		magnet: false,
		throw: false,
		mega: false,
		attack: false,
	};
	// ?level=<n> and ?x=<tile> open a later level or section for a look without replaying.
	const query = new URLSearchParams(location.search);
	const startLevel = Math.max(1, Math.floor(Number(query.get("level")) || 1));
	const startTile = Number(query.get("x"));
	let state: GameState = { ...createState(newSeed()), level: startLevel };
	const freshLevel = (n: number): Level => {
		const built = buildLevel(n, state.seed);
		if (n === startLevel && Number.isFinite(startTile) && startTile > 0) {
			built.spawn = { ...built.spawn, x: startTile };
		}
		return built;
	};
	let level = freshLevel(startLevel);
	let world: World = createWorld(level);
	const render = createRenderer(canvas);
	const audio = createAudio(((startLevel - 1) % 3) + 1);
	const onShortcut = (code: string): void => {
		if (paused) return;
		audio.unlock();
		if (code === "KeyM") audio.toggleMute();
		if (code === "Enter" && state.status === "cleared") {
			const next = nextLevel(state);
			world = worldFor(state, next);
			state = next;
		}
		if (code === "Enter" && state.status === "over") {
			state = createState(newSeed());
			level = freshLevel(1);
			world = createWorld(level);
			audio.setTrack(1);
			hooks.onRestart?.();
		}
	};
	const released = new Set<keyof Input>();
	// A release waits for the next step, so even a tap shorter than a frame registers.
	const press = (key: keyof Input, down: boolean): void => {
		if (down) input[key] = true;
		else released.add(key);
	};
	const onKey = (down: boolean) => (e: KeyboardEvent) => {
		// Typing a nick into the form must not steer the game.
		if (e.target instanceof HTMLInputElement) return;
		if (down) onShortcut(e.code);
		const key = keys.get(e.code);
		if (!key) return;
		press(key, down);
		e.preventDefault();
	};
	window.addEventListener("keydown", onKey(true));
	window.addEventListener("keyup", onKey(false));

	const arena = buildArena();
	// ?boss=korpus/atak/slaby-punkt forces one combination, for looking at a boss without earning it.
	const forced = query.get("boss")?.split("/");
	const bossFor = (n: number, seen: readonly string[]) =>
		forced && forced.length === 3
			? makeBoss(forced[0] as BossBody, forced[1] as BossAttack, forced[2] as BossWeakSpot, n)
			: pickBoss(n, seen, state.seed);
	// The arena wears the look of the level that led to it.
	const enterArena = (n: number, seen: readonly string[]): World =>
		createWorld(
			{ ...arena, theme: level.theme, sky: level.sky, hue: level.hue },
			createBoss(bossFor(n, seen), arena.widthTiles),
			carriedScrap(world),
		);

	/** Picks the world a new state calls for: the arena after the gate, a fresh one after a lost life. */
	const worldFor = (prev: GameState, next: GameState): World => {
		if (next.level !== prev.level) {
			level = freshLevel(next.level);
			audio.setTrack(next.level);
			return createWorld(level, undefined, carriedScrap(world));
		}
		if (next.status === "boss" && prev.status === "playing")
			return enterArena(next.level, next.bossesSeen);
		if (next.respawns !== prev.respawns)
			return next.status === "boss"
				? enterArena(next.level, next.bossesSeen)
				: createWorld(level, undefined, carriedScrap(world));
		return world;
	};

	const tick = (): void => {
		if (paused || state.status === "over" || state.status === "cleared") return;
		if (pointer !== undefined) {
			// The mouse steers: run toward the pointer until Śrubek is under it.
			const px = pointer * VIEW_W + world.camera;
			const cx = world.player.x + world.player.w / 2;
			input.left = px < cx - 6;
			input.right = px > cx + 6;
		}
		world.megaBalls = state.megaBalls;
		world.meleeReach = HAND_REACH[skin.hand];
		const events = step(world, input);
		audio.react(events);
		const next = applyEvents(state, events);
		for (const key of released) input[key] = false;
		released.clear();
		world = worldFor(state, next);
		// The early return above means any end status here is a fresh one.
		if (next.status === "over") hooks.onEnd?.(next);
		state = next;
	};

	// ?fps=1 shows frames per second in the corner.
	const showFps = query.get("fps") === "1";
	let fps = 0;
	let frames = 0;
	let fpsAt = performance.now();
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
		frames += 1;
		if (now - fpsAt >= 1000) {
			fps = frames;
			frames = 0;
			fpsAt = now;
		}
		render(world, state, board, skin, showFps ? fps : undefined);
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
	return {
		setBoard(rows) {
			board = rows;
		},
		press,
		enter() {
			onShortcut("Enter");
		},
		setSkin(next) {
			skin = next;
		},
		setPaused(next) {
			paused = next;
		},
		setKeys(bindings) {
			keys = keyMap(bindings);
		},
		pointAt(fraction) {
			pointer = fraction;
			if (fraction === undefined) {
				input.left = false;
				input.right = false;
			}
		},
	};
}
