// Sanity checks for the 2×2 and 4×4 models and solvers. Run with `npm run verify`.
import { CubeModel } from '../src/nxn/model';
import { Solver2 } from '../src/nxn/solver2';
import { Reducer4 } from '../src/nxn/reduction';
import { applyMove, isSolved as isSolved3, solvedState } from '../src/cube/model';
import { initSolver, solve } from '../src/cube/solver';

function fail(msg: string): never {
  console.error('✗ ' + msg);
  process.exit(1);
}
const same = (a: number[], b: number[]) => a.every((x, i) => x === b[i]);

for (const n of [2, 4]) {
  const M = new CubeModel(n);
  const names = n === 2 ? ['U', 'R', 'F', 'D', 'L', 'B', 'x', 'y', 'z'] : ['U', 'R', 'F', 'D', 'L', 'B', 'Uw', 'r', '2F', '2D', 'x', 'y', 'z'];
  for (const m of names) {
    const t = M.parseMove(m);
    if (!t) fail(`${n}: can't parse ${m}`);
    if (M.moveName(t) !== m.replace('r', 'Rw')) fail(`${n}: ${m} named ${M.moveName(t)}`);
    const perm = M.permutation(t);
    if (new Set(perm).size !== M.size) fail(`${n}: ${m} is not a permutation`);
    const s0 = M.solved();
    if (same(M.apply(s0, m), s0) && !'xyz'.includes(m)) fail(`${n}: ${m} does nothing`);
    if (!same(M.applyAll(s0, [m, m, m, m]), s0)) fail(`${n}: ${m}×4 is not identity`);
    if (!M.isSolved(M.applyAll(s0, [m + "'", m + '2', m + "'"]))) fail(`${n}: ${m}' ${m}2 ${m}' is not identity`);
  }
  // wings keep their sticker order under every move
  const firsts = new Set(M.wings.map((w) => w.facelets[0]));
  for (const m of names) {
    const perm = M.permutation(M.parseMove(m)!);
    for (const w of M.wings) if (!firsts.has(perm[w.facelets[0]])) fail(`${n}: ${m} flips a wing`);
  }
  if (!M.validate(M.solved()).ok) fail(`${n}: solved state invalid`);
  console.log(`✓ ${n}×${n}: ${M.size} stickers, moves are permutations and wings never flip`);

  // twisted corner rejected
  const s = M.solved();
  const c = M.corners[0].facelets;
  [s[c[0]], s[c[1]], s[c[2]]] = [s[c[1]], s[c[2]], s[c[0]]];
  const v = M.validate(s);
  if (v.ok) fail(`${n}: twisted corner accepted`);
  console.log(`✓ ${n}×${n}: twisted corner rejected: "${v.message}"`);
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
  const randomAlg = (length: number) => Array.from({ length }, () => all[(Math.random() * all.length) | 0] + ['', "'", '2'][(Math.random() * 3) | 0]);
  let total = 0, worst = 0;
  t = Date.now();
  for (let i = 0; i < 50; i++) {
    const scr = randomAlg(50);
    const st = M.applyAll(M.solved(), scr);
    const v = M.validate(st);
    if (!v.ok) fail(`4×4 scramble invalid: ${v.message}`);
    const { moves, cube3 } = R.reduce(M.toFaces(st));
    const reduced = M.toFaces(M.applyAll(st, moves));
    // centers and wings solved?
    for (const s of [...M.centers, ...M.wings]) for (const f of s.facelets) if (reduced[f] !== M.facelets[f].face) fail(`4×4 not reduced: ${scr.join(' ')}`);
    if (cube3.length !== 54) fail('bad cube3');
    total += moves.length;
    worst = Math.max(worst, moves.length);
  }
  console.log(`✓ 50 random 4×4 states reduced (${((Date.now() - t) / 50).toFixed(1)} ms avg, ${(total / 50).toFixed(0)} moves avg, longest ${worst})`);

  // full pipeline, as in the worker: reduce, then solve the 3×3 that's left
  initSolver((f) => applyMove(solvedState(), 'URFDLB'[f]));
  total = 0;
  for (let i = 0; i < 20; i++) {
    const scr = randomAlg(40);
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
