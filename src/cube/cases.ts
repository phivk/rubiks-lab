// The 3×3's case sets: every case a course can teach, with its algorithm, for a method's stages
// to pick from. Unlike a guided solve a case doesn't look at the cube on screen: each is set up
// by undoing its algorithm on a solved cube held with white down, so the picture, the 3D cube
// and the algorithm always agree.
//
//   beginner     the beginner's method, stage by stage: example cross edges (white on top,
//                where the method builds it), then each stage's algorithm on the cases it meets
//   cross        a few example edges, since the cross is planned rather than learnt
//   F2L          the idea, build the block then insert it, on cases sorted by where the pieces are
//   two-look     OLL: the 3 edge cases that make a yellow cross, then the 7 corner cases (OCLL);
//                PLL: the 2 corner cases, then the 4 edge cases
//   full         all 57 OLLs, by shape, and all 21 PLLs, by what moves
//
// The 2×2 has its own set (cube2Cases), for its beginner's method: the white corners as on the
// 3×3, the seven shapes of the yellow top, each with the run of Sunes that solves it, and the
// two corner swaps.
//
// The 4×4 and 5×5 have theirs (bigCubeCases), for the reduction method: example centers and
// edges, the beginner's 3×3 cases on the big cube, and the parities: OLL and PLL parity on
// the 4×4, edge parity on the 5×5.
//
// A case has the same id in every set it's in (OLL 27 is oll-27, as two-look's Sune and as
// full OLL's), and a guided solve's step names the case it is by that id (GuideStep.caseId).
// scripts/verify-tutorial.ts checks every case.

import type { Case, CaseGroup, State } from '../core/types';
import { OLL, OLL_CORNERS, OLL_EDGES, PLL, PLL_CORNERS, PLL_EDGES, type TwoLookAlg } from './algs';
import { alg, asThree, caseMaker, CORNERS, EDGES, lessonKit, repeat, sameSet, TOP_CORNERS, TOP_EDGES, U_TURNS } from './lessonKit';
import { invertAlg, UNSET, type CubeModel } from './model';

/**
 * F2L, for the front-right slot (white down, green front): [name, algorithm, note], grouped by
 * where the corner and edge are. The long ones say to learn them as algorithms.
 */
const ALG = 'Quicker to learn as an algorithm than to work out.';
const F2L_GROUPS: { id: string; name: string; about: string; cases: [string, string, string][] }[] = [
  {
    id: 'f2l-ready',
    name: 'Ready to go in',
    about: 'Three moves, or four with a turn of the top. Every other case ends with one of these.',
    cases: [
      ['White right, edge back', "R U R'", 'R brings the corner to the edge, U R′ drops the block in.'],
      ['White front, edge left', "F' U' F", 'The mirror image, on the F side.'],
      ['White front, edge right', "U R U' R'", 'Already a block, above the slot: U moves it aside, R U′ R′ puts it in.'],
      ['White right, edge front', "U' F' U F", 'The mirror image, on the F side.'],
    ],
  },
  {
    id: 'f2l-build',
    name: 'Build the block first',
    about: 'Corner and edge are both on top, white facing a side, but apart. Bring them together, then it’s a case from above.',
    cases: [
      ['White front, edge back', "U' R U R' U2 R U' R'", 'U′ R U R′ U2 builds the block, R U′ R′ puts it in.'],
      ['White right, edge left', "U F' U' F U2 F' U F", 'The mirror image, on the F side.'],
      ['White front, edge left, flipped', "U' R U2 R' U2 R U' R'", 'U′ R U2 R′ builds the block, which leaves White front, edge right.'],
      ['White right, edge left, flipped', "U2 R U' R' U' R U R'", 'U2 R U′ R′ moves the edge round, which leaves White right, edge back.'],
    ],
  },
  {
    id: 'f2l-joined',
    name: 'Joined wrongly',
    about: 'Corner and edge touch on top, but their colors don’t line up into a block. Split them first.',
    cases: [
      ['White right, edge right', "U' R U' R' U R U R'", 'U′ R U′ R′ splits them, which leaves White right, edge back.'],
      ['White front, edge front', "U F' U F U' F' U' F", 'U F′ U F splits them, which leaves White front, edge left.'],
    ],
  },
  {
    id: 'f2l-white-up',
    name: 'White facing up',
    about: 'The first moves turn the corner so white faces a side, then it’s a case from above.',
    cases: [
      ['White up, far apart', "R U2 R' U R U' R'", 'R U2 R′ builds the block, U R U′ R′ puts it in.'],
      ['White up, apart, edge flipped', "U R U R' F' U' F", 'U R U R′ brings them together as White front, edge left.'],
      ['White up, edge front', "R U R' U' U' R U R' U' R U R'", ALG],
      ['White up, edge right', "F' U' F U U F' U' F U F' U' F", ALG],
    ],
  },
  {
    id: 'f2l-corner-in',
    name: 'Corner in the slot',
    about: 'Lift the corner out to the top first, even when it’s already right, then it’s a case from above.',
    cases: [
      ['Corner in slot, white front', "R U' R' F' U' F", 'R U′ R′ lifts the corner out, which leaves White front, edge left.'],
      ['Corner in slot, white right', "R U R' U' R U R'", 'R U R′ U′ lifts the corner out, which leaves White right, edge back.'],
      ['Corner done, edge from the front', "U R U' R' U' F' U F", 'U R U′ R′ lifts the corner out, which leaves White right, edge front.'],
      ['Corner done, edge from the right', "U' F' U F U R U' R'", 'U′ F′ U F lifts the corner out, which leaves White front, edge right.'],
    ],
  },
  {
    id: 'f2l-edge-in',
    name: 'Edge in the slot',
    about: 'Lift the edge out to the top first.',
    cases: [
      ['Edge in slot, flipped', "U' R U R' U F' U' F", 'U′ R U R′ lifts the edge out, and U then leaves White front, edge left.'],
      ['White up, edge in slot', "R U R' U' R U R' U' R U R'", ALG],
    ],
  },
  {
    id: 'f2l-both-in',
    name: 'Both in the slot',
    about: 'Both pieces are in the slot, the edge flipped. Lift them out first.',
    cases: [
      ['Both in slot, white down', "R U2 R' U R U2 R' U F' U' F", 'R U2 R′ U R U2 R′ lifts both out, which leaves White front, edge left.'],
      ['Both in slot, white right', "R U R' U' R U' R' U2 F' U' F", ALG],
      ['Both in slot, white front', "R U' R' U F' U' F U' F' U' F", ALG],
    ],
  },
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

/** the sexy move, R U R' U': the trigger most F2L and OLL algorithms are built from */
export const SEXY = alg("R U R' U'");

/** the beginner's method's algorithms, as its guided solve (beginner.ts) does them */
export const BEGINNER = {
  right: alg("U R U' R' U' F' U F"),
  left: alg("U' L' U L U F U' F'"),
  cross: alg("F R U R' U' F'"),
  sune: alg("R U R' U R U2 R' U"),
  niklas: alg("U R U' L' U R' U' L"),
  twist: alg("R' D' R D"),
};

/**
 * The beginner's cross, built on top: example cases for the white–green edge, each the
 * fewest turns that leave the other cross edges where they were. [name, algorithm, note]
 */
const BEGINNER_CROSS_CASES: [string, string, string][] = [
  ['On the bottom, white facing down', 'F2', 'It’s right under its spot: turn the front twice.'],
  ['On the bottom, to one side', "D' F2", 'Turn the bottom to bring it under its spot first. No white edge is on the bottom, so that moves nothing you’ve done.'],
  ['On the bottom, white facing out', "R F' R'", 'R lifts it into the middle layer and F′ brings it up; R′ puts back the edge R moved.'],
  ['In the middle, white facing right', "F'", 'One turn of the front brings it up.'],
  ['In the middle, white facing front', "U' R U", 'U′ moves its spot above it, R lifts it in, and U turns the top back.'],
  ['On top, flipped', "U L U' F", 'U moves it to the left, L turns it down into the middle layer and U′ puts the top back. Now white faces left: F brings it up.'],
];

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

export type CubeCases = ReturnType<typeof buildCases>;
const built = new WeakMap<CubeModel, CubeCases>();

/** The 3×3's case sets, built once per model. */
export function cubeCases(M: CubeModel): CubeCases {
  if (!built.has(M)) built.set(M, buildCases(M));
  return built.get(M)!;
}

function buildCases(M: CubeModel) {
  if (M.n !== 3) throw new Error('the case sets are for the 3×3');
  const K = lessonKit(M);
  const { at, stickersOf, center, colorsAt, focusOn } = K;
  // cases are set up with white down; z2 keeps green in front
  const home = K.apply(M.solved(), ['z2']);
  const white = center(home, 'D');
  const yellow = center(home, 'U');
  const makeCase = caseMaker((s, moves) => K.apply(s, invertAlg(moves)), home, UNSET);
  /** a case, its algorithm as text or as moves */
  const make = (id: string, name: string, text: string | string[], shown?: (s: State) => number[], note?: string, from = home) =>
    makeCase(id, name, typeof text === 'string' ? alg(text) : text, shown, note, from);

  const SLOTS = [...EDGES, ...CORNERS, ...'UDFRBL'];
  const slotOf: string[] = [];
  for (const slot of SLOTS) for (const i of stickersOf(slot)) slotOf[i] = slot;
  const centers = [...'UDFRBL'].map((f) => at(f, f));
  const TOP = [...TOP_EDGES, ...TOP_CORNERS];
  const TOP_STICKERS = [at('U', 'U'), ...TOP.flatMap((slot) => stickersOf(slot))];

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

  // ---------- cross ----------

  const crossEdges = [...'FRBL'].map((f) => [white, center(home, f)]);
  const cross: CaseGroup[] = [{
    id: 'cross-one-edge',
    name: 'Bringing one edge home',
    cases: CROSS_CASES.map(([name, a, note]) => make(`cross-${slug(name)}`, name, a, (s) => [...centers, ...focusOn(crossEdges)(s)], note)),
  }];

  // ---------- F2L ----------

  const pair = [[white, center(home, 'F'), center(home, 'R')], [center(home, 'F'), center(home, 'R')]];
  const f2l: CaseGroup[] = F2L_GROUPS.map(({ id, name, about, cases }) => ({
    id, name, about,
    // the cross is already done by now, so it shows along with the pair
    cases: cases.map(([name, a, note]) => make(`f2l-${slug(name)}`, name, a, (s) => [...centers, ...focusOn(crossEdges)(s), ...focusOn(pair)(s)], note)),
  }));

  // ---------- OLL ----------

  const TOP_EDGE_STICKERS = new Set(TOP_EDGES.flatMap((slot) => stickersOf(slot)));
  const ALL = M.facelets.map((f) => f.index);
  const inF2L = (i: number) => !slotOf[i].includes('U') || slotOf[i] === 'U';
  // the first two layers, and the top layer's yellow stickers: where the rest go is for PLL
  const ollShown = (s: State) => ALL.filter((i) => inF2L(i) || s[i] === yellow);
  // look 1 is about the edges: their yellow stickers only, the corners blank
  const edgesShown = (s: State) => ALL.filter((i) => inF2L(i) || (TOP_EDGE_STICKERS.has(i) && s[i] === yellow));
  // look 1 of PLL moves the corners: the top edges' side stickers are blank
  const cornersShown = (s: State) => ALL.filter((i) => !TOP_EDGE_STICKERS.has(i) || s[i] === yellow);

  /** a two-look case, under the id a guided solve's step names it by */
  const twoLook = (a: TwoLookAlg, shown?: (s: State) => number[], note?: string, after = ''): Case =>
    ({ ...make(a.id, a.name, a.alg + after, shown, note), alias: a.alias });
  const ollEdge = (id: string, note: string) => twoLook(OLL_EDGES.find((a) => a.id === id)!, edgesShown, note);

  const ollEdges: CaseGroup = {
    id: 'oll-cross',
    name: '1 · Yellow cross',
    about: 'Ignore the corners. The yellow edges on top make a line, an L or just the center dot.',
    cases: [
      ollEdge('oll-line', 'Hold the line left to right.'),
      ollEdge('oll-l', 'Hold the L at the front right: yellow edges in front and on the right.'),
      { ...ollEdge('oll-dot', 'The line algorithm, then the L one: the first leaves exactly the L above, the second makes the cross.'), breakAfter: 6 },
    ],
  };
  const ollCorners: CaseGroup = {
    id: 'oll-corners',
    name: '2 · Yellow corners',
    about: 'With the cross done, count the yellow corners on top and look where the side ones face.',
    cases: OLL_CORNERS.map((a) => twoLook(a, ollShown)),
  };
  // every OLL, by the shape the top makes, in the order the shapes first come up in the list
  const oll: CaseGroup[] = [...new Set(OLL.map((o) => o.group))].map((group) => ({
    id: `oll-${slug(group)}`,
    name: group,
    cases: OLL.filter((o) => o.group === group).map((o) => ({ ...make(o.id, o.name, o.alg, ollShown), alias: `OLL ${o.n}` })),
  }));

  // ---------- PLL ----------

  /** the turn of the top an algorithm ends with, if it ends a turn off: it lines the top up, so the arrows show only the swaps */
  const lineUp = (text: string, shown?: (s: State) => number[]) =>
    U_TURNS.reduce((best, u) => (pllArrows(make('', '', `${text} ${u}`, shown).setup).length < pllArrows(make('', '', `${text} ${best}`, shown).setup).length ? u : best));
  const perm = (name: string, shown?: (s: State) => number[], note?: string) => {
    const a = [...PLL_CORNERS, ...PLL_EDGES].find((x) => x.id === `pll-${name}`)!;
    const u = lineUp(a.alg, shown);
    return twoLook(a, shown, note, u && ` ${u}`);
  };

  const pllCorners: CaseGroup = {
    id: 'pll-corners',
    name: '1 · Corners',
    about: 'Ignore the edges and look for headlights. On every side: the corners are done, skip to the edges.',
    cases: [
      perm('T', cornersShown, 'Headlights on one side: hold them on the left. Two neighbouring corners swap.'),
      perm('Y', cornersShown, 'No headlights anywhere: two opposite corners swap.'),
    ],
  };
  const pllEdges: CaseGroup = {
    id: 'pll-edges',
    name: '2 · Edges',
    about: 'Headlights on every side now. Look for a side that’s all one color: its edge is already home.',
    cases: [
      perm('Ua', undefined, 'One solved side, held at the back. The front edge goes right, the right one left, the left one to the front.'),
      perm('Ub', undefined, 'One solved side, held at the back. The front edge goes left, the left one right, the right one to the front.'),
      perm('H', undefined, 'No solved side, opposite colors on each: opposite edges swap.'),
      perm('Z', undefined, 'No solved side, neighbouring colors: the edges swap in neighbouring pairs, front with right and back with left.'),
    ],
  };
  // every PLL, by what it moves
  const pll: CaseGroup[] = [...new Set(PLL.map((p) => p.kind))].map((kind) => ({
    id: `pll-${slug(kind)}`,
    name: capital(kind),
    cases: PLL.filter((p) => p.kind === kind).map((p) => {
      const u = lineUp(p.alg);
      return make(p.id, `${p.name} perm`, p.alg + (u && ` ${u}`));
    }),
  }));

  // ---------- the beginner's method ----------

  const { right, left, cross: crossAlg, sune, niklas, twist } = BEGINNER;
  const whiteCorners = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']].map(([a, b]) => [white, center(home, a), center(home, b)]);
  const middleEdges = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']].map(([a, b]) => [center(home, a), center(home, b)]);
  const firstLayer = [...crossEdges, ...whiteCorners];
  const lit = (pieces: number[][]) => (s: State) => [...centers, ...focusOn(pieces)(s)];
  const TOP_CORNER_STICKERS = new Set(TOP_CORNERS.flatMap((slot) => stickersOf(slot)));
  // the corners are for later: their stickers are blank
  const noCorners = (s: State) => ALL.filter((i) => !TOP_CORNER_STICKERS.has(i));
  const TOP_LAYER = new Set(TOP_STICKERS);
  const topOnly = (s: State) => ALL.filter((i) => TOP_LAYER.has(i) || centers.includes(i));
  const B = (stage: string, name: string, moves: string[], shown?: (s: State) => number[], note?: string, from = home) =>
    make(`${stage}-${slug(name)}`, name, moves, shown, note, from);
  const sexy = (n: number) => repeat(SEXY, n);

  const beginner = {
    whiteCross: [{
      id: 'white-cross-one-edge',
      name: 'Bringing one edge home',
      about: 'The white–green edge, with the other three already in the cross. Each case is the fewest turns that leave them where they are.',
      // the cross goes on top, so these are set up on a cube held the usual way up
      cases: BEGINNER_CROSS_CASES.map(([name, a, note]) => B('white-cross', name, alg(a), lit(crossEdges), note, M.solved())),
    }],
    whiteCorners: [
      {
        id: 'white-corners-top',
        name: 'Above its spot',
        about: 'The corner is on top, right above its spot at the front right. Repeat R U R′ U′ until it drops in with white facing down.',
        cases: [
          B('white-corner', 'White facing right', sexy(1), lit(firstLayer), 'One round drops it in.'),
          B('white-corner', 'White facing up', sexy(3), lit(firstLayer), 'Three rounds.'),
          B('white-corner', 'White facing front', sexy(5), lit(firstLayer), 'Five rounds. It looks like a lot, but it’s the same four moves each time.'),
        ],
      },
      {
        id: 'white-corners-stuck',
        name: 'Stuck in the bottom',
        about: 'In its spot but twisted, or in the wrong spot: hold it at the front right and do R U R′ U′ once to lift it to the top. Then it’s a case from above.',
        cases: [
          B('white-corner', 'In its spot, white facing right', sexy(2), lit(firstLayer), 'The first round lifts it out, the second drops it in.'),
          B('white-corner', 'In its spot, white facing front', sexy(4), lit(firstLayer), 'The first round lifts it out, with white facing up; three more drop it in.'),
        ],
      },
    ],
    middleLayer: [
      {
        id: 'middle-top',
        name: 'From the top',
        about: 'Find an edge on top without yellow. Turn the top until its front sticker sits above the center of its color, making an upside-down T, and look at its top color.',
        cases: [
          B('middle', 'Goes to the right', right, lit([...firstLayer, ...middleEdges]), 'Its top color is the right center’s, so it goes down to the right.'),
          B('middle', 'Goes to the left', left, lit([...firstLayer, ...middleEdges]), 'Its top color is the left center’s: the mirror image.'),
        ],
      },
      {
        id: 'middle-stuck',
        name: 'Stuck in the middle layer',
        about: 'Flipped in its slot, or in the wrong one: hold it at the front right and the right-hand algorithm swaps it out for an edge from the top.',
        cases: [{
          ...B('middle', 'In its spot, flipped', [...right, 'U2', ...right], lit([...firstLayer, ...middleEdges]), 'The algorithm takes it out to the top, U2 brings it round above the green center, and the algorithm puts it back the right way round.'),
          breakAfter: 8,
        }],
      },
    ],
    yellowCross: [{
      id: 'yellow-cross',
      name: 'Yellow cross',
      about: 'Ignore the corners. Look at the yellow edges on top: a line, an L or just the center dot. Hold the shape as shown and do F R U R′ U′ F′; each go takes it one shape further.',
      cases: [
        B('yellow-cross', 'Line', crossAlg, edgesShown, 'Hold the line left to right. One go makes the plus.'),
        { ...B('yellow-cross', 'L', [...crossAlg, ...crossAlg], edgesShown, 'Hold the L at the back left. The first go makes a line, left to right, and the second the plus.'), breakAfter: 6 },
        { ...B('yellow-cross', 'Dot', [...crossAlg, 'U2', ...crossAlg, ...crossAlg], edgesShown, 'Do it from any side and you have an L. Turn the top to hold it at the back left (here U2): then it’s the L case.'), breakAfter: 6 },
      ],
    }],
    yellowEdges: [{
      id: 'yellow-edges',
      name: 'Yellow edges',
      about: 'Turn the top until at least two edges match the center below them, then do R U R′ U R U2 R′ U. The arrows show where the edges go.',
      cases: [
        B('yellow-edges', 'Two side by side', sune, noCorners, 'Hold the two that match at the back and the right. One go swaps the other two.'),
        { ...B('yellow-edges', 'Two opposite', [...sune, 'U', 'y', ...sune], noCorners, 'Do it once from any side. Turn the top until two neighbours match (here U), hold them at the back and the right (y) and it’s the case above.'), breakAfter: 8 },
      ],
    }],
    cornerSpots: [{
      id: 'corner-spots',
      name: 'Corner spots',
      about: 'A corner is in its spot when it has the colors of the three centers around it, however it’s twisted. Hold one that is at the front right and do U R U′ L′ U R′ U′ L: it moves the other three round. The arrows show where they go.',
      cases: [
        B('corner-spots', 'One in its spot', niklas, undefined, 'One go moves the other three home.'),
        { ...B('corner-spots', 'One in its spot, the other way', [...niklas, ...niklas], undefined, 'The other three go round the other way: do it twice.'), breakAfter: 8 },
        { ...B('corner-spots', 'None in its spot', [...niklas, 'y', ...niklas], undefined, 'Do it once from any side and one corner will be in its spot. Hold that one at the front right (here y) and it’s a case above.'), breakAfter: 8 },
      ],
    }],
    cornerTwists: [{
      id: 'corner-twists',
      name: 'Twist a corner',
      about: 'Hold a corner without yellow on top at the front right and repeat R′ D′ R D until yellow faces up. The lower layers get scrambled on the way: that’s fine. Then turn only the top to bring the next corner there, and keep going. Once the last corner is done, the lower layers are back.',
      cases: [
        B('corner-twist', 'Yellow facing right', repeat(twist, 2), topOnly, 'Two rounds.'),
        B('corner-twist', 'Yellow facing front', repeat(twist, 4), topOnly, 'Four rounds.'),
      ],
    }],
  };

  return {
    home,
    /** the top layer, to keep lit while a last-layer case plays */
    focusTop: () => TOP_STICKERS,
    pllArrows: (c: Case) => pllArrows(c.setup),
    beginner,
    cross, f2l,
    ollEdges, ollCorners, oll,
    pllCorners, pllEdges, pll,
  };
}

/** the 2×2 beginner's method's algorithms, as its guided solve (beginner2.ts) does them */
export const BEGINNER2 = {
  sune: alg("R U R' U R U2 R'"),
  swap: alg("R' F R' B2 R F' R' B2 R2"),
};

/**
 * The 2×2's yellow top, by shape: [name, corners showing yellow on top, the turns of the top
 * between Sunes, note]. Each
 * shape is solved by Sunes alone, held by the rule (one yellow corner up: it goes front left;
 * none: the front-left corner's yellow faces left; two: it faces you), turning only the top in
 * between; the turns are the ones the guided solve makes.
 */
const YELLOW_TOP: [string, number, string[], string][] = [
  ['Sune', 1, [], 'One corner up, at the front left: one Sune does it.'],
  ['Anti-Sune', 1, ['U2'], 'One corner up: hold it at the front left. A Sune leaves the Sune case, again with one corner up.'],
  ['H', 0, [''], 'None up, yellow facing left and right in pairs. Hold one pair facing left; after one Sune it’s the Sune case.'],
  ['Pi', 0, ["U'"], 'None up. Turn the top so the front-left corner’s yellow faces left; a Sune leaves one up.'],
  ['Headlights', 2, ["U'", 'U2'], 'Two up, side by side. Turn the top so the front-left corner’s yellow faces you; it takes three Sunes.'],
  ['T', 2, ['U', 'U2'], 'Two up, side by side, the other two facing out to either side. Three Sunes, by the same rule each time.'],
  ['Bowtie', 2, ['', 'U2'], 'Two up, across from each other. Hold the cube so the front-left corner’s yellow faces you; three Sunes.'],
];

export type Cube2Cases = ReturnType<typeof build2>;
const built2 = new WeakMap<CubeModel, Cube2Cases>();

/** The 2×2's case sets, built once per model. */
export function cube2Cases(M: CubeModel): Cube2Cases {
  if (!built2.has(M)) built2.set(M, build2(M));
  return built2.get(M)!;
}

function build2(M: CubeModel) {
  if (M.n !== 2) throw new Error('these case sets are for the 2×2');
  const K = lessonKit(M);
  const { at, stickersOf, colorsAt } = K;
  // set up with white down, as the guided solve holds it
  const home = K.apply(M.solved(), ['z2']);
  const yellow = home[at('UFR', 'U')];
  const BOTTOM = CORNERS.slice(4);
  const ALL = M.facelets.map((f) => f.index);
  const whiteCorners = (s: State) => ALL.filter((i) => colorsAt(s, CORNERS.find((c) => stickersOf(c).includes(i))!).includes(home[at('DFR', 'D')]));
  const bottomAndYellow = (s: State) => ALL.filter((i) => BOTTOM.some((c) => stickersOf(c).includes(i)) || s[i] === yellow);
  const make = caseMaker((s, moves) => K.apply(s, invertAlg(moves)), home, UNSET);
  const sexy = (n: number) => repeat(SEXY, n);
  const { sune, swap } = BEGINNER2;
  const TOP_STICKERS = TOP_CORNERS.flatMap((slot) => stickersOf(slot));

  /** An arrow from each top corner to its spot, which the white layer's colors say. */
  function arrows(s: State): [number, number][] {
    const side = (f: string) => s[at(BOTTOM.find((c) => c.includes(f))!, f)];
    const out: [number, number][] = [];
    for (const slot of TOP_CORNERS) {
      if (colorsAt(s, slot).includes(UNSET)) continue;
      const to = TOP_CORNERS.find((h) => sameSet(colorsAt(s, slot), [yellow, side(h[1]), side(h[2])]))!;
      if (to !== slot) out.push([at(slot, 'U'), at(to, 'U')]);
    }
    return out;
  }

  const whiteLayer: CaseGroup[] = [
    {
      id: '2x2-white-corners-top',
      name: 'Above its spot',
      about: 'The other three white corners are in. This one is on top, right above its spot at the front right: repeat R U R′ U′ until it drops in with white facing down.',
      cases: [
        make('2x2-white-corner-white-facing-right', 'White facing right', sexy(1), whiteCorners, 'One round drops it in.'),
        make('2x2-white-corner-white-facing-up', 'White facing up', sexy(3), whiteCorners, 'Three rounds.'),
        make('2x2-white-corner-white-facing-front', 'White facing front', sexy(5), whiteCorners, 'Five rounds: the same four moves each time.'),
      ],
    },
    {
      id: '2x2-white-corners-stuck',
      name: 'Twisted in its spot',
      about: 'In its spot but twisted: hold it at the front right and do R U R′ U′ once to lift it to the top. Then it’s a case from above.',
      cases: [
        make('2x2-white-corner-in-its-spot-white-facing-right', 'White facing right', sexy(2), whiteCorners, 'The first round lifts it out, the second drops it in.'),
        make('2x2-white-corner-in-its-spot-white-facing-front', 'White facing front', sexy(4), whiteCorners, 'The first round lifts it out with white facing up; three more drop it in.'),
      ],
    },
  ];

  const sunes = (turns: string[]) => [...sune, ...turns.flatMap((u) => [...(u ? [u] : []), ...sune])];
  const up = (n: number) => YELLOW_TOP.filter(([, k]) => k === n).map(([name, , turns, note]) => {
    const out = make(`2x2-yellow-top-${slug(name)}`, name, sunes(turns), bottomAndYellow, note);
    // a long run of Sunes reads better a Sune to a line
    return turns.length ? { ...out, breakAfter: sune.length } : out;
  });
  const yellowTop: CaseGroup[] = [
    { id: '2x2-yellow-top-one', name: 'One corner up', about: 'Hold the yellow corner at the front left and do the Sune.', cases: up(1) },
    { id: '2x2-yellow-top-none', name: 'No corner up', about: 'Turn the top until the front-left corner’s yellow faces left, then do the Sune.', cases: up(0) },
    { id: '2x2-yellow-top-two', name: 'Two corners up', about: 'Turn the top until the front-left corner’s yellow faces you, then do the Sune.', cases: up(2) },
  ];

  const swapCorners: CaseGroup[] = [{
    id: '2x2-swap',
    name: 'Swap corners',
    about: 'Look at the sides of the top layer: two matching stickers on a side are headlights. The algorithm swaps the two front corners; the arrows show where each corner goes.',
    cases: [
      make('2x2-swap-headlights', 'Headlights on one side', swap, undefined, 'Hold the headlights at the back. One go swaps the front two.'),
      { ...make('2x2-swap-no-headlights', 'No headlights', [...swap, 'U', ...swap], undefined, 'Two corners across from each other swap. Do it once from any side, then there are headlights: hold them at the back (here U) and go again.'), breakAfter: 9 },
    ],
  }];

  return { home, focusTop: () => TOP_STICKERS, arrows: (c: Case) => arrows(c.setup), whiteLayer, yellowTop, swapCorners };
}

/** the reduction method's own algorithms, as its guided solve (reduction.ts) does them */
export const REDUCTION = {
  /** joins the last two edges: flips the one at the front right */
  flip: alg("R U R' F R' F' R"),
  ollParity: alg("Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'"),
  pllParity: alg('2R2 U2 2R2 Uw2 2R2 Uw2'),
  /** the 5×5's: swaps the outer pieces of the edge at the front of the top */
  edgeParity: alg("Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 3Rw' U2 Rw U2 Rw' U2 Rw'"),
};

export type BigCubeCases = ReturnType<typeof buildBig>;
const builtBig = new WeakMap<CubeModel, BigCubeCases>();

/** The 4×4's or 5×5's case sets, built once per model. */
export function bigCubeCases(M: CubeModel): BigCubeCases {
  if (!builtBig.has(M)) builtBig.set(M, buildBig(M));
  return builtBig.get(M)!;
}

function buildBig(M: CubeModel) {
  if (M.n !== 4 && M.n !== 5) throw new Error('these case sets are for the 4×4 and 5×5');
  const odd = M.n === 5;
  const m = M.n - 1;
  const { cube3, bigOf, reduce, lift } = asThree(M);
  const C3 = cubeCases(cube3);
  // set up with white down, as the 3×3 stage holds it; the first center is built on top
  const home = M.applyAll(M.solved(), ['z2']);
  const up = M.solved();
  const yellow = lessonKit(cube3).center(C3.home, 'U');
  const make = caseMaker((s, moves) => M.applyAll(s, invertAlg(moves)), home, UNSET);

  const ALL = M.facelets.map((f) => f.index);
  const outerAxes = (i: number) => M.facelets[i].pos.filter((x) => Math.abs(x) === m).length;
  const CENTERS = ALL.filter((i) => outerAxes(i) === 1);
  const EDGE_STICKERS = ALL.filter((i) => outerAxes(i) === 2);
  const CENTER_SET = new Set(CENTERS);
  const EDGE_SET = new Set(EDGE_STICKERS);
  const TOP_LAYER = ALL.filter((i) => M.facelets[i].pos[1] === m);
  const centersOnly = () => CENTERS;
  // the corners are for later: their stickers are blank
  const noCorners = () => [...CENTERS, ...EDGE_STICKERS];
  // the first two layers, and the yellow stickers of the top edges, as for the yellow cross
  const edgesShown = (s: State) => ALL.filter((i) => M.facelets[i].pos[1] !== m || CENTER_SET.has(i) || (EDGE_SET.has(i) && s[i] === yellow));

  // ---------- centers ----------

  const two = odd ? ' On a 5×5 the wide turn takes two layers, so it brings in two pieces at once, a corner piece and an edge piece of the center.' : '';
  const centers: CaseGroup[] = [
    {
      id: 'centers-first',
      name: 'The first center',
      about: 'White goes on top. A white piece on a side comes up in three moves: a slice turn lifts it in, a turn of the top moves it out of the slice, and the slice turns back, bringing the top’s own pieces back with it.',
      cases: [
        make('centers-first-front', 'A piece on the front', alg("Rw U Rw'"), centersOnly, 'Rw lifts the right side of the front into the top. U moves the white piece out of its way, and Rw′ turns it back.' + two, up),
        make('centers-first-right', 'A piece on the right', alg("Fw' U Fw"), centersOnly, 'The same from the right: Fw′ lifts the right side’s top half in.' + two, up),
      ],
    },
    {
      id: 'centers-sides',
      name: 'The sides',
      about: 'With the top and bottom built, each side is built on the front. The slices now turn sideways, Uw and Dw, so the top and bottom centers only spin in place.',
      cases: [
        make('centers-side-right', 'A piece on the right', alg("Uw F Uw'"), centersOnly, 'Uw brings it round to the front, F moves it out of the slice, and Uw′ turns the slice back.' + two, M.applyAll(up, ['x2'])),
      ],
    },
  ];

  // ---------- edges ----------

  const { flip, ollParity, pllParity, edgeParity } = REDUCTION;
  const edges: CaseGroup[] = [
    {
      id: 'edges-pair',
      name: 'Pairing an edge',
      about: `Set up ${odd ? 'the pieces of one edge' : 'the two pieces of an edge'} in the middle layer, at the front left and front right, at different heights. A slice turn joins them, R U R′ swaps the joined edge out for one from the top, and the slice turns back to fix the centers.`,
      cases: [make('edges-pair', 'Join, swap out, slice back', alg(`Uw' R U R' Uw`), noCorners, 'Uw′ joins them at the front right; R U R′ takes the edge up and out of the slice; Uw puts the centers back.')],
    },
    {
      id: 'edges-last-two',
      name: 'The last two edges',
      about: 'With two left there’s no unfinished edge to swap in. Join them with the slice as before, then flip the edge at the front right instead: that trades the halves between the two.',
      cases: [{ ...make('edges-last-two', 'Join, flip, slice back', [`Uw'`, ...flip, 'Uw'], noCorners, `Uw′ joins one pair; ${flip.join(' ').replaceAll("'", '′')} flips the edge at the front right, which finishes both; Uw puts the centers back.`), breakAfter: 1 }],
    },
    ...(odd ? [{
      id: 'edges-parity',
      name: 'Edge parity',
      about: 'On a 5×5 the last edge can end up with its two outer pieces swapped round its middle one. No pairing move fixes that: this algorithm swaps them back, at the front of the top.',
      cases: [make('edge-parity', 'Outer pieces swapped', edgeParity, noCorners, 'Hold the edge at the front of the top. The algorithm keeps the centers and the other edges.')],
    }] : []),
  ];

  // ---------- parity ----------

  const crossAlg = BEGINNER.cross;
  const parity: { oll: CaseGroup[]; pll: CaseGroup[] } = odd ? { oll: [], pll: [] } : {
    oll: [{
      id: 'oll-parity',
      name: 'OLL parity',
      about: 'One or three edges show yellow on top. On a 3×3 that can’t happen, but each 4×4 edge is two pieces. Hold an edge without yellow on top at the front and do the algorithm: it flips that edge and keeps the first two layers.',
      cases: [
        make('oll-parity-three-up', 'Three edges up', ollParity, edgesShown, 'The one without yellow on top goes at the front. One go makes the cross.'),
        { ...make('oll-parity-one-up', 'One edge up', [...ollParity, 'U', ...crossAlg], edgesShown, 'Any edge without yellow on top goes at the front. Then two show yellow, here in a line: hold it left to right (U) and make the cross as usual.'), breakAfter: ollParity.length },
      ],
    }],
    pll: [{
      id: 'pll-parity',
      name: 'PLL parity',
      about: 'Before the corners, check them: if two would have to swap, or all four go round, the corner step can’t do it. Really two edges are swapped. The algorithm swaps the front and back edges; then line the edges up again.',
      cases: [make('pll-parity', 'Front and back edges swapped', [...pllParity, 'U2'], undefined, 'Here the rest of the top is done, so this is all it does: it swaps the front and back edges, and turns the top halfway (U2 turns it back). In a solve you spot it earlier, by the corners.')],
    }],
  };

  // ---------- the 3×3 stage ----------

  /** the beginner's 3×3 cases, on the big cube */
  const beginner = Object.fromEntries(Object.entries(C3.beginner).map(([k, groups]) =>
    [k, groups.map((g) => ({ ...g, cases: g.cases.map((c) => ({ ...c, setup: lift(c.setup) })) }))])) as typeof C3.beginner;
  // an arrow on the big cube for each on the 3×3: between the middle pieces of two edges on a
  // 5×5, and between their nearest pieces on a 4×4 (the same pair either way round, so a swap
  // stays one arrow)
  const pos = (i: number) => M.facelets[i].pos;
  const apart = (i: number, j: number) => pos(i).reduce((d, x, k) => d + (x - pos(j)[k]) ** 2, 0);
  const nearest = (a: number, b: number): [number, number] => {
    if (odd) return [bigOf[a][(bigOf[a].length - 1) / 2], bigOf[b][(bigOf[b].length - 1) / 2]];
    // the closest pair, the lowest sticker breaking ties
    const pairs = bigOf[a].flatMap((i) => bigOf[b].map((j) => ({ ij: [i, j] as [number, number], d: apart(i, j), lo: Math.min(i, j) })));
    return pairs.reduce((p, q) => (q.d < p.d || (q.d === p.d && q.lo < p.lo) ? q : p)).ij;
  };
  const bigArrows = (arrows: [number, number][]) => arrows.map(([a, b]) => nearest(a, b));

  return {
    home,
    focusTop: () => TOP_LAYER,
    pllArrows: (c: Case) => bigArrows(C3.pllArrows({ ...c, setup: reduce(c.setup) })),
    centers, edges, beginner, parity,
  };
}

/** Every case of every set, by id: what a guided solve's step can name. */
export function allCases(M: CubeModel) {
  if (M.n === 2) {
    const C2 = cube2Cases(M);
    return new Map([...C2.whiteLayer, ...C2.yellowTop, ...C2.swapCorners].flatMap((g) => g.cases).map((c) => [c.id, c]));
  }
  if (M.n > 3) {
    const B = bigCubeCases(M);
    const groups = [...B.centers, ...B.edges, ...Object.values(B.beginner).flat(), ...B.parity.oll, ...B.parity.pll];
    return new Map(groups.flatMap((g) => g.cases).map((c) => [c.id, c]));
  }
  const C = cubeCases(M);
  const groups = [...Object.values(C.beginner).flat(), ...C.cross, ...C.f2l, C.ollEdges, C.ollCorners, ...C.oll, C.pllCorners, C.pllEdges, ...C.pll];
  return new Map(groups.flatMap((g) => g.cases).map((c) => [c.id, c]));
}
