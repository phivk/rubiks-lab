// Telling sticker colors apart in camera samples.
//
// Colors are compared in CIELAB, mostly by hue, since lighting changes how bright and
// vivid a sticker looks far more than its hue. While aiming, samples are matched against
// a typical cube's colors; once faces are captured, their centers stand in for those, so
// the cube's own shades under the room's light decide. The final pass also knows how many
// stickers each color has, which settles the close calls (red/orange, white/yellow).

import type { Puzzle, State } from '../core/types';

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
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

export function toLab([r, g, b]: RGB): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
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
export const distance = (a: RGB, b: RGB) => labDistance(toLab(a), toLab(b));

/** Nearest reference color id, or -1 if there are none. `refs` may have gaps. */
export function nearest(sample: RGB, refs: (RGB | undefined)[]): number {
  let best = -1, bestD = Infinity;
  refs.forEach((r, id) => {
    if (!r) return;
    const d = distance(sample, r);
    if (d < bestD) { bestD = d; best = id; }
  });
  return best;
}

/**
 * Color ids for every sample, with `fixed` samples (the centers) pinned to theirs and each
 * id used `perColor` times. Greedy: the most confident remaining match is taken first, and
 * a color that's full stops taking stickers. Then each color's reference becomes the
 * average of the stickers it took, which is steadier than one center, and it goes again.
 */
export function classifyAll(samples: RGB[], refs: RGB[], fixed: Map<number, number>, perColor: number): number[] {
  const labs = samples.map(toLab);
  let out = assign(labs, refs.map(toLab), fixed, perColor);
  for (let round = 0; round < 3; round++) {
    const means = refs.map((_, id) => {
      const mine = labs.filter((_, i) => out[i] === id);
      return [0, 1, 2].map((k) => mine.reduce((a, l) => a + l[k], 0) / mine.length) as Lab;
    });
    const next = assign(labs, means, fixed, perColor);
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
 * The state a scan shows: `captured[k]` holds the samples of `puzzle.scan[k]`, row by row.
 * Each face's center decides its color; every other sticker goes to the center it's closest to.
 */
export function scanState(puzzle: Puzzle, captured: RGB[][]): State {
  const faces = puzzle.scan!;
  const perFace = faces[0].stickers.length, middle = (perFace - 1) / 2;
  const state: State = puzzle.stickers.map(() => puzzle.unset);
  const samples = captured.flat();
  const stickers = faces.flatMap((f) => f.stickers);
  const fixed = new Map(faces.map((f, k) => [k * perFace + middle, f.center]));
  const refs: RGB[] = [];
  faces.forEach((f, k) => { refs[f.center] = captured[k][middle]; });
  classifyAll(samples, refs, fixed, perFace).forEach((c, i) => { state[stickers[i]] = c; });
  return state;
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
