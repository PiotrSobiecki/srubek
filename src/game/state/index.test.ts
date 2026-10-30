import { applyEvents, createState, NUT_POINTS } from "./index";

describe("points", () => {
	it("start at zero", () => {
		expect(createState().points).toBe(0);
	});

	it("grow by NUT_POINTS per nut without mutating the previous state", () => {
		const before = createState();
		const after = applyEvents(before, [{ type: "nut" }, { type: "nut" }]);
		expect(after.points).toBe(2 * NUT_POINTS);
		expect(before.points).toBe(0);
	});
});
