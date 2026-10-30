/**
 * Everything that touches the canvas. Sprites are pixel maps drawn once into
 * offscreen canvases; the world is drawn at VIEW_W x VIEW_H and the page scales
 * it up with crisp pixels.
 */

import { type Player, VIEW_H, VIEW_W, type World } from "@/game/engine";
import { type Level, TILE } from "@/game/level";
import { BATTERY_MAX, type GameState, totalPoints } from "@/game/state";

const PALETTE: Record<string, string> = {
	a: "#2b2f36", // dark metal
	b: "#9aa3ad", // body
	c: "#5f6771", // body shadow
	d: "#d6dde4", // highlight
	e: "#4ff0e0", // eye glow
	f: "#0a2a2e", // eye socket
	r: "#8a4b2a", // rust
	o: "#e0a23e", // brass
	p: "#a8742a", // brass shadow
	g: "#3b2a1f", // dirt
	h: "#5a4030", // dirt light
	m: "#6e7781", // plate
	n: "#4a525b", // plate edge
	k: "#8a939d", // rivet
};

type Pixels = readonly string[];

const SRUBEK_IDLE: Pixels = [
	".....a......",
	"....aoa.....",
	".....a......",
	"....dbbb....",
	"...dbbbbc...",
	"...bfebfc...",
	"...bbbbbc...",
	"....cbbc....",
	"..dbbbbbbc..",
	"..bbbrbbbc..",
	"..bbbbbbbc..",
	"..cbbobbcc..",
	"...cccccc...",
	"...cb..bc...",
	"..aaa..aaa..",
	"..aaa..aaa..",
];

const SRUBEK_RUN1: Pixels = [
	".....a......",
	"....aoa.....",
	".....a......",
	"....dbbb....",
	"...dbbbbc...",
	"...bfebfc...",
	"...bbbbbc...",
	"....cbbc....",
	"..dbbbbbbc..",
	"..bbbrbbbc..",
	"..bbbbbbbc..",
	"..cbbobbcc..",
	"...cccccc...",
	"..cb....bc..",
	".aaa....aaa.",
	".aaa....aaa.",
];

const SRUBEK_RUN2: Pixels = [
	".....a......",
	"....aoa.....",
	".....a......",
	"....dbbb....",
	"...dbbbbc...",
	"...bfebfc...",
	"...bbbbbc...",
	"....cbbc....",
	"..dbbbbbbc..",
	"..bbbrbbbc..",
	"..bbbbbbbc..",
	"..cbbobbcc..",
	"...cccccc...",
	"....cbbc....",
	"....aaaa....",
	"....aaaa....",
];

const SRUBEK_JUMP: Pixels = [
	".....a......",
	"....aoa.....",
	".....a......",
	"....dbbb....",
	"...dbbbbc...",
	"...bfebfc...",
	"...bbbbbc...",
	"....cbbc....",
	".cdbbbbbbcc.",
	".cbbbrbbbcc.",
	"..bbbbbbbc..",
	"..cbbobbcc..",
	"...cccccc...",
	"...cb..bc...",
	"..aaa..aaa..",
	"............",
];

const NUT: Pixels = [
	"..oooo..",
	".oooooo.",
	"oooppooo",
	"oop..poo",
	"oop..poo",
	"oooppppo",
	".oppppp.",
	"..pppp..",
];

const DRONE_1: Pixels = [
	"a..........a",
	"aaaaa..aaaaa",
	".....aa.....",
	"...annnna...",
	"..anneenna..",
	"..annnnnna..",
	"...aarraa...",
	"....a..a....",
];

const DRONE_2: Pixels = [
	"....a..a....",
	"..aaaaaaaa..",
	".....aa.....",
	"...annnna...",
	"..anneenna..",
	"..annnnnna..",
	"...aarraa...",
	"....a..a....",
];

const CHARGER: Pixels = [
	"......dddd......",
	"......daad......",
	"......daad......",
	".....dnnnnd.....",
	".....dneend.....",
	".....dneend.....",
	".....dneend.....",
	".....dnnnnd.....",
	"....dnnnnnnd....",
	"....dnneennd....",
	"....dnnnnnnd....",
	"...mmmmmmmmmm...",
	"...mkmmmmmmkm...",
	"...mmmmmmmmmm...",
	"..nnnnnnnnnnnn..",
	"..nnnnnnnnnnnn..",
];

const HEART: Pixels = [".rr.rr.", "rrrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."];

function bake(pixels: Pixels): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = pixels[0]?.length ?? 0;
	canvas.height = pixels.length;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	pixels.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			const color = PALETTE[row[x] ?? "."];
			if (!color) continue;
			ctx.fillStyle = color;
			ctx.fillRect(x, y, 1, 1);
		}
	});
	return canvas;
}

/** Deterministic noise per tile so scrap looks varied but never flickers. */
function noise(x: number, y: number, salt: number): number {
	const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
	return n - Math.floor(n);
}

/** Palette key for one ground pixel: lighter crust on top, rust and scrap flecks below. */
function groundPixel(y: number, r: number): string {
	if (y < 2) return r > 0.3 ? "h" : "g";
	if (r > 0.93) return "r";
	if (r > 0.88) return "n";
	if (r > 0.8) return "h";
	return "g";
}

function bakeGround(variant: number): HTMLCanvasElement {
	const rows: string[] = [];
	for (let y = 0; y < TILE; y++) {
		let row = "";
		for (let x = 0; x < TILE; x++) row += groundPixel(y, noise(x, y, variant));
		rows.push(row);
	}
	return bake(rows);
}

function bakePlate(): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = TILE;
	canvas.height = TILE;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	ctx.fillStyle = PALETTE.m ?? "#000";
	ctx.fillRect(0, 0, TILE, TILE);
	ctx.fillStyle = PALETTE.n ?? "#000";
	ctx.fillRect(0, TILE - 1, TILE, 1);
	ctx.fillRect(TILE - 1, 0, 1, TILE);
	ctx.fillStyle = PALETTE.d ?? "#000";
	ctx.fillRect(0, 0, TILE, 1);
	ctx.fillStyle = PALETTE.k ?? "#000";
	for (const [x, y] of [
		[2, 2],
		[12, 2],
		[2, 12],
		[12, 12],
	] as const) {
		ctx.fillRect(x, y, 2, 2);
	}
	return canvas;
}

interface Sprites {
	idle: HTMLCanvasElement;
	run: HTMLCanvasElement[];
	jump: HTMLCanvasElement;
	nut: HTMLCanvasElement;
	drone: HTMLCanvasElement[];
	charger: HTMLCanvasElement;
	heart: HTMLCanvasElement;
	ground: HTMLCanvasElement[];
	plate: HTMLCanvasElement;
}

function bakeAll(): Sprites {
	return {
		idle: bake(SRUBEK_IDLE),
		run: [bake(SRUBEK_RUN1), bake(SRUBEK_IDLE), bake(SRUBEK_RUN2), bake(SRUBEK_IDLE)],
		jump: bake(SRUBEK_JUMP),
		nut: bake(NUT),
		drone: [bake(DRONE_1), bake(DRONE_2)],
		charger: bake(CHARGER),
		heart: bake(HEART),
		ground: [bakeGround(1), bakeGround(2), bakeGround(3)],
		plate: bakePlate(),
	};
}

function drawDrones(ctx: CanvasRenderingContext2D, world: World, s: Sprites, camera: number): void {
	const sprite = s.drone[Math.floor(world.frame / 4) % 2] ?? s.charger;
	for (const d of world.drones) {
		if (!d.alive) continue;
		ctx.save();
		if (d.dir < 0) {
			ctx.translate(Math.round(d.x - camera) + d.w, Math.round(d.y));
			ctx.scale(-1, 1);
			ctx.drawImage(sprite, 0, 0);
		} else {
			ctx.drawImage(sprite, Math.round(d.x - camera), Math.round(d.y));
		}
		ctx.restore();
	}
}

function drawBackground(ctx: CanvasRenderingContext2D, camera: number): void {
	const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
	sky.addColorStop(0, "#2a1f3d");
	sky.addColorStop(0.6, "#7a3b3a");
	sky.addColorStop(1, "#d9823b");
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);

	// Far scrap heaps, parallax 0.3.
	ctx.fillStyle = "#3a2c33";
	const shift = (camera * 0.3) % 160;
	for (let i = -1; i < VIEW_W / 160 + 2; i++) {
		const bx = i * 160 - shift;
		ctx.beginPath();
		ctx.moveTo(bx, VIEW_H - 40);
		ctx.lineTo(bx + 40, VIEW_H - 110);
		ctx.lineTo(bx + 70, VIEW_H - 90);
		ctx.lineTo(bx + 100, VIEW_H - 130);
		ctx.lineTo(bx + 160, VIEW_H - 40);
		ctx.closePath();
		ctx.fill();
		// crane
		ctx.fillRect(bx + 120, VIEW_H - 190, 3, 150);
		ctx.fillRect(bx + 80, VIEW_H - 190, 70, 3);
	}
	ctx.fillStyle = "#2b2127";
	ctx.fillRect(0, VIEW_H - 40, VIEW_W, 40);
}

function drawTiles(ctx: CanvasRenderingContext2D, level: Level, camera: number, s: Sprites): void {
	const first = Math.floor(camera / TILE);
	const last = Math.min(level.widthTiles - 1, first + VIEW_W / TILE + 1);
	level.rows.forEach((row, ty) => {
		for (let tx = first; tx <= last; tx++) {
			const c = row[tx];
			if (c !== "#" && c !== "=") continue;
			const sprite = c === "=" ? s.plate : (s.ground[(tx * 7 + ty * 13) % 3] ?? s.plate);
			ctx.drawImage(sprite, tx * TILE - camera, ty * TILE);
		}
	});
}

function drawPlayer(
	ctx: CanvasRenderingContext2D,
	p: Player,
	frame: number,
	s: Sprites,
	camera: number,
): void {
	// Blink through the grace period after a hit.
	if (p.hurtLeft > 0 && Math.floor(frame / 4) % 2 === 0) return;
	let sprite = s.idle;
	if (!p.onGround) sprite = s.jump;
	else if (Math.abs(p.vx) > 0.3) sprite = s.run[Math.floor(frame / 6) % s.run.length] ?? s.idle;
	const sx = Math.round(p.x - camera);
	const sy = Math.round(p.y);
	ctx.save();
	if (p.facing < 0) {
		ctx.translate(sx + p.w, sy);
		ctx.scale(-1, 1);
		ctx.drawImage(sprite, 0, 0);
	} else {
		ctx.drawImage(sprite, sx, sy);
	}
	ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, s: Sprites): void {
	ctx.fillStyle = "rgba(0,0,0,0.45)";
	ctx.fillRect(4, 4, 150, 14);
	ctx.drawImage(s.nut, 7, 7);
	ctx.fillStyle = "#f4e7c3";
	ctx.font = "10px monospace";
	ctx.textBaseline = "top";
	ctx.fillText(String(totalPoints(state)).padStart(5, "0"), 20, 7);
	for (let i = 0; i < BATTERY_MAX; i++) {
		ctx.fillStyle = i < state.battery ? "#4ff0e0" : "#2b2f36";
		ctx.fillRect(66 + i * 9, 8, 7, 6);
	}
	ctx.fillStyle = "#9aa3ad";
	ctx.fillRect(93, 10, 2, 2);
	for (let i = 0; i < state.lives; i++) ctx.drawImage(s.heart, 102 + i * 10, 8);
}

function drawGameOver(ctx: CanvasRenderingContext2D, state: GameState): void {
	ctx.fillStyle = "rgba(0,0,0,0.6)";
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	ctx.fillStyle = "#f4e7c3";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = "bold 20px monospace";
	ctx.fillText("KONIEC GRY", VIEW_W / 2, VIEW_H / 2 - 20);
	ctx.font = "10px monospace";
	ctx.fillText(`wynik ${totalPoints(state)}`, VIEW_W / 2, VIEW_H / 2 + 4);
	ctx.fillText("Enter: jeszcze raz", VIEW_W / 2, VIEW_H / 2 + 20);
	ctx.textAlign = "start";
}

export type Renderer = (world: World, state: GameState) => void;

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
	canvas.width = VIEW_W;
	canvas.height = VIEW_H;
	const ctx = canvas.getContext("2d");
	if (!ctx) return () => {};
	ctx.imageSmoothingEnabled = false;
	const sprites = bakeAll();
	return (world, state) => {
		const camera = Math.round(world.camera);
		drawBackground(ctx, camera);
		drawTiles(ctx, world.level, camera, sprites);
		for (const nut of world.nuts) {
			if (nut.taken) continue;
			const bob = Math.round(Math.sin((world.frame + nut.x * 7) / 12) * 1.5);
			ctx.drawImage(sprites.nut, nut.x * TILE + 4 - camera, nut.y * TILE + 4 + bob);
		}
		for (const c of world.level.chargers) {
			ctx.drawImage(sprites.charger, c.x * TILE - camera, c.y * TILE);
		}
		drawDrones(ctx, world, sprites, camera);
		drawPlayer(ctx, world.player, world.frame, sprites, camera);
		drawHud(ctx, state, sprites);
		if (state.status === "over") drawGameOver(ctx, state);
	};
}
