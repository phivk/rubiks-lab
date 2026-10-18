// The Pyraminx's case set, for its layer-by-layer method (lesson.ts), stage by stage. As on the
// cubes, a case doesn't look at the puzzle on screen: each is set up by undoing its algorithm
// on a solved Pyraminx held yellow down, green toward you, so the picture, the 3D puzzle and
// the algorithm always agree.
//
//   tips            a tip twisted either way: one turn of the tip
//   bottom centers  a center with yellow to the right or left: one turn of the corner
//   bottom edges    the last bottom edge, from each place it can be: in the top layer either
//                   way round, or flipped in its slot. Each is the guided solve's own route
//   top layer       the five last-layer cases, each with its algorithm
//
// A guided solve's step names the case it is by its id (GuideStep.caseId).
// scripts/verify-tutorial.ts checks every case.

import type { Case, CaseGroup, State } from '../core/types';
import { alg } from '../cube/lessonKit';
import { CENTER, TIP, UNSET, applyAll, invertMove, piecesOf, solved, stickers } from './model';

/**
 * The last layer. Each is written as seen with the green side toward you; the flips are also
 * done from the other two sides, which renames the corners (SIDES).
 */
export const LL = [
  { id: 'cw', name: 'Cycle clockwise', moves: alg("R' U' R U' R' U' R") },
  { id: 'ccw', name: 'Cycle counter-clockwise', moves: alg("R' U R U R' U R") },
  { id: 'flip', name: 'Flip two in place', moves: alg("R' L R L' U L' U' L") },
  { id: 'flipcw', name: 'Flip two, cycle clockwise', moves: alg("L U R U' R' L'") },
  { id: 'flipccw', name: 'Flip two, cycle counter-clockwise', moves: alg("R' U' L' U L R") },
];

/** holding another side toward you renames the bottom corners */
export const SIDES = [
  { name: 'front', map: {} as Record<string, string> },
  { name: 'right', map: { L: 'R', R: 'B', B: 'L' } as Record<string, string> },
  { name: 'left', map: { L: 'B', B: 'R', R: 'L' } as Record<string, string> },
];
export const rename = (moves: string[], map: Record<string, string>) => moves.map((m) => (map[m[0]] ?? m[0]) + m.slice(1));

/**
 * The last bottom edge, green–yellow, going into its slot at the front: [id, name, algorithm,
 * note]. The algorithms are the guided solve's routes (lesson.ts) with the other two bottom
 * edges in.
 */
const LAST_EDGE: Record<string, [string, string, string, string][]> = {
  'one move': [
    ['front-left-green-front', 'Front left, green facing you', "R U' R'", 'Lift the right corner, turn the top to bring the slot under the edge, and put it back.'],
    ['front-right-green-front', 'Front right, green facing you', "L' U L", 'The mirror image: lift the left corner instead.'],
    ['back-green-right', 'At the back, green on the right', "L' U' L", 'Lift the left corner, and the top turn brings the edge round to it.'],
    ['back-green-left', 'At the back, green on the left', "R U R'", 'The mirror image, with the right corner.'],
  ],
  'turn first': [
    ['front-right-green-right', 'Front right, green on the right', "U R U' R'", 'Turn the top first, so the edge is at the back with green on the left: then it’s R U R′ with U′ in place of U.'],
    ['front-left-green-left', 'Front left, green on the left', "U L' U' L", 'Turn the top first, then lift the left corner.'],
  ],
  flipped: [
    ['flipped', 'Flipped in its slot', "L' U L R U R'", 'Lift it out into the top with L′ U L, then it goes in from the back with R U R′.'],
  ],
};

let built: ReturnType<typeof build> | null = null;
/** The Pyraminx's case sets, built once. */
export function pyraminxCases() {
  return (built ??= build());
}

function build() {
  const home = solved();
  const axial = [0, 1, 2, 3].flatMap((v) => [TIP(v), CENTER(v)]).flatMap(piecesOf);
  const BOTTOM_EDGES = [11, 12, 13];
  const TOP_EDGES = [8, 9, 10];
  const make = (id: string, name: string, moves: string[], shown: number[] | null, note?: string): Case => {
    const setup = applyAll(home, [...moves].reverse().map(invertMove));
    if (shown) {
      const keep = new Set(shown);
      setup.forEach((_, i) => { if (!keep.has(i)) setup[i] = UNSET; });
    }
    return { id: `pyra-${id}`, name, moves, setup, note };
  };

  const tips: CaseGroup[] = [{
    id: 'pyra-tips',
    name: 'A tip',
    about: 'Look at a tip from outside, and at the center below it: one turn of the tip lines its colors up with the center’s. Here it’s the top tip; every tip goes the same way.',
    cases: [
      make('tip-ccw', 'Twisted counter-clockwise', ['u'], axial, 'Its colors are a third of a turn counter-clockwise from the center’s: u turns it back clockwise.'),
      make('tip-cw', 'Twisted clockwise', ["u'"], axial, 'A third of a turn clockwise: u′ turns it back.'),
    ],
  }];

  const centers: CaseGroup[] = [{
    id: 'pyra-centers',
    name: 'A bottom center',
    about: 'Look at a bottom corner from outside: its center’s yellow is to the right of the corner, or to the left. One turn of the corner, tip and all, brings it down. Here it’s the right corner; every corner goes the same way.',
    cases: [
      make('center-right', 'Yellow to the right', ['R'], axial, 'R turns the corner clockwise, as you look at it: yellow comes round to the bottom.'),
      make('center-left', 'Yellow to the left', ["R'"], axial, 'R′ turns it the other way.'),
    ],
  }];

  // the centers and tips, the other two bottom edges, and the green–yellow edge wherever it starts
  const bottomAnd = (piece: number, moves: string[]) => {
    const start = applyAll(home, [...moves].reverse().map(invertMove));
    const [g, y] = piecesOf(piece);
    const at = stickers.findIndex((st, i) => st.piece >= 8 && start[i] === home[g] && piecesOf(st.piece).some((j) => j !== i && start[j] === home[y]));
    return [...axial, ...BOTTOM_EDGES.filter((p) => p !== piece).flatMap(piecesOf), ...piecesOf(stickers[at].piece)];
  };
  const groupAbout: Record<string, [string, string]> = {
    'one move': ['In the top layer', 'The other two bottom edges are in. This one is in the top layer: lift a bottom corner so its slot comes up, turn the top, and put the corner back. Which corner, and which way to turn the top, depend on where the edge is and which way its green faces.'],
    'turn first': ['Turn the top first', 'When the edge’s green faces the side instead of you, turn the top first, so it’s one of the cases above.'],
    flipped: ['In its slot', 'In its slot but flipped: lift it out into the top layer, then put it back in the right way round.'],
  };
  const bottomEdges: CaseGroup[] = Object.entries(LAST_EDGE).map(([k, cases]) => ({
    id: `pyra-edges-${k.replace(' ', '-')}`,
    name: groupAbout[k][0],
    about: groupAbout[k][1],
    cases: cases.map(([id, name, moves, note]) => {
      const m = alg(moves);
      return make(`edge-${id}`, name, m, bottomAnd(11, m), note);
    }),
  }));

  const ll = (ids: string[], name: string, about: string): CaseGroup => ({
    id: `pyra-ll-${ids[0]}`, name, about,
    cases: LL.filter((a) => ids.includes(a.id)).map((a) => make(`ll-${a.id}`, a.name, a.moves, null)),
  });
  const topLayer: CaseGroup[] = [
    ll(['cw', 'ccw'], 'Cycle three', 'No edge is flipped, but all three are in the wrong place: they go round one place, clockwise or counter-clockwise seen from above.'),
    ll(['flip'], 'Flip two', 'Two edges are in place but flipped. Hold the puzzle so they’re the two at the front, and the one that’s right is at the back.'),
    ll(['flipcw', 'flipccw'], 'Flip two and cycle', 'Two edges are flipped and all three go round one place. Each can be done from any side: turn the puzzle until it looks like one of these.'),
  ];

  /** An arrow from each top edge to its spot, from a sticker to where its color goes. */
  function arrows(s: State): [number, number][] {
    const out: [number, number][] = [];
    for (const p of TOP_EDGES) {
      const [i, j] = piecesOf(p);
      if (s[i] === UNSET) continue;
      const to = TOP_EDGES.find((q) => piecesOf(q).every((k) => [s[i], s[j]].includes(home[k])))!;
      if (to === p) continue;
      out.push([i, piecesOf(to).find((k) => home[k] === s[i])!]);
    }
    return out;
  }

  return {
    tips, centers, bottomEdges, topLayer,
    arrows: (c: Case) => arrows(c.setup),
    focusTop: () => [TIP(0), CENTER(0), ...TOP_EDGES].flatMap(piecesOf),
  };
}

/** Every case, by id: what a guided solve's step can name. */
export function allPyraminxCases() {
  const C = pyraminxCases();
  return new Map([...C.tips, ...C.centers, ...C.bottomEdges, ...C.topLayer].flatMap((g) => g.cases).map((c) => [c.id, c]));
}
