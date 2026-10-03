// Checks for camera scanning on the 3×3: the scan faces' sticker order matches what a
// camera sees, and simulated photos of scrambled cubes read back as the right state.
// Run with `npm run verify`.
import type { Vec3 } from '../src/core/types';
import { cross, dot } from '../src/core/vec';
import { TYPICAL, scanState, type RGB } from '../src/scan/classify';

// the 3×3 starts its solver worker on load, which Node doesn't have
(globalThis as { Worker?: unknown }).Worker = class { postMessage() {} addEventListener() {} terminate() {} };
const { cube3 } = await import('../src/cube/puzzles');

function fail(msg: string): never {
  console.error('✗ ' + msg);
  process.exit(1);
}

const P = cube3;
const faces = P.scan!;
const centroid = (i: number) => [0, 1, 2].map((k) => P.stickers[i].outline.reduce((a, p) => a + p[k], 0) / 4) as Vec3;
const faceNormal = (color: number) => P.stickers.find((s) => s.color === color)!.normal;

// Held as told, each face's stickers run left to right, then top to bottom, as the camera sees them.
for (const f of faces) {
  const n = faceNormal(f.center), up = faceNormal(f.top);
  if (dot(n, up) !== 0) fail(`scan face ${f.center}: top isn't beside it`);
  const right = cross(up, n);
  f.stickers.forEach((s, i) => {
    if (P.stickers[s].color !== f.center) fail(`scan face ${f.center}: sticker ${s} is on another face`);
    const p = centroid(s), r = Math.floor(i / 3), c = i % 3;
    if (Math.round(dot(p, right)) !== c - 1 || Math.round(dot(p, up)) !== 1 - r) fail(`scan face ${f.center}: sticker ${s} isn't at row ${r}, column ${c}`);
  });
}
if (new Set(faces.map((f) => f.center)).size !== 6) fail('every face is scanned once');
console.log('✓ scan faces line up with the camera');

// seeded, so the check gives the same answer every run
let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A photo: each color shifted the way a particular cube and lamp shift it, each face lit
// differently, and every sticker a little noisy.
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
function photo(state: number[]): RGB[][] {
  const shade = TYPICAL.map((c) => c.map((x) => x + rand(-15, 15)) as RGB);
  const tint = [rand(0.9, 1.1), rand(0.9, 1.1), rand(0.85, 1.1)];
  return faces.map((f) => {
    const light = rand(0.65, 1.15);
    return f.stickers.map((s) => shade[state[s]].map((x, k) => clamp(x * light * tint[k] + rand(-12, 12))) as RGB);
  });
}

const apply = (s: number[], moves: string[]) => moves.reduce((st, m) => P.parseMove(m)!.perm.map((src) => st[src]), s);
const TRIALS = 500;
let wrong = 0;
for (let t = 0; t < TRIALS; t++) {
  const state = apply(P.solved(), P.scramble());
  const read = scanState(P, photo(state));
  if (read.some((c, i) => c !== state[i])) wrong++;
}
// the simulation is harsher than a real cube in decent light; a few misreads are what paint mode is for
if (wrong > TRIALS * 0.06) fail(`${wrong} of ${TRIALS} simulated scans misread`);
console.log(`✓ ${TRIALS - wrong} of ${TRIALS} simulated scans read back exactly`);
