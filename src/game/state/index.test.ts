import {
	applyEvents,
	BATTERY_MAX,
	createState,
	DRONE_POINTS,
	LIVES_START,
	NUT_POINTS,
	totalPoints,
} from "./index";

describe("points", () => {
	it("start at zero", () => {
		expect(totalPoints(createState())).toBe(0);
	});

	it("grow per nut and per drone without mutating the previous state", () => {
		const before = createState();
		const after = applyEvents(before, [{ type: "nut" }, { type: "nut" }, { type: "drone" }]);
		expect(totalPoints(after)).toBe(2 * NUT_POINTS + DRONE_POINTS);
		expect(totalPoints(before)).toBe(0);
	});
});

describe("battery and lives", () => {
	it("a hit takes one bar, a charger refills to full", () => {
		let s = applyEvents(createState(), [{ type: "hit" }]);
		expect(s.battery).toBe(BATTERY_MAX - 1);
		s = applyEvents(s, [{ type: "charge" }]);
		expect(s.battery).toBe(BATTERY_MAX);
	});

	it("an empty battery costs a life, the level's points and asks for a respawn", () => {
		let s = applyEvents(createState(), [{ type: "nut" }]);
		s = applyEvents(
			s,
			Array.from({ length: BATTERY_MAX }, () => ({ type: "hit" }) as const),
		);
		expect(s.lives).toBe(LIVES_START - 1);
		expect(s.levelPoints).toBe(0);
		expect(s.battery).toBe(BATTERY_MAX);
		expect(s.respawns).toBe(1);
		expect(s.status).toBe("playing");
	});

	it("a fall costs a life outright", () => {
		const s = applyEvents(createState(), [{ type: "fall" }]);
		expect(s.lives).toBe(LIVES_START - 1);
		expect(s.respawns).toBe(1);
	});

	it("keeps banked points from earlier levels through a lost life", () => {
		const s = applyEvents(
			{ ...createState(), points: 300 },
			Array.from({ length: BATTERY_MAX }, () => ({ type: "hit" }) as const),
		);
		expect(totalPoints(s)).toBe(300);
	});

	it("ends the game after the last life and ignores later events", () => {
		const hits = Array.from(
			{ length: BATTERY_MAX * LIVES_START },
			() => ({ type: "hit" }) as const,
		);
		const s = applyEvents(createState(), hits);
		expect(s.lives).toBe(0);
		expect(s.status).toBe("over");
		expect(applyEvents(s, [{ type: "nut" }])).toEqual(s);
	});

	it("restarts from the initial state", () => {
		expect(createState()).toEqual({
			points: 0,
			levelPoints: 0,
			battery: BATTERY_MAX,
			lives: LIVES_START,
			respawns: 0,
			status: "playing",
		});
	});
});
