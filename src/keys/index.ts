/**
 * Keyboard bindings: which keys drive which control, saved in this browser,
 * and the menu panel that rebinds a control to the next key pressed.
 */

import type { Input } from "@/game/engine";
import type { Game } from "@/game/main";

export type Action = keyof Input;
export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
	left: ["ArrowLeft", "KeyA"],
	right: ["ArrowRight", "KeyD"],
	jump: ["Space", "ArrowUp", "KeyW"],
	magnet: ["KeyC", "KeyE"],
	throw: ["KeyX", "KeyF", "ControlLeft", "ArrowDown"],
	mega: ["KeyZ"],
	attack: ["ShiftLeft", "ShiftRight", "KeyV"],
};

/** The page answers these itself (menu, next level, sound, focus), so no control may take them. */
const RESERVED = ["Escape", "Enter", "KeyM", "Tab"];

const ACTIONS: readonly { action: Action; label: string; hint: string }[] = [
	{ action: "left", label: "W lewo", hint: "jazda w lewo" },
	{ action: "right", label: "W prawo", hint: "jazda w prawo" },
	{
		action: "jump",
		label: "Skok",
		hint: "skok (przytrzymaj, by skoczyć wyżej; w locie raz jeszcze)",
	},
	{ action: "magnet", label: "Magnes", hint: "magnes zbiera złom (do 10 szt.)" },
	{ action: "throw", label: "Rzut", hint: "rzut złomem" },
	{ action: "mega", label: "Mega kula", hint: "mega kula (za 10 śrub)" },
	{ action: "attack", label: "Cios", hint: "cios przedmiotem z ręki" },
];

const STORAGE_KEY = "srubek.keys";

const NAMES: Record<string, string> = {
	ArrowLeft: "←",
	ArrowRight: "→",
	ArrowUp: "↑",
	ArrowDown: "↓",
	Space: "spacja",
	ShiftLeft: "lewy Shift",
	ShiftRight: "prawy Shift",
	ControlLeft: "lewy Ctrl",
	ControlRight: "prawy Ctrl",
	AltLeft: "lewy Alt",
	AltRight: "prawy Alt",
};

/** A key code as a player reads it: `KeyA` → `A`, `ArrowLeft` → `←`. */
export function keyLabel(code: string): string {
	return NAMES[code] ?? code.replace(/^(Key|Digit)/, "").replace(/^Numpad/, "num ");
}

/** `code` becomes the action's only key and leaves whichever control had it. */
export function rebind(bindings: Bindings, action: Action, code: string): Bindings {
	const next = { ...bindings };
	for (const { action: a } of ACTIONS) next[a] = next[a].filter((c) => c !== code);
	next[action] = [code];
	return next;
}

/** Accepts anything and returns usable bindings: a bad entry falls back to its default. */
export function normalizeBindings(raw: unknown): Bindings {
	const r = (raw ?? {}) as Partial<Record<Action, unknown>>;
	const next = { ...DEFAULT_BINDINGS };
	for (const { action } of ACTIONS) {
		const codes = r[action];
		if (Array.isArray(codes) && codes.every((c) => typeof c === "string"))
			next[action] = codes.filter((c) => !RESERVED.includes(c));
	}
	return next;
}

export function loadBindings(storage: Pick<Storage, "getItem"> = localStorage): Bindings {
	try {
		const raw = storage.getItem(STORAGE_KEY);
		return normalizeBindings(raw ? JSON.parse(raw) : undefined);
	} catch {
		return DEFAULT_BINDINGS;
	}
}

function keysOf(bindings: Bindings, action: Action): string {
	return bindings[action].map(keyLabel).join(" / ") || "brak";
}

export interface KeysElements {
	/** Gets one button per control. */
	list: HTMLElement;
	reset: HTMLButtonElement;
	/** The line of controls under the game. */
	hint: HTMLElement;
}

export function mountKeys(el: KeysElements, game: Game): void {
	let bindings = loadBindings();
	let waiting: Action | undefined;

	const show = (): void => {
		el.list.replaceChildren(
			...ACTIONS.map(({ action, label }) => {
				const b = document.createElement("button");
				b.type = "button";
				b.className = "keybind";
				b.textContent =
					waiting === action
						? `${label}: naciśnij klawisz…`
						: `${label}: ${keysOf(bindings, action)}`;
				b.addEventListener("click", () => {
					waiting = action;
					show();
				});
				return b;
			}),
		);
		el.hint.textContent = [
			...ACTIONS.map(({ action, hint }) => `${keysOf(bindings, action)}: ${hint}`),
			"M: dźwięk",
			"mysz: trzymaj lewy, by jechać w stronę kursora, prawy skok, środkowy rzut",
		].join(" · ");
	};

	const apply = (next: Bindings): void => {
		bindings = next;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		game.setKeys(next);
		show();
	};

	// Capture phase: the key being bound must not also steer the game or close the menu.
	window.addEventListener(
		"keydown",
		(e) => {
			const action = waiting;
			if (!action) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			waiting = undefined;
			if (RESERVED.includes(e.code)) show();
			else apply(rebind(bindings, action, e.code));
		},
		{ capture: true },
	);
	el.reset.addEventListener("click", () => {
		waiting = undefined;
		apply(DEFAULT_BINDINGS);
	});

	game.setKeys(bindings);
	show();
}
