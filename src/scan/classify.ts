// Telling sticker colors apart in camera samples.
//
// Colors are compared in CIELAB, mostly by hue, since lighting changes how bright and
// vivid a sticker looks far more than its hue. While aiming, samples are matched against
// the colors of whichever known kind of cube fits best; the centers seen so far stand in
// for those, and correct the ones not yet seen, so the cube's own shades under the room's
// light decide (a cube without fixed centers corrects them by the average of everything
// seen). The final pass also knows how many stickers each color has, which settles the
// close calls (red/orange, white/yellow).

import type { CubeKind } from '../core/colors';
import type { Puzzle, State, Vec3 } from '../core/types';
import { mean } from '../core/vec';

export type RGB = [number, number, number];
type Lab = [number, number, number];

/** what a typical cube's colors look like to a phone camera, by color id (White Red Green Yellow Orange Blue) */
export const TYPICAL: RGB[] = [
  [205, 210, 210],
  [185, 30, 45],
  [20, 150, 80],
  [215, 205, 45],
  [235, 105, 35],
  [25, 75, 175],
];

const lin = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** a bright stickerless cube's colors (like many of QiYi's): sky blue, lime green, crimson red */
export const BRIGHT: RGB[] = [
  [205, 210, 210],
  [175, 35, 60],
  [110, 190, 75],
  [205, 212, 65],
  [235, 115, 60],
  [70, 160, 195],
];

/** each kind of cube's colors; the kind whose colors fit what's seen is used */
const PALETTES: Record<CubeKind, RGB[]> = { typical: TYPICAL, bright: BRIGHT };

/**
 * How much better than a typical cube's each kind's centers must fit for it to be taken: a
 * dim, warm webcam can make a typical cube's navy look sky blue, and a typical cube is the
 * likelier one.
 */
const DOUBT: Record<CubeKind, number> = { typical: 1, bright: 1.15 };

/** reference colors to match samples against, and the kind of cube they're for */
export interface Calibration {
  refs: RGB[];
  kind: CubeKind;
}

/** a palette's average color, per channel in linear light */
const paletteMean = (p: RGB[]) => [0, 1, 2].map((k) => p.reduce((sum, t) => sum + lin(t[k]), 0) / p.length);

const toLinear = (c: RGB) => c.map(lin) as Vec3;
const luminance = ([R, G, B]: Vec3) => 0.2126 * R + 0.7152 * G + 0.0722 * B;
const toLab = (c: RGB) => linearToLab(toLinear(c));

function linearToLab([R, G, B]: Vec3): Lab {
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(luminance([R, G, B]));
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * Lighting scales a sticker's lightness and chroma but barely moves its hue, and hue is
 * what tells red from orange, so the first two count for less.
 */
const L_WEIGHT = 0.4, C_WEIGHT = 0.5;
function labDistance([l1, a1, b1]: Lab, [l2, a2, b2]: Lab) {
  const c1 = Math.hypot(a1, b1), c2 = Math.hypot(a2, b2);
  const hue2 = Math.max(0, (a1 - a2) ** 2 + (b1 - b2) ** 2 - (c1 - c2) ** 2);
  return Math.sqrt((L_WEIGHT * (l1 - l2)) ** 2 + (C_WEIGHT * (c1 - c2)) ** 2 + hue2);
}

/**
 * how much each channel's gain leans on the overall one, in seen colors' worth: from the
 * centers, and from a cube without them, whose colors aren't known (in stickers' worth)
 */
const PRIOR = 1, BLIND_PRIOR = 6;

/**
 * Reference colors while scanning: the ones seen so far as they are, and the rest a known
 * cube's, corrected the way the camera has shifted the seen ones. One gain per channel, in
 * linear light, fitted to the seen colors, takes out the camera's white balance and exposure:
 * a dim, warm webcam makes a typical orange darker and redder, so it no longer loses its
 * stickers to the red that's already been seen. One color says little about the channels it
 * barely has (green about red and blue), so each channel's gain leans on the overall one.
 * The known cube is the one whose colors, so corrected, come closest to the seen ones: a
 * lime green center says it's a bright cube, whose blue is sky blue rather than navy.
 */
export function calibrate(seen: (RGB | undefined)[]): Calibration {
  return best(kinds.map((kind) => {
    const palette = PALETTES[kind];
    const st = [0, 0, 0], tt = [0, 0, 0];
    seen.forEach((s, id) => {
      if (s) for (let k = 0; k < 3; k++) {
        const t = lin(palette[id][k]);
        st[k] += lin(s[k]) * t;
        tt[k] += t * t;
      }
    });
    const gain = gains(st, tt, PRIOR);
    const shifted = palette.map((t) => shift(t, gain));
    let miss = 0;
    seen.forEach((s, id) => { if (s) miss += labDistance(toLab(s), toLab(shifted[id])) * DOUBT[kind]; });
    return { refs: shifted.map((t, id) => seen[id] ?? t), kind, miss };
  }));
}

/**
 * Reference colors for a cube without fixed centers, where no sample is known to be any
 * color: a whole cube has the same number of each, so its samples average out to a known
 * cube's average, shifted by the camera. Part of a cube is a rougher guess. The known cube
 * is the one whose colors, so shifted, leave the samples closest to one of them.
 */
export function calibrateBlind(samples: RGB[]): Calibration {
  const labs = samples.map(toLab);
  const st = [0, 1, 2].map((k) => samples.reduce((sum, s) => sum + lin(s[k]), 0));
  return best(kinds.map((kind) => {
    const palette = PALETTES[kind];
    const tt = paletteMean(palette).map((x) => x * samples.length);
    // one face says little about a channel on its own, so each leans on the overall gain by a few stickers' worth
    const gain = gains(st, tt, BLIND_PRIOR);
    const refs = palette.map((t) => shift(t, gain)), refLabs = refs.map(toLab);
    const miss = sum(labs.map((l) => Math.min(...refLabs.map((r) => labDistance(l, r)))));
    return { refs, kind, miss };
  }));
}

const kinds = Object.keys(PALETTES) as CubeKind[];

/** the fit that misses by least; the first on a tie, so a typical cube unless told otherwise */
const best = (fits: (Calibration & { miss: number })[]): Calibration => {
  const { refs, kind } = fits.reduce((a, b) => (b.miss < a.miss ? b : a));
  return { refs, kind };
};

/** One gain per channel, each leaning on the overall one by `prior` colors' worth. */
function gains(st: number[], tt: number[], prior: number) {
  const overall = sum(tt) ? sum(st) / sum(tt) : 1;
  return st.map((x, k) => (x + prior * overall) / (tt[k] + prior));
}

const shift = (c: RGB, gain: number[]) => c.map((x, k) => Math.round(255 * gamma(Math.min(1, lin(x) * gain[k])))) as RGB;

/** Nearest reference color id, or -1 if there are none. `refs` may have gaps. */
export function nearest(sample: RGB, refs: (RGB | undefined)[]): number {
  let best = -1, bestD = Infinity;
  refs.forEach((r, id) => {
    if (!r) return;
    const d = labDistance(toLab(sample), toLab(r));
    if (d < bestD) { bestD = d; best = id; }
  });
  return best;
}

/**
 * Color ids for every sample, with `fixed` samples (the centers) pinned to theirs and each
 * id used `perColor` times, `perColor` samples to a face. Greedy: the most confident
 * remaining match is taken first, and a color that's full stops taking stickers. Then each
 * face's exposure is evened out, since one may face the light and the next be in shadow,
 * judged by how bright the colors it took are elsewhere; each color's reference becomes the
 * average of the stickers it took, which is steadier than one center; and it goes again.
 */
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);

function classifyAll(samples: RGB[], refs: RGB[], fixed: Map<number, number>, perColor: number): number[] {
  const linear = samples.map(toLinear);
  let out = assign(samples.map(toLab), refs.map(toLab), fixed, perColor);
  for (let round = 0; round < 4; round++) {
    const bright = refs.map((_, id) => luminance(mean(linear.filter((_, i) => out[i] === id))));
    const exposure: number[] = [];
    for (let at = 0; at < linear.length; at += perColor) {
      const seen = sum(linear.slice(at, at + perColor).map(luminance));
      exposure.push(seen / sum(out.slice(at, at + perColor).map((id) => bright[id])));
    }
    const labs = linear.map((c, i) => linearToLab(c.map((x) => x / exposure[Math.floor(i / perColor)]) as Vec3));
    const next = assign(labs, refs.map((_, id) => mean(labs.filter((_, i) => out[i] === id))), fixed, perColor);
    if (next.every((c, i) => c === out[i])) break;
    out = next;
  }
  return out;
}

function assign(labs: Lab[], refs: Lab[], fixed: Map<number, number>, perColor: number): number[] {
  const out = labs.map((_, i) => fixed.get(i) ?? -1);
  const left = refs.map(() => perColor);
  for (const id of fixed.values()) left[id]--;
  const pairs: { i: number; id: number; d: number }[] = [];
  labs.forEach((l, i) => {
    if (out[i] >= 0) return;
    refs.forEach((r, id) => pairs.push({ i, id, d: labDistance(l, r) }));
  });
  pairs.sort((a, b) => a.d - b.d);
  for (const { i, id } of pairs) {
    if (out[i] >= 0 || left[id] <= 0) continue;
    out[i] = id;
    left[id]--;
  }
  return out;
}

/**
 * The state a scan shows, and the kind of cube it's of: `captured[k]` holds the samples of
 * `puzzle.scan[k]`, row by row. Fixed centers decide their faces' colors, and every other
 * sticker goes to the center it's closest to; without them, the whole scan's average sets
 * the colors to match.
 */
export function scanState(puzzle: Puzzle, captured: RGB[][]): { state: State; kind: CubeKind } {
  const faces = puzzle.scan!;
  const perFace = faces[0].stickers.length;
  const state: State = puzzle.stickers.map(() => puzzle.unset);
  const samples = captured.flat();
  const stickers = faces.flatMap((f) => f.stickers);
  const fixed = new Map<number, number>();
  const refs: RGB[] = [];
  faces.forEach((f, k) => {
    if (f.center === undefined) return;
    fixed.set(k * perFace + f.center, f.face);
    refs[f.face] = captured[k][f.center];
  });
  const fit = fixed.size ? calibrate(refs) : calibrateBlind(samples);
  classifyAll(samples, fixed.size ? refs : fit.refs, fixed, perFace).forEach((c, i) => { state[stickers[i]] = c; });
  return { state, kind: fit.kind };
}

/** The median of each channel over an RGBA pixel buffer: robust to glare and the sticker's edges. */
export function medianColor(data: Uint8ClampedArray): RGB {
  const ch = [0, 1, 2].map((k) => {
    const v: number[] = [];
    for (let p = k; p < data.length; p += 4) v.push(data[p]);
    v.sort((a, b) => a - b);
    return v[v.length >> 1];
  });
  return ch as RGB;
}
