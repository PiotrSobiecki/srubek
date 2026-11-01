import { DEFAULT_BINDINGS, keyLabel, loadBindings, normalizeBindings, rebind } from "./index";

describe("rebind", () => {
	it("makes the key the control's only one and takes it from any other control", () => {
		const next = rebind(DEFAULT_BINDINGS, "jump", "KeyC");
		expect(next.jump).toEqual(["KeyC"]);
		expect(next.magnet).toEqual(["KeyE"]);
		expect(next.left).toEqual(DEFAULT_BINDINGS.left);
		expect(DEFAULT_BINDINGS.jump).toContain("Space");
	});
});

describe("stored bindings", () => {
	it("fall back to the defaults when missing or broken, entry by entry", () => {
		expect(loadBindings({ getItem: () => null })).toEqual(DEFAULT_BINDINGS);
		expect(loadBindings({ getItem: () => "{nope" })).toEqual(DEFAULT_BINDINGS);
		const b = normalizeBindings({ jump: ["KeyJ", "Escape"], mega: 5 });
		expect(b.jump).toEqual(["KeyJ"]);
		expect(b.mega).toEqual(DEFAULT_BINDINGS.mega);
	});
});

describe("keyLabel", () => {
	it.each([
		["KeyA", "A"],
		["Digit3", "3"],
		["ArrowLeft", "←"],
		["Space", "spacja"],
		["Numpad4", "num 4"],
		["Semicolon", "Semicolon"],
	])("%s reads as %s", (code, label) => {
		expect(keyLabel(code)).toBe(label);
	});
});
