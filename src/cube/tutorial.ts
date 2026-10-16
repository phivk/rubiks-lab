// The CFOP tutorial: every case of each stage, with its algorithm, to learn from and follow
// along with on a real cube. Unlike a lesson it doesn't look at the cube on screen: each
// case is set up by undoing its algorithm on a solved cube held with white down, so the
// picture, the 3D cube and the algorithm always agree.
//
//   Cross   a few example edges, since the cross is planned rather than learnt
//   F2L     all 41 ways the front-right corner and edge can sit, each with an algorithm
//   OLL     two-look: the 3 edge cases that make a yellow cross, then the 7 corner cases
//   PLL     two-look: the 2 corner cases, then the 4 edge cases
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
      // a blanked piece has nowhere to point
      if (colorsAt(s, slot).includes(UNSET)) continue;
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
  // the sexy move, R U R' U': the trigger most F2L and OLL algorithms are built from, highlighted wherever it appears
  const SEXY = "R U R' U'";

  const f2l: TutorialStep = {
    name: 'F2L',
    goal: CFOP_STAGES[1].goal,
    html: `<p><b>F2L</b> stands for <b>F</b>irst <b>2</b> <b>L</b>ayers. Each white corner and the middle edge beside it go in together, as a pair, into the slot between their two centers.</p>
      <p>Hold the slot you’re working on at the <b>front right</b>. Find its corner and edge, turn the top until they look like one of the pictures, and do its algorithm. Every case keeps the cross and the other slots.</p>
      <p>There are 41 cases, but don’t learn them by heart: they’re all built from the same few moves (<code>R U R'</code>, <code>F' U' F</code>), which join the pair in the top layer and then insert it. Watch a few on the cube and you’ll see the idea.</p>`,
    groups: f2lGroups,
    view: 'corner',
  };

  // ---------- 3. OLL, in two looks ----------

  const TOP_EDGE_STICKERS = new Set(TOP_EDGES.flatMap((slot) => stickersOf(slot)));
  const inF2L = (i: number) => !slotOf[i].includes('U') || slotOf[i] === 'U';
  // the first two layers, and the top layer's yellow stickers: where the rest go is for PLL
  const ollShown = (s: State) => M.facelets.map((f) => f.index).filter((i) => inF2L(i) || s[i] === yellow);
  // look 1 is about the edges: their yellow stickers only, the corners blank
  const edgesShown = (s: State) => M.facelets.map((f) => f.index).filter((i) => inF2L(i) || (TOP_EDGE_STICKERS.has(i) && s[i] === yellow));
  const ocll = (n: number, name: string) => make(name, OLL.find((o) => o.n === n)!.alg, ollShown);

  const oll: TutorialStep = {
    name: 'OLL',
    goal: 'Orient the Last Layer: make the whole top yellow, in two looks.',
    html: `<p><b>OLL</b> stands for <b>O</b>rient the <b>L</b>ast <b>L</b>ayer: with the first two layers solved, turn every top piece so yellow faces up.</p>
      <p>Do it in two looks: first the edges, making a yellow cross, then the corners. That’s 10 algorithms instead of the 57 it takes in one go, for a few extra moves.</p>
      <p>Hold the cube with yellow on top and look at it from above. The pictures show which stickers are yellow, on top and on the sides of the top layer. Turn the top until your cube matches one, then do its algorithm. Watch for the <b>sexy move</b>, <code>R U R' U'</code>, highlighted wherever it appears.</p>`,
    groups: [
      {
        name: '1 · Yellow cross',
        about: 'Ignore the corners. The yellow edges on top make a line, an L or just the center dot.',
        cases: [
          make('Line', "F R U R' U' F'", edgesShown, 'Hold the line left to right.'),
          make('L', "f R U R' U' f'", edgesShown, 'Hold the L at the front right: yellow edges in front and on the right.'),
          make('Dot', "F R U R' U' F' f R U R' U' f'", edgesShown, 'The line algorithm, then the L one: the first leaves exactly the L above, the second makes the cross.'),
        ],
      },
      {
        name: '2 · Yellow corners',
        about: 'With the cross done, count the yellow corners on top and look where the side ones face.',
        cases: [
          ocll(27, 'Sune'),
          ocll(26, 'Anti-Sune'),
          ocll(21, 'H'),
          ocll(22, 'Pi'),
          ocll(23, 'Headlights'),
          ocll(24, 'T'),
          ocll(25, 'Bowtie'),
        ],
      },
    ],
    view: 'top',
    focus: focusTop,
  };

  // ---------- 4. PLL, in two looks ----------

  // look 1 moves the corners: the top edges' side stickers are blank
  const cornersShown = (s: State) => M.facelets.map((f) => f.index).filter((i) => !TOP_EDGE_STICKERS.has(i) || s[i] === yellow);
  const perm = (name: string, shown?: (s: State) => number[], note?: string) => make(`${name} perm`, PLL.find((p) => p.name === name)!.alg, shown, note);

  const pll: TutorialStep = {
    name: 'PLL',
    goal: 'Permute the Last Layer: move the top pieces to their spots, in two looks.',
    html: `<p><b>PLL</b> stands for <b>P</b>ermute the <b>L</b>ast <b>L</b>ayer: with the top all yellow, move its pieces to their spots. Each case is a letter-named “perm”.</p>
      <p>Again in two looks: first the corners, then the edges. That’s 6 algorithms instead of 21. The arrows show where each piece goes.</p>
      <p>Look at the sides of the top layer. Two matching corner stickers on a side are <b>headlights</b>. Turn the top to match the picture, do the algorithm, and at the end turn the top to line it up with the rest.</p>`,
    groups: [
      {
        name: '1 · Corners',
        about: 'Ignore the edges and look for headlights. On every side: the corners are done, skip to the edges.',
        cases: [
          perm('T', cornersShown, 'Headlights on one side: hold them on the left. Two neighbouring corners swap.'),
          perm('Y', cornersShown, 'No headlights anywhere: two opposite corners swap.'),
        ],
      },
      {
        name: '2 · Edges',
        about: 'Headlights on every side now. Look for a side that’s all one color: its edge is already home.',
        cases: [
          perm('Ua', undefined, 'One solved side, held at the back. The front edge goes right, the right one left, the left one to the front.'),
          perm('Ub', undefined, 'One solved side, held at the back. The front edge goes left, the left one right, the right one to the front.'),
          perm('H', undefined, 'No solved side, opposite colors on each: opposite edges swap.'),
          // the Z perm ends a quarter turn off; the U lines it up, so the arrows show just the edge swaps
          make('Z perm', PLL.find((p) => p.name === 'Z')!.alg + ' U', undefined, 'No solved side, neighbouring colors: the edges swap in neighbouring pairs, front with right and back with left.'),
        ],
      },
    ],
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
