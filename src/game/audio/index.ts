/**
 * Sound effects synthesised with Web Audio, so there are no files to load.
 * The context can only start after a user gesture; `unlock()` is called on
 * the first key press and every sound before that is simply dropped.
 */

import type { GameEvent } from "@/game/engine";

type SoundName =
	| "jump"
	| "airjump"
	| "nut"
	| "bolt"
	| "gear"
	| "cell"
	| "boom"
	| "hit"
	| "fall"
	| "pull"
	| "throw"
	| "charge"
	| "gate"
	| "life";

export interface Audio {
	unlock(): void;
	play(name: SoundName): void;
	toggleMute(): boolean;
	/** Switch the background track (1..3) and keep playing if already unlocked. */
	setTrack(track: number): void;
	/** Plays whatever the frame's events call for. */
	react(events: GameEvent[]): void;
}

interface Tone {
	type: OscillatorType;
	from: number;
	to: number;
	dur: number;
	gain?: number;
	delay?: number;
}

const MASTER = 0.22;
const MUSIC = 0.3;

function tone(ctx: AudioContext, out: GainNode, t: Tone): void {
	const osc = ctx.createOscillator();
	const g = ctx.createGain();
	const start = ctx.currentTime + (t.delay ?? 0);
	osc.type = t.type;
	osc.frequency.setValueAtTime(t.from, start);
	osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
	g.gain.setValueAtTime(t.gain ?? 0.5, start);
	g.gain.exponentialRampToValueAtTime(0.001, start + t.dur);
	osc.connect(g).connect(out);
	osc.start(start);
	osc.stop(start + t.dur + 0.02);
}

function noise(ctx: AudioContext, out: GainNode, dur: number, cutoff: number, gain = 0.6): void {
	const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	const src = ctx.createBufferSource();
	src.buffer = buffer;
	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";
	filter.frequency.setValueAtTime(cutoff, ctx.currentTime);
	filter.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff / 8), ctx.currentTime + dur);
	const g = ctx.createGain();
	g.gain.setValueAtTime(gain, ctx.currentTime);
	g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
	src.connect(filter).connect(g).connect(out);
	src.start();
}

const SOUNDS: Record<SoundName, (ctx: AudioContext, out: GainNode) => void> = {
	jump: (c, o) => tone(c, o, { type: "square", from: 280, to: 620, dur: 0.12, gain: 0.25 }),
	airjump: (c, o) => {
		tone(c, o, { type: "square", from: 420, to: 980, dur: 0.14, gain: 0.25 });
		noise(c, o, 0.18, 2400, 0.25);
	},
	nut: (c, o) => {
		tone(c, o, { type: "sine", from: 880, to: 880, dur: 0.07 });
		tone(c, o, { type: "sine", from: 1320, to: 1320, dur: 0.12, delay: 0.07 });
	},
	bolt: (c, o) => tone(c, o, { type: "triangle", from: 660, to: 700, dur: 0.1 }),
	gear: (c, o) => {
		for (const [i, f] of [660, 880, 1100, 1320].entries()) {
			tone(c, o, { type: "sine", from: f, to: f, dur: 0.1, delay: i * 0.06 });
		}
	},
	cell: (c, o) => tone(c, o, { type: "sawtooth", from: 400, to: 1400, dur: 0.25, gain: 0.3 }),
	boom: (c, o) => {
		noise(c, o, 0.3, 1800, 0.8);
		tone(c, o, { type: "sine", from: 160, to: 40, dur: 0.3, gain: 0.7 });
	},
	hit: (c, o) => {
		tone(c, o, { type: "sawtooth", from: 220, to: 70, dur: 0.22, gain: 0.4 });
		noise(c, o, 0.1, 900, 0.3);
	},
	fall: (c, o) => tone(c, o, { type: "square", from: 700, to: 90, dur: 0.6, gain: 0.3 }),
	pull: (c, o) => tone(c, o, { type: "sine", from: 200, to: 520, dur: 0.12, gain: 0.35 }),
	throw: (c, o) => noise(c, o, 0.16, 3200, 0.4),
	charge: (c, o) => {
		tone(c, o, { type: "triangle", from: 440, to: 470, dur: 0.3, gain: 0.25 });
		tone(c, o, { type: "triangle", from: 880, to: 940, dur: 0.3, gain: 0.12 });
	},
	life: (c, o) => {
		for (const [i, f] of [659, 784, 988, 1319, 1568].entries()) {
			tone(c, o, { type: "square", from: f, to: f, dur: 0.12, delay: i * 0.08, gain: 0.2 });
		}
	},
	gate: (c, o) => {
		for (const [i, f] of [523, 659, 784, 1047].entries()) {
			tone(c, o, { type: "triangle", from: f, to: f, dur: 0.5, delay: i * 0.12, gain: 0.3 });
		}
	},
};

const BY_EVENT: Partial<Record<GameEvent["type"], SoundName>> = {
	jump: "jump",
	airjump: "airjump",
	drone: "boom",
	dog: "boom",
	hit: "hit",
	fall: "fall",
	pull: "pull",
	throw: "throw",
	gate: "gate",
	slam: "boom",
	bossHit: "gear",
	bossDown: "gate",
};

/** `track` picks /music/level<n>.mp3; the pack has 1..3. */
export function createAudio(track = 1): Audio {
	let ctx: AudioContext | undefined;
	let out: GainNode | undefined;
	let muted = false;
	let lastCharge = Number.NEGATIVE_INFINITY;

	// The charger reports every frame; one hum per second is enough.
	const chargeHum = (): SoundName | undefined => {
		const now = performance.now();
		if (now - lastCharge < 1000) return undefined;
		lastCharge = now;
		return "charge";
	};

	const play = (name: SoundName): void => {
		if (!ctx || !out || muted) return;
		SOUNDS[name](ctx, out);
	};

	// Background track: a looping <audio> element, started with the context on the first key.
	const trackFile = (n: number): string => `/music/level${((Math.round(n) - 1) % 3) + 1}.mp3`;
	const music = new window.Audio(trackFile(track));
	music.loop = true;
	music.volume = MUSIC;
	music.preload = "auto";

	return {
		unlock() {
			if (ctx) return;
			ctx = new AudioContext();
			out = ctx.createGain();
			out.gain.value = MASTER;
			out.connect(ctx.destination);
			if (!muted) music.play().catch(() => undefined);
		},
		play,
		setTrack(next) {
			const wanted = trackFile(next);
			if (music.src.endsWith(wanted)) return;
			music.src = wanted;
			if (ctx && !muted) music.play().catch(() => undefined);
		},
		toggleMute() {
			muted = !muted;
			if (muted) music.pause();
			else if (ctx) music.play().catch(() => undefined);
			return muted;
		},
		react(events) {
			for (const e of events) {
				const name =
					e.type === "pickup" ? e.kind : e.type === "charge" ? chargeHum() : BY_EVENT[e.type];
				if (name) play(name);
			}
		},
	};
}
