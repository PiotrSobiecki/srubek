/**
 * Śrubek's look: colours and parts chosen in the menu, kept in the browser.
 * The renderer only reads a `Skin`; this module owns presets, defaults,
 * validation and storage.
 */

export type Hat = "none" | "antena" | "kask" | "czapka" | "korona" | "cylinder";
export type Accessory = "none" | "szalik" | "plecak" | "pelerynka" | "okulary";

export interface Skin {
	/** Light, mid and dark of the shell. */
	body: string;
	eyes: string;
	accent: string;
	hat: Hat;
	accessory: Accessory;
}

export const HATS: readonly Hat[] = ["antena", "kask", "czapka", "korona", "cylinder", "none"];
export const ACCESSORIES: readonly Accessory[] = [
	"none",
	"szalik",
	"plecak",
	"pelerynka",
	"okulary",
];

export const DEFAULT_SKIN: Skin = {
	body: "#aab5bf",
	eyes: "#2fd3c6",
	accent: "#e07b1c",
	hat: "antena",
	accessory: "none",
};

export const PRESETS: Record<string, Skin> = {
	Klasyk: DEFAULT_SKIN,
	Strażak: {
		body: "#d8402a",
		eyes: "#ffe08a",
		accent: "#f5c242",
		hat: "kask",
		accessory: "plecak",
	},
	Kosmita: {
		body: "#6fd36f",
		eyes: "#ff5ad9",
		accent: "#b48cff",
		hat: "antena",
		accessory: "okulary",
	},
	Król: {
		body: "#f1c232",
		eyes: "#4ff0e0",
		accent: "#c0392b",
		hat: "korona",
		accessory: "pelerynka",
	},
	Dżentelmen: {
		body: "#2b2f36",
		eyes: "#ffd27a",
		accent: "#e74c3c",
		hat: "cylinder",
		accessory: "szalik",
	},
	Zima: { body: "#dfe7ee", eyes: "#4aa3ff", accent: "#ff6a3d", hat: "czapka", accessory: "szalik" },
};

const KEY = "srubek.skin";

function isHex(v: unknown): v is string {
	return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

/** Accepts anything and returns a usable skin: bad fields fall back to the default. */
export function normalizeSkin(raw: unknown): Skin {
	const r = (raw ?? {}) as Partial<Record<keyof Skin, unknown>>;
	return {
		body: isHex(r.body) ? r.body : DEFAULT_SKIN.body,
		eyes: isHex(r.eyes) ? r.eyes : DEFAULT_SKIN.eyes,
		accent: isHex(r.accent) ? r.accent : DEFAULT_SKIN.accent,
		hat: HATS.includes(r.hat as Hat) ? (r.hat as Hat) : DEFAULT_SKIN.hat,
		accessory: ACCESSORIES.includes(r.accessory as Accessory)
			? (r.accessory as Accessory)
			: DEFAULT_SKIN.accessory,
	};
}

export function loadSkin(storage: Pick<Storage, "getItem"> = localStorage): Skin {
	try {
		const raw = storage.getItem(KEY);
		return normalizeSkin(raw ? JSON.parse(raw) : undefined);
	} catch {
		return DEFAULT_SKIN;
	}
}

export function saveSkin(skin: Skin, storage: Pick<Storage, "setItem"> = localStorage): void {
	storage.setItem(KEY, JSON.stringify(skin));
}

/** Lighter and darker versions of a hex colour, for gradients. */
export function tint(hex: string, amount: number): string {
	const n = Number.parseInt(hex.slice(1), 16);
	const ch = (shift: number) => {
		const c = (n >> shift) & 0xff;
		const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
		return Math.round(Math.max(0, Math.min(255, v)));
	};
	return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
