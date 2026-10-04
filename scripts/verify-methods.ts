// Checks the CFOP, Roux and ZZ lessons on random scrambles: every lesson must end solved,
// with its stages in order and no empty move groups.
import { cfopGuide } from '../src/cube/cfop';
import { rouxGuide } from '../src/cube/roux';
import { zzGuide } from '../src/cube/zz';
import { CubeModel } from '../src/cube/model';
import type { Guide } from '../src/core/types';

const M = new CubeModel(3);
const MOVES = ['U', 'R', 'F', 'D', 'L', 'B'];
const scramble = (n: number) => Array.from({ length: n }, () => MOVES[(Math.random() * 6) | 0] + ['', "'", '2'][(Math.random() * 3) | 0]);
const RUNS = Number(process.env.RUNS ?? 300);

let anyFailed = false;
for (const guide of [cfopGuide(M), rouxGuide(M), zzGuide(M)] as Guide[]) {
  const lengths: number[] = [];
  const stepCounts: number[] = [];
  let failed = 0;
  const t0 = Date.now();
  for (let i = 0; i < RUNS; i++) {
    const alg = i === 0 ? [] : scramble(i < 20 ? (i % 4) + 1 : 25);
    const start = M.applyAll(M.solved(), alg);
    try {
      const steps = guide.steps(start);
      const moves = steps.flatMap((s) => s.phrases.flatMap((p) => p.moves));
      if (!M.isSolved(M.applyAll(start, moves))) throw new Error('not solved');
      if (steps.some((s, k) => k > 0 && s.stage < steps[k - 1].stage)) throw new Error('stages out of order');
      if (steps.some((s) => s.phrases.some((p) => p.moves.length === 0))) throw new Error('empty phrase');
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
