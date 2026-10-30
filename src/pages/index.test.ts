import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(import.meta.dirname, "index.astro"), "utf8");

describe("game page", () => {
	it("mounts the game canvas", () => {
		expect(page).toMatch(/<canvas id="game"/);
	});

	it("carries no template demo copy", () => {
		expect(page).not.toContain("Astro on Cloudflare");
		expect(page).not.toContain("init-project");
	});
});
