// Checks the CFOP tutorial: every algorithm solves its case's setup, each stage's setups keep
// the earlier stages solved and need this one, the F2L cases are all different and cover all
// 41, and every picture draws.
import { lessonKit, U_TURNS } from '../src/cube/lessonKit';
import { CubeModel } from '../src/cube/model';
import { cfopTutorial } from '../src/cube/tutorial';

const M = new CubeModel(3);
const K = lessonKit(M);
const T = cfopTutorial(M);
const home = K.apply(M.solved(), ['z2']);
const crossEdges = [...'FRBL'].flatMap((f) => K.stickersOf('D' + f));
const slots = ['FR', 'RB', 'BL', 'LF'].map((p) => [...K.stickersOf(p), ...K.stickersOf('D' + p)]);
const f2lStickers = [...crossEdges, ...slots.flat(), ...[...'FRBLD'].map((f) => K.at(f, f))];
const same = (s: number[], idx: number[]) => idx.every((i) => s[i] === home[i]);
const topYellow = (s: number[]) => home.every((_, i) => M.facelets[i].normal[1] !== 1 || s[i] === K.center(s, 'U'));

let fails = 0;
const fail = (msg: string) => { fails++; console.log('FAIL', msg); };
const [cross, f2l, oll, pll] = T.steps;
for (const step of T.steps) {
  for (const g of step.groups) {
    if (!g.cases.length) fail(`${step.name}: empty group ${g.name}`);
    for (const c of g.cases) {
      if (!M.isSolved(K.apply(c.setup, c.moves))) fail(`${c.name}: doesn't solve its setup`);
      if (M.isSolved(c.setup)) fail(`${c.name}: already solved`);
      if (!step.diagram(c).startsWith('<svg')) fail(`${c.name}: no picture`);
      if (!step.focus(c.setup).length) fail(`${c.name}: nothing in focus`);
      for (const m of c.moves) if (!M.parseMove(m)) fail(`${c.name}: bad move ${m}`);
      if (step === cross && !same(c.setup, K.stickersOf('DR').concat(K.stickersOf('DB'), K.stickersOf('DL')))) fail(`${c.name}: moves another cross edge`);
      if (step === f2l && !same(c.setup, [...crossEdges, ...slots.slice(1).flat()])) fail(`${c.name}: disturbs the cross or another slot`);
      if (step === oll && (!same(c.setup, f2lStickers) || topYellow(c.setup))) fail(`${c.name}: not an OLL case`);
      if (step === pll && (!same(c.setup, f2lStickers) || !topYellow(c.setup) || U_TURNS.some((u) => M.isSolved(K.apply(c.setup, [u]))))) fail(`${c.name}: not a PLL case`);
    }
  }
}
// the 41 F2L cases: where the pair's corner and edge are, up to a turn of the top
const white = K.center(home, 'D'), F = K.center(home, 'F'), R = K.center(home, 'R');
const keys = new Set(f2l.groups.flatMap((g) => g.cases).map((c) => U_TURNS.map((u) => {
  const t = K.apply(c.setup, [u]);
  return K.stickerOf(t, [white, F, R], white) + ',' + K.stickerOf(t, [F, R], F);
}).sort()[0]));
const count = (s: typeof cross) => s.groups.reduce((n, g) => n + g.cases.length, 0);
if (keys.size !== 41 || count(f2l) !== 41) fail(`F2L: ${keys.size} different cases in ${count(f2l)}`);
if (count(oll) !== 57) fail(`OLL: ${count(oll)} cases`);
if (count(pll) !== 21) fail(`PLL: ${count(pll)} cases`);
console.log(`tutorial: ${T.steps.map((s) => `${s.name} ${count(s)}`).join(', ')}${fails ? ` — ${fails} failures` : ' — all ok'}`);
if (fails) process.exit(1);
