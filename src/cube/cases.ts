// The 3×3's case sets: every case a course can teach, with its algorithm, for a method's stages
// to pick from. Unlike a guided solve a case doesn't look at the cube on screen: each is set up
// by undoing its algorithm on a solved cube held with white down, so the picture, the 3D cube
// and the algorithm always agree.
//
//   cross        a few example edges, since the cross is planned rather than learnt
//   F2L          the idea, build the block then insert it, on cases sorted by where the pieces are
//   two-look     OLL: the 3 edge cases that make a yellow cross, then the 7 corner cases (OCLL);
//                PLL: the 2 corner cases, then the 4 edge cases
//   full         all 57 OLLs, by shape, and all 21 PLLs, by what moves
//
// A case has the same id in every set it's in (OLL 27 is oll-27, as two-look's Sune and as
// full OLL's), and a guided solve's step names the case it is by that id (GuideStep.caseId).
// scripts/verify-tutorial.ts checks every case.

import type { Case, CaseGroup, State } from '../core/types';
import { OLL, OLL_CORNERS, OLL_EDGES, PLL, PLL_CORNERS, PLL_EDGES, type TwoLookAlg } from './algs';
import { alg, CORNERS, EDGES, lessonKit, sameSet, TOP_CORNERS, TOP_EDGES, U_TURNS } from './lessonKit';
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
  /**
   * A case, set up by undoing its algorithm. Stickers outside `shown` are blanked, on the
   * picture and the 3D cube alike: they're whatever a real cube has there at this stage.
   */
  const make = (id: string, name: string, text: string, shown?: (s: State) => number[], note?: string): Case => {
    const moves = alg(text);
    const setup = K.apply(home, invertAlg(moves));
    if (shown) {
      const keep = new Set(shown(setup));
      setup.forEach((_, i) => { if (!keep.has(i)) setup[i] = UNSET; });
    }
    return { id, name, moves, setup, note };
  };

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

  return {
    home,
    /** the top layer, to keep lit while a last-layer case plays */
    focusTop: () => TOP_STICKERS,
    pllArrows: (c: Case) => pllArrows(c.setup),
    cross, f2l,
    ollEdges, ollCorners, oll,
    pllCorners, pllEdges, pll,
  };
}

/** Every case of every set, by id: what a guided solve's step can name. */
export function allCases(M: CubeModel) {
  const C = cubeCases(M);
  const groups = [...C.cross, ...C.f2l, C.ollEdges, C.ollCorners, ...C.oll, C.pllCorners, C.pllEdges, ...C.pll];
  return new Map(groups.flatMap((g) => g.cases).map((c) => [c.id, c]));
}
