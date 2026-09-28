// Sanity checks for the N×N model and the 2×2, 4×4 and 5×5 solvers. Run with `npm run verify`.
import { CORNER_FACELETS, EDGE_FACELETS, initSolver, solve } from '../src/cube/kociemba/solver';
import type { Vec3 } from '../src/core/types';
import { CubeModel, FACES } from '../src/cube/model';
import { Reducer } from '../src/cube/reduce';
import { Solver2 } from '../src/cube/solve2';

function fail(msg: string): never {
  console.error('✗ ' + msg);
  process.exit(1);
}
const same = (a: number[], b: number[]) => a.every((x, i) => x === b[i]);

const randomAlg = (M: CubeModel, all: string[], length: number) =>
  Array.from({ length }, () => all[(Math.random() * all.length) | 0] + ['', "'", '2'][(Math.random() * 3) | 0]).filter((m) => M.parseMove(m));

// orbit sizes (slots per orbit, corners first) for each N
const ORBITS: Record<number, number[]> = { 2: [8], 3: [8, 12, 6], 4: [8, 24, 24], 5: [8, 12, 24, 24, 24, 6] };
const MOVES: Record<number, string[]> = {
  2: ['U', 'R', 'F', 'D', 'L', 'B', 'x', 'y', 'z'],
  3: ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'Uw', 'r', '2F', 'x', 'y', 'z'],
  4: ['U', 'R', 'F', 'D', 'L', 'B', 'Uw', 'r', '2F', '2D', '3Rw', 'x', 'y', 'z'],
  5: ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'Uw', 'r', '3Rw', '2F', '2D', '3R', 'x', 'y', 'z'],
};
// how the model names a move, where that differs from how it was typed
const NAMED_AS: Record<string, string> = { r: 'Rw', '2F': 'S', '3R': "M'" };

for (const n of [2, 3, 4, 5]) {
  const M = new CubeModel(n);
  for (const m of MOVES[n]) {
    const t = M.parseMove(m);
    if (!t) fail(`${n}: can't parse ${m}`);
    const expect = (n === 3 || m !== '2F') ? NAMED_AS[m] ?? m : m;
    if (M.moveName(t) !== expect) fail(`${n}: ${m} named ${M.moveName(t)}, expected ${expect}`);
    const perm = M.permutation(t);
    if (new Set(perm).size !== M.size) fail(`${n}: ${m} is not a permutation`);
    const s0 = M.solved();
    if (same(M.apply(s0, m), s0) && !'xyz'.includes(m)) fail(`${n}: ${m} does nothing`);
    if (!same(M.applyAll(s0, [m, m, m, m]), s0)) fail(`${n}: ${m}×4 is not identity`);
    if (!M.isSolved(M.applyAll(s0, [m + "'", m + '2', m + "'"]))) fail(`${n}: ${m}' ${m}2 ${m}' is not identity`);
  }
  // moves that only exist on some sizes, and some that never do
  const legal: [string, boolean][] = [
    ['M', n % 2 === 1], ['2R', n >= 3], ['3R', n >= 5], ['Rw', n >= 3], ['2Rw', n >= 3], ['3Rw', n >= 4], ['4Rw', n >= 5],
    ['rw', false], ['0R', false], ['2x', false], ['2M', false],
  ];
  for (const [m, ok] of legal) if (!M.parseMove(m) !== !ok) fail(`${n}: ${m} ${ok ? 'rejected' : 'accepted'}`);
  // every single layer has a name that parses back to the same turn
  for (const axis of [0, 1, 2] as const) {
    for (const layer of M.coords) {
      for (const quarters of [1, 2, 3]) {
        const name = M.moveName({ axis, layers: [layer], quarters });
        const back = name ? M.parseMove(name) : null;
        if (!back || !same(M.permutation(back), M.permutation({ axis, layers: [layer], quarters }))) fail(`${n}: layer ${axis}/${layer} named ${name}`);
      }
    }
  }
  console.log(`✓ ${n}×${n}: ${M.size} stickers, moves are permutations, every single layer is named`);

  // orbits: the expected shapes, covering every sticker, and moves keep each orbit's sticker order
  if (M.orbits.map((o) => o.slots.length).join() !== ORBITS[n].join()) fail(`${n}: orbits ${M.orbits.map((o) => o.slots.length)}`);
  if (M.orbits.reduce((a, o) => a + o.size * o.slots.length, 0) !== M.size) fail(`${n}: orbits don't cover every sticker`);
  for (const m of MOVES[n]) {
    const perm = M.permutation(M.parseMove(m)!);
    for (const o of M.orbits) {
      for (const slot of o.slots) {
        const src = slot.facelets.map((f) => perm[f]);
        const ok = o.slots.some((x) => x.facelets.some((_, r) => (o.twists || r === 0) && x.facelets.every((f, j) => src[(j + r) % src.length] === f)));
        if (!ok) fail(`${n}: ${m} breaks the sticker order of a (${o.coords}) slot`);
      }
    }
  }
  if (!M.validate(M.solved()).ok) fail(`${n}: solved state invalid`);
  console.log(`✓ ${n}×${n}: orbits ${M.orbits.map((o) => `(${o.coords})×${o.slots.length}${o.twists ? '↻' : ''}`).join(' ')}`);

  // legal scrambles are valid, in any orientation
  for (let i = 0; i < 100; i++) {
    const scr = randomAlg(M, MOVES[n], 40);
    const v = M.validate(M.applyAll(M.solved(), scr));
    if (!v.ok) fail(`${n}: legal scramble rejected: ${v.message} (${scr.join(' ')})`);
  }
  // broken states are rejected
  const broken: [string, (s: number[]) => void][] = [
    ['twisted corner', (s) => { const c = M.corners.slots[0].facelets; [s[c[0]], s[c[1]], s[c[2]]] = [s[c[1]], s[c[2]], s[c[0]]]; }],
  ];
  const midges = M.orbits.find((o) => o.size === 2 && o.twists);
  if (midges) {
    const [a, b] = midges.slots;
    broken.push(['flipped edge', (s) => { const e = a.facelets; [s[e[0]], s[e[1]]] = [s[e[1]], s[e[0]]]; }]);
    broken.push(['two edges swapped', (s) => a.facelets.forEach((f, j) => ([s[f], s[b.facelets[j]]] = [s[b.facelets[j]], s[f]]))]);
  }
  const centers = M.orbits.filter((o) => o.size === 1 && o.slots.length === 24);
  if (centers.length > 1) {
    broken.push(['x- and t-center swapped', (s) => {
      const x = centers[0].slots[0].facelets[0];
      const t = centers[1].slots.find((slot) => s[slot.facelets[0]] !== s[x])!.facelets[0];
      [s[x], s[t]] = [s[t], s[x]];
    }]);
  }
  for (const [what, breakIt] of broken) {
    const s = M.applyAll(M.solved(), randomAlg(M, MOVES[n], 40));
    breakIt(s);
    const v = M.validate(s);
    if (v.ok) fail(`${n}: ${what} accepted`);
    console.log(`✓ ${n}×${n}: ${what} rejected: "${v.message}"`);
  }
}

// ---------- 3×3 ----------
{
  // Kociemba reads corners and edges through fixed facelet tables: they must be the
  // model's corner and midge slots, with the same first sticker (it defines orientation).
  const M = new CubeModel(3);
  const key = (fs: number[]) => fs.join();
  const slots = (o: number) => new Set(M.orbits[o].slots.map((x) => key(x.facelets)));
  const rotations = (fs: number[]) => fs.map((_, r) => key(fs.map((_, j) => fs[(j + r) % fs.length])));
  if (!CORNER_FACELETS.every((fs) => slots(0).has(key(fs)))) fail('3×3: Kociemba corners are not the model\'s corner slots');
  if (!EDGE_FACELETS.every((fs) => slots(1).has(key(fs)))) fail('3×3: Kociemba edges are not the model\'s midge slots');
  if (CORNER_FACELETS.some((fs) => rotations(fs).slice(1).some((k) => slots(0).has(k)))) fail('3×3: corner slot ambiguous');
  console.log('✓ 3×3: Kociemba corner and edge facelets match the model');
}

// ---------- 2×2 ----------
{
  const M = new CubeModel(2);
  const S = new Solver2(M);
  let t = Date.now();
  S.solve(M.toFaces(M.solved()));
  console.log(`✓ 2×2 table built in ${Date.now() - t} ms`);
  for (const [alg, len] of [['R', 1], ["R U R' U'", 4], ['x y', 0], ['L D B', 3]] as const) {
    const st = M.applyAll(M.solved(), M.parseAlg(alg).moves);
    const sol = S.solve(M.toFaces(st));
    if (sol.length !== len || !M.isSolved(M.applyAll(st, sol))) fail(`2×2 ${alg}: got ${sol.join(' ')}`);
  }
  console.log('✓ 2×2 known short cases solved optimally');
  let worst = 0;
  t = Date.now();
  for (let i = 0; i < 300; i++) {
    const scr = [...S.randomState(), ...['x', 'y2', "z'"].slice(0, i % 4)];
    const st = M.applyAll(M.solved(), scr);
    if (!M.validate(st).ok) fail(`2×2 scramble invalid: ${scr.join(' ')}`);
    const sol = S.solve(M.toFaces(st));
    if (!M.isSolved(M.applyAll(st, sol))) fail(`2×2 wrong solution for ${scr.join(' ')}`);
    worst = Math.max(worst, sol.length);
  }
  console.log(`✓ 300 random 2×2 states solved (${((Date.now() - t) / 300).toFixed(2)} ms avg, longest ${worst})`);
}

// ---------- big cubes ----------
const M3 = new CubeModel(3);
initSolver((f) => M3.apply(M3.solved(), FACES[f]));
const BIG_MOVES: Record<number, string[]> = {
  4: ['U', 'R', 'F', 'D', 'L', 'B', 'Uw', 'Rw', 'Fw', '2U', '2R', '2F', 'x', 'y'],
  5: ['U', 'R', 'F', 'D', 'L', 'B', 'Uw', 'Rw', 'Fw', '3Rw', '2U', '2R', '2F', 'M', 'E', 'S', 'x', 'y'],
};
for (const n of [4, 5]) {
  const M = new CubeModel(n);
  const N = `${n}×${n}`;
  let t = Date.now();
  const R = new Reducer(M);
  console.log(`✓ ${N} macros built in ${Date.now() - t} ms (${R.macroCount} 3-cycles)`);
  const reducible = M.orbits.filter((o) => !o.twists && o.slots.length > 6);
  let total = 0, worst = 0;
  t = Date.now();
  for (let i = 0; i < 50; i++) {
    const scr = randomAlg(M, BIG_MOVES[n], 60);
    const st = M.applyAll(M.solved(), scr);
    const v = M.validate(st);
    if (!v.ok) fail(`${N} scramble invalid: ${v.message}`);
    const { moves, cube3 } = R.reduce(M.toFaces(st));
    const reduced = M.toFaces(M.applyAll(st, moves));
    // centers solved; wings solved on an even cube, matching their edge's midge on an odd one
    const midgeSticker = (f: number) => M.faceletAt(M.facelets[f].pos.map((x) => (Math.abs(x) === n - 1 ? x : 0)) as Vec3, M.facelets[f].normal)!;
    for (const o of reducible) {
      for (const f of o.slots.flatMap((x) => x.facelets)) {
        const want = o.size === 2 && n % 2 ? reduced[midgeSticker(f)] : M.facelets[f].face;
        if (reduced[f] !== want) fail(`${N} not reduced: ${scr.join(' ')}`);
      }
    }
    if (!M3.validate(cube3).ok) fail(`${N} reduced to an invalid 3×3: ${M3.validate(cube3).ok || M3.validate(cube3).message}`);
    total += moves.length;
    worst = Math.max(worst, moves.length);
  }
  console.log(`✓ 50 random ${N} states reduced to valid 3×3s (${((Date.now() - t) / 50).toFixed(1)} ms avg, ${(total / 50).toFixed(0)} moves avg, longest ${worst})`);

  // full pipeline, as in the worker: reduce, then solve the 3×3 that's left
  total = 0;
  worst = 0;
  for (let i = 0; i < 20; i++) {
    const scr = randomAlg(M, BIG_MOVES[n], 60);
    const st = M.applyAll(M.solved(), scr);
    const { moves, cube3 } = R.reduce(M.toFaces(st));
    let finish: string[] = [];
    if (!M3.isSolved(cube3)) {
      const t0 = Date.now();
      solve(cube3, { onSolution: (m) => (finish = m), shouldStop: () => finish.length > 0 && Date.now() - t0 > 200 });
    }
    const sol = M.simplify([...moves, ...finish]);
    if (!M.isSolved(M.applyAll(st, sol))) fail(`${N} wrong solution for ${scr.join(' ')}`);
    total += sol.length;
    worst = Math.max(worst, sol.length);
  }
  console.log(`✓ 20 random ${N} states fully solved and verified (${(total / 20).toFixed(0)} moves avg, longest ${worst})`);
}
try {
  new Reducer(new CubeModel(6));
  fail('6×6 reducer built without telling oblique orbits apart');
} catch (e) {
  console.log(`✓ 6×6 reducer refused: "${(e as Error).message}"`);
}
