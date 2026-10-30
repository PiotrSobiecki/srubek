/**
 * Input beyond the keyboard: touch zones and action buttons for phones, mouse
 * buttons on the canvas, and fullscreen for the stage. Everything funnels into
 * `game.press` / `game.enter`, so the engine never knows where a press came from.
 */

import type { Input } from "@/game/engine";
import type { Game } from "@/game/main";

interface ActionButton {
	key: keyof Input;
	label: string;
}

const ACTIONS: ActionButton[] = [
	{ key: "mega", label: "Z" },
	{ key: "magnet", label: "C" },
	{ key: "throw", label: "X" },
	{ key: "attack", label: "⚔" },
];

/** How far the thumb must slide before Śrubek moves, and where the stick stops. */
const DEAD_ZONE = 10;
const STICK_RANGE = 40;

export function touchDevice(): boolean {
	return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function el(tag: string, className: string, text = ""): HTMLElement {
	const node = document.createElement(tag);
	node.className = className;
	node.textContent = text;
	return node;
}

/** Makes `target` hold `key` down for as long as a finger rests on it. */
function holdable(target: HTMLElement, game: Game, key: keyof Input, onDown?: () => void): void {
	const down = (e: PointerEvent): void => {
		e.preventDefault();
		target.setPointerCapture(e.pointerId);
		onDown?.();
		game.press(key, true);
		target.classList.add("is-down");
	};
	const up = (e: PointerEvent): void => {
		e.preventDefault();
		game.press(key, false);
		target.classList.remove("is-down");
	};
	target.addEventListener("pointerdown", down);
	target.addEventListener("pointerup", up);
	target.addEventListener("pointercancel", up);
	target.addEventListener("lostpointercapture", up);
	target.addEventListener("contextmenu", (e) => e.preventDefault());
}

/**
 * Left half: a floating stick. Wherever the thumb lands becomes the centre, and
 * sliding left or right steers; the centre trails the thumb so reversing is quick.
 */
function mountStick(zone: HTMLElement, game: Game, onTouch: () => void): void {
	const ring = el("div", "stick");
	const knob = el("div", "knob");
	zone.appendChild(ring);
	zone.appendChild(knob);
	let id: number | undefined;
	let origin = 0;
	let dir = 0;
	const steer = (next: number): void => {
		if (next === dir) return;
		if (dir < 0) game.press("left", false);
		if (dir > 0) game.press("right", false);
		if (next < 0) game.press("left", true);
		if (next > 0) game.press("right", true);
		dir = next;
	};
	const place = (node: HTMLElement, x: number, y: number): void => {
		const r = zone.getBoundingClientRect();
		node.style.left = `${x - r.left}px`;
		node.style.top = `${y - r.top}px`;
	};
	zone.addEventListener("pointerdown", (e) => {
		if (id !== undefined) return;
		e.preventDefault();
		id = e.pointerId;
		zone.setPointerCapture(e.pointerId);
		origin = e.clientX;
		onTouch();
		place(ring, e.clientX, e.clientY);
		place(knob, e.clientX, e.clientY);
		zone.classList.add("is-down");
	});
	zone.addEventListener("pointermove", (e) => {
		if (e.pointerId !== id) return;
		let dx = e.clientX - origin;
		if (Math.abs(dx) > STICK_RANGE) {
			origin += dx - Math.sign(dx) * STICK_RANGE;
			dx = Math.sign(dx) * STICK_RANGE;
			ring.style.left = `${origin - zone.getBoundingClientRect().left}px`;
		}
		place(knob, origin + dx, e.clientY);
		steer(dx > DEAD_ZONE ? 1 : dx < -DEAD_ZONE ? -1 : 0);
	});
	const release = (e: PointerEvent): void => {
		if (e.pointerId !== id) return;
		id = undefined;
		steer(0);
		zone.classList.remove("is-down");
	};
	zone.addEventListener("pointerup", release);
	zone.addEventListener("pointercancel", release);
	zone.addEventListener("lostpointercapture", release);
}

/**
 * Touch layout borrowed from one-button games: the screen halves are the big
 * controls, so a thumb never misses. Left half steers, right half jumps, and
 * four small buttons on the right edge carry the actions.
 */
export function mountPad(host: HTMLElement, game: Game): (visible: boolean) => void {
	host.replaceChildren();
	const learned = (): void => {
		host.classList.add("learned");
		// Any touch also confirms the end screens, as Enter would.
		game.enter();
	};
	const move = el("div", "zone zone-move");
	move.appendChild(el("span", "zone-label", "przesuń kciukiem: jazda"));
	mountStick(move, game, learned);
	const jump = el("div", "zone zone-jump");
	jump.appendChild(el("span", "zone-label", "stuknij: skok"));
	holdable(jump, game, "jump", learned);
	const actions = el("div", "actions");
	for (const a of ACTIONS) {
		const b = el("button", "pad-btn", a.label);
		b.setAttribute("aria-label", a.key);
		(b as HTMLButtonElement).type = "button";
		holdable(b, game, a.key);
		actions.appendChild(b);
	}
	for (const node of [move, jump, actions]) host.appendChild(node);
	return (visible) => {
		host.hidden = !visible;
	};
}

/** Stops the page zooming under fast taps and pinches on phones; form fields stay usable. */
export function preventPageZoom(): void {
	const stop = (e: Event): void => e.preventDefault();
	for (const type of ["gesturestart", "gesturechange", "gestureend", "dblclick"]) {
		document.addEventListener(type, stop, { passive: false });
	}
	let lastEnd = 0;
	document.addEventListener(
		"touchend",
		(e) => {
			const now = performance.now();
			const field = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
			if (!field && now - lastEnd < 350) e.preventDefault();
			lastEnd = now;
		},
		{ passive: false },
	);
	document.addEventListener(
		"touchmove",
		(e) => {
			if (e.touches.length > 1) e.preventDefault();
		},
		{ passive: false },
	);
}

/**
 * Mouse on the canvas: holding the left button runs toward the pointer, the
 * right button jumps, the middle button throws. Any click also stands in for
 * Enter on the end screens; a finger on the canvas only does that.
 */
export function mountMouse(canvas: HTMLCanvasElement, game: Game): void {
	const byButton: Record<number, keyof Input | undefined> = { 1: "throw", 2: "jump" };
	const fraction = (e: PointerEvent): number => {
		const r = canvas.getBoundingClientRect();
		return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
	};
	let steering = false;
	canvas.addEventListener("contextmenu", (e) => e.preventDefault());
	canvas.addEventListener("pointermove", (e) => {
		if (steering && e.pointerType === "mouse") game.pointAt(fraction(e));
	});
	canvas.addEventListener("pointerdown", (e) => {
		game.enter();
		if (e.pointerType !== "mouse") return;
		e.preventDefault();
		if (e.button === 0) {
			steering = true;
			game.pointAt(fraction(e));
			const stop = (): void => {
				steering = false;
				game.pointAt(undefined);
				window.removeEventListener("pointerup", stop);
			};
			window.addEventListener("pointerup", stop);
			return;
		}
		const key = byButton[e.button];
		if (!key) return;
		game.press(key, true);
		const release = (): void => {
			game.press(key, false);
			window.removeEventListener("pointerup", release);
		};
		window.addEventListener("pointerup", release);
	});
}

/**
 * Fullscreen for the stage. Where the Fullscreen API is missing (iPhone Safari)
 * the stage is pinned over the page instead; both paths toggle the same class so
 * the CSS has one source of truth. Landscape lock is attempted and ignored on failure.
 */
export function mountFullscreen(stage: HTMLElement, button: HTMLButtonElement): void {
	const canNative = typeof stage.requestFullscreen === "function" && document.fullscreenEnabled;
	const apply = (on: boolean): void => {
		stage.classList.toggle("is-fullscreen", on);
		document.documentElement.classList.toggle("no-scroll", on);
		button.textContent = on ? "Zamknij pełny ekran" : "Pełny ekran";
	};
	const lockLandscape = async (): Promise<void> => {
		const orientation = screen.orientation as ScreenOrientation & {
			lock?: (o: string) => Promise<void>;
		};
		await orientation.lock?.("landscape").catch(() => undefined);
	};
	button.addEventListener("click", async () => {
		const on = stage.classList.contains("is-fullscreen");
		if (on) {
			if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
			apply(false);
			return;
		}
		if (canNative) await stage.requestFullscreen().catch(() => undefined);
		apply(true);
		await lockLandscape();
	});
	// Leaving native fullscreen by gesture or Esc drops the class too.
	document.addEventListener("fullscreenchange", () => {
		if (!document.fullscreenElement && canNative) apply(false);
	});
}
