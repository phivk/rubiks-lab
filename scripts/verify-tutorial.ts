// Checks the CFOP tutorial: every algorithm solves its case's setup (the stickers it shows end
// up home, and the blanked ones are only ones it doesn't show), each stage's setups keep
// the earlier stages solved and need this one, the F2L cases are all different and cover all
// 41, and the PLL arrows join top stickers.
import { lessonKit, U_TURNS } from '../src/cube/lessonKit';
import { CubeModel, invertAlg, UNSET } from '../src/cube/model';
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
      const full = K.apply(home, invertAlg(c.moves));
      if (c.setup.some((x, i) => x !== UNSET && x !== full[i])) fail(`${c.name}: setup doesn't match its algorithm`);
      const end = K.apply(c.setup, c.moves);
      if (end.some((x, i) => x !== UNSET && x !== home[i])) fail(`${c.name}: doesn't solve its setup`);
      if (M.isSolved(full)) fail(`${c.name}: already solved`);
      const tops = new Set(['UF', 'UR', 'UB', 'UL', 'UFR', 'URB', 'UBL', 'ULF'].map((slot) => K.at(slot, 'U')));
      const arrows = step.arrows?.(c) ?? [];
      if (step === pll && (!arrows.length || arrows.some(([a, b]) => a === b || !tops.has(a) || !tops.has(b)))) fail(`${c.name}: bad arrows`);
      if (step.focus && !step.focus(c.setup).length) fail(`${c.name}: nothing in focus`);
      for (const m of c.moves) if (!M.parseMove(m)) fail(`${c.name}: bad move ${m}`);
      if (step === cross && !same(full, K.stickersOf('DR').concat(K.stickersOf('DB'), K.stickersOf('DL')))) fail(`${c.name}: moves another cross edge`);
      if (step === f2l && !same(full, [...crossEdges, ...slots.slice(1).flat()])) fail(`${c.name}: disturbs the cross or another slot`);
      if (step === oll && (!same(full, f2lStickers) || topYellow(full))) fail(`${c.name}: not an OLL case`);
      if (step === pll && (!same(full, f2lStickers) || !topYellow(full) || U_TURNS.some((u) => M.isSolved(K.apply(full, [u]))))) fail(`${c.name}: not a PLL case`);
    }
  }
}
// the 41 F2L cases: where the pair's corner and edge are, up to a turn of the top
const white = K.center(home, 'D'), F = K.center(home, 'F'), R = K.center(home, 'R');
const f2lCases = f2l.groups.flatMap((g) => g.cases);
const keys = new Set(f2lCases.map((c) => U_TURNS.map((u) => {
  const t = K.apply(K.apply(home, invertAlg(c.moves)), [u]);
  return K.stickerOf(t, [white, F, R], white) + ',' + K.stickerOf(t, [F, R], F);
}).sort()[0]));
const count = (s: typeof cross) => s.groups.reduce((n, g) => n + g.cases.length, 0);
if (keys.size !== 41 || count(f2l) !== 41) fail(`F2L: ${keys.size} different cases in ${count(f2l)}`);
console.log(`tutorial: ${T.steps.map((s) => `${s.name} ${count(s)}`).join(', ')}${fails ? ` — ${fails} failures` : ' — all ok'}`);
if (fails) process.exit(1);
