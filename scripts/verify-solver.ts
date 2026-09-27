// Sanity check: scramble many random states and confirm every solver answer really solves the cube.
// Run with `npm run verify`.
import { initSolver, solve } from '../src/cube/kociemba/solver';
import { applyMove, applyMoves, isSolved, parseAlg, solvedState } from '../src/cube/model3';
import { validate } from '../src/cube/validate3';

const t = Date.now();
initSolver((f) => applyMove(solvedState(), 'URFDLB'[f]));
console.log(`tables built in ${Date.now() - t} ms`);

const MOVES = ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'x', 'y', 'z', 'r', 'u'];
const cases: [string, string[], number?][] = [
  ['R U', parseAlg('R U').moves, 2],
  ['U R2', parseAlg('U R2').moves, 2],
  ['sexy move', parseAlg("R U R' U'").moves, 4],
  ['with slices + rotations', parseAlg("R U R' U' M2 x y S E'").moves],
];
for (let i = 0; i < 20; i++) {
  cases.push([`random #${i + 1}`, Array.from({ length: 30 }, () => MOVES[(Math.random() * MOVES.length) | 0] + ['', "'", '2'][(Math.random() * 3) | 0])]);
}

let failed = 0;
for (const [name, scramble, expected] of cases) {
  const state = applyMoves(solvedState(), scramble);
  if (!validate(state).ok) throw new Error(`${name}: scramble produced an invalid state`);
  const faceOfColor: number[] = [];
  for (let f = 0; f < 6; f++) faceOfColor[state[f * 9 + 4]] = f;
  let best: string[] = [];
  const t0 = Date.now();
  const result = solve(state.map((c) => faceOfColor[c]), {
    onSolution: (m) => (best = m),
    shouldStop: () => Date.now() - t0 > 1000,
  });
  const ok = isSolved(applyMoves(state, best)) && (expected === undefined || (result === 'optimal' && best.length === expected));
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(24)} ${String(best.length).padStart(2)} moves  ${result}`);
}
if (failed) {
  console.error(`${failed} case(s) failed`);
  process.exit(1);
}
