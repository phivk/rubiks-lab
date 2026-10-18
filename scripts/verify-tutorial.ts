// Checks every case of every method's course, and the case sets they come from (cases.ts).
//
// Every method: each case's algorithm solves its setup (whatever stickers it shows end up on
// faces of one color), its moves are moves, its id is its own, and no case group is empty.
//
// CFOP: every algorithm solves its case's setup (the stickers it shows end up home, and the
// blanked ones are only ones it doesn't show), each stage's setups keep the earlier stages
// solved and need this one, the F2L cases are all different, the F2L notes that point to
// another case are right, OLL and PLL each take two looks whose cases cover every situation
// between them, and the PLL arrows join top stickers.
//
// Full OLL and PLL: 57 and 21 cases, each one a case of its kind that its algorithm finishes,
// and no algorithm finishes another's case.
//
// Beginner: each case is one its stage meets, the guided solve does exactly its algorithm on
// it, and names it.
import type { Case, GuideStep, Method } from '../src/core/types';
import { beginnerMethod, beginnerStages } from '../src/cube/beginner';
import { beginner2Method } from '../src/cube/beginner2';
import { allCases, cubeCases } from '../src/cube/cases';
import { cfopMethod } from '../src/cube/cfop';
import { lessonKit, ROTATIONS, TOP_CORNERS as TOP_C, TOP_EDGES as TOP_E, U_TURNS } from '../src/cube/lessonKit';
import { CubeModel, invertAlg, UNSET } from '../src/cube/model';
import { reductionMethod } from '../src/cube/reduction';
import { rouxMethod } from '../src/cube/roux';
import { zzMethod } from '../src/cube/zz';

const M = new CubeModel(3);
const K = lessonKit(M);
const C = cubeCases(M);
const cfop = cfopMethod(M);
const home = K.apply(M.solved(), ['z2']);
const crossEdges = [...'FRBL'].flatMap((f) => K.stickersOf('D' + f));
const slots = ['FR', 'RB', 'BL', 'LF'].map((p) => [...K.stickersOf(p), ...K.stickersOf('D' + p)]);
const f2lStickers = [...crossEdges, ...slots.flat(), ...[...'FRBLD'].map((f) => K.at(f, f))];
const same = (s: number[], idx: number[]) => idx.every((i) => s[i] === home[i]);
const topYellow = (s: number[]) => home.every((_, i) => M.facelets[i].normal[1] !== 1 || s[i] === K.center(s, 'U'));

let fails = 0;
const fail = (msg: string) => { fails++; console.log('FAIL', msg); };
const course = cfop.stages.map((st) => ({ ...st, groups: st.caseGroups ?? [] }));
const [cross, f2l, oll, pll] = course;
const tops = new Set([...TOP_E, ...TOP_C].map((slot) => K.at(slot, 'U')));
/** each case's setup before any stickers were blanked */
const fullOf = new Map(course.flatMap((step) => step.groups.flatMap((g) => g.cases)).map((c) => [c, K.apply(home, invertAlg(c.moves))]));
for (const step of course) {
  for (const g of step.groups) {
    if (!g.cases.length) fail(`${step.name}: empty group ${g.name}`);
    for (const c of g.cases) {
      const full = fullOf.get(c)!;
      if (c.setup.some((x, i) => x !== UNSET && x !== full[i])) fail(`${c.name}: setup doesn't match its algorithm`);
      const end = K.apply(c.setup, c.moves);
      if (end.some((x, i) => x !== UNSET && x !== home[i])) fail(`${c.name}: doesn't solve its setup`);
      if (M.isSolved(full)) fail(`${c.name}: already solved`);
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
// F2L notes that point to another case ("…, which leaves <case>", "…, and U then leaves <case>",
// "… brings them together as <case>"): the note's opening moves, from this case's setup, leave
// a position that case's algorithm solves after a turn of the top
const f2lByName = new Map(f2l.groups.flatMap((g) => g.cases).map((c) => [c.name, c]));
for (const c of f2lByName.values()) {
  if (!c.note || !/\bleaves\b|together as/.test(c.note)) continue;
  const m = c.note.match(/^(?<lead>.+?)(?:, which leaves|, and (?<then>U) then leaves| brings them together as) (?<name>.+)\.$/)?.groups;
  if (!m) { fail(`${c.name}: can't read the note`); continue; }
  const { name } = m;
  const words = m.lead.replaceAll('′', "'").split(' ');
  const end = words.findIndex((w) => !M.parseMove(w));
  const moves = end < 0 ? words : words.slice(0, end);
  if (m.then) moves.push(m.then);
  const target = f2lByName.get(name);
  if (!moves.length) fail(`${c.name}: no moves at the start of the note`);
  else if (!target) fail(`${c.name}: the note names ${name}, which isn't an F2L case`);
  else {
    const t = K.apply(fullOf.get(c)!, moves);
    if (!U_TURNS.some((u) => same(K.apply(t, [u, ...target.moves]), f2lStickers))) fail(`${c.name}: ${moves.join(' ')} doesn't leave ${name}`);
  }
}

// the F2L cases: where the pair's corner and edge are, up to a turn of the top
const white = K.center(home, 'D'), F = K.center(home, 'F'), R = K.center(home, 'R');
const f2lCases = f2l.groups.flatMap((g) => g.cases);
const keys = new Set(f2lCases.map((c) => U_TURNS.map((u) => {
  const t = K.apply(fullOf.get(c)!, [u]);
  return K.stickerOf(t, [white, F, R], white) + ',' + K.stickerOf(t, [F, R], F);
}).sort()[0]));

// two-look OLL and PLL: each case needs its look and finishes it, and each look's cases are
// all different (up to turning the top, or the whole cube) and cover every situation
const yellow = K.center(home, 'U');
const edgesUp = (s: number[]) => TOP_E.filter((e) => s[K.at(e, 'U')] === yellow).length;
const placed = (s: number[], at: string[]) => at.every((slot) => K.placed(s, slot));
const upTo = (s: number[], ok: (t: number[]) => boolean) => U_TURNS.some((u) => ok(K.apply(s, [u])));
/** a key for `s` that's the same however the cube is held (around the vertical) and, unless `fixedTop`, the top turned */
const key = (s: number[], f: (t: number[]) => string, fixedTop = false) =>
  ROTATIONS.flatMap((r) => (fixedTop ? [''] : U_TURNS).map((u) => f(K.apply(s, [u, r].filter(Boolean))))).sort()[0];
const topPattern = (t: number[]) => M.facelets.map((x) => x.index).filter((i) => M.facelets[i].pos[1] > 0 && t[i] === yellow).join();
const edgePerm = (t: number[]) => TOP_E.map((slot) => TOP_E.find((h) => h.split('').every((f) => K.colorsAt(t, slot).includes(K.center(t, f))))).join();
const looks: [string, typeof oll.groups[number], number, (s: number[]) => boolean, (s: number[]) => boolean, (s: number[]) => string][] = [
  ['OLL edges', oll.groups[0], 3, (s) => edgesUp(s) < 4, (t) => edgesUp(t) === 4, (s) => key(s, (t) => TOP_E.map((e) => +(t[K.at(e, 'U')] === yellow)).join(''))],
  ['OLL corners', oll.groups[1], 7, (s) => edgesUp(s) === 4 && !topYellow(s), topYellow, (s) => key(s, topPattern)],
  ['PLL corners', pll.groups[0], 2, (s) => !upTo(s, (t) => placed(t, TOP_C)), (t) => upTo(t, (x) => placed(x, TOP_C)), (s) => key(s, (t) => String([...'FRBL'].filter((f) => { const cs = TOP_C.filter((c) => c.includes(f)); return t[K.at(cs[0], f)] === t[K.at(cs[1], f)]; }).length))],
  ['PLL edges', pll.groups[1], 4, (s) => placed(s, TOP_C) && !placed(s, TOP_E), (t) => M.isSolved(t), (s) => key(s, edgePerm, true)],
];
for (const [name, g, n, needs, done, k] of looks) {
  const fulls = g.cases.map((c) => fullOf.get(c)!);
  g.cases.forEach((c, j) => {
    if (!needs(fulls[j])) fail(`${name}: ${c.name} isn't a case for this look`);
    if (!done(K.apply(fulls[j], c.moves))) fail(`${name}: ${c.name} doesn't finish the look`);
  });
  const different = new Set(fulls.map(k)).size;
  if (g.cases.length !== n || different !== n) fail(`${name}: ${different} different cases in ${g.cases.length}, want ${n}`);
}
const count = (s: typeof cross) => s.groups.reduce((n, g) => n + g.cases.length, 0);
if (keys.size !== count(f2l)) fail(`F2L: ${keys.size} different cases in ${count(f2l)}`);

// ---------- full OLL and PLL ----------

const topUp = (s: number[]) => home.every((_, i) => M.facelets[i].normal[1] !== 1 || s[i] === K.center(s, 'U'));
const fullSets: [string, Case[], number, (s: number[]) => boolean, (s: number[]) => boolean][] = [
  ['OLL', C.oll.flatMap((g) => g.cases), 57, (s) => same(s, f2lStickers) && !topUp(s), topUp],
  ['PLL', C.pll.flatMap((g) => g.cases), 21, (s) => same(s, f2lStickers) && topUp(s) && !U_TURNS.some((u) => M.isSolved(K.apply(s, [u]))), (s) => M.isSolved(s)],
];
for (const [name, cases, n, needs, done] of fullSets) {
  if (cases.length !== n) fail(`${name}: ${cases.length} cases, want ${n}`);
  const fulls = cases.map((c) => K.apply(home, invertAlg(c.moves)));
  cases.forEach((c, i) => {
    if (!needs(fulls[i])) fail(`${name}: ${c.name} isn't a case of it`);
    if (!done(K.apply(fulls[i], c.moves))) fail(`${name}: ${c.name} doesn't finish it`);
    // a case's algorithm finishes no other case, however the cube is held and the top turned
    cases.forEach((d, j) => {
      if (j !== i && ROTATIONS.some((r) => U_TURNS.some((u) => U_TURNS.some((v) => done(K.apply(fulls[i], [r, u, ...d.moves, v].filter(Boolean)))))))
        fail(`${name}: ${d.name} also finishes ${c.name}`);
    });
    if (name === 'PLL' && !C.pllArrows(c).length) fail(`${name}: ${c.name} has no arrows`);
  });
}

// ---------- the beginner's method ----------

// each case is one its stage meets (the stages before it done, this one not), and the guided
// solve's own stage, run on the case's setup, does exactly the case's algorithm
{
  const B = beginnerStages(M);
  const course = beginnerMethod(M).stages;
  const up = M.solved();
  const placedAll = (s: number[], slots: string[]) => slots.every((slot) => K.placed(s, slot));
  const MIDDLE = ['FR', 'RB', 'BL', 'LF'];
  const BOTTOM = ['DF', 'DR', 'DB', 'DL', 'DRF', 'DFL', 'DLB', 'DBR'];
  const yellowUp = (s: number[], slots: string[]) => slots.every((slot) => s[K.at(slot, 'U')] === K.center(s, 'U'));
  const stages: [((s: number[], steps: GuideStep[]) => number[]), (full: number[]) => boolean, string[]][] = [
    [B.crossStage, (s) => !placedAll(s, TOP_E) && TOP_E.filter((e) => K.placed(s, e)).length === 3, []],
    // the guided solve flips the cube first; the case starts after that
    [(s, steps) => B.cornersStage(K.apply(s, ['z2']), steps), (s) => placedAll(s, ['DF', 'DR', 'DB', 'DL']) && BOTTOM.filter((c) => !K.placed(s, c)).length === 1, ['z2']],
    [B.middleStage, (s) => placedAll(s, BOTTOM) && !placedAll(s, MIDDLE), []],
    [B.yellowCross, (s) => placedAll(s, [...BOTTOM, ...MIDDLE]) && !yellowUp(s, TOP_E), []],
    [B.yellowEdges, (s) => placedAll(s, [...BOTTOM, ...MIDDLE]) && yellowUp(s, TOP_E) && !U_TURNS.some((u) => placedAll(K.apply(s, [u]), TOP_E)), []],
    [B.cornerSpots, (s) => placedAll(s, [...BOTTOM, ...MIDDLE, ...TOP_E]) && !TOP_C.every((c) => K.inSpot(s, c)), []],
    // a corner's twist scrambles the lower layers until the last is done, so its cases show only the top
    [B.cornerTwists, (s) => placedAll(s, TOP_E) && TOP_C.every((c) => K.inSpot(s, c)) && !yellowUp(s, TOP_C), []],
  ];
  course.forEach((st, k) => {
    const [run, isCase, before] = stages[k];
    for (const c of (st.caseGroups ?? []).flatMap((g) => g.cases)) {
      const full = K.apply(k === 0 ? up : home, invertAlg(c.moves));
      if (!isCase(full)) fail(`Beginner ${st.name}: ${c.name} isn't a case of the stage`);
      const steps: GuideStep[] = [];
      run(full, steps);
      const moves = steps.flatMap((x) => x.phrases.flatMap((p) => p.moves));
      if (moves.join(' ') !== [...before, ...c.moves].join(' ')) fail(`Beginner ${st.name}: ${c.name} is ${c.moves.join(' ')}, but the guided solve does ${moves.join(' ')}`);
      // its steps name this case, or (where the case is several goes) the cases it passes through on the way
      const named = steps.map((x) => x.caseId).filter(Boolean);
      if (k > 0 && !named.includes(c.id)) fail(`Beginner ${st.name}: the guided solve's steps for ${c.name} name ${named.join(', ') || 'no case'}`);
    }
  });
}

// ---------- every case of every method ----------

const ids = allCases(M);
const methods: [CubeModel, Method][] = [
  ...[beginnerMethod(M), cfop, rouxMethod(M), zzMethod(M)].map((m): [CubeModel, Method] => [M, m]),
  ...[2, 4, 5].map((n): [CubeModel, Method] => {
    const Mn = new CubeModel(n);
    return [Mn, n === 2 ? beginner2Method(Mn) : reductionMethod(Mn)];
  }),
];
const faceOf = (Mn: CubeModel, i: number) => Mn.facelets[i].normal.join();
let total = 0;
const perMethod: string[] = [];
for (const [Mn, m] of methods) {
  const before = total;
  const seen = new Set<string>();
  for (const st of m.stages) {
    for (const g of st.caseGroups ?? []) {
      if (!g.cases.length) fail(`${m.name} ${st.name}: empty group ${g.name}`);
      for (const c of g.cases) {
        total++;
        if (seen.has(c.id)) fail(`${m.name}: two cases are ${c.id}`);
        seen.add(c.id);
        if (Mn.n === 3 && ids.get(c.id)?.moves.join(' ') !== c.moves.join(' ')) fail(`${m.name}: ${c.id} isn't the case set's`);
        if (c.moves.some((mv) => !Mn.parseMove(mv))) fail(`${m.name} ${c.name}: a move that isn't one`);
        const end = Mn.applyAll(c.setup, c.moves);
        const colorOf = new Map<string, number>();
        end.forEach((x, i) => {
          if (x === UNSET) return;
          const f = faceOf(Mn, i);
          if ((colorOf.get(f) ?? x) !== x) fail(`${m.name} ${c.name}: doesn't solve its setup`);
          colorOf.set(f, x);
        });
      }
    }
  }
  if (total > before) perMethod.push(`${m.name}${Mn.n !== 3 ? ` ${Mn.n}×${Mn.n}` : ''} ${total - before}`);
}

console.log(`cases: CFOP ${course.map((s) => `${s.name} ${count(s)}`).join(', ')}, full OLL ${fullSets[0][1].length}, full PLL ${fullSets[1][1].length}; by course: ${perMethod.join(', ')}; ${total} in all${fails ? ` — ${fails} failures` : ' — all ok'}`);
if (fails) process.exit(1);
