// Sanity checks for the N×N model and the 2×2 and 4×4 solvers. Run with `npm run verify`.
import { initSolver, solve } from '../src/cube/kociemba/solver';
import { CubeModel } from '../src/cube/model';
import {
  FACELETS, UNSET as UNSET3, applyMove, applyMoves, fromFaceletString, isSolved as isSolved3, parseMove as parseMove3,
  solvedState, toFaceletString, turnPermutation, turnToMove,
} from '../src/cube/model3';
import { validate as validate3 } from '../src/cube/validate3';
import { Reducer4 } from '../src/cube/reduce';
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

// ---------- CubeModel(3) matches the 3×3 model ----------
{
  const M = new CubeModel(3);
  if (M.size !== 54 || FACELETS.some((f, i) => {
    const g = M.facelets[i];
    return g.face !== f.face || !same(g.pos, f.pos.map((x) => 2 * x)) || !same(g.normal, f.normal);
  })) fail('3×3: sticker order differs');

  const tokens: string[] = [];
  for (const l of 'URFDLBMESxyzurfdlb') {
    for (const w of 'URFDLB'.includes(l) ? ['', 'w'] : ['']) for (const suf of ['', "'", '2', "2'"]) tokens.push(l + w + suf);
  }
  for (const tok of tokens) {
    const a = parseMove3(tok), b = M.parseMove(tok);
    if (!a || !b) fail(`3×3: ${tok} parsed as ${a && 'turn'} / ${b && 'turn'}`);
    if (!same(turnPermutation(a), M.permutation(b))) fail(`3×3: ${tok} permutes differently`);
  }
  for (const axis of [0, 1, 2] as const) {
    for (const layer of [-1, 0, 1]) {
      for (let q = -3; q <= 4; q++) {
        const a = turnToMove(axis, layer, q), b = M.moveName({ axis, layers: [2 * layer], quarters: q });
        if (a !== b) fail(`3×3: layer ${axis}/${layer}/${q} named ${a} vs ${b}`);
      }
    }
  }
  console.log(`✓ 3×3: same sticker order, same permutation for ${tokens.length} moves, same names for every dragged layer`);

  const random3 = (length: number) => randomAlg(M, ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'x', 'y', 'z', 'r', 'u', 'Fw'], length);
  const letters = 'URFDLBurfdlb?-X';
  for (let i = 0; i < 300; i++) {
    const s = applyMoves(solvedState(), random3(30));
    if (toFaceletString(s) !== M.encode(s)) fail('3×3: encodings differ');
    const garbage = Array.from({ length: 50 + (i % 8) }, () => letters[(Math.random() * letters.length) | 0]).join('');
    for (const text of [toFaceletString(s), toFaceletString(s).toLowerCase(), garbage]) {
      const a = fromFaceletString(text), b = M.decode(text);
      if (String(a) !== String(b)) fail(`3×3: ${text} decodes differently`);
    }
  }
  console.log('✓ 3×3: same encoding and decoding');

  // Validators agree on scrambled and broken states. `swap` exchanges stickers; the
  // rest reshuffle whole pieces.
  const swap = (s: number[], a: number, b: number) => ([s[a], s[b]] = [s[b], s[a]]);
  const pick = <T>(xs: T[]) => xs[(Math.random() * xs.length) | 0];
  const midges = M.orbits[1].slots.map((x) => x.facelets);
  const corners = M.corners.slots.map((x) => x.facelets);
  const breakers: ((s: number[]) => void)[] = [
    () => {},
    (s) => swap(s, (Math.random() * 54) | 0, (Math.random() * 54) | 0),
    (s) => { const c = pick(corners); [s[c[0]], s[c[1]], s[c[2]]] = [s[c[1]], s[c[2]], s[c[0]]]; },
    (s) => { const e = pick(midges); swap(s, e[0], e[1]); },
    (s) => { const a = pick(midges), b = pick(midges); a.forEach((f, j) => swap(s, f, b[j])); },
    (s) => { const a = pick(corners), b = pick(corners); a.forEach((f, j) => swap(s, f, b[j])); },
    (s) => swap(s, pick(M.fixedCenters), pick(M.fixedCenters)),
    (s) => (s[(Math.random() * 54) | 0] = (Math.random() * 7) | 0),
    (s) => (s[(Math.random() * 54) | 0] = UNSET3),
  ];
  const tally = new Map<string, number>();
  let messagesDiffer = 0;
  for (let i = 0; i < 3000; i++) {
    const s = applyMoves(solvedState(), random3(25));
    breakers[i % breakers.length](s);
    const a = validate3(s), b = M.validate(s);
    const verdict = (v: typeof a) => (v.ok ? 'ok' : v.kind);
    if (verdict(a) !== verdict(b)) fail(`3×3: validators disagree on ${toFaceletString(s)}: ${a.ok || a.message} / ${b.ok || b.message}`);
    tally.set(verdict(a), (tally.get(verdict(a)) ?? 0) + 1);
    if (!a.ok && !b.ok && a.message !== b.message) messagesDiffer++;
  }
  console.log(`✓ 3×3: validators agree on 3000 states (${[...tally].map(([k, v]) => `${v} ${k}`).join(', ')}; ${messagesDiffer} with differently worded messages)`);
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

// ---------- 4×4 ----------
{
  const M = new CubeModel(4);
  let t = Date.now();
  const R = new Reducer4(M);
  console.log(`✓ 4×4 macros built in ${Date.now() - t} ms (${R.macroCount} 3-cycles)`);
  const all = ['U', 'R', 'F', 'D', 'L', 'B', 'Uw', 'Rw', 'Fw', '2U', '2R', '2F', 'x', 'y'];
  let total = 0, worst = 0;
  t = Date.now();
  for (let i = 0; i < 50; i++) {
    const scr = randomAlg(M, all, 50);
    const st = M.applyAll(M.solved(), scr);
    const v = M.validate(st);
    if (!v.ok) fail(`4×4 scramble invalid: ${v.message}`);
    const { moves, cube3 } = R.reduce(M.toFaces(st));
    const reduced = M.toFaces(M.applyAll(st, moves));
    // centers and wings solved?
    for (const o of M.orbits.slice(1)) for (const f of o.slots.flatMap((x) => x.facelets)) if (reduced[f] !== M.facelets[f].face) fail(`4×4 not reduced: ${scr.join(' ')}`);
    if (cube3.length !== 54) fail('bad cube3');
    total += moves.length;
    worst = Math.max(worst, moves.length);
  }
  console.log(`✓ 50 random 4×4 states reduced (${((Date.now() - t) / 50).toFixed(1)} ms avg, ${(total / 50).toFixed(0)} moves avg, longest ${worst})`);

  // full pipeline, as in the worker: reduce, then solve the 3×3 that's left
  initSolver((f) => applyMove(solvedState(), 'URFDLB'[f]));
  total = 0;
  for (let i = 0; i < 20; i++) {
    const scr = randomAlg(M, all, 40);
    const st = M.applyAll(M.solved(), scr);
    const { moves, cube3 } = R.reduce(M.toFaces(st));
    let finish: string[] = [];
    if (!isSolved3(cube3)) {
      const t0 = Date.now();
      solve(cube3, { onSolution: (m) => (finish = m), shouldStop: () => finish.length > 0 && Date.now() - t0 > 200 });
    }
    const sol = M.simplify([...moves, ...finish]);
    if (!M.isSolved(M.applyAll(st, sol))) fail(`4×4 wrong solution for ${scr.join(' ')}`);
    total += sol.length;
  }
  console.log(`✓ 20 random 4×4 states fully solved and verified (${(total / 20).toFixed(0)} moves avg)`);
}
