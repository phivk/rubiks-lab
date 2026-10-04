// Checks every lesson on random scrambles: each must end solved, with its stages in order,
// no empty steps or move groups, and every acronym spelled out.
import type { Guide, State } from '../src/core/types';
import { beginnerGuide } from '../src/cube/beginner';
import { beginner2Guide } from '../src/cube/beginner2';
import { cfopGuide } from '../src/cube/cfop';
import { stepMoves } from '../src/cube/lessonKit';
import { CubeModel } from '../src/cube/model';
import { reductionGuide } from '../src/cube/reduction';
import { rouxGuide } from '../src/cube/roux';
import { zzGuide } from '../src/cube/zz';
import { pyraminxGuide } from '../src/pyraminx/lesson';
import { applyAll as pyraApply, solved as pyraSolved } from '../src/pyraminx/model';
import { scramble as pyraScramble } from '../src/pyraminx/solver';

const RUNS = Number(process.env.RUNS ?? 500);
/** run only the lessons for this puzzle (3x3, 2x2, 4x4, 5x5, pyra) */
const ONLY = process.env.ONLY;
// every acronym a lesson uses must be spelled out somewhere in its text
const ACRONYMS: [RegExp, RegExp][] = [
  [/\bCFOP\b/, /Cross, F2L/],
  [/\bF2L\b/, /First (2|Two) Layers/],
  [/\bOLL\b/, /Orient the Last Layer/],
  [/\bOCLL\b/, /Orient the Corners of the Last Layer/],
  [/\bPLL\b/, /Permute the Last Layer/],
  [/\bCMLL\b/, /Corners of the Last Layer/],
  [/\bLSE\b/, /Last Six Edges/],
  [/\bEOLine\b/, /Edge Orientation/],
];

interface Case {
  puzzle: string;
  guide: Guide;
  /** the i-th scramble */
  scramble: (i: number) => State;
  apply: (s: State, moves: string[]) => State;
  solved: (s: State) => boolean;
  runs: number;
}

const randomMoves = (n: number, faces: string[]) =>
  Array.from({ length: n }, () => faces[(Math.random() * faces.length) | 0] + ['', "'", '2'][(Math.random() * 3) | 0]);
const FACES = [...'URFDLB'];
const cubeCase = (puzzle: string, M: CubeModel, guide: Guide, scramble: (i: number) => string[], runs: number): Case => ({
  puzzle, guide, runs,
  scramble: (i) => M.applyAll(M.solved(), scramble(i)),
  apply: (s, moves) => M.applyAll(s, moves),
  solved: (s) => M.isSolved(s),
});

const M3 = new CubeModel(3);
// the solved cube, a few short scrambles, then long ones
const scramble3 = (i: number) => (i === 0 ? [] : randomMoves(i < 20 ? (i % 4) + 1 : 25, FACES));
const M2 = new CubeModel(2);
const PYRA_SOLVED = pyraSolved();
const cases: Case[] = [
  ...[beginnerGuide(M3), cfopGuide(M3), rouxGuide(M3), zzGuide(M3)].map((g) => cubeCase('3x3', M3, g, scramble3, RUNS)),
  cubeCase('2x2', M2, beginner2Guide(M2), () => randomMoves(25, FACES), RUNS),
  // the big cubes take ~0.3–1 s a lesson, so fewer runs
  ...[4, 5].map((n) => {
    const M = new CubeModel(n);
    return cubeCase(`${n}x${n}`, M, reductionGuide(M), () => randomMoves(n === 4 ? 40 : 60, FACES.flatMap((f) => [f, f + 'w'])), Math.ceil(RUNS / 15));
  }),
  {
    puzzle: 'pyra', guide: pyraminxGuide(), runs: RUNS,
    scramble: () => pyraApply(PYRA_SOLVED, pyraScramble()),
    apply: pyraApply,
    // the lesson ends yellow down, green in front
    solved: (s) => s.every((c, i) => c === PYRA_SOLVED[i]),
  },
];

let anyFailed = false;
for (const c of cases) {
  if (ONLY && c.puzzle !== ONLY) continue;
  const { guide } = c;
  const lengths: number[] = [];
  const stepCounts: number[] = [];
  let failed = 0;
  const t0 = Date.now();
  for (let i = 0; i < c.runs; i++) {
    const start = c.scramble(i);
    try {
      const steps = guide.steps(start);
      const moves = steps.flatMap(stepMoves);
      if (!c.solved(c.apply(start, moves))) throw new Error('not solved');
      if (steps.some((s, k) => k > 0 && s.stage < steps[k - 1].stage)) throw new Error('stages out of order');
      if (steps.some((s) => !s.phrases.length || s.phrases.some((p) => p.moves.length === 0))) throw new Error('empty step or move group');
      const text = steps.map((s) => s.title + ' ' + s.html).join(' ') + ' ' + steps.map((s) => guide.stages[s.stage].name).join(' ');
      const html = steps.map((s) => s.html).join(' ').replace(/<[^>]*>/g, '');
      for (const [word, meaning] of ACRONYMS) if (word.test(text) && !meaning.test(html)) throw new Error(`${word.source} is never spelled out`);
      lengths.push(moves.length);
      stepCounts.push(steps.length);
    } catch (e) {
      failed++;
      if (failed < 5) console.error(`✗ ${c.puzzle} ${guide.name}: ${(e as Error).stack}`);
    }
  }
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`${c.puzzle} ${guide.name}: ${c.runs - failed}/${c.runs} solved in ${Date.now() - t0} ms · avg ${avg(lengths)} moves (max ${Math.max(...lengths)}), avg ${avg(stepCounts)} steps`);
  if (failed) anyFailed = true;
}
if (anyFailed) process.exit(1);
