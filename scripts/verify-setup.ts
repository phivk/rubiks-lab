// Checks step 0 of stage practice: for every method and stage, on random scrambles, there's a
// way to set a real puzzle up from solved that lands exactly on the cube the guided solve starts
// the stage from, and it says how to hold the puzzle. Run with `pnpm verify`.
import { apply, same, setups } from '../src/core/setup';
import type { State } from '../src/core/types';
import { initSolver, solve as kociemba } from '../src/cube/kociemba/solver';
import { stepMoves } from '../src/cube/lessonKit';
import { CUBE3, CubeModel, FACES } from '../src/cube/model';
import { Solver2 } from '../src/cube/solve2';
import { pyraminx } from '../src/pyraminx/puzzle';
import { solveOptimal } from '../src/pyraminx/solver';

// the 3×3 starts its solver worker on load, which Node doesn't have
(globalThis as { Worker?: unknown }).Worker = class { postMessage() {} addEventListener() {} terminate() {} };
const { cube2, cube3, cube4, cube5 } = await import('../src/cube/puzzles');

function fail(msg: string): never {
  console.error('✗ ' + msg);
  process.exit(1);
}

// the solvers Learn asks for a short way there, as the app runs them (on the main thread or in a worker)
initSolver((f) => CUBE3.apply(CUBE3.solved(), FACES[f]));
const model2 = new CubeModel(2);
const solver2 = new Solver2(model2);
const SOLVERS: Record<string, (s: State) => string[] | null> = {
  '2x2': (s) => solver2.solve(model2.toFaces(s)),
  '3x3': (s) => {
    let best: string[] | null = null;
    const t0 = Date.now();
    // a moment to shorten it, but never stopped before it has one
    kociemba(CUBE3.toFaces(s), { onSolution: (m) => (best = m), shouldStop: () => best !== null && Date.now() - t0 > 200 });
    return best;
  },
  pyra: solveOptimal,
};

for (const P of [cube2, cube3, cube4, cube5, pyraminx]) {
  const runs = P === cube4 || P === cube5 ? 2 : 10;
  for (const method of P.methods!) {
    const lengths: number[] = [];
    for (let stage = 0; stage < method.stages.length; stage++) {
      for (let r = 0; r < runs; r++) {
        const scramble = P.scramble();
        const steps = method.solve!(apply(P, P.solved(), scramble));
        const first = steps.findIndex((st) => st.stage >= stage);
        if (first < 0) continue;
        const before = steps.slice(0, first).flatMap(stepMoves);
        const at = apply(P, apply(P, P.solved(), scramble), before);
        const best = setups(P, at, scramble, before, steps.slice(first).flatMap(stepMoves), SOLVERS[P.id]?.(at))[0];
        if (!best) fail(`${P.name} ${method.name} ${method.stages[stage].name}: no way to set it up`);
        if (!same(apply(P, best.from, best.moves), at)) fail(`${P.name} ${method.name}: the setup doesn't land on the stage's cube`);
        if (!P.holdHtml?.(best.from)) fail(`${P.name} ${method.name}: no way to say how to hold it`);
        if (SOLVERS[P.id]) {
          const sol = SOLVERS[P.id](at);
          if (!sol) fail(`${P.name} ${method.name}: the solver found nothing`);
          if (!setups(P, at, [], [], [], sol).length) fail(`${P.name} ${method.name}: the solver's way doesn't land on the stage's cube`);
        }
        lengths.push(best.moves.length);
      }
    }
    const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
    console.log(`✓ ${P.name} ${method.name}: every stage can be set up, avg ${avg} moves (max ${Math.max(...lengths)})${SOLVERS[P.id] ? ', the solver\'s way included' : ''}`);
  }
}
