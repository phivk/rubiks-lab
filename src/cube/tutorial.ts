// The CFOP tutorial: every case of each stage, with its algorithm, to learn from and follow
// along with on a real cube. Unlike a lesson it doesn't look at the cube on screen: each
// case is set up by undoing its algorithm on a solved cube held with white down, so the
// picture, the 3D cube and the algorithm always agree.
//
//   Cross   a few example edges, since the cross is planned rather than learnt
//   F2L     all 41 ways the front-right corner and edge can sit, each with an algorithm
//   OLL     the 57 cases, grouped by shape
//   PLL     the 21 cases, grouped by what moves
//
// scripts/verify-tutorial.ts checks every case: each algorithm solves its setup, the F2L
// cases are all different and cover all 41, and each stage's setups leave the earlier
// stages alone.

import type { State, Tutorial, TutorialCase, TutorialStep } from '../core/types';
import { OLL, PLL } from './algs';
import { CFOP_STAGES } from './cfop';
import { alg, CORNERS, EDGES, lessonKit, sameSet, TOP_CORNERS, TOP_EDGES, WIDE_NOTATION } from './lessonKit';
import { invertAlg, UNSET, type CubeModel } from './model';

/** the four corner–edge pairs' F2L algorithms, for the front-right slot (white down, green front) */
export const F2L_ALGS = [
  "U R U' R'", "U' F' U F", "F' U' F", "R U R'",
  "U' R U R' U2 R U' R'", "U F' U' F U2 F' U F", "U' R U2 R' U2 R U' R'", "U F' U2 F U2 F' U F",
  "U' R U' R' U F' U' F", "U' R U R' U R U R'", "U' R U2 R' U F' U' F", "U F' U F U' F' U' F",
  "U' R U' R' U R U R'", "R U' R' U2 F' U' F", "R U2 R' U' R U R'", "F' U2 F U F' U' F",
  "U R U2 R' U R U' R'", "U' F' U2 F U' F' U F", "U2 R U R' U R U' R'", "U2 F' U' F U' F' U F",
  "U R U' R' U' R U' R' U R U' R'", "F U R U' R' F' R U' R'", "U' R' F R F' R U R'", "U R U' R' F R' F' R",
  "R U' R' U R U' R'", "F' U F U' F' U F", "R U R' U' R U R'", "U' R' F R F' R U' R'",
  "U R U' R' U R U' R' U R U' R'", "U' R U' R' U2 R U' R'", "U R U R' U2 R U R'", "R2 U2 F R2 F' U2 R' U R'",
  "R U' R' U' R U R' U2 R U' R'", "R U' R' U R U2 R' U R U' R'", "R U' R' F' U' F", "R U R' U' R U' R' U2 F' U' F",
  "U' R U R' U F' U' F", "U F' U F U2 R U R'", "F' U2 F U' R U R'", "F' U' F U' R U R'",
  "F' U F U2 F' U' F R U R'",
];

/** example cross edges for the white–green edge, with how to bring it home */
const CROSS_CASES: [string, string, string][] = [
  ['On top, white up', 'F2', 'Turn the top until the edge sits above its center, then turn the front twice.'],
  ['On top, white facing out', "U' R' F R", 'Move it beside its spot, then bring it down from the side; the R’ … R puts the right edge back.'],
  ['In the middle, white facing right', 'F', 'One turn of the front drops it in.'],
  ['In the middle, white facing left', "F'", 'One turn of the front, the other way.'],
  ['In the middle, white facing front', "R U R' F2", 'Lift it to the top with the white facing up, put the right side back, then bring it down.'],
  ['On the bottom, flipped', "F2 U' R' F R", 'Take it out to the top, then bring it back in the right way round.'],
];

const OLL_GROUPS = [
  'All Edges Oriented Correctly', 'T-Shapes', 'Squares', 'C-Shapes', 'W-Shapes', 'Corners Correct, Edges Flipped',
  'P-Shapes', 'I-Shapes', 'Fish-Shapes', 'Knight Move Shapes', 'Awkward Shapes', 'L-Shapes', 'Lightning Bolts',
  'No Edges Flipped Correctly',
];
const PLL_GROUPS = ['only edges move', 'only corners move', 'two neighbouring corners swap', 'two opposite corners swap'];


export function cfopTutorial(M: CubeModel): Tutorial {
  if (M.n !== 3) throw new Error('the CFOP tutorial is for the 3×3');
  const K = lessonKit(M);
  const { at, stickersOf, center, find, colorsAt } = K;
  // CFOP is solved with white down; z2 keeps green in front
  const home = K.apply(M.solved(), ['z2']);
  const white = center(home, 'D');
  const yellow = center(home, 'U');
  /**
   * A case, set up by undoing its algorithm. Stickers outside `shown` are blanked, on the
   * picture and the 3D cube alike: they're whatever a real cube has there at this stage.
   */
  const make = (name: string, text: string, shown?: (s: State) => number[], note?: string): TutorialCase => {
    const moves = alg(text);
    const setup = K.apply(home, invertAlg(moves));
    if (shown) {
      const keep = new Set(shown(setup));
      setup.forEach((_, i) => { if (!keep.has(i)) setup[i] = UNSET; });
    }
    return { name, moves, setup, note };
  };
  /** A demo: moves played from a solved cube, to see what they do. */
  const demo = (name: string, text: string, note: string): TutorialCase => ({ name, moves: alg(text), setup: home.slice(), note, demo: true });

  const SLOTS = [...EDGES, ...CORNERS, ...'UDFRBL'];
  const slotOf: string[] = [];
  for (const slot of SLOTS) for (const i of stickersOf(slot)) slotOf[i] = slot;
  const pieceStickers = (s: State, colors: number[][]) => colors.flatMap((c) => stickersOf(find(s, c)));
  const centers = [...'UDFRBL'].map((f) => at(f, f));
  const TOP = [...TOP_EDGES, ...TOP_CORNERS];
  const focusTop = () => [at('U', 'U'), ...TOP.flatMap((slot) => stickersOf(slot))];

  /** An arrow from each top piece to its spot, as top stickers: where it is, where it goes. */
  function pllArrows(s: State): [number, number][] {
    const out: [number, number][] = [];
    for (const slot of TOP) {
      const to = TOP.find((h) => h.length === slot.length && sameSet(colorsAt(s, slot), [...h].map((f) => center(s, f))))!;
      if (to !== slot) out.push([at(slot, 'U'), at(to, 'U')]);
    }
    return out;
  }

  // ---------- 1. cross ----------

  const crossEdges = [...'FRBL'].map((f) => [white, center(home, f)]);
  const cross: TutorialStep = {
    name: 'Cross',
    goal: CFOP_STAGES[0].goal,
    html: `<p>Hold the cube with the <b>white center down</b> and green in front. The cross is the four white edges on the bottom, each beside the center of its other color.</p>
      <p>There’s no algorithm to learn here: the cross takes at most eight moves, and with practice you plan all of it while you inspect the cube. These examples show the usual ways to bring one edge home, the white–green one, without disturbing the others.</p>
      <p class="muted">Tip: solve the cross on the bottom from the start, even though it’s harder to see. You’ll never have to flip the cube for the next stage.</p>`,
    groups: [{ name: 'Bringing one edge home', cases: CROSS_CASES.map(([name, a, note]) => make(name, a, (s) => [...centers, ...pieceStickers(s, crossEdges)], note)) }],
    view: 'corner',
  };

  // ---------- 2. F2L ----------

  const pair = [[white, center(home, 'F'), center(home, 'R')], [center(home, 'F'), center(home, 'R')]];
  const f2lGroup = (c: TutorialCase) => {
    const corner = find(c.setup, pair[0]);
    const edge = find(c.setup, pair[1]);
    if (c.moves.length <= 4) return 0;
    if (corner.includes('U') && edge.includes('U')) return c.setup[at(corner, 'U')] === white ? 2 : 1;
    if (corner.includes('U')) return 3;
    if (edge.includes('U')) return 4;
    return 5;
  };
  const f2lCases = F2L_ALGS.map((a) => make('', a, (s) => [...centers, ...pieceStickers(s, pair)]));
  const F2L_GROUP_NAMES: [string, string][] = [
    ['Basic inserts', 'The pair is joined, or one move from it: insert it straight away.'],
    ['Both on top, white facing out', 'Corner and edge in the top layer, with the corner’s white sticker on a side.'],
    ['Both on top, white facing up', 'The trickiest pairs to join: first turn the corner so its white faces out.'],
    ['Corner on top, edge in its slot', 'Take the edge out with the corner, or pair them over it.'],
    ['Edge on top, corner in its slot', 'Take the corner out, joined to the edge.'],
    ['Both in the slot', 'Wrongly placed, or flipped: take them out together and put them back.'],
  ];
  const f2lGroups = F2L_GROUP_NAMES.map(([name, about], g) => ({
    name, about,
    cases: f2lCases.filter((c) => f2lGroup(c) === g).sort((x, y) => x.moves.length - y.moves.length),
  }));
  let n = 0;
  for (const g of f2lGroups) for (const c of g.cases) c.name = `F2L ${++n}`;
  // the sexy move, R U R' U': the trigger most F2L and OLL algorithms are built from
  const SEXY = "R U R' U'";
  // which way each of its moves turns, as an arrow across the front face
  const front = (a: string, b: string): [number, number] => [at(a, 'F'), at(b, 'F')];
  const sexy = {
    name: 'The sexy move',
    about: `<p><code>${SEXY}</code> is the <b>sexy move</b>: right side up, top to the left, right side down, top back. It’s the most common <b>trigger</b> — a short run of moves your fingers learn as one — and it’s inside most F2L and OLL algorithms, highlighted wherever it appears.</p>
      <p>Hold the cube in both hands; your right hand turns R, your right index finger pushes U from the back. Do it six times in a row and the cube is back where it started, so it’s safe to practise until it’s one smooth motion.</p>`,
    frames: {
      start: home,
      moves: alg(SEXY),
      arrows: [[front('FDR', 'FUR')], [front('FUR', 'FUL')], [front('FUR', 'FDR')], [front('FUL', 'FUR')]],
    },
    cases: [
      demo('Sexy move', SEXY, 'Watch the front-right corner: it goes up, around and back down, swapping places with the corner on top.'),
      demo('Six sexy moves', Array(6).fill(SEXY).join(' '), 'Six in a row bring every piece home: a good way to drill it.'),
      demo('Left sexy move', "L' U' L U", 'The mirror image, for the left hand: left side up, top to the right, left side down, top back.'),
    ],
  };

  const f2l: TutorialStep = {
    name: 'F2L',
    goal: CFOP_STAGES[1].goal,
    html: `<p><b>F2L</b> stands for <b>F</b>irst <b>2</b> <b>L</b>ayers. Each white corner and the middle edge beside it go in together, as a pair, into the slot between their two centers.</p>
      <p>Hold the slot you’re working on at the <b>front right</b>. Find its corner and edge, turn the top until they look like one of the pictures, and do its algorithm. Every case keeps the cross and the other slots.</p>
      <p>There are 41 cases, but don’t learn them by heart: they’re all built from the same few moves (<code>R U R'</code>, <code>F' U' F</code>), which join the pair in the top layer and then insert it. Watch a few on the cube and you’ll see the idea.</p>`,
    groups: [sexy, ...f2lGroups],
    view: 'corner',
  };

  // ---------- 3. OLL ----------

  // the first two layers, and the top layer's yellow stickers: where the rest go is for PLL
  const ollShown = (s: State) => M.facelets.map((f) => f.index).filter((i) => !slotOf[i].includes('U') || s[i] === yellow);

  const oll: TutorialStep = {
    name: 'OLL',
    goal: CFOP_STAGES[2].goal,
    html: `<p><b>OLL</b> stands for <b>O</b>rient the <b>L</b>ast <b>L</b>ayer: with the first two layers solved, one algorithm turns every top piece so yellow faces up.</p>
      <p>Hold the cube with yellow on top and look at it from above. The pictures show which stickers are yellow, on top and on the sides of the top layer. Turn the top until your cube matches one, then do its algorithm.</p>
      <p>There are 57 cases. Start with the first group: once all four edges show yellow, these seven fix the corners. With the three edge cases in the T, I and P groups (<code>F R U R' U' F'</code> and friends) you have two-look OLL, and can learn the rest one at a time.</p>
      <p>Look for the <b>sexy move</b> (<code>R U R' U'</code>, highlighted) inside the algorithms: many are one or two of them wrapped in a setup move. OLL 45 is just <code>F</code>, a sexy move, <code>F'</code>.</p>`,
    groups: OLL_GROUPS.map((g) => ({
      name: g,
      cases: OLL.filter((o) => o.group === g).map((o) => make(`OLL ${o.n} · ${o.name}`, o.alg, ollShown)),
    })),
    view: 'top',
    focus: focusTop,
  };

  // ---------- 4. PLL ----------

  const pll: TutorialStep = {
    name: 'PLL',
    goal: CFOP_STAGES[3].goal,
    html: `<p><b>PLL</b> stands for <b>P</b>ermute the <b>L</b>ast <b>L</b>ayer: with the top all yellow, one algorithm moves its pieces to their spots. Each case is a letter-named “perm”.</p>
      <p>Look at the sides of the top layer. Two matching corner stickers on a side are <b>headlights</b>: they tell the corners apart. Headlights on every side mean only edges move; on one side, two neighbouring corners swap; on none, two opposite corners swap. The arrows show where each piece goes.</p>
      <p>Turn the top to match the picture, do the algorithm, then turn the top to line it up with the rest. For two-look PLL, learn the corner cases (A, E, T, Y) and the edge cases (U, H, Z) first.</p>`,
    groups: PLL_GROUPS.map((k) => ({
      name: k[0].toUpperCase() + k.slice(1),
      cases: PLL.filter((p) => p.kind === k).map((p) => make(`${p.name} perm`, p.alg)),
    })),
    view: 'top',
    arrows: (c) => pllArrows(c.setup),
    focus: focusTop,
  };

  return {
    id: 'cfop',
    name: 'CFOP',
    intro: 'Every case of each CFOP stage, with its algorithm. Hold your own cube white down, green in front, and follow along — no need to enter it here. Pick a case to watch it on the 3D cube.',
    notation: WIDE_NOTATION,
    triggers: [{ name: 'sexy move', moves: alg(SEXY) }],
    steps: [cross, f2l, oll, pll],
  };
}
