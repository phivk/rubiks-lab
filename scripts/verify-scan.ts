// Checks for camera scanning on the N×N cubes and the Pyraminx: the scan faces' sticker order
// matches what a camera sees, and simulated photos of scrambled puzzles read back as the right state.
// Run with `npm run verify`.
import { byIds } from '../src/core/colors';
import type { Puzzle, State, Vec3 } from '../src/core/types';
import { cross, dot, mean, rotate } from '../src/core/vec';
import { CubeModel } from '../src/cube/model';
import { applyAll as pyraApplyAll, rotations } from '../src/pyraminx/model';
import { pyraminx } from '../src/pyraminx/puzzle';
import { scanCells, toUnitBox } from '../src/scan/cells';
import { BRIGHT, TYPICAL, calibrateFaces, nearest, scanState, type RGB } from '../src/scan/classify';

// the 3×3 starts its solver worker on load, which Node doesn't have
(globalThis as { Worker?: unknown }).Worker = class { postMessage() {} addEventListener() {} terminate() {} };
const { cube2, cube3, cube4, cube5 } = await import('../src/cube/puzzles');

function fail(msg: string): never {
  console.error('✗ ' + msg);
  process.exit(1);
}

// seeded, so the check gives the same answer every run
let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A photo: each color shifted the way a particular cube and lamp shift it, each face lit
// differently, and every sticker a little noisy. A dim webcam also sees everything darker and warmer.
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
function photo(P: Puzzle, state: number[], webcam: boolean, cube: RGB[]): RGB[][] {
  const palette = byIds(cube, P.cubeColorIds);
  const shade = palette.map((c) => c.map((x) => x + rand(-15, 15)) as RGB);
  const tint = webcam ? [rand(0.85, 1), rand(0.6, 0.8), rand(0.5, 0.75)] : [rand(0.9, 1.1), rand(0.9, 1.1), rand(0.85, 1.1)];
  const dim = webcam ? rand(0.6, 0.8) : 1;
  return P.scan!.map((f) => {
    const light = dim * (webcam ? rand(0.85, 1.1) : rand(0.65, 1.15));
    return f.stickers.map((s) => shade[state[s]].map((x, k) => clamp(x * light * tint[k] + rand(-12, 12))) as RGB);
  });
}

// a typical cube, and a bright stickerless one, whose sky blue is closer to its white and
// lime green to its yellow, so it's allowed more misreads; the most each may misread, in
// percent, in decent light and on a dim webcam, once scanned and while aiming
const CUBES = [
  { kind: 'typical', palette: TYPICAL, scan: [0.3, 2], aim: [1, 10] },
  { kind: 'bright', palette: BRIGHT, scan: [0.5, 3], aim: [3, 12] },
];

/**
 * Simulated scans of states from `scrambled`, each photographed as `held` shows it, read back
 * as the state: `name` is what the puzzle's called, and `other` what a wrong kind is taken for.
 */
function checkScans(P: Puzzle, name: string, other: string, trials: number, scrambled: () => State, held = (s: State) => s) {
  for (const { kind, palette, scan } of CUBES) for (const webcam of [false, true]) {
    let exact = 0, misread = 0, wrongKind = 0;
    for (let t = 0; t < trials; t++) {
      const state = scrambled();
      const { state: read, kind: seen } = scanState(P, photo(P, held(state), webcam, palette));
      if (seen !== kind) wrongKind++;
      const wrong = read.filter((c, i) => c !== state[i]).length;
      if (!wrong) exact++;
      misread += wrong;
    }
    // the simulation is harsher than a real cube in decent light; a few misreads are what paint mode is for
    const pct = 100 * misread / (trials * P.stickers.length), limit = scan[+webcam];
    const what = `${exact} of ${trials} ${kind} ${name} simulated scans${webcam ? ' on a dim webcam' : ''} read back exactly, and ${pct.toFixed(2)}% of stickers misread`;
    if (pct > limit) fail(what);
    console.log(`✓ ${what}`);
    // a wrong kind only draws the cube in the wrong colors; without fixed centers it also reads them a little worse
    const kinds = `${wrongKind} of them taken for the other kind of ${other}`;
    if (wrongKind > trials * (webcam ? 0.06 : 0.01)) fail(kinds);
    console.log(`  ${kinds}`);
  }
}

/** While aiming, each face is read against the faces captured before it and itself, before any of the later ones are known. */
function checkAim(P: Puzzle, name: string, scrambled: () => State) {
  const faces = P.scan!;
  for (const { kind, palette, aim } of CUBES) for (const webcam of [false, true]) {
    let misread = 0, total = 0;
    for (let t = 0; t < 200; t++) {
      const state = scrambled();
      const pic = photo(P, state, webcam, palette);
      faces.forEach((f, k) => {
        const { refs } = calibrateFaces(P, pic.map((p, j) => (j <= k ? p : undefined)));
        f.stickers.forEach((s, i) => { total++; if (nearest(pic[k][i], refs) !== state[s]) misread++; });
      });
    }
    const pct = 100 * misread / total, limit = aim[+webcam];
    const what = `the ${kind} ${name} live preview misreads ${pct.toFixed(1)}% of stickers${webcam ? ' on a dim webcam' : ''}`;
    if (pct > limit) fail(what);
    console.log(`✓ ${what}`);
  }
}

for (const P of [cube2, cube3, cube4, cube5]) {
  const faces = P.scan!;
  const M = new CubeModel(Math.round(Math.sqrt(faces[0].stickers.length)));
  const n = M.n;
  const faceNormal = (face: number) => P.stickers.find((s) => s.color === face)!.normal;

  // Held as told, each face's stickers run left to right, then top to bottom, as the camera sees them.
  for (const f of faces) {
    const normal = faceNormal(f.face), up = faceNormal(f.top);
    if (dot(normal, up) !== 0) fail(`${P.name} scan face ${f.face}: top isn't beside it`);
    const right = cross(up, normal);
    f.stickers.forEach((s, i) => {
      if (P.stickers[s].color !== f.face) fail(`${P.name} scan face ${f.face}: sticker ${s} is on another face`);
      const p = mean(P.stickers[s].outline), r = Math.floor(i / n), c = i % n;
      if (Math.round(2 * dot(p, right)) !== 2 * c - (n - 1) || Math.round(2 * dot(p, up)) !== n - 1 - 2 * r) {
        fail(`${P.name} scan face ${f.face}: sticker ${s} isn't at row ${r}, column ${c}`);
      }
    });
    if (f.center !== undefined && !M.fixedCenters.includes(f.stickers[f.center])) fail(`${P.name} scan face ${f.face}: its center isn't fixed`);
  }
  if (new Set(faces.map((f) => f.face)).size !== 6) fail(`${P.name}: every face is scanned once`);
  console.log(`✓ ${P.name} scan faces line up with the camera`);

  // Faces go by position on an even cube, so it can be held any way round: scan it turned.
  const turn = n % 2 ? [] : ['x', 'y2', "z'"];
  checkScans(P, P.name, 'cube', Math.round(1500 / n), () => M.applyAll(P.solved(), [...P.scramble(), ...turn]));
  checkAim(P, P.name, () => M.applyAll(P.solved(), P.scramble()));
}

// ---------- Pyraminx ----------
{
  const P = pyraminx, faces = P.scan!;
  // Turned as told: a third of the way round the top tip each time, the way that brings the
  // side on the camera's right (+x) round to it (+z), and leaned back so it faces the camera
  // square on; for the bottom, back to the start and tipped top away. The camera looks down
  // -z, with +y up.
  const LEAN = Math.atan(1 / (2 * Math.SQRT2));
  const turned = (k: number, p: Vec3): Vec3 => k < 3
    ? rotate(rotate(p, [0, 1, 0], (-2 * Math.PI * k) / 3), [1, 0, 0], LEAN)
    : rotate(p, [1, 0, 0], -Math.PI / 2);
  faces.forEach((f, k) => {
    const normal = turned(k, P.stickers[f.stickers[0]].normal);
    if (normal[2] < 0.99) fail(`Pyraminx scan face ${k + 1} doesn't face the camera once turned`);
    const seen = toUnitBox(f.stickers.map((s) => { const p = turned(k, mean(P.stickers[s].outline)); return [p[0], -p[1]]; }));
    const cells = toUnitBox(scanCells(f).map((c) => c.at));
    f.stickers.forEach((s, i) => {
      if (P.stickers[s].color !== f.face) fail(`Pyraminx scan face ${k + 1}: sticker ${s} is on another face`);
      if (Math.hypot(seen[i][0] - cells[i][0], seen[i][1] - cells[i][1]) > 0.05) fail(`Pyraminx scan face ${k + 1}: sticker ${s} isn't in cell ${i}`);
    });
  });
  if (new Set(faces.map((f) => f.face)).size !== 4) fail('Pyraminx: every face is scanned once');
  console.log('✓ Pyraminx scan faces line up with the camera');

  // held any way round: scan it turned, and it's turned back
  const scrambled = () => pyraApplyAll(P.solved(), P.scramble());
  checkScans(P, 'Pyraminx', 'puzzle', 500, scrambled, (s) => rotations[Math.floor(Math.random() * rotations.length)].map((src) => s[src]));
  checkAim(P, 'Pyraminx', scrambled);
}
