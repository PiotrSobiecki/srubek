/**
 * GET /api/scores — the top of the board. POST /api/scores — add a run.
 * Parses, rate-limits and delegates to `@/scores`; every decision lives there.
 */

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { listScores, parseScore, ScoreError, saveScore } from "@/scores";

export const GET: APIRoute = async () => {
	const scores = await listScores(env.DB);
	return Response.json({ scores }, { status: 200 });
};

export const POST: APIRoute = async ({ request }) => {
	// The adapter has no clientAddress; Cloudflare puts the caller's IP in this header.
	const ip = request.headers.get("cf-connecting-ip") ?? "local";
	const { success } = await env.SCORE_LIMIT.limit({ key: ip });
	if (!success)
		return Response.json({ error: "za dużo zapisów, spróbuj za minutę" }, { status: 429 });

	const body: unknown = await request.json().catch(() => null);
	try {
		const score = parseScore(body);
		await saveScore(env.DB, score);
		return Response.json({ ok: true }, { status: 201 });
	} catch (e) {
		if (e instanceof ScoreError) return Response.json({ error: e.message }, { status: e.status });
		throw e;
	}
};
