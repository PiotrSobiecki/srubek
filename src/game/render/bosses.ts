/**
 * The boss bodies, each with its own palette, silhouette and idle
 * motion. Positions come from the boss object; everything else is drawn here.
 */

import { type Boss, beamEnd, bucketBox, coreOpen, swarmOffsets } from "@/game/boss";
import type { World } from "@/game/engine";
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
	koparka: "KOPARKA",
	zgniatarka: "ZGNIATARKA",
	wieza: "WIEŻA STRAŻNICZA",
	magnes: "MAGNES DŹWIGOWY",
	roj: "RÓJ DRONÓW",
	waz: "TAŚMOCIĄG-WĄŻ",
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

// ── koparka: green excavator with a swinging bucket ───────────────────

function drawExcavator(
	ctx: Ctx,
	boss: Boss,
	world: World,
	frame: number,
	x: number,
	y: number,
): void {
	const w = boss.w;
	const floor = y + boss.h;
	ctx.fillStyle = "rgba(0,0,0,0.3)";
	ctx.beginPath();
	ctx.ellipse(x + w / 2, floor + 1, w / 2, 3, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.save();
	ctx.translate(x + w / 2, floor);
	ctx.scale(boss.dir, 1);
	// Tracks with rolling treads.
	rounded(ctx, -w / 2 + 2, -12, w - 4, 12, 6);
	ctx.fillStyle = shade(ctx, -12, 12, "#4a535d", "#1e2227");
	ctx.fill();
	outline(ctx, 1);
	ctx.fillStyle = "#8d939b";
	const roll = (frame / 2) % 6;
	for (let i = 0; i < (w - 8) / 6; i++) ctx.fillRect(-w / 2 + 4 + i * 6 + roll, -11, 2, 10);
	for (const rx of [-w / 2 + 10, 0, w / 2 - 10]) sphere(ctx, rx, -6, 3.5, "#c9d2da", "#4a535d");
	// Body and cab.
	rounded(ctx, -w / 2 + 6, -30, w - 12, 18, 3);
	ctx.fillStyle = shade(ctx, -30, 18, "#7bc043", "#2f5a18");
	ctx.fill();
	outline(ctx, 1);
	rim(ctx, 0.35);
	rounded(ctx, 4, -42, 18, 14, 3);
	ctx.fillStyle = shade(ctx, -42, 14, "#9ad15e", "#2f5a18");
	ctx.fill();
	outline(ctx, 1);
	ctx.fillStyle = "#9fd8ff";
	ctx.fillRect(7, -40, 12, 7);
	ctx.fillStyle = "rgba(255,255,255,0.5)";
	ctx.fillRect(8, -39, 4, 2);
	// Exhaust stack with smoke.
	ctx.fillStyle = "#2b2f36";
	ctx.fillRect(-w / 2 + 10, -40, 4, 10);
	puff(ctx, -w / 2 + 12, -40, frame, "rgba(90,90,100,A)");
	ctx.restore();
	// Arm: boom from the cab to the bucket, drawn in world space.
	const b =
		boss.phase === "sweep"
			? bucketBox(boss, world)
			: { x: x + w / 2 + boss.dir * 30 - 8, y: floor - 26, w: 16, h: 14 };
	const bx = b.x - (world.camera | 0);
	const shoulder = { x: x + w / 2 + boss.dir * 10, y: floor - 36 };
	const elbow = { x: (shoulder.x + bx + 8) / 2, y: Math.min(shoulder.y, b.y) - 18 };
	ctx.strokeStyle = "#2f5a18";
	ctx.lineWidth = 6;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(shoulder.x, shoulder.y);
	ctx.lineTo(elbow.x, elbow.y);
	ctx.lineTo(bx + 8, b.y + 2);
	ctx.stroke();
	ctx.strokeStyle = "#9ad15e";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(shoulder.x, shoulder.y - 1.5);
	ctx.lineTo(elbow.x, elbow.y - 1.5);
	ctx.stroke();
	// Hydraulic ram along the boom.
	ctx.strokeStyle = "#c9d2da";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(shoulder.x + boss.dir * 4, shoulder.y - 8);
	ctx.lineTo(elbow.x, elbow.y + 6);
	ctx.stroke();
	// Bucket with teeth.
	rounded(ctx, bx, b.y, b.w, b.h, 2);
	ctx.fillStyle = shade(ctx, b.y, b.h, "#8d939b", "#2b2f36");
	ctx.fill();
	outline(ctx, 1);
	ctx.fillStyle = "#c9d2da";
	for (let i = 0; i < 4; i++) {
		ctx.beginPath();
		ctx.moveTo(bx + 1 + i * 4, b.y + b.h);
		ctx.lineTo(bx + 3 + i * 4, b.y + b.h + 3);
		ctx.lineTo(bx + 5 + i * 4, b.y + b.h);
		ctx.closePath();
		ctx.fill();
	}
	if (boss.phase === "sweep") glow(ctx, bx + 8, b.y + 10, 12, "rgba(255,170,60,A)", 0.4);
	drawWeakSpot(ctx, boss, x + w / 2 + boss.dir * 13, floor - 44, frame);
}

// ── zgniatarka: grey crusher with jaws ───────────────────────────────

function drawCrusher(ctx: Ctx, boss: Boss, frame: number, x: number, y: number): void {
	const w = boss.w;
	const h = boss.h;
	const cx = x + w / 2;
	const jaw = boss.phase === "slide" ? Math.abs(Math.sin(frame / 3)) * 6 : 2;
	// Rails above and the lifting arms.
	ctx.fillStyle = "#3a3f49";
	ctx.fillRect(0, 2, VIEW_W, 3);
	for (const px of [x + 10, x + w - 14]) {
		ctx.fillStyle = shade(ctx, 0, y + 4, "#8d939b", "#3a3f49");
		ctx.fillRect(px, 0, 4, y + 4);
	}
	ctx.fillStyle = "rgba(0,0,0,0.3)";
	ctx.beginPath();
	ctx.ellipse(cx, boss.floorY + h + 1, w / 2, 3, 0, 0, Math.PI * 2);
	ctx.fill();
	// Housing with rivets and a mesh grille.
	panel(ctx, x, y + 4, w, h - 12, "#9aa6b2", "#3f4852");
	ctx.fillStyle = "#1e2227";
	ctx.fillRect(x + 8, y + 9, w - 16, 9);
	ctx.strokeStyle = "#5a646e";
	ctx.lineWidth = 0.8;
	ctx.beginPath();
	for (let i = 0; i < (w - 16) / 4; i++) {
		ctx.moveTo(x + 8 + i * 4, y + 9);
		ctx.lineTo(x + 8 + i * 4, y + 18);
	}
	ctx.stroke();
	// Two toothed jaws that gnash while sliding.
	for (const side of [-1, 1]) {
		const jx = cx + side * (w / 2 - 6) - 6;
		rounded(ctx, jx, y + h - 10 + jaw * (side < 0 ? 0 : 0), 12, 8, 2);
		ctx.fillStyle = shade(ctx, y + h - 10, 8, "#c9d2da", "#4a535d");
		ctx.fill();
		outline(ctx, 1);
		ctx.fillStyle = "#e6ecf1";
		for (let i = 0; i < 3; i++) {
			ctx.beginPath();
			ctx.moveTo(jx + 1 + i * 4, y + h - 2);
			ctx.lineTo(jx + 3 + i * 4, y + h + 3 + jaw);
			ctx.lineTo(jx + 5 + i * 4, y + h - 2);
			ctx.closePath();
			ctx.fill();
		}
	}
	// Rollers under the housing.
	for (const rx of [x + 12, cx, x + w - 12]) {
		sphere(ctx, rx, y + h - 6, 4, "#5a646e", "#1e2227");
		ctx.strokeStyle = "#8d939b";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(rx, y + h - 6);
		ctx.lineTo(rx + Math.cos(frame / 4) * 3, y + h - 6 + Math.sin(frame / 4) * 3);
		ctx.stroke();
	}
	// Warning strobe.
	const strobe = boss.phase === "drop" || boss.phase === "slide";
	glow(ctx, cx, y + 6, 10, "rgba(255,60,40,A)", strobe && frame % 10 < 5 ? 0.8 : 0.1);
	sphere(ctx, cx, y + 6, 2.2, strobe ? "#ffb0a0" : "#8a2a1a", "#5a1a10");
	drawWeakSpot(ctx, boss, cx, y, frame);
}

// ── wieża strażnicza: steel watchtower with a sweeping laser ─────────

function drawTower(ctx: Ctx, boss: Boss, world: World, frame: number, x: number, y: number): void {
	const w = boss.w;
	const h = boss.h;
	const cx = x + w / 2;
	const floor = y + h;
	ctx.fillStyle = "rgba(0,0,0,0.3)";
	ctx.beginPath();
	ctx.ellipse(cx, floor + 1, w / 2 + 6, 3, 0, 0, Math.PI * 2);
	ctx.fill();
	// Lattice legs and a base plate.
	ctx.strokeStyle = "#4a535d";
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo(cx - w / 2 - 4, floor);
	ctx.lineTo(cx - 6, y + 22);
	ctx.moveTo(cx + w / 2 + 4, floor);
	ctx.lineTo(cx + 6, y + 22);
	ctx.stroke();
	ctx.strokeStyle = "#8d939b";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let i = 0; i < 5; i++) {
		const t = i / 5;
		const lx = cx - w / 2 - 4 + (w / 2 - 2) * t;
		const rx = cx + w / 2 + 4 - (w / 2 - 2) * t;
		const ly = floor - (floor - y - 22) * t;
		ctx.moveTo(lx, ly);
		ctx.lineTo(rx, ly - 6);
		ctx.moveTo(rx, ly);
		ctx.lineTo(lx, ly - 6);
	}
	ctx.stroke();
	rounded(ctx, cx - w / 2 - 6, floor - 4, w + 12, 4, 1);
	ctx.fillStyle = "#3a3f49";
	ctx.fill();
	// Cabin with a searchlight dome and camera eyes.
	panel(ctx, cx - w / 2, y + 8, w, 18, "#8893a0", "#2f363d");
	ctx.fillStyle = "#1e2227";
	ctx.fillRect(cx - w / 2 + 3, y + 12, w - 6, 6);
	for (const ex of [-8, 0, 8]) {
		glow(ctx, cx + ex, y + 15, 5, "rgba(255,70,50,A)", 0.5);
		sphere(ctx, cx + ex, y + 15, 2, "#ffb0a0", "#c8231a");
	}
	ctx.beginPath();
	ctx.arc(cx, y + 8, 9, Math.PI, 0);
	ctx.closePath();
	ctx.fillStyle = shade(ctx, y - 1, 9, "#c9d2da", "#4a535d");
	ctx.fill();
	outline(ctx, 1);
	// The beam.
	if (boss.phase === "beam") {
		const end = beamEnd(boss, world);
		const ex = end.x - (world.camera | 0);
		glow(ctx, cx, y + 8, 14, "rgba(255,80,60,A)", 0.7);
		ctx.strokeStyle = "rgba(255,90,70,0.35)";
		ctx.lineWidth = 9;
		ctx.beginPath();
		ctx.moveTo(cx, y + 8);
		ctx.lineTo(ex, end.y);
		ctx.stroke();
		ctx.strokeStyle = "#ffd0c0";
		ctx.lineWidth = 2;
		ctx.stroke();
		glow(ctx, ex, end.y, 10, "rgba(255,120,60,A)", 0.6);
	}
	drawWeakSpot(ctx, boss, cx, y - 2, frame);
}

// ── magnes dźwigowy: purple electromagnet on a boom, field lines when pulling ──

function drawMagnet(ctx: Ctx, boss: Boss, world: World, frame: number, x: number, y: number): void {
	const w = boss.w;
	const h = boss.h;
	const cx = x + w / 2;
	// Boom across the top on a pivot, cable down.
	ctx.fillStyle = "#5a3a7a";
	ctx.fillRect(0, 3, VIEW_W, 4);
	ctx.strokeStyle = "#2e1a44";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let bx = 0; bx < VIEW_W; bx += 12) {
		ctx.moveTo(bx, 3);
		ctx.lineTo(bx + 6, 11);
		ctx.lineTo(bx + 12, 3);
	}
	ctx.stroke();
	ctx.fillStyle = "#5a3a7a";
	ctx.fillRect(0, 11, VIEW_W, 2);
	ctx.strokeStyle = "#2b2f36";
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo(cx, 13);
	ctx.lineTo(cx, y + 4);
	ctx.stroke();
	// Horseshoe magnet body.
	ctx.beginPath();
	ctx.arc(cx, y + 12, w / 2, Math.PI, 0);
	ctx.lineTo(cx + w / 2, y + h);
	ctx.lineTo(cx + w / 2 - 12, y + h);
	ctx.lineTo(cx + w / 2 - 12, y + 14);
	ctx.arc(cx, y + 12, w / 2 - 12, 0, Math.PI, true);
	ctx.lineTo(cx - w / 2 + 12, y + h);
	ctx.lineTo(cx - w / 2, y + h);
	ctx.closePath();
	const g = ctx.createLinearGradient(x, 0, x + w, 0);
	g.addColorStop(0, "#c33b6a");
	g.addColorStop(0.5, "#ff6f9c");
	g.addColorStop(1, "#8a1f45");
	ctx.fillStyle = g;
	ctx.fill();
	outline(ctx, 1.1);
	rim(ctx, 0.4);
	// Silver pole tips.
	for (const side of [-1, 1]) {
		rounded(ctx, cx + side * (w / 2 - 6) - 6, y + h - 7, 12, 7, 1.5);
		ctx.fillStyle = shade(ctx, y + h - 7, 7, "#e6ecf1", "#6a7682");
		ctx.fill();
		outline(ctx, 0.9);
	}
	// Coil windings.
	ctx.strokeStyle = "rgba(255,255,255,0.35)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let i = 0; i < 5; i++) {
		ctx.moveTo(cx - w / 2 + 2, y + 16 + i * 3);
		ctx.lineTo(cx - w / 2 + 10, y + 16 + i * 3);
		ctx.moveTo(cx + w / 2 - 10, y + 16 + i * 3);
		ctx.lineTo(cx + w / 2 - 2, y + 16 + i * 3);
	}
	ctx.stroke();
	// Field lines toward Śrubek while pulling.
	if (boss.phase === "pull") {
		const p = world.player;
		const px = p.x + p.w / 2 - (world.camera | 0);
		const py = p.y + p.h / 2;
		for (let i = 0; i < 4; i++) {
			const k = (frame / 12 + i / 4) % 1;
			const fx = px + (cx - px) * k;
			const fy = py + (y + h - py) * k;
			glow(ctx, fx, fy, 5, "rgba(255,120,200,A)", 0.7 * (1 - k));
		}
		glow(ctx, cx, y + h, 24, "rgba(255,120,200,A)", 0.4 + Math.sin(frame / 4) * 0.15);
	}
	drawWeakSpot(ctx, boss, cx, y - 4, frame);
}

// ── rój dronów: a core with eight drones orbiting it ─────────────────

function drawSwarm(ctx: Ctx, boss: Boss, frame: number, x: number, y: number): void {
	const cx = x + boss.w / 2;
	const cy = y + boss.h / 2;
	// Core: a cracked glass orb with a yellow reactor.
	glow(ctx, cx, cy, 22, "rgba(255,220,80,A)", 0.3 + Math.sin(frame / 6) * 0.1);
	sphere(ctx, cx, cy, 11, "#fff3b0", "#b8860b");
	ctx.beginPath();
	ctx.arc(cx, cy, 11, 0, Math.PI * 2);
	outline(ctx, 1);
	ctx.strokeStyle = "rgba(60,40,0,0.5)";
	ctx.lineWidth = 0.8;
	ctx.beginPath();
	ctx.moveTo(cx - 6, cy - 8);
	ctx.lineTo(cx - 2, cy - 2);
	ctx.lineTo(cx - 5, cy + 4);
	ctx.stroke();
	ctx.fillStyle = "#3a3f49";
	ctx.fillRect(cx - 4, cy - 15, 8, 5);
	// Drones around it.
	for (const o of swarmOffsets(boss, frame)) {
		const dx = cx + o.x;
		const dy = cy + o.y;
		ctx.fillStyle = `rgba(255,240,180,${0.3 + (frame % 2) * 0.3})`;
		ctx.beginPath();
		ctx.ellipse(dx, dy - 4, 5, 1.2, 0, 0, Math.PI * 2);
		ctx.fill();
		sphere(ctx, dx, dy, 4, "#f2d04a", "#7a5a10");
		ctx.beginPath();
		ctx.arc(dx, dy, 4, 0, Math.PI * 2);
		outline(ctx, 0.7);
		sphere(ctx, dx + 1, dy, 1.3, "#ffb0a0", "#c8231a");
		if (boss.phase === "scatter") glow(ctx, dx, dy, 7, "rgba(255,80,60,A)", 0.4);
	}
	drawWeakSpot(ctx, boss, cx, cy - 16, frame);
}

// ── taśmociąg-wąż: segmented conveyor snake on the floor ─────────────

function drawSnake(ctx: Ctx, boss: Boss, frame: number, x: number, y: number): void {
	const w = boss.w;
	const h = boss.h;
	const floor = boss.floorY + h;
	ctx.fillStyle = "rgba(0,0,0,0.3)";
	ctx.beginPath();
	ctx.ellipse(x + w / 2, floor + 1, w / 2, 3, 0, 0, Math.PI * 2);
	ctx.fill();
	const segs = 6;
	const segW = w / segs;
	const crawling = boss.phase === "crawl";
	// Segments from tail to head so the head overlaps.
	for (let i = 0; i < segs; i++) {
		const idx = boss.dir > 0 ? i : segs - 1 - i;
		const sx = x + idx * segW;
		const wave = crawling ? Math.sin(frame / 4 + i * 0.9) * 3 : Math.sin(frame / 20 + i) * 0.8;
		const sy = y + 4 + wave;
		rounded(ctx, sx + 1, sy, segW - 2, h - 6, 4);
		ctx.fillStyle = shade(ctx, sy, h - 6, i % 2 ? "#6fa8dc" : "#3d6e9e", "#17304d");
		ctx.fill();
		outline(ctx, 1);
		rim(ctx, 0.3);
		// Conveyor belt rollers along the belly, rolling.
		ctx.fillStyle = "#1e2227";
		ctx.fillRect(sx + 2, sy + h - 10, segW - 4, 4);
		const roll = (frame / 2) % 4;
		ctx.fillStyle = "#8d939b";
		for (let r = 0; r < (segW - 4) / 4; r++)
			ctx.fillRect(sx + 2 + r * 4 + roll - 2, sy + h - 9, 1.5, 2);
	}
	// Head: wedge with a lamp eye and a grinder mouth.
	const hx = boss.dir > 0 ? x + w - segW : x;
	const hy = y + 4 + (crawling ? Math.sin(frame / 4 + segs * 0.9) * 3 : 0);
	ctx.save();
	ctx.translate(hx + segW / 2, hy + (h - 6) / 2);
	ctx.scale(boss.dir, 1);
	ctx.beginPath();
	ctx.moveTo(-segW / 2, -(h - 6) / 2);
	ctx.lineTo(segW / 2 + 8, -2);
	ctx.lineTo(segW / 2 + 8, 2);
	ctx.lineTo(-segW / 2, (h - 6) / 2);
	ctx.closePath();
	ctx.fillStyle = shade(ctx, -(h - 6) / 2, h - 6, "#8fc1ea", "#17304d");
	ctx.fill();
	outline(ctx, 1);
	glow(ctx, 2, -3, 6, "rgba(255,70,50,A)", 0.6);
	sphere(ctx, 2, -3, 2.4, "#ffb0a0", "#c8231a");
	ctx.fillStyle = "#e6ecf1";
	for (let i = 0; i < 3; i++) {
		ctx.beginPath();
		ctx.moveTo(segW / 2 - 2 + i * 3, 3);
		ctx.lineTo(segW / 2 - 0.5 + i * 3, 6);
		ctx.lineTo(segW / 2 + 1 + i * 3, 3);
		ctx.closePath();
		ctx.fill();
	}
	ctx.restore();
	drawWeakSpot(ctx, boss, x + w / 2, y - 2, frame);
}

export function drawBoss(ctx: Ctx, boss: Boss, frame: number, camera: number, world: World): void {
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
		case "koparka":
			drawExcavator(ctx, boss, world, frame, bx, by);
			break;
		case "zgniatarka":
			drawCrusher(ctx, boss, frame, bx, by);
			break;
		case "wieza":
			drawTower(ctx, boss, world, frame, bx, by);
			break;
		case "magnes":
			drawMagnet(ctx, boss, world, frame, bx, by);
			break;
		case "roj":
			drawSwarm(ctx, boss, frame, bx, by);
			break;
		case "waz":
			drawSnake(ctx, boss, frame, bx, by);
			break;
		default:
			drawPress(ctx, boss, frame, bx, by);
	}
}
