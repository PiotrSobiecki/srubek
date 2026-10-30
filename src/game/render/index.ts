/**
 * Everything that touches the canvas. Vector drawing at 2x over CC0 photo
 * textures (public/textures): the world keeps its 16 px tiles, the canvas is
 * 960x512, shapes get gradients, rim lights and outlines, surfaces get texture.
 */

import type { Boss } from "@/game/boss";
import {
	EFFECT_FRAMES,
	MEGA_SIZE,
	type Platform,
	type Player,
	type Press,
	SCRAP_CAPACITY,
	VIEW_H,
	VIEW_W,
	type World,
} from "@/game/engine";
import { type Level, type PickupKind, type Theme, TILE } from "@/game/level";
import { BATTERY_MAX, BOLTS_PER_MEGA, type GameState, totalPoints } from "@/game/state";
import { type Skin, tint } from "@/skin";
import { BOSS_NAMES, drawBoss } from "./bosses";
import { type Ctx, glow, noise, outline, rim, rounded, shade, sphere } from "./draw";

const SCALE = 2;

/** Śrubek and company are drawn this much larger than their hitboxes. */
const ACTOR = 1.25;

/** Comic-style text: warm gradient fill with a dark outline, like the page title. */
function fancyText(
	ctx: Ctx,
	text: string,
	x: number,
	y: number,
	size: number,
	align: CanvasTextAlign = "left",
): void {
	ctx.font = `${size}px Bangers, Impact, sans-serif`;
	ctx.textAlign = align;
	ctx.textBaseline = "middle";
	ctx.lineJoin = "round";
	ctx.lineWidth = Math.max(1.5, size / 7);
	ctx.strokeStyle = "#2a140c";
	ctx.strokeText(text, x, y);
	const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
	g.addColorStop(0, "#fff2b0");
	g.addColorStop(0.5, "#ffb347");
	g.addColorStop(1, "#ff6a3d");
	ctx.fillStyle = g;
	ctx.fillText(text, x, y);
	ctx.textAlign = "left";
}

function hexagon(ctx: Ctx, r: number): void {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
	}
	ctx.closePath();
}

// ── textures ─────────────────────────────────────────────────────────

type TextureName =
	| "gravel"
	| "moss"
	| "rust"
	| "plates"
	| "concrete"
	| "asphalt"
	| "diamond"
	| "tiles"
	| "paint"
	| "corrugated";

interface Textures {
	pattern(ctx: Ctx, name: TextureName, offsetX: number, scale: number): CanvasPattern | string;
}

const FALLBACK: Record<TextureName, string> = {
	gravel: "#5a4a3e",
	moss: "#6f8a2e",
	rust: "#8a4b2a",
	plates: "#58606a",
	concrete: "#8d8f8c",
	asphalt: "#2b2d33",
	diamond: "#8a9096",
	tiles: "#3a3d33",
	paint: "#b8a640",
	corrugated: "#9a3a34",
};

/** How each theme dresses its ground, crust and platforms. */
interface ThemeStyle {
	ground: TextureName;
	groundScale: number;
	crust: TextureName;
	crustScale: number;
	plate: TextureName;
	/** Grass tufts on the crust, or none. */
	tufts?: string;
	rim: string;
	/** Scrap shards sunk into the ground. */
	shards: boolean;
	/** Hazard stripes painted along the crust. */
	stripes: boolean;
}

const THEME_STYLE: Record<Theme, ThemeStyle> = {
	zlomowisko: {
		ground: "gravel",
		groundScale: 0.3,
		crust: "moss",
		crustScale: 0.22,
		plate: "plates",
		tufts: "#9ec44a",
		rim: "rgba(255,255,200,0.55)",
		shards: true,
		stripes: false,
	},
	stocznia: {
		ground: "concrete",
		groundScale: 0.25,
		crust: "asphalt",
		crustScale: 0.25,
		plate: "diamond",
		rim: "rgba(220,235,255,0.6)",
		shards: false,
		stripes: false,
	},
	fabryka: {
		ground: "tiles",
		groundScale: 0.25,
		crust: "paint",
		crustScale: 0.2,
		plate: "corrugated",
		rim: "rgba(255,220,120,0.6)",
		shards: false,
		stripes: true,
	},
};

/** Loads the CC0 textures; until an image arrives its flat colour is used instead. */
function loadTextures(): Textures {
	const images = new Map<TextureName, HTMLImageElement>();
	const cache = new Map<string, CanvasPattern>();
	for (const name of Object.keys(FALLBACK) as TextureName[]) {
		const img = new Image();
		img.src = `/textures/${name}.jpg`;
		img.onload = () => images.set(name, img);
	}
	return {
		pattern(ctx, name, offsetX, scale) {
			const img = images.get(name);
			if (!img) return FALLBACK[name];
			const key = `${name}:${scale}`;
			let p = cache.get(key);
			if (!p) {
				const made = ctx.createPattern(img, "repeat");
				if (!made) return FALLBACK[name];
				p = made;
				cache.set(key, p);
			}
			p.setTransform(new DOMMatrix().translate(offsetX, 0).scale(scale));
			return p;
		},
	};
}

// ── background ───────────────────────────────────────────────────────

interface Backdrop {
	sky: HTMLCanvasElement;
	far: HTMLCanvasElement;
	mid: HTMLCanvasElement;
	/** Water strip between the far and mid layers, shipyard only. */
	sea?: HTMLCanvasElement;
	/** Chimneys in the mid layer that breathe smoke, factory only. */
	smoky?: boolean;
}

function layerCanvas(w: number, h: number): [HTMLCanvasElement, Ctx | null] {
	const c = document.createElement("canvas");
	c.width = w * SCALE;
	c.height = h * SCALE;
	const ctx = c.getContext("2d");
	ctx?.scale(SCALE, SCALE);
	return [c, ctx];
}

interface SkyPalette {
	stops: [string, string, string, string];
	clouds: string;
	cloudAlpha: number;
	stars: number;
	moon: [string, string];
	moonY: number;
}

const SKIES: Record<Theme, SkyPalette> = {
	zlomowisko: {
		stops: ["#0e0c24", "#35204a", "#b84e33", "#f2a640"],
		clouds: "rgba(120,70,160,A)",
		cloudAlpha: 0.25,
		stars: 160,
		moon: ["#fff6cf", "#d9b35a"],
		moonY: 48,
	},
	stocznia: {
		stops: ["#03060f", "#0b1836", "#1d3766", "#4d74a8"],
		clouds: "rgba(70,110,190,A)",
		cloudAlpha: 0.22,
		stars: 240,
		moon: ["#f4f8ff", "#9fb4d6"],
		moonY: 40,
	},
	fabryka: {
		stops: ["#1c130d", "#3d2618", "#86431c", "#e08a2e"],
		clouds: "rgba(80,62,52,A)",
		cloudAlpha: 0.45,
		stars: 30,
		moon: ["#ffe2a0", "#e0782a"],
		moonY: 120,
	},
};

function bakeSky(p: SkyPalette): HTMLCanvasElement {
	const [c, ctx] = layerCanvas(VIEW_W, VIEW_H);
	if (!ctx) return c;
	const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
	sky.addColorStop(0, p.stops[0]);
	sky.addColorStop(0.4, p.stops[1]);
	sky.addColorStop(0.75, p.stops[2]);
	sky.addColorStop(1, p.stops[3]);
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	// Nebula-like soft clouds, or smog.
	for (let i = 0; i < 6; i++) {
		glow(ctx, 60 + i * 80, 40 + noise(i, 1, 5) * 90, 70, p.clouds, p.cloudAlpha);
	}
	for (let i = 0; i < p.stars; i++) {
		const x = noise(i, 1, 3) * VIEW_W;
		const y = noise(i, 2, 3) * VIEW_H * 0.62;
		const r = 0.4 + noise(i, 3, 3) * 1.2;
		ctx.fillStyle = `rgba(255,240,200,${0.3 + noise(i, 4, 3) * 0.7})`;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	glow(ctx, 400, p.moonY, 46, "rgba(255,230,160,A)", 0.35);
	sphere(ctx, 400, p.moonY, 18, p.moon[0], p.moon[1]);
	ctx.fillStyle = "rgba(190,150,70,0.35)";
	ctx.beginPath();
	ctx.arc(394, 44, 4, 0, Math.PI * 2);
	ctx.arc(406, 54, 3, 0, Math.PI * 2);
	ctx.fill();
	return c;
}

function drawCrane(ctx: Ctx, x: number, top: number, bottom: number, color: string): void {
	ctx.fillStyle = color;
	ctx.fillRect(x, top, 3, bottom - top);
	ctx.fillRect(x - 40, top, 70, 2.5);
	ctx.fillRect(x + 24, top + 2, 1, 30);
	ctx.fillRect(x + 20, top + 30, 9, 5);
	// Lattice.
	ctx.lineWidth = 0.6;
	ctx.strokeStyle = color;
	ctx.beginPath();
	for (let y = top + 6; y < bottom; y += 8) {
		ctx.moveTo(x, y);
		ctx.lineTo(x + 3, y + 8);
	}
	ctx.stroke();
}

function drawSpotlight(ctx: Ctx, x: number, bottom: number, height: number, color: string): void {
	ctx.fillStyle = color;
	ctx.fillRect(x - 1, bottom - height, 2, height);
	rounded(ctx, x - 5, bottom - height - 5, 10, 6, 2);
	ctx.fill();
	// Light cone up into the sky.
	const g = ctx.createLinearGradient(0, bottom - height, 0, bottom - height - 120);
	g.addColorStop(0, "rgba(255,230,160,0.35)");
	g.addColorStop(1, "rgba(255,230,160,0)");
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.moveTo(x - 4, bottom - height - 4);
	ctx.lineTo(x - 36, bottom - height - 120);
	ctx.lineTo(x + 8, bottom - height - 120);
	ctx.lineTo(x + 4, bottom - height - 4);
	ctx.closePath();
	ctx.fill();
	glow(ctx, x, bottom - height - 2, 9, "rgba(255,235,170,A)", 0.9);
}

/** One repeating strip of distant scrap mountains with cranes and lights. */
function bakeLayer(
	period: number,
	height: number,
	top: string,
	bottom: string,
	salt: number,
	lit: boolean,
): HTMLCanvasElement {
	const [c, ctx] = layerCanvas(period, height);
	if (!ctx) return c;
	ctx.fillStyle = shade(ctx, 0, height, top, bottom);
	ctx.beginPath();
	ctx.moveTo(0, height);
	const steps = 14;
	for (let i = 0; i <= steps; i++) {
		const x = (i / steps) * period;
		const y = height - 20 - noise(i, salt, salt) * (height - 36);
		ctx.quadraticCurveTo(x - period / steps / 2, y + 6, x, y);
	}
	ctx.lineTo(period, height);
	ctx.closePath();
	ctx.fill();
	drawCrane(ctx, period * 0.6, 6, height, bottom);
	ctx.fillStyle = bottom;
	ctx.fillRect(period * 0.2, 30, 10, height);
	ctx.fillRect(period * 0.22, 22, 6, 10);
	if (lit) drawSpotlight(ctx, period * 0.85, height - 10, 60, bottom);
	return c;
}

/** Warehouse blocks with a scatter of lit windows. */
function drawWarehouses(
	ctx: Ctx,
	period: number,
	height: number,
	tone: string,
	dark: string,
): void {
	const blocks: [number, number, number][] = [
		[0.02, 0.18, 46],
		[0.22, 0.1, 70],
		[0.34, 0.14, 38],
		[0.86, 0.12, 58],
	];
	for (const [bx, bw, bh] of blocks) {
		const x = bx * period;
		const w = bw * period;
		ctx.fillStyle = shade(ctx, height - bh, bh, tone, dark);
		ctx.fillRect(x, height - bh, w, bh);
		ctx.fillRect(x + w * 0.3, height - bh - 6, w * 0.4, 6);
		for (let wy = height - bh + 6; wy < height - 8; wy += 9) {
			for (let wx = x + 4; wx < x + w - 5; wx += 7) {
				const on = noise(wx, wy, 53) > 0.55;
				ctx.fillStyle = on ? "rgba(255,220,140,0.85)" : "rgba(0,0,0,0.35)";
				ctx.fillRect(wx, wy, 3, 4);
			}
		}
	}
}

/** Shipyard skyline: a gantry crane, a hull in the dock, warehouses with lit windows. */
function bakeShipyard(
	period: number,
	height: number,
	tone: string,
	dark: string,
	lit: boolean,
): HTMLCanvasElement {
	const [c, ctx] = layerCanvas(period, height);
	if (!ctx) return c;
	drawWarehouses(ctx, period, height, tone, dark);
	ctx.fillStyle = dark;
	ctx.fillRect(period * 0.12, height - 90, 6, 90);
	// Gantry crane straddling the dock.
	const gx = period * 0.5;
	ctx.fillRect(gx, 10, 4, height - 10);
	ctx.fillRect(gx + 80, 10, 4, height - 10);
	ctx.fillRect(gx - 20, 10, 124, 5);
	ctx.fillRect(gx + 30, 15, 2, 28);
	ctx.fillRect(gx + 24, 43, 14, 6);
	ctx.strokeStyle = dark;
	ctx.lineWidth = 0.8;
	ctx.beginPath();
	for (let y = 20; y < height; y += 10) {
		ctx.moveTo(gx, y);
		ctx.lineTo(gx + 4, y + 10);
		ctx.moveTo(gx + 84, y);
		ctx.lineTo(gx + 80, y + 10);
	}
	ctx.stroke();
	// Hull in the dock under the crane.
	ctx.fillStyle = shade(ctx, height - 40, 40, tone, dark);
	ctx.beginPath();
	ctx.moveTo(gx - 6, height - 40);
	ctx.lineTo(gx + 96, height - 40);
	ctx.lineTo(gx + 88, height);
	ctx.lineTo(gx + 2, height);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = dark;
	ctx.fillRect(gx + 20, height - 56, 40, 16);
	ctx.fillRect(gx + 50, height - 68, 6, 12);
	for (let i = 0; i < 7; i++) {
		ctx.fillStyle = noise(i, 2, 57) > 0.4 ? "rgba(255,220,140,0.8)" : "rgba(0,0,0,0.3)";
		ctx.fillRect(gx + 8 + i * 11, height - 30, 4, 3);
	}
	if (lit) drawSpotlight(ctx, period * 0.78, height - 4, 48, dark);
	return c;
}

function bakeSea(): HTMLCanvasElement {
	const [c, ctx] = layerCanvas(VIEW_W, 60);
	if (!ctx) return c;
	ctx.fillStyle = shade(ctx, 0, 60, "#2a3b6a", "#0e1630");
	ctx.fillRect(0, 0, VIEW_W, 60);
	// Moon path and ripples.
	const g = ctx.createLinearGradient(0, 0, 0, 60);
	g.addColorStop(0, "rgba(255,230,160,0.45)");
	g.addColorStop(1, "rgba(255,230,160,0)");
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.moveTo(392, 0);
	ctx.lineTo(408, 0);
	ctx.lineTo(440, 60);
	ctx.lineTo(360, 60);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = "rgba(180,210,255,0.35)";
	ctx.lineWidth = 0.8;
	ctx.beginPath();
	for (let i = 0; i < 70; i++) {
		const x = noise(i, 1, 61) * VIEW_W;
		const y = 3 + noise(i, 2, 61) * 54;
		ctx.moveTo(x, y);
		ctx.lineTo(x + 6 + noise(i, 3, 61) * 14, y);
	}
	ctx.stroke();
	return c;
}

/** Chimney x positions inside the factory's mid layer, for the live smoke. */
const FACTORY_STACKS = [0.18, 0.62, 0.86];

/** Factory skyline: sawtooth-roof halls, striped chimneys, a pipe run with lit windows. */
function bakeFactory(
	period: number,
	height: number,
	tone: string,
	dark: string,
	stacks: boolean,
): HTMLCanvasElement {
	const [c, ctx] = layerCanvas(period, height);
	if (!ctx) return c;
	const halls: [number, number, number][] = [
		[0, 0.34, 54],
		[0.36, 0.3, 66],
		[0.7, 0.3, 48],
	];
	for (const [hx, hw, hh] of halls) {
		const x = hx * period;
		const w = hw * period;
		const top = height - hh;
		ctx.fillStyle = shade(ctx, top, hh, tone, dark);
		ctx.beginPath();
		ctx.moveTo(x, height);
		ctx.lineTo(x, top + 10);
		const teeth = Math.max(3, Math.round(w / 22));
		for (let i = 0; i < teeth; i++) {
			const tx = x + (i * w) / teeth;
			ctx.lineTo(tx + w / teeth, top);
			ctx.lineTo(tx + w / teeth, top + 10);
		}
		ctx.lineTo(x + w, height);
		ctx.closePath();
		ctx.fill();
		for (let i = 0; i < teeth; i++) {
			const on = noise(i, hx * 10, 61) > 0.35;
			ctx.fillStyle = on ? "rgba(255,200,110,0.75)" : "rgba(0,0,0,0.3)";
			ctx.fillRect(x + (i * w) / teeth + 6, top + 14, w / teeth - 12, 5);
		}
	}
	// Pipe run along the halls.
	ctx.fillStyle = dark;
	ctx.fillRect(0, height - 30, period, 3);
	ctx.fillRect(period * 0.33, height - 46, 3, 16);
	if (stacks) {
		for (const sx of FACTORY_STACKS) {
			const x = sx * period;
			ctx.fillStyle = shade(ctx, 8, height, "#5a4a44", dark);
			ctx.fillRect(x - 4, 8, 8, height);
			for (let y = 14; y < 40; y += 10) {
				ctx.fillStyle = "rgba(220,80,60,0.75)";
				ctx.fillRect(x - 4, y, 8, 4);
			}
			glow(ctx, x, 10, 5, "rgba(255,90,60,A)", 0.7);
		}
	}
	return c;
}

function bakeBackdrop(theme: Theme): Backdrop {
	if (theme === "fabryka") {
		return {
			sky: bakeSky(SKIES.fabryka),
			far: bakeFactory(400, 140, "#4a3428", "#24170f", false),
			mid: bakeFactory(300, 120, "#3d2a20", "#1a100a", true),
			smoky: true,
		};
	}
	if (theme === "stocznia") {
		return {
			sky: bakeSky(SKIES.stocznia),
			far: bakeShipyard(420, 150, "#3a3458", "#1e1a34", false),
			mid: bakeShipyard(360, 110, "#4a3a4a", "#261c2c", true),
			sea: bakeSea(),
		};
	}
	return {
		sky: bakeSky(SKIES.zlomowisko),
		far: bakeLayer(340, 160, "#4d2b58", "#2b1a38", 11, false),
		mid: bakeLayer(280, 118, "#5f3238", "#33202a", 17, true),
	};
}

function drawLayer(
	ctx: Ctx,
	layer: HTMLCanvasElement,
	camera: number,
	parallax: number,
	bottom: number,
): void {
	const period = layer.width / SCALE;
	const height = layer.height / SCALE;
	const shift = (camera * parallax) % period;
	for (let x = -shift - period; x < VIEW_W + period; x += period) {
		ctx.drawImage(layer, x, bottom - height, period, height);
	}
}

function drawBackground(ctx: Ctx, b: Backdrop, camera: number, frame: number): void {
	ctx.drawImage(b.sky, 0, 0, VIEW_W, VIEW_H);
	// Two searchlights sweeping slowly across the sky.
	for (const [bx, speed, phase] of [
		[120, 0.004, 0],
		[360, 0.003, 2],
	] as const) {
		const a = -Math.PI / 2 + Math.sin(frame * speed + phase) * 0.5;
		const x = bx - camera * 0.1;
		const g = ctx.createLinearGradient(
			x,
			VIEW_H,
			x + Math.cos(a) * 300,
			VIEW_H + Math.sin(a) * 300,
		);
		g.addColorStop(0, "rgba(255,240,200,0.22)");
		g.addColorStop(1, "rgba(255,240,200,0)");
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.moveTo(x, VIEW_H - 20);
		ctx.lineTo(x + Math.cos(a - 0.06) * 340, VIEW_H - 20 + Math.sin(a - 0.06) * 340);
		ctx.lineTo(x + Math.cos(a + 0.06) * 340, VIEW_H - 20 + Math.sin(a + 0.06) * 340);
		ctx.closePath();
		ctx.fill();
	}
	drawLayer(ctx, b.far, camera, 0.2, VIEW_H - 60);
	if (b.sea) {
		ctx.drawImage(b.sea, 0, VIEW_H - 60, VIEW_W, 60);
		// Slow shimmer: a second, offset pass at low alpha.
		ctx.globalAlpha = 0.35;
		ctx.drawImage(b.sea, (frame * 0.15) % 40, VIEW_H - 60, VIEW_W, 60);
		ctx.globalAlpha = 1;
	}
	drawLayer(ctx, b.mid, camera, 0.45, VIEW_H - 12);
	if (b.smoky) drawSmoke(ctx, b.mid, camera, frame);
}

/** Smoke rising from the factory chimneys, moving with the mid layer. */
function drawSmoke(ctx: Ctx, layer: HTMLCanvasElement, camera: number, frame: number): void {
	const period = layer.width / SCALE;
	const top = VIEW_H - 12 - layer.height / SCALE + 8;
	const shift = (camera * 0.45) % period;
	for (let base = -shift - period; base < VIEW_W + period; base += period) {
		for (const sx of FACTORY_STACKS) {
			for (let i = 0; i < 6; i++) {
				const t = (frame * 0.5 + i * 18 + sx * 50) % 108;
				const k = t / 108;
				const x = base + sx * period + t * 0.35 + Math.sin(t / 12 + i) * 3;
				glow(ctx, x, top - t * 0.9, 4 + t * 0.14, "rgba(70,58,52,A)", (1 - k) * 0.45);
			}
		}
	}
}

// ── tiles and decor ──────────────────────────────────────────────────

function drawGroundTile(
	ctx: Ctx,
	tex: Textures,
	style: ThemeStyle,
	x: number,
	y: number,
	tx: number,
	ty: number,
	open: boolean,
	camera: number,
): void {
	ctx.fillStyle = tex.pattern(ctx, style.ground, -camera, style.groundScale);
	ctx.fillRect(x, y, TILE, TILE);
	// Depth: darker the deeper the row.
	ctx.fillStyle = `rgba(20,10,5,${Math.min(0.55, 0.12 + (ty - 12) * 0.08)})`;
	ctx.fillRect(x, y, TILE, TILE);
	// Buried scrap: bolts and bright shards.
	for (let i = 0; i < (style.shards ? 3 : 0); i++) {
		const r = noise(tx * 5 + i, ty, 7);
		const px = x + 2 + noise(tx, ty + i, 9) * 12;
		const py = y + 4 + noise(tx + i, ty, 13) * 10;
		if (r > 0.5) sphere(ctx, px, py, 1 + r, "#c9d2da", "#4e5760");
		else sphere(ctx, px, py, 0.8 + r, "#c97a3a", "#5a2d14");
	}
	if (!open) return;
	// Mossy crust with a wavy underside, a bright rim and a shadow beneath.
	ctx.fillStyle = "rgba(0,0,0,0.35)";
	ctx.fillRect(x, y + 6, TILE, 2);
	ctx.fillStyle = tex.pattern(ctx, style.crust, -camera, style.crustScale);
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + TILE, y);
	ctx.lineTo(x + TILE, y + 5);
	for (let i = 3; i >= 0; i--) {
		const px = x + i * 4;
		ctx.quadraticCurveTo(px + 2, y + 8 + noise(tx, i, 21) * 2, px, y + 5);
	}
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = style.rim;
	ctx.fillRect(x, y, TILE, 1.2);
	if (style.stripes) {
		ctx.fillStyle = "rgba(20,16,12,0.8)";
		for (let i = 0; i < 2; i++) {
			ctx.beginPath();
			ctx.moveTo(x + i * 8 + 2, y + 5);
			ctx.lineTo(x + i * 8 + 5, y + 1.2);
			ctx.lineTo(x + i * 8 + 8, y + 1.2);
			ctx.lineTo(x + i * 8 + 5, y + 5);
			ctx.closePath();
			ctx.fill();
		}
	}
	if (!style.tufts) return;
	// Tufts.
	ctx.strokeStyle = style.tufts;
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let i = 0; i < 3; i++) {
		const px = x + 2 + i * 5 + noise(tx, i, 25) * 3;
		ctx.moveTo(px, y + 1);
		ctx.lineTo(px - 1 + noise(tx + i, ty, 27) * 2, y - 2 - noise(tx, ty + i, 29) * 2);
	}
	ctx.stroke();
}

function drawPlateTile(
	ctx: Ctx,
	tex: Textures,
	style: ThemeStyle,
	x: number,
	y: number,
	left: boolean,
	right: boolean,
	camera: number,
): void {
	ctx.fillStyle = tex.pattern(ctx, style.plate, -camera, 0.125);
	ctx.fillRect(x, y, TILE, TILE);
	ctx.fillStyle = shade(ctx, y, TILE, "rgba(255,255,255,0.22)", "rgba(0,0,0,0.35)");
	ctx.fillRect(x, y, TILE, TILE);
	ctx.fillStyle = "#e6edf3";
	ctx.fillRect(x, y, TILE, 1.5);
	ctx.fillStyle = "#1f252c";
	ctx.fillRect(x, y + TILE - 1.5, TILE, 1.5);
	if (left) ctx.fillRect(x, y, 1, TILE);
	if (right) ctx.fillRect(x + TILE - 1, y, 1, TILE);
	for (const [rx, ry] of [
		[3, 4],
		[13, 4],
		[3, 12],
		[13, 12],
	] as const) {
		sphere(ctx, x + rx, y + ry, 1.4, "#ffffff", "#6f7a86");
	}
}

function drawBarrel(
	ctx: Ctx,
	tex: Textures,
	x: number,
	floor: number,
	camera: number,
	salt: number,
): void {
	const w = 12;
	const h = 16;
	const y = floor - h;
	rounded(ctx, x, y, w, h, 2);
	ctx.fillStyle = tex.pattern(ctx, "rust", -camera, 0.1);
	ctx.fill();
	ctx.fillStyle = shade(ctx, y, h, "rgba(255,220,180,0.25)", "rgba(0,0,0,0.45)");
	ctx.fill();
	// Cylinder shading left/right.
	const g = ctx.createLinearGradient(x, 0, x + w, 0);
	g.addColorStop(0, "rgba(0,0,0,0.35)");
	g.addColorStop(0.35, "rgba(255,255,255,0.18)");
	g.addColorStop(1, "rgba(0,0,0,0.45)");
	ctx.fillStyle = g;
	ctx.fill();
	outline(ctx, 0.7);
	ctx.fillStyle = "rgba(40,30,25,0.8)";
	ctx.fillRect(x, y + 4, w, 1.2);
	ctx.fillRect(x, y + h - 5, w, 1.2);
	if (noise(salt, 1, 31) > 0.5) {
		ctx.fillStyle = "#e9c16a";
		ctx.fillRect(x + 4, y + 7, 4, 3);
	}
}

function drawTire(ctx: Ctx, cx: number, cy: number): void {
	ctx.fillStyle = "rgba(0,0,0,0.25)";
	ctx.beginPath();
	ctx.ellipse(cx, cy + 5.5, 7, 1.5, 0, 0, Math.PI * 2);
	ctx.fill();
	sphere(ctx, cx, cy, 6.5, "#4a4d52", "#15171a");
	ctx.beginPath();
	ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
	outline(ctx, 0.6);
	sphere(ctx, cx, cy, 3, "#6a7078", "#2a2e33");
	ctx.strokeStyle = "rgba(255,255,255,0.35)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(cx, cy, 5, Math.PI * 1.1, Math.PI * 1.6);
	ctx.stroke();
}

function drawBollard(ctx: Ctx, cx: number, floor: number): void {
	rounded(ctx, cx - 4, floor - 10, 8, 10, 2);
	ctx.fillStyle = shade(ctx, floor - 10, 10, "#4a535d", "#1e2227");
	ctx.fill();
	outline(ctx, 0.7);
	rounded(ctx, cx - 5.5, floor - 12, 11, 3, 1.5);
	ctx.fill();
	outline(ctx, 0.6);
	ctx.fillStyle = "#e9c136";
	ctx.fillRect(cx - 4, floor - 7, 8, 1.5);
}

function drawContainer(ctx: Ctx, x: number, floor: number, color: string): void {
	const w = 14;
	const h = 12;
	rounded(ctx, x, floor - h, w, h, 1);
	ctx.fillStyle = shade(ctx, floor - h, h, color, "#1a2030");
	ctx.fill();
	outline(ctx, 0.7);
	ctx.strokeStyle = "rgba(0,0,0,0.35)";
	ctx.lineWidth = 0.8;
	ctx.beginPath();
	for (let i = 2; i < w; i += 2.5) {
		ctx.moveTo(x + i, floor - h + 1);
		ctx.lineTo(x + i, floor - 1);
	}
	ctx.stroke();
}

function drawGasBottles(ctx: Ctx, x: number, floor: number): void {
	for (const [bx, color] of [
		[x + 2, "#c0392b"],
		[x + 8, "#e9c136"],
	] as const) {
		rounded(ctx, bx, floor - 14, 5, 14, 2.5);
		ctx.fillStyle = shade(ctx, floor - 14, 14, color, "#3a1a10");
		ctx.fill();
		outline(ctx, 0.6);
		ctx.fillStyle = "#5a646e";
		ctx.fillRect(bx + 1.5, floor - 16, 2, 2);
	}
}

/** One piece of scenery in the theme's style; `kind` is a 0..1 roll fixed per column. */
function drawDecorItem(
	ctx: Ctx,
	tex: Textures,
	theme: Theme,
	kind: number,
	x: number,
	floor: number,
	camera: number,
	tx: number,
): void {
	if (theme === "stocznia") {
		if (kind > 0.5) drawBollard(ctx, x + 8, floor);
		else drawContainer(ctx, x + 1, floor, kind > 0.25 ? "#3d6e9e" : "#b0412f");
		return;
	}
	if (theme === "fabryka") {
		if (kind > 0.5) drawGasBottles(ctx, x + 1, floor);
		else drawBarrel(ctx, tex, x + 2, floor, camera, tx);
		return;
	}
	if (kind > 0.6) {
		drawBarrel(ctx, tex, x + 2, floor, camera, tx);
	} else if (kind > 0.3) {
		drawTire(ctx, x + 6, floor - 6.5);
		drawTire(ctx, x + 10, floor - 6.5);
		drawTire(ctx, x + 8, floor - 17);
	} else {
		drawTire(ctx, x + 8, floor - 6.5);
	}
}

/** Scenery standing on open ground, placed by noise so it never moves. */
function drawDecor(
	ctx: Ctx,
	tex: Textures,
	level: Level,
	camera: number,
	first: number,
	last: number,
): void {
	for (let tx = first; tx <= last; tx++) {
		if (noise(tx, 0, 41) > 0.16) continue;
		const ty = level.rows.findIndex((row) => row[tx] === "#");
		if (ty < 2 || level.rows[ty - 1]?.[tx] !== "." || level.rows[ty - 2]?.[tx] !== ".") continue;
		drawDecorItem(
			ctx,
			tex,
			level.theme,
			noise(tx, 1, 43),
			tx * TILE - camera,
			ty * TILE,
			camera,
			tx,
		);
	}
}

function drawTiles(ctx: Ctx, tex: Textures, level: Level, camera: number): void {
	const style = THEME_STYLE[level.theme];
	const first = Math.floor(camera / TILE);
	const last = Math.min(level.widthTiles - 1, first + VIEW_W / TILE + 1);
	level.rows.forEach((row, ty) => {
		for (let tx = first; tx <= last; tx++) {
			const c = row[tx];
			if (c !== "#" && c !== "=") continue;
			const x = tx * TILE - camera;
			const y = ty * TILE;
			if (c === "#")
				drawGroundTile(ctx, tex, style, x, y, tx, ty, level.rows[ty - 1]?.[tx] !== "#", camera);
			else drawPlateTile(ctx, tex, style, x, y, row[tx - 1] !== "=", row[tx + 1] !== "=", camera);
		}
	});
	drawDecor(ctx, tex, level, camera, first, last);
}

// ── actors ───────────────────────────────────────────────────────────

function drawNut(ctx: Ctx, cx: number, cy: number, spin: number): void {
	const sx = Math.abs(Math.cos(spin)) * 0.75 + 0.25;
	glow(ctx, cx, cy, 9, "rgba(255,200,80,A)", 0.35);
	ctx.save();
	ctx.translate(cx, cy);
	ctx.scale(sx, 1);
	ctx.fillStyle = "#8a5a12";
	hexagon(ctx, 6);
	ctx.fill();
	const g = ctx.createLinearGradient(-5, -5, 5, 5);
	g.addColorStop(0, "#ffe58a");
	g.addColorStop(0.5, "#e2a62c");
	g.addColorStop(1, "#a86f12");
	ctx.fillStyle = g;
	hexagon(ctx, 5);
	ctx.fill();
	ctx.fillStyle = "#6e4810";
	ctx.beginPath();
	ctx.arc(0, 0, 2, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "rgba(255,255,255,0.7)";
	ctx.beginPath();
	ctx.arc(-2, -2.5, 1.1, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawBolt(ctx: Ctx, cx: number, cy: number, spin: number): void {
	const sx = Math.abs(Math.cos(spin)) * 0.7 + 0.3;
	glow(ctx, cx, cy, 8, "rgba(180,220,255,A)", 0.3);
	ctx.save();
	ctx.translate(cx, cy);
	ctx.scale(sx, 1);
	ctx.fillStyle = shade(ctx, -6, 12, "#dfe7ee", "#6a7682");
	rounded(ctx, -4.5, -6, 9, 3.5, 1.2);
	ctx.fill();
	outline(ctx, 0.6);
	rounded(ctx, -2, -2.5, 4, 8.5, 1);
	ctx.fillStyle = shade(ctx, -2.5, 8.5, "#c9d3dc", "#58636e");
	ctx.fill();
	outline(ctx, 0.6);
	ctx.strokeStyle = "rgba(0,0,0,0.45)";
	ctx.lineWidth = 0.7;
	ctx.beginPath();
	for (let y = -0.5; y < 5.5; y += 2) {
		ctx.moveTo(-2, y);
		ctx.lineTo(2, y + 1);
	}
	ctx.stroke();
	ctx.restore();
}

function drawGear(ctx: Ctx, cx: number, cy: number, spin: number): void {
	glow(ctx, cx, cy, 10, "rgba(255,160,80,A)", 0.3);
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(spin);
	ctx.fillStyle = "#8a4b2a";
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		ctx.save();
		ctx.rotate(a);
		ctx.fillRect(4, -1.6, 3.2, 3.2);
		ctx.restore();
	}
	sphere(ctx, 0, 0, 5, "#ffb070", "#9a4b1f");
	ctx.beginPath();
	ctx.arc(0, 0, 5, 0, Math.PI * 2);
	outline(ctx, 0.6);
	ctx.fillStyle = "#3d2214";
	ctx.beginPath();
	ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawCell(ctx: Ctx, cx: number, cy: number, frame: number): void {
	const pulse = 0.5 + Math.sin(frame / 6) * 0.3;
	glow(ctx, cx, cy, 11, "rgba(79,240,224,A)", pulse * 0.6);
	rounded(ctx, cx - 3.5, cy - 5, 7, 10, 1.5);
	ctx.fillStyle = shade(ctx, cy - 5, 10, "#dfe7ee", "#4a535d");
	ctx.fill();
	outline(ctx, 0.6);
	ctx.fillStyle = "#2b2f36";
	ctx.fillRect(cx - 1.5, cy - 6.5, 3, 1.5);
	ctx.fillStyle = `rgba(79,240,224,${0.7 + pulse * 0.3})`;
	ctx.fillRect(cx - 2.2, cy - 3.2, 4.4, 2);
	ctx.fillRect(cx - 2.2, cy - 0.5, 4.4, 2);
	ctx.fillRect(cx - 2.2, cy + 2.2, 4.4, 2);
}

function drawLife(ctx: Ctx, cx: number, cy: number, frame: number): void {
	const pulse = 1 + Math.sin(frame / 7) * 0.12;
	glow(ctx, cx, cy, 12, "rgba(255,90,90,A)", 0.5);
	ctx.save();
	ctx.translate(cx, cy + 1);
	ctx.scale(pulse, pulse);
	ctx.beginPath();
	ctx.moveTo(0, 6);
	ctx.bezierCurveTo(-8, 0, -4, -7, 0, -3);
	ctx.bezierCurveTo(4, -7, 8, 0, 0, 6);
	const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, 8);
	g.addColorStop(0, "#ffb3b3");
	g.addColorStop(1, "#c81e1e");
	ctx.fillStyle = g;
	ctx.fill();
	outline(ctx, 0.7);
	ctx.restore();
}

function drawPickup(
	ctx: Ctx,
	kind: PickupKind,
	cx: number,
	cy: number,
	frame: number,
	salt: number,
): void {
	switch (kind) {
		case "nut":
			drawNut(ctx, cx, cy, frame / 12 + salt);
			break;
		case "bolt":
			drawBolt(ctx, cx, cy, frame / 10 + salt);
			break;
		case "gear":
			drawGear(ctx, cx, cy, frame / 20 + salt);
			break;
		case "cell":
			drawCell(ctx, cx, cy, frame + salt);
			break;
		case "life":
			drawLife(ctx, cx, cy, frame + salt);
			break;
	}
}

function drawBurst(ctx: Ctx, x: number, y: number, t: number): void {
	// Flash ring, then debris flying out under gravity and a puff of smoke.
	const k = t / EFFECT_FRAMES;
	ctx.strokeStyle = `rgba(255,230,160,${(1 - k) * 0.9})`;
	ctx.lineWidth = 2.5 * (1 - k) + 0.5;
	ctx.beginPath();
	ctx.arc(x, y, 3 + k * 22, 0, Math.PI * 2);
	ctx.stroke();
	if (t < 4) glow(ctx, x, y, 18, "rgba(255,240,200,A)", 0.9);
	for (let i = 0; i < 9; i++) {
		const a = noise(x, i, 71) * Math.PI * 2;
		const speed = 1.2 + noise(y, i, 73) * 1.6;
		const px = x + Math.cos(a) * speed * t;
		const py = y + Math.sin(a) * speed * t + 0.08 * t * t;
		ctx.fillStyle = i % 3 === 0 ? "#ff9a3a" : "#8f9aa6";
		ctx.fillRect(px - 1, py - 1, 2.2, 2.2);
	}
	for (let i = 0; i < 4; i++) {
		const px = x + (noise(x, i, 77) - 0.5) * 14;
		const py = y - 2 - t * 0.5 - i * 2;
		glow(ctx, px, py, 5 + k * 8, "rgba(90,90,100,A)", (1 - k) * 0.5);
	}
}

function drawSpark(ctx: Ctx, x: number, y: number, t: number): void {
	const k = t / EFFECT_FRAMES;
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2 + noise(x, i, 79);
		const r = 2 + t * 0.7;
		const px = x + Math.cos(a) * r;
		const py = y + Math.sin(a) * r - t * 0.4;
		ctx.fillStyle = `rgba(255,235,150,${1 - k})`;
		ctx.beginPath();
		ctx.moveTo(px, py - 2);
		ctx.lineTo(px + 1.2, py);
		ctx.lineTo(px, py + 2);
		ctx.lineTo(px - 1.2, py);
		ctx.closePath();
		ctx.fill();
	}
	ctx.fillStyle = `rgba(255,255,255,${(1 - k) * 0.8})`;
	ctx.font = "bold 7px Bangers, Impact, sans-serif";
	ctx.fillText("+", x - 2, y - 6 - t * 0.5);
}

function drawChargeArc(ctx: Ctx, x: number, y: number, t: number, px: number, py: number): void {
	if (t > 8) return;
	ctx.strokeStyle = `rgba(140,255,240,${1 - t / 8})`;
	ctx.lineWidth = 1.2;
	ctx.beginPath();
	ctx.moveTo(x, y);
	const steps = 5;
	for (let i = 1; i <= steps; i++) {
		const f = i / steps;
		ctx.lineTo(
			x + (px - x) * f + (noise(t, i, 83) - 0.5) * 8,
			y + (py - y) * f + (noise(i, t, 89) - 0.5) * 8,
		);
	}
	ctx.stroke();
	glow(ctx, px, py, 12, "rgba(79,240,224,A)", 0.35);
}

function drawDust(ctx: Ctx, x: number, y: number, t: number): void {
	if (t > 20) return;
	const k = t / 20;
	for (let i = 0; i < 3; i++) {
		const px = x + (noise(x, i, 91) - 0.5) * 6 - t * 0.3;
		const py = y - 1 - t * 0.35 - i * 1.5;
		glow(ctx, px, py, 2.5 + k * 5, "rgba(200,180,150,A)", (1 - k) * 0.45);
	}
}

function drawMagnetPulse(ctx: Ctx, x: number, y: number, t: number): void {
	if (t > 12) return;
	const k = t / 12;
	ctx.strokeStyle = `rgba(79,240,224,${(1 - k) * 0.9})`;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(x, y, 4 + k * 26, 0, Math.PI * 2);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(x, y, 2 + k * 14, 0, Math.PI * 2);
	ctx.stroke();
}

function drawQuake(ctx: Ctx, x: number, y: number, t: number): void {
	const k = t / EFFECT_FRAMES;
	ctx.fillStyle = `rgba(200,180,150,${(1 - k) * 0.6})`;
	for (let i = 0; i < 10; i++) {
		const dir = i % 2 ? 1 : -1;
		const px = x + dir * (20 + t * 2.2 + i * 3);
		const py = y - 2 - Math.sin((t + i) / 3) * 4 - i;
		ctx.fillRect(px, py, 2.5, 2.5);
	}
}

function drawEffects(ctx: Ctx, world: World, camera: number): void {
	const p = world.player;
	for (const e of world.effects) {
		const t = world.frame - e.frame;
		const x = e.x - camera;
		if (e.kind === "burst") drawBurst(ctx, x, e.y, t);
		else if (e.kind === "spark") drawSpark(ctx, x, e.y, t);
		else if (e.kind === "dust") drawDust(ctx, x, e.y, t);
		else if (e.kind === "quake") drawQuake(ctx, x, e.y, t);
		else if (e.kind === "magnet") drawMagnetPulse(ctx, p.x + p.w / 2 - camera, p.y + 6, t);
		else drawChargeArc(ctx, x, e.y, t, p.x + p.w / 2 - camera, p.y + 4);
	}
}

function drawWheels(ctx: Ctx, p: Player): void {
	const roll = (p.x / 3) * p.facing;
	// Axle bar.
	rounded(ctx, -5.5, -6.5, 11, 3, 1.2);
	ctx.fillStyle = shade(ctx, -6.5, 3, "#6a7682", "#2b2f36");
	ctx.fill();
	for (const wx of [-3.6, 3.6]) {
		const r = 3.2;
		ctx.fillStyle = "rgba(0,0,0,0.3)";
		ctx.beginPath();
		ctx.ellipse(wx, 0.4, r, 1, 0, 0, Math.PI * 2);
		ctx.fill();
		sphere(ctx, wx, -r, r, "#4a4d52", "#15171a");
		ctx.beginPath();
		ctx.arc(wx, -r, r, 0, Math.PI * 2);
		outline(ctx, 0.6);
		// Hub and spokes show the rotation.
		ctx.save();
		ctx.translate(wx, -r);
		ctx.rotate(roll);
		ctx.strokeStyle = "#9aa3ad";
		ctx.lineWidth = 0.8;
		ctx.beginPath();
		for (let i = 0; i < 3; i++) {
			const a = (i / 3) * Math.PI * 2;
			ctx.moveTo(0, 0);
			ctx.lineTo(Math.cos(a) * (r - 0.8), Math.sin(a) * (r - 0.8));
		}
		ctx.stroke();
		ctx.restore();
		sphere(ctx, wx, -r, 1.1, "#e6ecf1", "#6a7682");
	}
}

function drawHat(ctx: Ctx, skin: Skin, frame: number, legPhase: number): void {
	const accent = skin.accent;
	switch (skin.hat) {
		case "antena":
			ctx.strokeStyle = "#3a3f49";
			ctx.lineWidth = 1.2;
			ctx.beginPath();
			ctx.moveTo(0, -23.5);
			ctx.quadraticCurveTo(1 + legPhase, -27, 0.5, -29);
			ctx.stroke();
			glow(ctx, 0.5, -29.5, 4, "rgba(255,190,80,A)", 0.5);
			sphere(ctx, 0.5, -29.5, 1.7, tint(accent, 0.6), accent);
			return;
		case "kask":
			ctx.beginPath();
			ctx.ellipse(0, -21, 7.5, 5, 0, Math.PI, 0);
			ctx.closePath();
			ctx.fillStyle = shade(ctx, -26, 5, tint(accent, 0.3), tint(accent, -0.3));
			ctx.fill();
			outline(ctx, 0.8);
			ctx.fillStyle = tint(accent, -0.4);
			ctx.fillRect(-8.5, -22, 17, 1.6);
			glow(ctx, 0, -24, 3, "rgba(255,240,200,A)", 0.6);
			sphere(ctx, 0, -24, 1.2, "#fff8dc", "#c9a04d");
			return;
		case "czapka":
			ctx.beginPath();
			ctx.moveTo(-6.5, -21.5);
			ctx.quadraticCurveTo(0, -31, 6.5, -21.5);
			ctx.closePath();
			ctx.fillStyle = shade(ctx, -31, 10, tint(accent, 0.25), tint(accent, -0.25));
			ctx.fill();
			outline(ctx, 0.8);
			ctx.fillStyle = "#f4f7fa";
			ctx.fillRect(-7, -22.5, 14, 2.2);
			sphere(ctx, 0, -31 + Math.sin(frame / 8) * 0.5, 2, "#ffffff", "#c9d2da");
			return;
		case "korona": {
			// A gold band with five points and three jewels; one clean outline around the whole shape.
			ctx.beginPath();
			ctx.moveTo(-6.5, -21);
			ctx.lineTo(-6.5, -25);
			for (let i = 0; i < 5; i++) {
				const x0 = -6.5 + i * 3.25;
				ctx.lineTo(x0 + 1.6, -29.5);
				ctx.lineTo(x0 + 3.25, -25);
			}
			ctx.lineTo(6.5, -21);
			ctx.closePath();
			ctx.fillStyle = shade(ctx, -29.5, 8.5, "#ffe58a", "#c99a16");
			ctx.fill();
			ctx.lineJoin = "round";
			outline(ctx, 0.7);
			ctx.fillStyle = "rgba(255,255,255,0.35)";
			ctx.fillRect(-6, -24.5, 12, 1);
			for (const jx of [-3.5, 0, 3.5]) sphere(ctx, jx, -23, 0.9, tint(accent, 0.5), accent);
			return;
		}
		case "cylinder":
			ctx.fillStyle = shade(ctx, -34, 12, tint(accent, -0.5), tint(accent, -0.8));
			ctx.fillRect(-4.5, -33, 9, 11);
			ctx.fillRect(-7, -23, 14, 1.8);
			ctx.beginPath();
			ctx.rect(-4.5, -33, 9, 11);
			outline(ctx, 0.8);
			ctx.fillStyle = accent;
			ctx.fillRect(-4.5, -24.5, 9, 1.8);
			return;
		default:
			return;
	}
}

function drawAccessory(ctx: Ctx, skin: Skin, frame: number, behind: boolean): void {
	const accent = skin.accent;
	if (behind) {
		if (skin.accessory === "plecak") {
			rounded(ctx, -9, -13, 4.5, 8, 1.5);
			ctx.fillStyle = shade(ctx, -13, 8, tint(accent, 0.2), tint(accent, -0.4));
			ctx.fill();
			outline(ctx, 0.6);
			ctx.fillStyle = "#3a3f49";
			ctx.fillRect(-8, -14.5, 2.5, 2);
		}
		if (skin.accessory === "pelerynka") {
			const sway = Math.sin(frame / 6) * 2;
			ctx.beginPath();
			ctx.moveTo(-4, -14);
			ctx.quadraticCurveTo(-12 + sway, -8, -10 + sway, 0);
			ctx.lineTo(-3, -3);
			ctx.closePath();
			ctx.fillStyle = shade(ctx, -14, 14, tint(accent, 0.1), tint(accent, -0.4));
			ctx.fill();
			outline(ctx, 0.6);
		}
		return;
	}
	if (skin.accessory === "szalik") {
		ctx.fillStyle = accent;
		rounded(ctx, -6, -14.5, 12, 2.6, 1.2);
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(-5, -13);
		ctx.lineTo(-7 + Math.sin(frame / 7), -6);
		ctx.lineTo(-3.5, -8);
		ctx.closePath();
		ctx.fill();
	}
	if (skin.accessory === "okulary") {
		ctx.strokeStyle = "#1b1a22";
		ctx.lineWidth = 0.8;
		ctx.fillStyle = "rgba(40,20,60,0.75)";
		for (const ex of [-0.8, 3.2]) {
			ctx.beginPath();
			ctx.arc(ex, -18, 2.3, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
		ctx.beginPath();
		ctx.moveTo(1.5, -18);
		ctx.lineTo(0.9, -18);
		ctx.stroke();
	}
}

/** Whatever Śrubek holds in the trailing claw, drawn from the claw outward. */
function drawHandItem(ctx: Ctx, skin: Skin, frame: number): void {
	const hx = -6.2;
	const hy = -5.2;
	const accent = skin.accent;
	const stick = (tx: number, ty: number, color: string, width: number): void => {
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(hx, hy);
		ctx.lineTo(tx, ty);
		ctx.stroke();
	};
	switch (skin.hand) {
		case "klucz":
			stick(-10, -14, "#8d939b", 1.8);
			ctx.beginPath();
			ctx.arc(-10.6, -15.6, 2.6, Math.PI * 0.15, Math.PI * 1.65);
			ctx.lineWidth = 1.8;
			ctx.strokeStyle = "#c9d2da";
			ctx.stroke();
			return;
		case "mlotek":
			stick(-9.5, -14.5, "#8a5a2a", 1.6);
			ctx.save();
			ctx.translate(-9.5, -14.5);
			ctx.rotate(-0.35);
			rounded(ctx, -4.5, -2.2, 9, 4.4, 1);
			ctx.fillStyle = shade(ctx, -2.2, 4.4, "#c9d2da", "#4a535d");
			ctx.fill();
			outline(ctx, 0.6);
			ctx.restore();
			return;
		case "flaga": {
			stick(-7, -27, "#9aa3ad", 1);
			const wave = Math.sin(frame / 6) * 1.5;
			ctx.beginPath();
			ctx.moveTo(-7, -27);
			ctx.quadraticCurveTo(-11, -27 + wave, -15, -25.5 + wave);
			ctx.lineTo(-15, -20.5 + wave);
			ctx.quadraticCurveTo(-11, -21.5 - wave, -7, -21);
			ctx.closePath();
			ctx.fillStyle = shade(ctx, -27, 7, tint(accent, 0.3), tint(accent, -0.3));
			ctx.fill();
			outline(ctx, 0.5);
			sphere(ctx, -7, -27.5, 1, "#ffe58a", "#b8860b");
			return;
		}
		case "lizak":
			stick(-8.5, -13, "#f4f7fa", 1);
			sphere(ctx, -8.5, -15.5, 3.4, tint(accent, 0.5), accent);
			ctx.strokeStyle = "rgba(255,255,255,0.85)";
			ctx.lineWidth = 0.8;
			ctx.beginPath();
			for (let a = 0; a < Math.PI * 4; a += 0.3) {
				const r = (a / (Math.PI * 4)) * 3;
				ctx.lineTo(-8.5 + Math.cos(a + frame / 20) * r, -15.5 + Math.sin(a + frame / 20) * r);
			}
			ctx.stroke();
			return;
		case "balonik": {
			const sway = Math.sin(frame / 15) * 1.5;
			ctx.strokeStyle = "rgba(240,240,240,0.8)";
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.moveTo(hx, hy);
			ctx.quadraticCurveTo(-13 + sway, -16, -11 + sway, -27);
			ctx.stroke();
			ctx.beginPath();
			ctx.ellipse(-11 + sway, -31, 4, 5, 0.1, 0, Math.PI * 2);
			const g = ctx.createRadialGradient(-12.5 + sway, -33, 0.5, -11 + sway, -31, 5);
			g.addColorStop(0, tint(accent, 0.6));
			g.addColorStop(1, accent);
			ctx.fillStyle = g;
			ctx.fill();
			outline(ctx, 0.5);
			return;
		}
		case "parasol":
			stick(-6, -27, "#2b2f36", 1);
			ctx.beginPath();
			ctx.arc(-6, -26, 9, Math.PI, 0);
			for (let i = 4; i >= 0; i--)
				ctx.quadraticCurveTo(-6 - 9 + i * 4.5 + 2.25, -24, -6 - 9 + i * 4.5, -26);
			ctx.closePath();
			ctx.fillStyle = shade(ctx, -35, 9, tint(accent, 0.3), tint(accent, -0.35));
			ctx.fill();
			outline(ctx, 0.6);
			return;
		default:
			return;
	}
}

function drawHead(ctx: Ctx, skin: Skin, frame: number, legPhase: number): void {
	// Rounded helmet with a glossy top.
	ctx.beginPath();
	ctx.ellipse(0, -18.5, 6.5, 5.5, 0, 0, Math.PI * 2);
	const g = ctx.createRadialGradient(-2.5, -21, 1, 0, -18.5, 7);
	g.addColorStop(0, tint(skin.body, 0.75));
	g.addColorStop(0.6, tint(skin.body, 0.1));
	g.addColorStop(1, tint(skin.body, -0.45));
	ctx.fillStyle = g;
	ctx.fill();
	outline(ctx);
	rim(ctx, 0.6);
	// Visor and eyes.
	rounded(ctx, -4, -20.6, 9.6, 5.2, 2.6);
	ctx.fillStyle = "#0f1820";
	ctx.fill();
	if (frame % 180 <= 174) {
		sphere(ctx, -0.8, -18, 1.5, tint(skin.eyes, 0.7), skin.eyes);
		sphere(ctx, 3.2, -18, 1.7, tint(skin.eyes, 0.7), skin.eyes);
		ctx.save();
		ctx.globalAlpha = 0.3;
		sphere(ctx, 1.4, -18, 6, skin.eyes, "rgba(0,0,0,0)");
		ctx.restore();
	}
	drawAccessory(ctx, skin, frame, false);
	drawHat(ctx, skin, frame, legPhase);
}

/** Jet flames under both wheels; `power` 1 for a plain jump, more for the thruster. */
function drawFlame(ctx: Ctx, frame: number, power: number): void {
	const f = (4 + (frame % 2) * 1.5) * power;
	glow(ctx, 0, 3, 7 * power, "rgba(255,140,40,A)", 0.45);
	for (const wx of [-3.6, 3.6]) {
		ctx.fillStyle = "rgba(255,110,20,0.9)";
		ctx.beginPath();
		ctx.moveTo(wx - 2.2, 0);
		ctx.lineTo(wx, f + 2);
		ctx.lineTo(wx + 2.2, 0);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = "rgba(255,230,120,0.95)";
		ctx.beginPath();
		ctx.moveTo(wx - 1, 0);
		ctx.lineTo(wx, f * 0.55 + 1);
		ctx.lineTo(wx + 1, 0);
		ctx.closePath();
		ctx.fill();
	}
}

/** Śrubek, scaled up from his hitbox with the feet pinned to its floor. */
function drawSrubek(ctx: Ctx, p: Player, skin: Skin, frame: number, camera: number): void {
	if (p.hurtLeft > 0 && Math.floor(frame / 4) % 2 === 0) return;
	const running = p.onGround && Math.abs(p.vx) > 0.3;
	const bob = running ? Math.sin(frame / 2) * 0.4 : 0;
	const legPhase = running ? Math.sin(frame / 3) : 0;
	ctx.save();
	ctx.translate(p.x + p.w / 2 - camera, p.y + p.h);
	ctx.fillStyle = "rgba(0,0,0,0.28)";
	ctx.beginPath();
	ctx.ellipse(0, 0.6, 8, 1.8, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.scale(p.facing * ACTOR, ACTOR);
	ctx.translate(0, bob);

	if (p.boostLeft > 0) drawFlame(ctx, frame, 1.6);
	else if (!p.onGround && p.vy < 0) drawFlame(ctx, frame, 0.8);
	drawWheels(ctx, p);
	drawAccessory(ctx, skin, frame, true);

	// Body: a rounded barrel with a glossy sweep, a rust dent and a chest light.
	ctx.beginPath();
	ctx.ellipse(0, -9.5, 6, 5.2, 0, 0, Math.PI * 2);
	const body = ctx.createRadialGradient(-2.2, -12, 1, 0, -9.5, 7);
	body.addColorStop(0, tint(skin.body, 0.7));
	body.addColorStop(0.55, skin.body);
	body.addColorStop(1, tint(skin.body, -0.45));
	ctx.fillStyle = body;
	ctx.fill();
	outline(ctx);
	rim(ctx, 0.5);
	ctx.fillStyle = "#9a5a34";
	ctx.beginPath();
	ctx.ellipse(-2.6, -8.2, 2, 1.3, 0.4, 0, Math.PI * 2);
	ctx.fill();
	glow(ctx, 2.6, -10, 4, "rgba(255,200,100,A)", 0.45);
	sphere(ctx, 2.6, -10, 1.5, tint(skin.accent, 0.6), skin.accent);

	// Trailing arm with the magnet claw, so the body reads as facing forward.
	rounded(ctx, -7.8, -12, 3.2, 6.5, 1.6);
	ctx.fillStyle = shade(ctx, -12, 6.5, "#c2ccd5", "#5f6971");
	ctx.fill();
	outline(ctx, 0.6);
	sphere(ctx, -6.2, -5.2, 2, "#ff9c84", "#c23b25");
	drawHandItem(ctx, skin, frame);

	drawHead(ctx, skin, frame, legPhase);
	ctx.restore();
}

function drawDrone(ctx: Ctx, x: number, y: number, dir: number, frame: number): void {
	ctx.save();
	ctx.translate(x + 6, y + 4);
	ctx.scale(dir * ACTOR, ACTOR);
	ctx.fillStyle = "rgba(0,0,0,0.18)";
	ctx.beginPath();
	ctx.ellipse(0, 7, 6, 1.2, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = `rgba(220,230,240,${0.35 + (frame % 2) * 0.3})`;
	ctx.beginPath();
	ctx.ellipse(-5, -4.5, 5, 0.9, 0, 0, Math.PI * 2);
	ctx.ellipse(5, -4.5, 5, 0.9, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "#3a3f49";
	ctx.fillRect(-6, -4, 12, 1.2);
	ctx.fillRect(-0.6, -4, 1.2, 3);
	sphere(ctx, 0, 1, 4.8, "#aeb8c3", "#3a424c");
	ctx.beginPath();
	ctx.arc(0, 1, 4.8, 0, Math.PI * 2);
	outline(ctx, 0.6);
	rim(ctx, 0.5);
	glow(ctx, 1.6, 0.6, 4, "rgba(255,80,60,A)", 0.5);
	sphere(ctx, 1.6, 0.6, 1.6, "#ffb0a0", "#c8231a");
	ctx.strokeStyle = "#2b2f36";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(-2, 5.5);
	ctx.lineTo(-3, 8);
	ctx.moveTo(2, 5.5);
	ctx.lineTo(3, 8);
	ctx.stroke();
	ctx.restore();
}

function drawDog(ctx: Ctx, x: number, y: number, dir: number, frame: number): void {
	ctx.save();
	ctx.translate(x + 8, y + 10);
	ctx.fillStyle = "rgba(0,0,0,0.25)";
	ctx.beginPath();
	ctx.ellipse(0, 0.6, 9, 1.6, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.scale(dir * ACTOR, ACTOR);
	const stride = Math.sin(frame / 4) * 2;
	for (const [lx, s] of [
		[-5, stride],
		[-2, -stride],
		[2, stride],
		[5, -stride],
	] as const) {
		rounded(ctx, lx - 1.1 + s * 0.5, -4.5, 2.2, 5, 1);
		ctx.fillStyle = shade(ctx, -4.5, 5, "#4d5661", "#1e2227");
		ctx.fill();
	}
	// Rounded body and snout, glossy.
	ctx.beginPath();
	ctx.ellipse(-1, -6.5, 7.2, 3.6, 0, 0, Math.PI * 2);
	const body = ctx.createRadialGradient(-3, -8.5, 1, -1, -6.5, 8);
	body.addColorStop(0, "#c3ccd5");
	body.addColorStop(0.6, "#7f8a95");
	body.addColorStop(1, "#3a424c");
	ctx.fillStyle = body;
	ctx.fill();
	outline(ctx, 0.7);
	rim(ctx, 0.45);
	ctx.beginPath();
	ctx.ellipse(6.5, -9, 3.6, 2.8, 0, 0, Math.PI * 2);
	ctx.fillStyle = shade(ctx, -12, 6, "#a8b3bd", "#4a535d");
	ctx.fill();
	outline(ctx, 0.7);
	ctx.fillStyle = "#1b1a22";
	ctx.fillRect(6.5, -7.2, 4, 1);
	glow(ctx, 7.5, -9.6, 3, "rgba(255,70,50,A)", 0.5);
	sphere(ctx, 7.5, -9.6, 1.2, "#ffb3a3", "#d8261b");
	ctx.strokeStyle = "#3a3f49";
	ctx.lineWidth = 1.1;
	ctx.beginPath();
	ctx.moveTo(-8, -7.5);
	ctx.quadraticCurveTo(-11, -11 + stride * 0.3, -10, -13);
	ctx.stroke();
	ctx.fillStyle = "#9a5a34";
	ctx.beginPath();
	ctx.ellipse(-3, -7, 1.6, 1, 0.3, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawScrap(ctx: Ctx, x: number, y: number, frame: number): void {
	ctx.save();
	ctx.translate(x + 6, y + 6);
	ctx.rotate(frame / 30);
	ctx.fillStyle = "#4e5760";
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		ctx.fillRect(Math.cos(a) * 4.8 - 1.4, Math.sin(a) * 4.8 - 1.4, 2.8, 2.8);
	}
	sphere(ctx, 0, 0, 5, "#c6d0d9", "#5a646e");
	ctx.beginPath();
	ctx.arc(0, 0, 5, 0, Math.PI * 2);
	outline(ctx, 0.6);
	ctx.fillStyle = "#2b2f36";
	ctx.beginPath();
	ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

/** Carried pieces orbit above Śrubek's head, with a count once the pouch gets full. */
/** The mega bolt ball: a spiked sphere of bolts, spinning and glowing. */
function drawMega(ctx: Ctx, x: number, y: number, frame: number): void {
	const cx = x + MEGA_SIZE / 2;
	const cy = y + MEGA_SIZE / 2;
	glow(ctx, cx, cy, MEGA_SIZE, "rgba(255,200,80,A)", 0.6);
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(frame / 6);
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		ctx.save();
		ctx.rotate(a);
		rounded(ctx, 6, -2, 7, 4, 1);
		ctx.fillStyle = shade(ctx, -2, 4, "#dfe7ee", "#5a646e");
		ctx.fill();
		outline(ctx, 0.5);
		ctx.restore();
	}
	sphere(ctx, 0, 0, 8, "#ffe9a8", "#b8701a");
	ctx.beginPath();
	ctx.arc(0, 0, 8, 0, Math.PI * 2);
	outline(ctx, 0.8);
	ctx.restore();
}

function drawPouch(ctx: Ctx, world: World, camera: number): void {
	const held = world.scraps.filter((s) => s.state === "held");
	if (held.length === 0) return;
	const p = world.player;
	const cx = p.x + p.w / 2 - camera;
	const cy = p.y - 16;
	glow(ctx, cx, cy, 14 + held.length, "rgba(79,240,224,A)", 0.3);
	held.forEach((_, i) => {
		const a = world.frame / 25 + (i / held.length) * Math.PI * 2;
		const r = 7 + held.length * 0.6;
		ctx.save();
		ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.45);
		ctx.scale(0.55, 0.55);
		drawScrap(ctx, -6, -6, world.frame + i * 7);
		ctx.restore();
	});
	fancyText(ctx, `${held.length}/${SCRAP_CAPACITY}`, cx, cy - 10, 9, "center");
}

function drawCharger(ctx: Ctx, x: number, y: number, frame: number): void {
	rounded(ctx, x + 1, y + 11, 14, 5, 2);
	ctx.fillStyle = shade(ctx, y + 11, 5, "#aab3bc", "#3f4852");
	ctx.fill();
	outline(ctx, 0.6);
	rounded(ctx, x + 4.5, y + 1, 7, 11, 3);
	ctx.fillStyle = shade(ctx, y + 1, 11, "#6b7682", "#2a3036");
	ctx.fill();
	outline(ctx, 0.6);
	rim(ctx, 0.35);
	const pulse = 0.6 + Math.sin(frame / 8) * 0.3;
	glow(ctx, x + 8, y + 7, 12, "rgba(79,240,224,A)", pulse * 0.5);
	ctx.fillStyle = `rgba(120,255,240,${pulse})`;
	ctx.beginPath();
	ctx.moveTo(x + 8.5, y + 3);
	ctx.lineTo(x + 6.5, y + 7.5);
	ctx.lineTo(x + 8, y + 7.5);
	ctx.lineTo(x + 7, y + 11);
	ctx.lineTo(x + 9.8, y + 6.2);
	ctx.lineTo(x + 8.3, y + 6.2);
	ctx.closePath();
	ctx.fill();
}

// ── hud ──────────────────────────────────────────────────────────────

function drawHud(ctx: Ctx, state: GameState, frame: number): void {
	rounded(ctx, 5, 5, 262, 18, 6);
	ctx.fillStyle = "rgba(10,8,20,0.55)";
	ctx.fill();
	ctx.strokeStyle = "rgba(255,255,255,0.18)";
	ctx.lineWidth = 0.8;
	ctx.stroke();
	drawNut(ctx, 15, 14, frame / 20);
	fancyText(ctx, String(totalPoints(state)).padStart(6, "0"), 24, 14.5, 13);
	for (let i = 0; i < BATTERY_MAX; i++) {
		rounded(ctx, 70 + i * 10, 10, 8, 8, 2);
		ctx.fillStyle = i < state.battery ? "#4ff0e0" : "#2b2f36";
		ctx.fill();
		if (i < state.battery) glow(ctx, 74 + i * 10, 14, 6, "rgba(79,240,224,A)", 0.4);
	}
	ctx.fillStyle = "#9aa3ad";
	ctx.fillRect(100, 12.5, 2, 3);
	fancyText(ctx, `POZ ${state.level}`, 160, 14.5, 11);
	// Bolt stock toward the next mega ball, and the balls in hand.
	drawBolt(ctx, 212, 14, 0.3);
	fancyText(ctx, `${state.bolts}/${BOLTS_PER_MEGA}`, 219, 14.5, 10);
	if (state.megaBalls > 0) {
		ctx.save();
		ctx.translate(246, 9);
		ctx.scale(0.45, 0.45);
		drawMega(ctx, 0, 0, frame);
		ctx.restore();
		fancyText(ctx, `x${state.megaBalls}`, 257, 14.5, 10);
	}
	for (let i = 0; i < Math.min(state.lives, 4); i++) {
		const hx = 110 + i * 11;
		ctx.fillStyle = "#ff5a5a";
		ctx.beginPath();
		ctx.moveTo(hx, 18);
		ctx.bezierCurveTo(hx - 6, 13, hx - 2, 8, hx, 11);
		ctx.bezierCurveTo(hx + 2, 8, hx + 6, 13, hx, 18);
		ctx.fill();
		ctx.fillStyle = "rgba(255,255,255,0.5)";
		ctx.beginPath();
		ctx.arc(hx - 2, 11.5, 0.9, 0, Math.PI * 2);
		ctx.fill();
	}
}

/** A row of the leaderboard as the page hands it in. */
export interface BoardRow {
	nick: string;
	points: number;
	level: number;
}

function drawOverlay(ctx: Ctx, state: GameState, board: readonly BoardRow[]): void {
	ctx.fillStyle = "rgba(5,4,12,0.72)";
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	fancyText(ctx, "KONIEC GRY", VIEW_W / 2, 30, 34, "center");
	fancyText(
		ctx,
		`wynik ${totalPoints(state)} · poziom ${state.level}`,
		VIEW_W / 2,
		58,
		16,
		"center",
	);
	fancyText(ctx, "NAJLEPSZE WYNIKI", VIEW_W / 2, 84, 14, "center");
	const top = board.slice(0, 10);
	if (top.length === 0)
		fancyText(ctx, "jeszcze pusto, będziesz pierwszy?", VIEW_W / 2, 104, 11, "center");
	top.forEach((row, i) => {
		const y = 104 + i * 13;
		fancyText(ctx, `${i + 1}.`, VIEW_W / 2 - 120, y, 11);
		fancyText(ctx, row.nick, VIEW_W / 2 - 96, y, 11);
		fancyText(ctx, `${row.points} pkt`, VIEW_W / 2 + 40, y, 11);
		fancyText(ctx, `poz. ${row.level}`, VIEW_W / 2 + 96, y, 11);
	});
	fancyText(ctx, "Enter: jeszcze raz", VIEW_W / 2, VIEW_H - 14, 14, "center");
}

// ── renderer ─────────────────────────────────────────────────────────

function drawPress(ctx: Ctx, p: Press, camera: number): void {
	const x = Math.round(p.x - camera);
	const y = Math.round(p.y);
	// Piston rod from the ceiling to the head.
	ctx.fillStyle = shade(ctx, p.topY, y - p.topY + 6, "#aab3bc", "#4a535d");
	ctx.fillRect(x + 6, p.topY, 4, y - p.topY + 6);
	ctx.fillStyle = "rgba(255,255,255,0.4)";
	ctx.fillRect(x + 6.5, p.topY, 1, y - p.topY + 6);
	// Head: a heavy block with a rusted face plate and hazard stripes.
	rounded(ctx, x, y + 4, TILE, 10, 1.5);
	ctx.fillStyle = shade(ctx, y + 4, 10, "#c2ccd5", "#4a535d");
	ctx.fill();
	outline(ctx, 0.7);
	rim(ctx, 0.4);
	ctx.fillStyle = "#1b1a22";
	ctx.fillRect(x, y + 12.5, TILE, 2.5);
	for (let i = 0; i < 4; i++) {
		ctx.fillStyle = "#e9c136";
		ctx.fillRect(x + i * 4 + 0.5, y + 12.5, 2, 2.5);
	}
	if (p.phase === "drop") glow(ctx, x + 8, y + 15, 10, "rgba(255,120,60,A)", 0.35);
}

function drawCleared(ctx: Ctx, state: GameState, frame: number): void {
	ctx.fillStyle = "rgba(5,4,12,0.6)";
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	glow(
		ctx,
		VIEW_W / 2,
		VIEW_H / 2 - 30,
		90,
		"rgba(255,200,90,A)",
		0.35 + Math.sin(frame / 10) * 0.1,
	);
	fancyText(ctx, "BOSS POKONANY!", VIEW_W / 2, VIEW_H / 2 - 34, 38, "center");
	fancyText(
		ctx,
		`poziom ${state.level} zaliczony · wynik ${totalPoints(state)}`,
		VIEW_W / 2,
		VIEW_H / 2 + 4,
		16,
		"center",
	);
	fancyText(ctx, `Enter: poziom ${state.level + 1}`, VIEW_W / 2, VIEW_H / 2 + 30, 14, "center");
}

function drawGate(ctx: Ctx, x: number, y: number, frame: number): void {
	// Two-tile steel door in a frame, with a lamp over it.
	rounded(ctx, x - 1, y - 1, TILE + 2, 3 * TILE + 1, 2);
	ctx.fillStyle = "#2a3036";
	ctx.fill();
	ctx.fillStyle = shade(ctx, y, 2 * TILE, "#8893a0", "#3a434d");
	ctx.fillRect(x + 1, y + 1, TILE - 2, 3 * TILE - 2);
	ctx.fillStyle = "#1b1a22";
	ctx.fillRect(x + TILE / 2 - 0.5, y + 1, 1, 3 * TILE - 2);
	for (const [rx, ry] of [
		[3, 4],
		[12, 4],
		[3, 43],
		[12, 43],
	] as const) {
		sphere(ctx, x + rx, y + ry, 1.2, "#ffffff", "#6f7a86");
	}
	ctx.fillStyle = "#e9c136";
	ctx.fillRect(x + 2, y + 22, 5, 2);
	ctx.fillRect(x + 9, y + 22, 5, 2);
	const pulse = 0.5 + Math.sin(frame / 10) * 0.3;
	glow(ctx, x + TILE / 2, y - 3, 12, "rgba(255,200,90,A)", pulse);
	sphere(ctx, x + TILE / 2, y - 3, 2, "#fff0b0", "#d9901c");
}

function drawBossBar(ctx: Ctx, boss: Boss): void {
	const w = 120;
	const x = (VIEW_W - w) / 2;
	rounded(ctx, x - 2, 27, w + 4, 10, 4);
	ctx.fillStyle = "rgba(10,8,20,0.55)";
	ctx.fill();
	for (let i = 0; i < boss.spec.hp; i++) {
		rounded(ctx, x + (i * w) / boss.spec.hp + 1, 29, w / boss.spec.hp - 2, 6, 2);
		ctx.fillStyle = i < boss.hp ? "#ff5a5a" : "#2b2f36";
		ctx.fill();
	}
	fancyText(ctx, BOSS_NAMES[boss.spec.body], VIEW_W / 2, 44, 10, "center");
}

function drawPickups(ctx: Ctx, world: World, camera: number): void {
	const frame = world.frame;
	for (const item of world.pickups) {
		if (item.taken) continue;
		const bob = Math.sin((frame + item.x * 7) / 12) * 1.5;
		drawPickup(ctx, item.kind, item.x * TILE + 8 - camera, item.y * TILE + 8 + bob, frame, item.x);
	}
}

function drawProjectiles(ctx: Ctx, world: World, camera: number): void {
	const frame = world.frame;
	for (const s of world.scraps) {
		if (s.state === "ground" || s.state === "thrown") drawScrap(ctx, s.x - camera, s.y, frame);
	}
	for (const m of world.megas) drawMega(ctx, m.x - camera, m.y, frame);
	for (const s of world.shots) drawScrap(ctx, s.x - camera, s.y, frame * 3);
	drawPouch(ctx, world, camera);
}

function drawSpikes(ctx: Ctx, x: number, y: number): void {
	for (let i = 0; i < 3; i++) {
		const sx = x + 1 + i * 5;
		ctx.beginPath();
		ctx.moveTo(sx, y + TILE);
		ctx.lineTo(sx + 2.5, y + 6);
		ctx.lineTo(sx + 5, y + TILE);
		ctx.closePath();
		const g = ctx.createLinearGradient(sx, 0, sx + 5, 0);
		g.addColorStop(0, "#5a646e");
		g.addColorStop(0.45, "#eef3f7");
		g.addColorStop(1, "#4a535d");
		ctx.fillStyle = g;
		ctx.fill();
		outline(ctx, 0.6);
		ctx.fillStyle = "#c23b25";
		ctx.beginPath();
		ctx.arc(sx + 2.5, y + 7, 0.9, 0, Math.PI * 2);
		ctx.fill();
	}
}

function drawSpring(ctx: Ctx, x: number, y: number, frame: number): void {
	const squash = Math.sin(frame / 10) * 0.6;
	rounded(ctx, x + 1, y + TILE - 3, TILE - 2, 3, 1);
	ctx.fillStyle = "#3a3f49";
	ctx.fill();
	ctx.strokeStyle = "#c9d2da";
	ctx.lineWidth = 1.4;
	ctx.beginPath();
	const top = y + 7 + squash;
	for (let i = 0; i <= 4; i++) {
		const yy = y + TILE - 3 - ((y + TILE - 3 - top) * i) / 4;
		ctx.lineTo(x + (i % 2 ? 4 : TILE - 4), yy);
	}
	ctx.stroke();
	rounded(ctx, x + 1, top - 3, TILE - 2, 3.5, 1.5);
	ctx.fillStyle = shade(ctx, top - 3, 3.5, "#ffb070", "#c2501c");
	ctx.fill();
	outline(ctx, 0.6);
	glow(ctx, x + TILE / 2, top - 2, 8, "rgba(255,170,80,A)", 0.3);
}

function drawPlatform(ctx: Ctx, pl: Platform, frame: number, camera: number): void {
	const x = Math.round(pl.x - camera);
	if (pl.kind === "mover") {
		// Rail it rides, then the deck with hazard ends.
		ctx.strokeStyle = "rgba(160,170,180,0.35)";
		ctx.lineWidth = 1;
		ctx.setLineDash([3, 3]);
		ctx.beginPath();
		ctx.moveTo(pl.minX - camera, pl.y + 4);
		ctx.lineTo(pl.maxX + pl.w - camera, pl.y + 4);
		ctx.stroke();
		ctx.setLineDash([]);
		rounded(ctx, x, pl.y, pl.w, pl.h, 2);
		ctx.fillStyle = shade(ctx, pl.y, pl.h, "#c9d2da", "#4a535d");
		ctx.fill();
		outline(ctx, 0.8);
		rim(ctx, 0.4);
		for (const ex of [x, x + pl.w - 6]) {
			for (let i = 0; i < 2; i++) {
				ctx.fillStyle = i % 2 ? "#1b1a22" : "#e9c136";
				ctx.fillRect(ex + i * 3, pl.y + 1, 3, pl.h - 2);
			}
		}
		for (const wx of [x + 10, x + pl.w - 10])
			sphere(ctx, wx, pl.y + pl.h + 1.5, 2, "#8d939b", "#2b2f36");
		return;
	}
	// Trapdoor: a hinged hatch that rattles before it drops open.
	if (pl.openLeft > 0) {
		ctx.save();
		ctx.translate(x + 1, pl.y + 1);
		ctx.rotate(Math.PI / 2.3);
		rounded(ctx, 0, -2, TILE - 2, 4, 1);
		ctx.fillStyle = shade(ctx, -2, 4, "#a67c52", "#5a3a20");
		ctx.fill();
		outline(ctx, 0.6);
		ctx.restore();
		return;
	}
	const shake = pl.timer > 6 ? Math.sin(frame * 1.7) * Math.min(1.5, pl.timer / 12) : 0;
	rounded(ctx, x + shake, pl.y, pl.w, 5, 1);
	ctx.fillStyle = shade(ctx, pl.y, 5, "#c99a6a", "#6a4424");
	ctx.fill();
	outline(ctx, 0.7);
	ctx.strokeStyle = "rgba(60,35,15,0.6)";
	ctx.lineWidth = 0.6;
	ctx.beginPath();
	ctx.moveTo(x + shake + 5, pl.y + 0.5);
	ctx.lineTo(x + shake + 5, pl.y + 4.5);
	ctx.moveTo(x + shake + 11, pl.y + 0.5);
	ctx.lineTo(x + shake + 11, pl.y + 4.5);
	ctx.stroke();
	sphere(ctx, x + 1.5, pl.y + 2.5, 1.3, "#e6ecf1", "#4a535d");
}

function drawObstacles(ctx: Ctx, world: World, camera: number): void {
	const frame = world.frame;
	for (const k of world.level.spikes) drawSpikes(ctx, k.x * TILE - camera, k.y * TILE);
	for (const j of world.level.springs) drawSpring(ctx, j.x * TILE - camera, j.y * TILE, frame);
	for (const pl of world.platforms) drawPlatform(ctx, pl, frame, camera);
}

function drawActors(ctx: Ctx, world: World, camera: number, skin: Skin): void {
	if (world.boss) drawBoss(ctx, world.boss, world.frame, camera, world);
	const frame = world.frame;
	for (const c of world.level.chargers) drawCharger(ctx, c.x * TILE - camera, c.y * TILE, frame);
	for (const g of world.level.gates) drawGate(ctx, g.x * TILE - camera, (g.y - 2) * TILE, frame);
	for (const p of world.presses) drawPress(ctx, p, camera);
	drawObstacles(ctx, world, camera);
	drawPickups(ctx, world, camera);
	drawProjectiles(ctx, world, camera);
	for (const d of world.dogs) if (d.alive) drawDog(ctx, d.x - camera, d.y, d.dir, frame);
	for (const d of world.drones) if (d.alive) drawDrone(ctx, d.x - camera, d.y, d.dir, frame);
	drawSrubek(ctx, world.player, skin, frame, camera);
	drawEffects(ctx, world, camera);
}

export type Renderer = (
	world: World,
	state: GameState,
	board: readonly BoardRow[],
	skin: Skin,
	fps?: number,
) => void;

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
	canvas.width = VIEW_W * SCALE;
	canvas.height = VIEW_H * SCALE;
	const ctx = canvas.getContext("2d");
	if (!ctx) return () => {};
	const backdrops = new Map<Theme, Backdrop>();
	const backdropFor = (theme: Theme): Backdrop => {
		let b = backdrops.get(theme);
		if (!b) {
			b = bakeBackdrop(theme);
			backdrops.set(theme, b);
		}
		return b;
	};
	const textures = loadTextures();
	return (world, state, board, skin, fps) => {
		const camera = Math.round(world.camera);
		const quake = world.effects.find((e) => e.kind === "quake");
		const shake = quake ? Math.max(0, 12 - (world.frame - quake.frame)) : 0;
		const sx = shake ? (noise(world.frame, 1, 97) - 0.5) * shake : 0;
		const sy = shake ? (noise(world.frame, 2, 97) - 0.5) * shake : 0;
		ctx.setTransform(SCALE, 0, 0, SCALE, sx * SCALE, sy * SCALE);
		drawBackground(ctx, backdropFor(world.level.theme), camera, world.frame);
		drawTiles(ctx, textures, world.level, camera);
		drawActors(ctx, world, camera, skin);
		// Vignette, so the edges fall off like a lit set.
		const v = ctx.createRadialGradient(
			VIEW_W / 2,
			VIEW_H / 2,
			VIEW_H * 0.5,
			VIEW_W / 2,
			VIEW_H / 2,
			VIEW_W * 0.75,
		);
		v.addColorStop(0, "rgba(0,0,0,0)");
		v.addColorStop(1, "rgba(0,0,0,0.35)");
		ctx.fillStyle = v;
		ctx.fillRect(0, 0, VIEW_W, VIEW_H);
		drawHud(ctx, state, world.frame);
		if (world.boss?.alive) drawBossBar(ctx, world.boss);
		if (state.status === "over") drawOverlay(ctx, state, board);
		if (state.status === "cleared") drawCleared(ctx, state, world.frame);
		if (fps !== undefined) fancyText(ctx, `${fps} FPS`, VIEW_W - 6, 14, 11, "right");
	};
}
