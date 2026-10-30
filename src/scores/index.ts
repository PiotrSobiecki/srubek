/**
 * Leaderboard: validation, the plausibility gate and the two D1 queries.
 * The endpoint parses and responds; this module decides.
 */

import { z } from "zod";
import { maxScore } from "./max-score";

export const NICK_MAX = 16;
const BOARD_SIZE = 10;

const ScoreInput = z.object({
	nick: z.string().trim().min(1).max(NICK_MAX),
	points: z.number().int().min(0),
	level: z.number().int().min(1).max(1000),
});

export type ScoreInput = z.infer<typeof ScoreInput>;

export interface ScoreRow {
	nick: string;
	points: number;
	level: number;
	created_at: string;
}

export class ScoreError extends Error {
	constructor(
		public status: 400 | 422,
		message: string,
	) {
		super(message);
		this.name = "ScoreError";
	}
}

/** The slice of D1 these queries use; a test hands in a fake with the same shape. */
export interface ScoreDb {
	prepare(sql: string): {
		bind(...values: unknown[]): {
			all<T>(): Promise<{ results: T[] }>;
			run(): Promise<unknown>;
		};
		all<T>(): Promise<{ results: T[] }>;
	};
}

export function parseScore(body: unknown): ScoreInput {
	const parsed = ScoreInput.safeParse(body);
	if (!parsed.success) throw new ScoreError(400, "ksywka 1–16 znaków, punkty i poziom liczbami");
	if (parsed.data.points > maxScore(parsed.data.level)) {
		throw new ScoreError(422, "tyle punktów nie da się zdobyć do tego poziomu");
	}
	return parsed.data;
}

export async function listScores(db: ScoreDb): Promise<ScoreRow[]> {
	const { results } = await db
		.prepare(
			"SELECT nick, points, level, created_at FROM scores ORDER BY points DESC, level DESC, created_at ASC LIMIT ?",
		)
		.bind(BOARD_SIZE)
		.all<ScoreRow>();
	return results;
}

export async function saveScore(db: ScoreDb, score: ScoreInput): Promise<void> {
	await db
		.prepare("INSERT INTO scores (nick, points, level) VALUES (?, ?, ?)")
		.bind(score.nick, score.points, score.level)
		.run();
}
