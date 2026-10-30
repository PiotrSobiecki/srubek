/** Shared drawing helpers: shading, lights, outlines and a deterministic noise. */

export type Ctx = CanvasRenderingContext2D;

export const INK = "#1b1a22";

/** Deterministic noise per tile so textures look varied but never flicker. */
export function noise(x: number, y: number, salt: number): number {
	const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
	return n - Math.floor(n);
}

export function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

export function shade(ctx: Ctx, y: number, h: number, top: string, bottom: string): CanvasGradient {
	const g = ctx.createLinearGradient(0, y, 0, y + h);
	g.addColorStop(0, top);
	g.addColorStop(1, bottom);
	return g;
}

export function sphere(
	ctx: Ctx,
	cx: number,
	cy: number,
	r: number,
	light: string,
	dark: string,
): void {
	const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
	g.addColorStop(0, light);
	g.addColorStop(1, dark);
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
}

/** Soft radial light; `color` carries an `A` placeholder for the alpha. */
export function glow(
	ctx: Ctx,
	cx: number,
	cy: number,
	r: number,
	color: string,
	alpha: number,
): void {
	const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
	g.addColorStop(0, color.replace("A", String(alpha)));
	g.addColorStop(1, color.replace("A", "0"));
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
}

export function outline(ctx: Ctx, width = 0.8): void {
	ctx.lineWidth = width;
	ctx.strokeStyle = INK;
	ctx.stroke();
}

/** Thin light along the upper-left edge of the current path, for a lit look. */
export function rim(ctx: Ctx, alpha = 0.5): void {
	ctx.save();
	ctx.clip();
	ctx.lineWidth = 2.2;
	ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
	ctx.translate(-0.9, -0.9);
	ctx.stroke();
	ctx.restore();
}

/** A metal panel with bevel, rivets and optional hazard stripe along the bottom. */
export function panel(
	ctx: Ctx,
	x: number,
	y: number,
	w: number,
	h: number,
	light: string,
	dark: string,
	stripes = false,
): void {
	rounded(ctx, x, y, w, h, 3);
	ctx.fillStyle = shade(ctx, y, h, light, dark);
	ctx.fill();
	outline(ctx, 1);
	rim(ctx, 0.4);
	for (const [rx, ry] of [
		[4, 4],
		[w - 4, 4],
		[4, h - 4],
		[w - 4, h - 4],
	] as const) {
		sphere(ctx, x + rx, y + ry, 1.6, "#ffffff", "#5a646e");
	}
	if (!stripes) return;
	ctx.fillStyle = INK;
	ctx.fillRect(x, y + h - 5, w, 5);
	for (let i = 0; i < w / 8; i++) {
		ctx.fillStyle = "#e9c136";
		ctx.fillRect(x + i * 8 + 1, y + h - 5, 4, 5);
	}
}

/** Short chain of links hanging straight down. */
export function chain(ctx: Ctx, x: number, y: number, length: number, sway = 0): void {
	ctx.strokeStyle = "#4a535d";
	ctx.lineWidth = 1.6;
	for (let i = 0; i < length / 4; i++) {
		const cy = y + i * 4;
		const cx = x + Math.sin(sway + i * 0.6) * 1.2;
		ctx.beginPath();
		ctx.ellipse(cx, cy + 2, 1.4, 2.2, 0, 0, Math.PI * 2);
		ctx.stroke();
	}
}

/** Exhaust or steam puff, keyed by time so it rises and fades. */
export function puff(
	ctx: Ctx,
	x: number,
	y: number,
	t: number,
	color = "rgba(220,220,230,A)",
): void {
	const k = (((t % 40) + 40) % 40) / 40;
	glow(ctx, x - k * 4, y - k * 14, 3 + k * 7, color, (1 - k) * 0.5);
}
