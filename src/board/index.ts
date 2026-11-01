/**
 * The leaderboard glue on the page: fetches the top runs for the game's end
 * screen and, when a run ends, opens a small dialog that asks for a nick and
 * posts the score. Talks only to /api/scores and the DOM elements it is given.
 */

import type { BoardRow } from "@/game/render";
import type { GameState } from "@/game/state";
import { totalPoints } from "@/game/state";
import { NICK_MAX } from "@/scores";

export interface BoardElements {
	modal: HTMLElement;
	form: HTMLFormElement;
	nick: HTMLInputElement;
	note: HTMLElement;
}

export interface Board {
	refresh(): Promise<void>;
	/** Open the nick dialog for a finished run. */
	offer(state: GameState): void;
	hide(): void;
}

export function mountBoard(el: BoardElements, onRows: (rows: BoardRow[]) => void): Board {
	let pending: GameState | undefined;
	el.nick.maxLength = NICK_MAX;

	const refresh = async (): Promise<void> => {
		const res = await fetch("/api/scores");
		if (!res.ok) return;
		const { scores } = (await res.json()) as { scores: BoardRow[] };
		onRows(scores);
	};

	const hide = (): void => {
		pending = undefined;
		el.modal.hidden = true;
		// Focus leaves the input so Enter restarts the game.
		el.nick.blur();
	};

	el.form.addEventListener("submit", async (e) => {
		e.preventDefault();
		if (!pending) return;
		const body = {
			nick: el.nick.value,
			points: totalPoints(pending),
			level: pending.level,
			seed: pending.seed,
		};
		el.note.textContent = "Zapisuję…";
		const res = await fetch("/api/scores", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		if (res.ok) {
			hide();
			await refresh();
			return;
		}
		const { error } = (await res.json().catch(() => ({ error: "nie udało się zapisać" }))) as {
			error?: string;
		};
		el.note.textContent = error ?? "nie udało się zapisać";
	});

	return {
		refresh,
		offer(state) {
			pending = state;
			el.note.textContent = `Twój wynik: ${totalPoints(state)} pkt, poziom ${state.level}. Wpisz ksywkę, nie imię i nazwisko.`;
			el.nick.value = "";
			el.modal.hidden = false;
			el.nick.focus();
		},
		hide,
	};
}
