/**
 * Input beyond the keyboard: an on-screen pad for touch (and mouse), mouse
 * buttons on the canvas, and fullscreen for the stage. Everything funnels into
 * `game.press` / `game.enter`, so the engine never knows where a press came from.
 */

import type { Input } from "@/game/engine";
import type { Game } from "@/game/main";

interface PadButton {
	key: keyof Input;
	label: string;
	/** Grid area in the pad layout. */
	area: string;
}

const BUTTONS: PadButton[] = [
	{ key: "left", label: "◀", area: "l" },
	{ key: "right", label: "▶", area: "r" },
	{ key: "jump", label: "▲", area: "j" },
	{ key: "magnet", label: "C", area: "c" },
	{ key: "throw", label: "X", area: "x" },
	{ key: "mega", label: "Z", area: "z" },
];

export function touchDevice(): boolean {
	return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

/** Builds the pad inside `host`; returns a toggle for showing it. */
export function mountPad(host: HTMLElement, game: Game): (visible: boolean) => void {
	host.replaceChildren();
	for (const b of BUTTONS) {
		const el = document.createElement("button");
		el.type = "button";
		el.textContent = b.label;
		el.className = "pad-btn";
		el.style.gridArea = b.area;
		el.setAttribute("aria-label", b.key);
		const down = (e: PointerEvent): void => {
			e.preventDefault();
			el.setPointerCapture(e.pointerId);
			game.press(b.key, true);
			el.classList.add("is-down");
		};
		const up = (e: PointerEvent): void => {
			e.preventDefault();
			game.press(b.key, false);
			el.classList.remove("is-down");
		};
		el.addEventListener("pointerdown", down);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointercancel", up);
		el.addEventListener("lostpointercapture", up);
		el.addEventListener("contextmenu", (e) => e.preventDefault());
		host.appendChild(el);
	}
	return (visible) => {
		host.hidden = !visible;
	};
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

/** Fullscreen for the stage, trying to lock landscape on phones. */
export function mountFullscreen(stage: HTMLElement, button: HTMLButtonElement): void {
	button.addEventListener("click", async () => {
		if (document.fullscreenElement) {
			await document.exitFullscreen();
			return;
		}
		await stage.requestFullscreen().catch(() => undefined);
		const orientation = screen.orientation as ScreenOrientation & {
			lock?: (o: string) => Promise<void>;
		};
		await orientation.lock?.("landscape").catch(() => undefined);
	});
	document.addEventListener("fullscreenchange", () => {
		button.textContent = document.fullscreenElement ? "Zamknij pełny ekran" : "Pełny ekran";
	});
}
