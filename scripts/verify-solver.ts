// Sanity check: scramble many random states and confirm every solver answer really solves the cube.
// Run with `npm run verify`.
import { initSolver, solve } from '../src/cube/kociemba/solver';
import { CubeModel, FACES } from '../src/cube/model';

const M = new CubeModel(3);
const t = Date.now();
initSolver((f) => M.apply(M.solved(), FACES[f]));
console.log(`tables built in ${Date.now() - t} ms`);

const MOVES = ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'x', 'y', 'z', 'r', 'u'];
const cases: [string, string[], number?][] = [
  ['R U', M.parseAlg('R U').moves, 2],
  ['U R2', M.parseAlg('U R2').moves, 2],
  ['sexy move', M.parseAlg("R U R' U'").moves, 4],
  ['with slices + rotations', M.parseAlg("R U R' U' M2 x y S E'").moves],
];
for (let i = 0; i < 20; i++) {
  cases.push([`random #${i + 1}`, Array.from({ length: 30 }, () => MOVES[(Math.random() * MOVES.length) | 0] + ['', "'", '2'][(Math.random() * 3) | 0])]);
}

let failed = 0;
for (const [name, scramble, expected] of cases) {
  const state = M.applyAll(M.solved(), scramble);
  if (!M.validate(state).ok) throw new Error(`${name}: scramble produced an invalid state`);
  let best: string[] = [];
  const t0 = Date.now();
  const result = solve(M.toFaces(state), {
    onSolution: (m) => (best = m),
    shouldStop: () => Date.now() - t0 > 1000,
  });
  const ok = M.isSolved(M.applyAll(state, best)) && (expected === undefined || (result === 'optimal' && best.length === expected));
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(24)} ${String(best.length).padStart(2)} moves  ${result}`);
}
if (failed) {
  console.error(`${failed} case(s) failed`);
  process.exit(1);
}
