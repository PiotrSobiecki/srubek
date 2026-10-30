/**
 * The leaderboard on the page: lists the top runs and, when a run ends, opens
 * a dialog over the game that asks for a nick, posts the score and shows the
 * board. Talks only to /api/scores and the DOM elements it is given.
 */

import type { GameState } from "@/game/state";
import { totalPoints } from "@/game/state";
import { NICK_MAX } from "@/scores";

export interface BoardElements {
	/** Always-visible list under the game. */
	list: HTMLOListElement;
	/** The end-of-run dialog and its parts. */
	modal: HTMLElement;
	modalList: HTMLOListElement;
	form: HTMLFormElement;
	nick: HTMLInputElement;
	note: HTMLElement;
	after: HTMLElement;
}

interface BoardRow {
	nick: string;
	points: number;
	level: number;
}

export interface Board {
	refresh(): Promise<void>;
	/** Open the dialog for a finished run. */
	offer(state: GameState): void;
	hide(): void;
}

function rows(scores: BoardRow[]): HTMLLIElement[] {
	if (scores.length === 0) {
		const li = document.createElement("li");
		li.textContent = "Jeszcze nikt nie zapisał wyniku. Będziesz pierwszy?";
		return [li];
	}
	return scores.map((row, i) => {
		const li = document.createElement("li");
		li.textContent = `${i + 1}. ${row.nick} — ${row.points} pkt, poziom ${row.level}`;
		return li;
	});
}

export function mountBoard(el: BoardElements): Board {
	let pending: GameState | undefined;
	el.nick.maxLength = NICK_MAX;

	const refresh = async (): Promise<void> => {
		const res = await fetch("/api/scores");
		if (!res.ok) return;
		const { scores } = (await res.json()) as { scores: BoardRow[] };
		el.list.replaceChildren(...rows(scores));
		el.modalList.replaceChildren(...rows(scores));
	};

	const hide = (): void => {
		pending = undefined;
		el.modal.hidden = true;
	};

	el.form.addEventListener("submit", async (e) => {
		e.preventDefault();
		if (!pending) return;
		const body = { nick: el.nick.value, points: totalPoints(pending), level: pending.level };
		el.note.textContent = "Zapisuję…";
		const res = await fetch("/api/scores", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		if (res.ok) {
			pending = undefined;
			el.note.textContent = "";
			el.form.hidden = true;
			el.after.hidden = false;
			// Focus leaves the input so Enter now restarts the game.
			el.nick.blur();
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
			el.form.hidden = false;
			el.after.hidden = true;
			el.modal.hidden = false;
			el.nick.focus();
		},
		hide,
	};
}
