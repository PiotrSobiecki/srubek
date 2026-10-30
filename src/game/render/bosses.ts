/**
 * The four boss bodies, each with its own palette, silhouette and idle
 * motion. Positions come from the boss object; everything else is drawn here.
 */

import { type Boss, coreOpen } from "@/game/boss";
import { VIEW_W } from "@/game/engine";
import {
	type Ctx,
	chain,
	glow,
	INK,
	noise,
	outline,
	panel,
	puff,
	rim,
	rounded,
	shade,
	sphere,
} from "./draw";

export const BOSS_NAMES: Record<Boss["spec"]["body"], string> = {
	prasa: "PRASA-OLBRZYM",
	"dron-matka": "DRON-MATKA",
	"pies-alfa": "PIES-ALFA",
	dzwig: "DŹWIG ZŁOMOWY",
};

/** The weak spot: a glass dome, an antenna bulb or a back vent, red when bare. */
function drawWeakSpot(ctx: Ctx, boss: Boss, cx: number, y: number, frame: number): void {
	const open = coreOpen(boss);
	const pulse = 0.5 + Math.sin(frame / 4) * 0.25;
	if (open) glow(ctx, cx, y + 2, 18, "rgba(255,80,60,A)", pulse);
	if (boss.spec.weakSpot === "antena") {
		ctx.strokeStyle = "#3a3f49";
		ctx.lineWidth = 1.8;
		ctx.beginPath();
		ctx.moveTo(cx, y + 4);
		ctx.lineTo(cx, y - 8);
		ctx.stroke();
		ctx.fillStyle = "#6a7682";
		ctx.fillRect(cx - 3, y - 2, 6, 1.5);
		sphere(ctx, cx, y - 9, 3.2, open ? "#fff0b0" : "#b9c3cc", open ? "#d8261b" : "#4a535d");
		return;
	}
	if (boss.spec.weakSpot === "grzbiet") {
		// Armoured vent on the back that pops open.
		rounded(ctx, cx - 8, y - 2, 16, 7, 2);
		ctx.fillStyle = shade(ctx, y - 2, 7, "#8a4b2a", "#4a2314");
		ctx.fill();
		outline(ctx, 0.8);
		if (open) {
			ctx.fillStyle = `rgba(255,120,80,${0.6 + pulse * 0.4})`;
			ctx.fillRect(cx - 6, y, 12, 3);
			sphere(ctx, cx, y + 1.5, 2.2, "#fff0b0", "#d8261b");
		} else {
			ctx.fillStyle = INK;
			for (let i = 0; i < 3; i++) ctx.fillRect(cx - 6 + i * 4.5, y, 2.5, 3);
		}
		return;
	}
	ctx.beginPath();
	ctx.arc(cx, y + 4, 8, Math.PI, 0);
	ctx.closePath();
	ctx.fillStyle = open ? "rgba(255,120,100,0.85)" : "rgba(60,70,90,0.9)";
	ctx.fill();
	outline(ctx, 0.9);
	ctx.fillStyle = "rgba(255,255,255,0.35)";
	ctx.beginPath();
	ctx.ellipse(cx - 3, y - 1, 3, 1.2, -0.5, 0, Math.PI * 2);
	ctx.fill();
	if (open) sphere(ctx, cx, y + 1, 3.4, "#fff0b0", "#d8261b");
}

// ── prasa-olbrzym: yellow-black hydraulics ───────────────────────────

function drawPress(ctx: Ctx, boss: Boss, frame: number, x: number, y: number): void {
	const cx = x + boss.w / 2;
	// Twin cylinders with sleeves and a cross brace.
	for (const px of [x + 8, x + boss.w - 16]) {
		ctx.fillStyle = shade(ctx, 0, y + 6, "#c9d2da", "#4a535d");
		ctx.fillRect(px, 0, 8, y + 6);
		ctx.fillStyle = "rgba(255,255,255,0.45)";
		ctx.fillRect(px + 1.5, 0, 2, y + 6);
		rounded(ctx, px - 3, 0, 14, 16, 2);
		ctx.fillStyle = shade(ctx, 0, 16, "#e9c136", "#a67c12");
		ctx.fill();
		outline(ctx, 0.9);
	}
	ctx.fillStyle = "#3a3f49";
	ctx.fillRect(x + 8, 10, boss.w - 16, 3);
	// Hoses swinging off the head.
	ctx.strokeStyle = "#2b2f36";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(x + 2, y + 8);
	ctx.quadraticCurveTo(x - 10 + Math.sin(frame / 20) * 2, y - 10, x + 6, 0);
	ctx.stroke();
	// Shadow and the head block.
	ctx.fillStyle = "rgba(0,0,0,0.3)";
	ctx.beginPath();
	ctx.ellipse(cx, boss.floorY + boss.h + 1, boss.w / 2, 3, 0, 0, Math.PI * 2);
	ctx.fill();
	panel(ctx, x, y + 4, boss.w, boss.h - 4, "#f2d04a", "#8a6a10", true);
	// Pressure gauge and vents.
	sphere(ctx, x + 12, y + 14, 4.5, "#f6f8fa", "#8d939b");
	ctx.strokeStyle = "#c8231a";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x + 12, y + 14);
	const needle = boss.phase === "drop" ? 1.2 : Math.sin(frame / 15) * 0.4;
	ctx.lineTo(x + 12 + Math.cos(needle - 1.2) * 3.5, y + 14 + Math.sin(needle - 1.2) * 3.5);
	ctx.stroke();
	ctx.fillStyle = INK;
	for (let i = 0; i < 4; i++) ctx.fillRect(x + boss.w - 16 + i * 3.5, y + 11, 2, 7);
	if (boss.phase === "slam") {
		puff(ctx, x - 2, y + boss.h - 4, frame);
		puff(ctx, x + boss.w + 2, y + boss.h - 4, frame + 20);
	}
	// Warning lamp while dropping.
	if (boss.phase === "drop") glow(ctx, cx, y + boss.h, 26, "rgba(255,120,60,A)", 0.45);
	drawWeakSpot(ctx, boss, cx, y, frame);
}

// ── dron-matka: teal hive drone ──────────────────────────────────────

function drawDroneMother(ctx: Ctx, boss: Boss, frame: number, x: number, y: number): void {
	const cx = x + boss.w / 2;
	const cy = y + boss.h / 2 + 3;
	const bob = Math.sin(frame / 10) * 1.5;
	ctx.save();
	ctx.translate(0, bob);
	// Six rotors on three arms.
	for (const [ax, ay] of [
		[-20, -6],
		[20, -6],
		[-22, 8],
		[22, 8],
		[0, -14],
	] as const) {
		ctx.strokeStyle = "#1f3a38";
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(cx, cy);
		ctx.lineTo(cx + ax, cy + ay);
		ctx.stroke();
		ctx.fillStyle = `rgba(190,240,230,${0.3 + (frame % 2) * 0.3})`;
		ctx.beginPath();
		ctx.ellipse(cx + ax, cy + ay - 2, 9, 2, 0, 0, Math.PI * 2);
		ctx.fill();
		sphere(ctx, cx + ax, cy + ay, 2, "#9fe3d8", "#1f3a38");
	}
	// Segmented shell: three armoured bands.
	for (const [ry, rw] of [
		[-8, 18],
		[0, 22],
		[9, 17],
	] as const) {
		ctx.beginPath();
		ctx.ellipse(cx, cy + ry, rw, 8, 0, 0, Math.PI * 2);
		const g = ctx.createRadialGradient(cx - 6, cy + ry - 4, 2, cx, cy + ry, rw);
		g.addColorStop(0, "#7fe0cf");
		g.addColorStop(0.55, "#2a8f85");
		g.addColorStop(1, "#0f3d3a");
		ctx.fillStyle = g;
		ctx.fill();
		outline(ctx, 1);
		rim(ctx, 0.35);
	}
	// Compound eyes and mandibles.
	for (const [ex, ey, r] of [
		[-7, -3, 3],
		[7, -3, 3],
		[0, 2, 2.2],
		[-11, 3, 1.6],
		[11, 3, 1.6],
	] as const) {
		glow(ctx, cx + ex, cy + ey, r * 2.2, "rgba(255,70,50,A)", 0.5);
		sphere(ctx, cx + ex, cy + ey, r, "#ffb0a0", "#c8231a");
	}
	ctx.strokeStyle = "#1f3a38";
	ctx.lineWidth = 1.5;
	for (const side of [-1, 1]) {
		ctx.beginPath();
		ctx.moveTo(cx + side * 6, cy + 12);
		ctx.quadraticCurveTo(
			cx + side * 12,
			cy + 18 + Math.sin(frame / 8) * 1.5,
			cx + side * 4,
			cy + 20,
		);
		ctx.stroke();
	}
	// Hatch underneath, lit when spawning.
	const hatchOpen = boss.phase === "volley";
	rounded(ctx, cx - 8, cy + 13, 16, 4, 1.5);
	ctx.fillStyle = hatchOpen ? "#ffd36a" : INK;
	ctx.fill();
	if (hatchOpen) glow(ctx, cx, cy + 18, 14, "rgba(255,210,100,A)", 0.5);
	drawWeakSpot(ctx, boss, cx, cy - 18, frame);
	ctx.restore();
}

// ── pies-alfa: rust-red mechanical hound ─────────────────────────────

function drawDogAlpha(ctx: Ctx, boss: Boss, frame: number, x: number, y: number): void {
	const w = boss.w;
	const floor = y + boss.h;
	const charging = boss.phase === "charge";
	const stunned = boss.phase === "stun";
	ctx.fillStyle = "rgba(0,0,0,0.3)";
	ctx.beginPath();
	ctx.ellipse(x + w / 2, floor + 1, w / 2, 3, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.save();
	ctx.translate(x + w / 2, floor);
	ctx.scale(boss.dir, 1);
	const breathe = stunned ? Math.sin(frame / 6) * 1.2 : Math.sin(frame / 14) * 0.6;
	// Legs: thigh, shin, paw, with pistons.
	for (const [lx, phase] of [
		[-18, 0],
		[-9, Math.PI],
		[9, 0],
		[18, Math.PI],
	] as const) {
		const s = Math.sin(frame / 2 + phase) * (charging ? 5 : 0);
		const kx = lx + s * 0.6;
		ctx.strokeStyle = "#5a2d14";
		ctx.lineWidth = 4;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(lx, -16);
		ctx.lineTo(kx - 2, -8);
		ctx.lineTo(kx + 1, -1);
		ctx.stroke();
		ctx.strokeStyle = "#b8623a";
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(lx + 1, -15);
		ctx.lineTo(kx - 1, -9);
		ctx.stroke();
		rounded(ctx, kx - 3, -2.5, 7, 2.5, 1);
		ctx.fillStyle = INK;
		ctx.fill();
	}
	// Body: armoured ribcage.
	ctx.beginPath();
	ctx.ellipse(-3, -20 + breathe, w / 2 - 8, 11, 0, 0, Math.PI * 2);
	const body = ctx.createRadialGradient(-10, -27, 2, -3, -20, 26);
	body.addColorStop(0, "#e07a3a");
	body.addColorStop(0.55, "#9a4420");
	body.addColorStop(1, "#4a1c0c");
	ctx.fillStyle = body;
	ctx.fill();
	outline(ctx, 1.1);
	rim(ctx, 0.35);
	ctx.strokeStyle = "rgba(40,15,5,0.7)";
	ctx.lineWidth = 1.2;
	for (let i = -2; i <= 2; i++) {
		ctx.beginPath();
		ctx.arc(-3 + i * 6, -20 + breathe, 9, Math.PI * 0.2, Math.PI * 0.8);
		ctx.stroke();
	}
	// Spine blades and exhaust stacks.
	ctx.fillStyle = "#3a3f49";
	for (let i = -3; i <= 1; i++) {
		ctx.beginPath();
		ctx.moveTo(i * 6 - 3, -30 + breathe);
		ctx.lineTo(i * 6, -39 + breathe);
		ctx.lineTo(i * 6 + 3, -30 + breathe);
		ctx.closePath();
		ctx.fill();
	}
	for (const sx of [-16, -12]) {
		ctx.fillStyle = "#2b2f36";
		ctx.fillRect(sx, -34 + breathe, 3, 8);
		puff(ctx, sx + 1.5, -34 + breathe, frame + sx * 7, "rgba(120,110,110,A)");
	}
	// Neck and head with jaws.
	ctx.strokeStyle = "#5a2d14";
	ctx.lineWidth = 7;
	ctx.beginPath();
	ctx.moveTo(w / 2 - 16, -24 + breathe);
	ctx.lineTo(w / 2 - 6, -30 + breathe);
	ctx.stroke();
	const hx = w / 2 - 4;
	const hy = -33 + breathe;
	rounded(ctx, hx - 12, hy - 4, 22, 13, 4);
	ctx.fillStyle = shade(ctx, hy - 4, 13, "#d77a44", "#5a2d14");
	ctx.fill();
	outline(ctx, 1.1);
	rim(ctx, 0.35);
	// Lower jaw hinges open when charging.
	const jaw = charging ? 4 + Math.sin(frame / 3) * 2 : 1;
	rounded(ctx, hx - 6, hy + 8 + jaw - 2, 16, 5, 2);
	ctx.fillStyle = shade(ctx, hy + 6, 5, "#b8623a", "#4a1c0c");
	ctx.fill();
	outline(ctx, 0.9);
	ctx.fillStyle = "#f4f7fa";
	for (let i = 0; i < 4; i++) {
		ctx.beginPath();
		ctx.moveTo(hx - 4 + i * 4, hy + 9);
		ctx.lineTo(hx - 2 + i * 4, hy + 9 + 2.5);
		ctx.lineTo(hx + i * 4, hy + 9);
		ctx.closePath();
		ctx.fill();
	}
	if (charging) glow(ctx, hx + 4, hy + 10, 10, "rgba(255,120,40,A)", 0.5);
	// Eye and ear fin.
	glow(ctx, hx + 2, hy + 1, 6, "rgba(255,70,50,A)", 0.6);
	sphere(ctx, hx + 2, hy + 1, 2.6, "#ffb0a0", "#c8231a");
	ctx.fillStyle = "#3a3f49";
	ctx.beginPath();
	ctx.moveTo(hx - 10, hy - 3);
	ctx.lineTo(hx - 6, hy - 12);
	ctx.lineTo(hx - 2, hy - 4);
	ctx.closePath();
	ctx.fill();
	// Blade tail.
	ctx.strokeStyle = "#5a2d14";
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(-w / 2 + 10, -24 + breathe);
	ctx.quadraticCurveTo(-w / 2 - 2, -34 + Math.sin(frame / 9) * 3, -w / 2 + 6, -40);
	ctx.stroke();
	ctx.fillStyle = "#9aa3ad";
	ctx.beginPath();
	ctx.moveTo(-w / 2 + 6, -40);
	ctx.lineTo(-w / 2 + 2, -47);
	ctx.lineTo(-w / 2 + 11, -43);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
	drawWeakSpot(ctx, boss, x + w / 2 - boss.dir * 4, y - 2 + breathe, frame);
}

// ── dźwig złomowy: orange gantry crane with a magnet block ───────────

function drawCrane(ctx: Ctx, boss: Boss, frame: number, x: number, y: number): void {
	const cx = x + boss.w / 2;
	// Lattice boom across the top with a cab at the left.
	ctx.fillStyle = "#e07a1c";
	ctx.fillRect(0, 2, VIEW_W, 4);
	ctx.strokeStyle = "#8a4a10";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let bx = 0; bx < VIEW_W; bx += 10) {
		ctx.moveTo(bx, 2);
		ctx.lineTo(bx + 5, 10);
		ctx.lineTo(bx + 10, 2);
	}
	ctx.stroke();
	ctx.fillStyle = "#e07a1c";
	ctx.fillRect(0, 10, VIEW_W, 2);
	rounded(ctx, 14, 12, 26, 16, 3);
	ctx.fillStyle = shade(ctx, 12, 16, "#f0a040", "#8a4a10");
	ctx.fill();
	outline(ctx, 1);
	ctx.fillStyle = "#9fd8ff";
	ctx.fillRect(18, 15, 12, 7);
	ctx.fillStyle = "rgba(255,255,255,0.5)";
	ctx.fillRect(19, 16, 4, 2);
	// Trolley with a blinking lamp, cable and chains.
	rounded(ctx, cx - 12, 0, 24, 12, 2);
	ctx.fillStyle = shade(ctx, 0, 12, "#c9d2da", "#4a535d");
	ctx.fill();
	outline(ctx, 1);
	const blink = Math.floor(frame / 15) % 2 === 0;
	glow(ctx, cx + 8, 3, 8, "rgba(255,180,60,A)", blink ? 0.8 : 0.1);
	sphere(ctx, cx + 8, 3, 2, blink ? "#fff0b0" : "#a67c12", "#8a4a10");
	ctx.strokeStyle = "#2b2f36";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(cx, 12);
	ctx.lineTo(cx, y + 2);
	ctx.stroke();
	chain(ctx, cx - 10, y + boss.h - 6, 14, frame / 12);
	chain(ctx, cx + 10, y + boss.h - 6, 14, frame / 12 + 1);
	// Magnet block: orange housing over a dark electromagnet disc.
	panel(ctx, x, y + 2, boss.w, boss.h - 10, "#f0a040", "#8a4a10");
	ctx.beginPath();
	ctx.ellipse(cx, y + boss.h - 7, boss.w / 2 + 2, 5, 0, 0, Math.PI * 2);
	ctx.fillStyle = shade(ctx, y + boss.h - 12, 10, "#5a646e", "#1e2227");
	ctx.fill();
	outline(ctx, 1);
	ctx.strokeStyle = `rgba(79,240,224,${0.3 + Math.sin(frame / 5) * 0.2})`;
	ctx.lineWidth = 1.2;
	ctx.beginPath();
	ctx.ellipse(cx, y + boss.h - 7, boss.w / 2 - 4, 3, 0, 0, Math.PI * 2);
	ctx.stroke();
	// Scrap bits stuck to the magnet.
	for (let i = 0; i < 4; i++) {
		const sx = cx - 10 + noise(i, 1, 131) * 20;
		sphere(ctx, sx, y + boss.h - 3 + noise(i, 2, 131) * 2, 2, "#c6d0d9", "#5a646e");
	}
	if (boss.phase === "volley") glow(ctx, cx, y + boss.h, 18, "rgba(79,240,224,A)", 0.5);
	drawWeakSpot(ctx, boss, cx, y, frame);
}

export function drawBoss(ctx: Ctx, boss: Boss, frame: number, camera: number): void {
	if (!boss.alive) return;
	const bx = Math.round(boss.x - camera);
	const by = Math.round(boss.y);
	switch (boss.spec.body) {
		case "dron-matka":
			drawDroneMother(ctx, boss, frame, bx, by);
			break;
		case "pies-alfa":
			drawDogAlpha(ctx, boss, frame, bx, by);
			break;
		case "dzwig":
			drawCrane(ctx, boss, frame, bx, by);
			break;
		default:
			drawPress(ctx, boss, frame, bx, by);
	}
}
