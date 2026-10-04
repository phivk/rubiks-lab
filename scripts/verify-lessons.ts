// Checks every 3×3 lesson (beginner, CFOP, Roux, ZZ) on random scrambles: each must end
// solved, with its stages in order, no empty move groups, and every acronym spelled out.
import { beginnerGuide } from '../src/cube/beginner';
import { cfopGuide } from '../src/cube/cfop';
import { rouxGuide } from '../src/cube/roux';
import { zzGuide } from '../src/cube/zz';
import { stepMoves } from '../src/cube/lessonKit';
import { CubeModel } from '../src/cube/model';

const M = new CubeModel(3);
const MOVES = ['U', 'R', 'F', 'D', 'L', 'B'];
const scramble = (n: number) => Array.from({ length: n }, () => MOVES[(Math.random() * 6) | 0] + ['', "'", '2'][(Math.random() * 3) | 0]);
const RUNS = Number(process.env.RUNS ?? 500);
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

let anyFailed = false;
for (const guide of [beginnerGuide(M), cfopGuide(M), rouxGuide(M), zzGuide(M)]) {
  const lengths: number[] = [];
  const stepCounts: number[] = [];
  let failed = 0;
  const t0 = Date.now();
  for (let i = 0; i < RUNS; i++) {
    const alg = i === 0 ? [] : scramble(i < 20 ? (i % 4) + 1 : 25);
    const start = M.applyAll(M.solved(), alg);
    try {
      const steps = guide.steps(start);
      const moves = steps.flatMap(stepMoves);
      if (!M.isSolved(M.applyAll(start, moves))) throw new Error('not solved');
      if (steps.some((s, k) => k > 0 && s.stage < steps[k - 1].stage)) throw new Error('stages out of order');
      if (steps.some((s) => s.phrases.some((p) => p.moves.length === 0))) throw new Error('empty phrase');
      const text = steps.map((s) => s.title + ' ' + s.html).join(' ') + ' ' + steps.map((s) => guide.stages[s.stage].name).join(' ');
      const html = steps.map((s) => s.html).join(' ').replace(/<[^>]*>/g, '');
      for (const [word, meaning] of ACRONYMS) if (word.test(text) && !meaning.test(html)) throw new Error(`${word.source} is never spelled out`);
      lengths.push(moves.length);
      stepCounts.push(steps.length);
    } catch (e) {
      failed++;
      if (failed < 5) console.error(`✗ ${guide.name}: ${alg.join(' ')}: ${(e as Error).stack}`);
    }
  }
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`${guide.name}: ${RUNS - failed}/${RUNS} solved in ${Date.now() - t0} ms · avg ${avg(lengths)} moves (max ${Math.max(...lengths)}), avg ${avg(stepCounts)} steps`);
  if (failed) anyFailed = true;
}
if (anyFailed) process.exit(1);
