/**
 * The wardrobe menu: presets to click and a form to build your own look.
 * Every change is saved and handed to the game at once.
 */

import type { Game } from "@/game/main";
import {
	ACCESSORIES,
	type Accessory,
	HANDS,
	HATS,
	type HandItem,
	type Hat,
	loadSkin,
	PRESETS,
	type Skin,
	saveSkin,
} from "@/skin";

const HAT_LABEL: Record<Hat, string> = {
	none: "bez niczego",
	antena: "antena",
	kask: "kask",
	czapka: "czapka z pomponem",
	korona: "korona",
	cylinder: "cylinder",
};

const ACCESSORY_LABEL: Record<Accessory, string> = {
	none: "bez dodatku",
	szalik: "szalik",
	plecak: "plecak",
	pelerynka: "pelerynka",
	okulary: "okulary",
};

const HAND_LABEL: Record<HandItem, string> = {
	none: "pusta ręka",
	klucz: "klucz",
	mlotek: "młotek",
	flaga: "flaga",
	lizak: "lizak",
	balonik: "balonik",
	parasol: "parasol",
};

export interface WardrobeElements {
	presets: HTMLElement;
	body: HTMLInputElement;
	eyes: HTMLInputElement;
	accent: HTMLInputElement;
	hat: HTMLSelectElement;
	accessory: HTMLSelectElement;
	hand: HTMLSelectElement;
}

function fillSelect<T extends string>(
	el: HTMLSelectElement,
	values: readonly T[],
	labels: Record<T, string>,
): void {
	el.replaceChildren(
		...values.map((v) => {
			const o = document.createElement("option");
			o.value = v;
			o.textContent = labels[v];
			return o;
		}),
	);
}

export function mountWardrobe(el: WardrobeElements, game: Game): void {
	fillSelect(el.hat, HATS, HAT_LABEL);
	fillSelect(el.accessory, ACCESSORIES, ACCESSORY_LABEL);
	fillSelect(el.hand, HANDS, HAND_LABEL);

	const show = (skin: Skin): void => {
		el.body.value = skin.body;
		el.eyes.value = skin.eyes;
		el.accent.value = skin.accent;
		el.hat.value = skin.hat;
		el.accessory.value = skin.accessory;
		el.hand.value = skin.hand;
	};

	const apply = (skin: Skin): void => {
		game.setSkin(skin);
		saveSkin(skin);
	};

	const read = (): Skin => ({
		body: el.body.value,
		eyes: el.eyes.value,
		accent: el.accent.value,
		hat: el.hat.value as Hat,
		accessory: el.accessory.value as Accessory,
		hand: el.hand.value as HandItem,
	});

	for (const [name, skin] of Object.entries(PRESETS)) {
		const b = document.createElement("button");
		b.type = "button";
		b.textContent = name;
		b.className = "preset";
		b.style.setProperty("--c", skin.body);
		b.style.setProperty("--a", skin.accent);
		b.addEventListener("click", () => {
			show(skin);
			apply(skin);
		});
		el.presets.appendChild(b);
	}

	for (const input of [el.body, el.eyes, el.accent, el.hat, el.accessory, el.hand]) {
		input.addEventListener("input", () => apply(read()));
	}

	const initial = loadSkin();
	show(initial);
	game.setSkin(initial);
}
