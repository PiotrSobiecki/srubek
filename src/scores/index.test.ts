import { BOSS_HIT_POINTS, BOSS_POINTS } from "@/game/state";
import {
	listScores,
	parseScore,
	type ScoreDb,
	ScoreError,
	type ScoreRow,
	saveScore,
} from "./index";
import { maxScore } from "./max-score";

/** In-memory stand-in for D1: enough SQL to insert and list. */
function fakeDb(): ScoreDb & { rows: ScoreRow[] } {
	const rows: ScoreRow[] = [];
	return {
		rows,
		prepare(sql) {
			const exec = (values: unknown[]) => ({
				async all<T>() {
					const limit = Number(values[0] ?? rows.length);
					const sorted = [...rows].sort((a, b) => b.points - a.points || b.level - a.level);
					return { results: sorted.slice(0, limit) as T[] };
				},
				async run() {
					if (!sql.startsWith("INSERT")) throw new Error(`unexpected ${sql}`);
					const [nick, points, level] = values as [string, number, number];
					rows.push({ nick, points, level, created_at: new Date().toISOString() });
				},
			});
			return { bind: (...values: unknown[]) => exec(values), all: exec([]).all };
		},
	};
}

describe("maxScore", () => {
	it("covers every pickup, enemy and the boss of level 1", () => {
		expect(maxScore(1)).toBeGreaterThan(2 * BOSS_HIT_POINTS + BOSS_POINTS);
		// Each level adds its own payout on top of the ones before it.
		expect(maxScore(2)).toBeGreaterThan(maxScore(1) + BOSS_POINTS);
		expect(maxScore(3)).toBeGreaterThan(maxScore(2));
	});
});

describe("parseScore", () => {
	it("accepts a sane score and trims the nick", () => {
		expect(parseScore({ nick: " Ola ", points: 120, level: 1 })).toEqual({
			nick: "Ola",
			points: 120,
			level: 1,
		});
	});

	it.each([
		[{ nick: "", points: 10, level: 1 }],
		[{ nick: "x".repeat(17), points: 10, level: 1 }],
		[{ nick: "Ola", points: -1, level: 1 }],
		[{ nick: "Ola", points: 1.5, level: 1 }],
		[{ nick: "Ola", points: 10, level: 0 }],
		[{ nick: "Ola", points: "10", level: 1 }],
	])("rejects malformed input %j with 400", (body) => {
		expect(() => parseScore(body)).toThrow(ScoreError);
		try {
			parseScore(body);
		} catch (e) {
			expect((e as ScoreError).status).toBe(400);
		}
	});

	it("lets exactly the maximum through and refuses one point more with 422", () => {
		const max = maxScore(1);
		expect(parseScore({ nick: "Ola", points: max, level: 1 }).points).toBe(max);
		try {
			parseScore({ nick: "Ola", points: max + 1, level: 1 });
			throw new Error("should have thrown");
		} catch (e) {
			expect((e as ScoreError).status).toBe(422);
		}
	});
});

describe("board", () => {
	it("stores a score and lists the best first", async () => {
		const db = fakeDb();
		await saveScore(db, { nick: "Ola", points: 50, level: 1 });
		await saveScore(db, { nick: "Jaś", points: 120, level: 1 });
		const board = await listScores(db);
		expect(board.map((r) => r.nick)).toEqual(["Jaś", "Ola"]);
	});
});
