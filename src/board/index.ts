/**
 * The leaderboard on the page: lists the top runs and, when a run ends, asks
 * for a nick and posts the score. Talks only to /api/scores and the DOM
 * elements it is given.
 */

import type { GameState } from "@/game/state";
import { totalPoints } from "@/game/state";
import { NICK_MAX } from "@/scores";

export interface BoardElements {
	list: HTMLOListElement;
	form: HTMLFormElement;
	nick: HTMLInputElement;
	note: HTMLElement;
}

interface BoardRow {
	nick: string;
	points: number;
	level: number;
}

export interface Board {
	refresh(): Promise<void>;
	/** Show the form for a finished run. */
	offer(state: GameState): void;
	hide(): void;
}

function levelReached(): number {
	// shortcut: one level until the generator counts them in phase 10
	return 1;
}

export function mountBoard(el: BoardElements): Board {
	let pending: GameState | undefined;
	el.nick.maxLength = NICK_MAX;

	const refresh = async (): Promise<void> => {
		const res = await fetch("/api/scores");
		if (!res.ok) return;
		const { scores } = (await res.json()) as { scores: BoardRow[] };
		el.list.replaceChildren(
			...scores.map((row, i) => {
				const li = document.createElement("li");
				li.textContent = `${i + 1}. ${row.nick} — ${row.points} pkt, poziom ${row.level}`;
				return li;
			}),
		);
		if (scores.length === 0) {
			const li = document.createElement("li");
			li.textContent = "Jeszcze nikt nie zapisał wyniku. Będziesz pierwszy?";
			el.list.replaceChildren(li);
		}
	};

	const hide = (): void => {
		pending = undefined;
		el.form.hidden = true;
	};

	el.form.addEventListener("submit", async (e) => {
		e.preventDefault();
		if (!pending) return;
		const body = {
			nick: el.nick.value,
			points: totalPoints(pending),
			level: levelReached(),
		};
		el.note.textContent = "Zapisuję…";
		const res = await fetch("/api/scores", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		if (res.ok) {
			el.note.textContent = "Zapisane!";
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
			el.note.textContent = `Twój wynik: ${totalPoints(state)} pkt. Wpisz ksywkę, nie imię i nazwisko.`;
			el.form.hidden = false;
			el.nick.focus();
		},
		hide,
	};
}
