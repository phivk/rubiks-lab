// Checks for camera scanning on the N×N cubes: the scan faces' sticker order matches what a
// camera sees, and simulated photos of scrambled cubes read back as the right state.
// Run with `npm run verify`.
import type { Puzzle } from '../src/core/types';
import { cross, dot, mean } from '../src/core/vec';
import { CubeModel } from '../src/cube/model';
import { TYPICAL, calibrate, calibrateBlind, nearest, scanState, type RGB } from '../src/scan/classify';

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
function photo(P: Puzzle, state: number[], webcam = false): RGB[][] {
  const shade = TYPICAL.map((c) => c.map((x) => x + rand(-15, 15)) as RGB);
  const tint = webcam ? [rand(0.85, 1), rand(0.6, 0.8), rand(0.5, 0.75)] : [rand(0.9, 1.1), rand(0.9, 1.1), rand(0.85, 1.1)];
  const dim = webcam ? rand(0.6, 0.8) : 1;
  return P.scan!.map((f) => {
    const light = dim * (webcam ? rand(0.85, 1.1) : rand(0.65, 1.15));
    return f.stickers.map((s) => shade[state[s]].map((x, k) => clamp(x * light * tint[k] + rand(-12, 12))) as RGB);
  });
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
  const TRIALS = Math.round(1500 / n);
  for (const webcam of [false, true]) {
    let exact = 0, misread = 0;
    for (let t = 0; t < TRIALS; t++) {
      const state = M.applyAll(P.solved(), [...P.scramble(), ...turn]);
      const read = scanState(P, photo(P, state, webcam));
      const wrong = read.filter((c, i) => c !== state[i]).length;
      if (!wrong) exact++;
      misread += wrong;
    }
    // the simulation is harsher than a real cube in decent light; a few misreads are what paint mode is for
    const pct = 100 * misread / (TRIALS * P.stickers.length), limit = webcam ? 2 : 0.3;
    const what = `${exact} of ${TRIALS} ${P.name} simulated scans${webcam ? ' on a dim webcam' : ''} read back exactly, and ${pct.toFixed(2)}% of stickers misread`;
    if (pct > limit) fail(what);
    console.log(`✓ ${what}`);
  }

  // While aiming, each face is read against the faces captured before it and itself,
  // before any of the later ones are known.
  for (const webcam of [false, true]) {
    let misread = 0, total = 0;
    for (let t = 0; t < 200; t++) {
      const state = M.applyAll(P.solved(), P.scramble());
      const pic = photo(P, state, webcam);
      faces.forEach((f, k) => {
        const refs = f.center === undefined ? calibrateBlind(pic.slice(0, k + 1).flat()) : calibrate(
          faces.slice(0, k + 1).reduce<RGB[]>((seen, g, j) => { seen[g.face] = pic[j][g.center!]; return seen; }, []),
        );
        f.stickers.forEach((s, i) => { total++; if (nearest(pic[k][i], refs) !== state[s]) misread++; });
      });
    }
    const pct = 100 * misread / total, limit = webcam ? 10 : 1;
    const what = `the ${P.name} live preview misreads ${pct.toFixed(1)}% of stickers${webcam ? ' on a dim webcam' : ''}`;
    if (pct > limit) fail(what);
    console.log(`✓ ${what}`);
  }
}
