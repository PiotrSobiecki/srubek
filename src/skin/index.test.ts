import { DEFAULT_SKIN, loadSkin, normalizeSkin, PRESETS, saveSkin, tint } from "./index";

function memory(): Pick<Storage, "getItem" | "setItem"> & { data: Record<string, string> } {
	const data: Record<string, string> = {};
	return {
		data,
		getItem: (k) => data[k] ?? null,
		setItem: (k, v) => {
			data[k] = v;
		},
	};
}

describe("skin", () => {
	it("round-trips through storage", () => {
		const store = memory();
		const skin = PRESETS.Kosmita;
		if (!skin) throw new Error("preset");
		saveSkin(skin, store);
		expect(loadSkin(store)).toEqual(skin);
	});

	it("falls back to the default on garbage, field by field", () => {
		expect(loadSkin(memory())).toEqual(DEFAULT_SKIN);
		const store = memory();
		store.data["srubek.skin"] = "not json";
		expect(loadSkin(store)).toEqual(DEFAULT_SKIN);
		expect(normalizeSkin({ body: "#ff0000", hat: "hełm", eyes: 12 })).toEqual({
			...DEFAULT_SKIN,
			body: "#ff0000",
		});
	});

	it("knows the newest parts and keeps them through storage", () => {
		const skin = {
			...DEFAULT_SKIN,
			hat: "daszek",
			accessory: "skrzydelka",
			hand: "miecz",
		} as const;
		expect(normalizeSkin(skin)).toEqual(skin);
	});

	it("every preset is already valid", () => {
		for (const skin of Object.values(PRESETS)) expect(normalizeSkin(skin)).toEqual(skin);
	});

	it("tints toward white and black", () => {
		expect(tint("#808080", 1)).toBe("rgb(255,255,255)");
		expect(tint("#808080", -1)).toBe("rgb(0,0,0)");
		expect(tint("#808080", 0)).toBe("rgb(128,128,128)");
	});
});
