// Checks the 2×2, 4×4, 5×5 and Pyraminx lessons on random scrambles: each must end solved,
// with its stages in order and no empty steps or move groups.
import type { Guide, State } from '../src/core/types';
import { beginner2Guide } from '../src/cube/beginner2';
import { reductionGuide } from '../src/cube/reduction';
import { stepMoves } from '../src/cube/lessonKit';
import { CubeModel } from '../src/cube/model';
import { solved as pyraSolvedState } from '../src/pyraminx/model';
import { pyraminxGuide } from '../src/pyraminx/lesson';
import { applyAll as pyraApply } from '../src/pyraminx/model';
import { scramble as pyraScramble } from '../src/pyraminx/solver';

const PYRA_SOLVED = pyraSolvedState();
const RUNS = Number(process.env.RUNS ?? 300);
const ONLY = process.env.ONLY;

interface Case { name: string; guide: Guide; scramble: () => State; apply: (s: State, m: string[]) => State; solved: (s: State) => boolean; runs: number }
const cases: Case[] = [];

const randomMoves = (n: number, faces: string[]) => Array.from({ length: n }, () => faces[(Math.random() * faces.length) | 0] + ['', "'", '2'][(Math.random() * 3) | 0]);

const M2 = new CubeModel(2);
cases.push({ name: '2x2', guide: beginner2Guide(M2), scramble: () => M2.applyAll(M2.solved(), randomMoves(25, [...'URFDLB'])), apply: (s, m) => M2.applyAll(s, m), solved: (s) => M2.isSolved(s), runs: RUNS });

cases.push({ name: 'pyra', guide: pyraminxGuide(), scramble: () => pyraApply(PYRA_SOLVED, pyraScramble()), apply: pyraApply, solved: (s) => s.join() === PYRA_SOLVED.join(), runs: RUNS });

for (const n of [4, 5]) {
  const M = new CubeModel(n);
  const wide = [...'URFDLB'].flatMap((f) => [f, f + 'w']);
  cases.push({ name: `${n}x${n}`, guide: reductionGuide(M), scramble: () => M.applyAll(M.solved(), randomMoves(n === 4 ? 40 : 60, wide)), apply: (s, m) => M.applyAll(s, m), solved: (s) => M.isSolved(s), runs: Math.ceil(RUNS / 10) });
}

let anyFailed = false;
for (const c of cases) {
  if (ONLY && c.name !== ONLY) continue;
  const lengths: number[] = [];
  const stepCounts: number[] = [];
  let failed = 0;
  const t0 = Date.now();
  for (let i = 0; i < c.runs; i++) {
    const start = c.scramble();
    try {
      const steps = c.guide.steps(start);
      const moves = steps.flatMap(stepMoves);
      if (!c.solved(c.apply(start, moves))) throw new Error('not solved');
      if (steps.some((s, k) => k > 0 && s.stage < steps[k - 1].stage)) throw new Error('stages out of order');
      if (steps.some((s) => !s.phrases.length || s.phrases.some((p) => p.moves.length === 0))) throw new Error('empty step or phrase');
      lengths.push(moves.length);
      stepCounts.push(steps.length);
    } catch (e) {
      failed++;
      if (failed < 4) console.error(`✗ ${c.name}: ${(e as Error).stack}`);
    }
  }
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`${c.name} ${c.guide.name}: ${c.runs - failed}/${c.runs} solved in ${Date.now() - t0} ms · avg ${avg(lengths)} moves (max ${Math.max(...lengths)}), avg ${avg(stepCounts)} steps`);
  if (failed) anyFailed = true;
}
if (anyFailed) process.exit(1);
