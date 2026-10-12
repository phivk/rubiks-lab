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

import { COLORS } from '../core/colors';
import type { State, Tutorial, TutorialCase, TutorialStep } from '../core/types';
import { OLL, PLL } from './algs';
import { CFOP_STAGES } from './cfop';
import { alg, CORNERS, EDGES, lessonKit, sameSet, TOP_CORNERS, TOP_EDGES, WIDE_NOTATION } from './lessonKit';
import { invertAlg, type CubeModel } from './model';

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

const GRAY = '#3a3f4c';
const DARK = '#0d0f14';

export function cfopTutorial(M: CubeModel): Tutorial {
  if (M.n !== 3) throw new Error('the CFOP tutorial is for the 3×3');
  const K = lessonKit(M);
  const { at, stickersOf, center, find, colorsAt } = K;
  // CFOP is solved with white down; z2 keeps green in front
  const home = K.apply(M.solved(), ['z2']);
  const white = center(home, 'D');
  const yellow = center(home, 'U');
  const setupFor = (moves: string[]) => K.apply(home, invertAlg(moves));
  const make = (name: string, text: string, note?: string): TutorialCase => {
    const moves = alg(text);
    return { name, moves, setup: setupFor(moves), note };
  };

  const SLOTS = [...EDGES, ...CORNERS, ...'UDFRBL'];
  const slotOf: string[] = [];
  for (const slot of SLOTS) for (const i of stickersOf(slot)) slotOf[i] = slot;
  const pieceStickers = (s: State, colors: number[][]) => colors.flatMap((c) => stickersOf(find(s, c)));
  const centers = [...'UDFRBL'].map((f) => at(f, f));
  const TOP = [...TOP_EDGES, ...TOP_CORNERS];
  const focusTop = () => [at('U', 'U'), ...TOP.flatMap((slot) => stickersOf(slot))];

  // ---------- diagrams ----------

  const poly = (pts: [number, number][], fill: string) =>
    `<polygon points="${pts.map(([x, y]) => `${+x.toFixed(3)},${+y.toFixed(3)}`).join(' ')}" fill="${fill}"/>`;

  /**
   * The cube from above the front-right corner: the top, front and right faces, with the back
   * and left stickers of the top layer folded out flat. Stickers not in `show` are gray.
   */
  function isoView(s: State, show: Set<number>) {
    const P = ([x, y, z]: number[]): [number, number] => [(x - z) * 0.866, (x + z) * 0.5 - y];
    const letter = (v: number, plus: string, minus: string) => (v === 1 ? plus : v === -1 ? minus : '');
    const fill = (i: number) => (show.has(i) ? COLORS[s[i]] : GRAY);
    const h = 0.44;
    const out: string[] = [];
    // body outline
    out.push(poly([[-1.5, 1.5, -1.5], [1.5, 1.5, -1.5], [1.5, -1.5, -1.5], [1.5, -1.5, 1.5], [-1.5, -1.5, 1.5], [-1.5, 1.5, 1.5]].map(P), DARK));
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
      // top: x = a, z = b
      out.push(poly([[a - h, 1.5, b - h], [a + h, 1.5, b - h], [a + h, 1.5, b + h], [a - h, 1.5, b + h]].map(P),
        fill(at('U' + letter(a, 'R', 'L') + letter(b, 'F', 'B'), 'U'))));
      // front: x = a, y = b
      out.push(poly([[a - h, b - h, 1.5], [a + h, b - h, 1.5], [a + h, b + h, 1.5], [a - h, b + h, 1.5]].map(P),
        fill(at('F' + letter(b, 'U', 'D') + letter(a, 'R', 'L'), 'F'))));
      // right: y = a, z = b
      out.push(poly([[1.5, a - h, b - h], [1.5, a + h, b - h], [1.5, a + h, b + h], [1.5, a - h, b + h]].map(P),
        fill(at('R' + letter(a, 'U', 'D') + letter(b, 'F', 'B'), 'R'))));
    }
    // the top layer's back and left stickers, folded out
    for (const a of [-1, 0, 1]) {
      out.push(poly([[a - h, 1.5, -1.62], [a + h, 1.5, -1.62], [a + h, 1.5, -1.95], [a - h, 1.5, -1.95]].map(P),
        fill(at('UB' + letter(a, 'R', 'L'), 'B'))));
      out.push(poly([[-1.62, 1.5, a - h], [-1.62, 1.5, a + h], [-1.95, 1.5, a + h], [-1.95, 1.5, a - h]].map(P),
        fill(at('UL' + letter(a, 'F', 'B'), 'L'))));
    }
    return `<svg class="diagram" viewBox="-3.15 -3.75 6.3 6.9" role="img">${out.join('')}</svg>`;
  }

  /** The top from above, with the top layer's side stickers around it; PLLs add arrows. */
  function topView(s: State, kind: 'oll' | 'pll') {
    const T = 0.36, G = 0.1, O = T + G;
    const W = 2 * O + 3;
    const fill = (i: number) => (kind === 'pll' ? COLORS[s[i]] : s[i] === yellow ? COLORS[yellow] : GRAY);
    const rect = (x: number, y: number, w: number, hh: number, i: number) =>
      `<rect x="${x + 0.05}" y="${y + 0.05}" width="${w - 0.1}" height="${hh - 0.1}" rx="0.1" fill="${fill(i)}"/>`;
    const row = (r: number) => (r === 0 ? 'B' : r === 2 ? 'F' : '');
    const col = (c: number) => (c === 0 ? 'L' : c === 2 ? 'R' : '');
    const out = [`<rect x="${O - 0.04}" y="${O - 0.04}" width="3.08" height="3.08" rx="0.14" fill="${DARK}"/>`];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(rect(O + c, O + r, 1, 1, at('U' + row(r) + col(c), 'U')));
    for (let k = 0; k < 3; k++) {
      out.push(rect(O + k, 0, 1, T, at('UB' + col(k), 'B')));
      out.push(rect(O + k, O + 3 + G, 1, T, at('UF' + col(k), 'F')));
      out.push(rect(0, O + k, T, 1, at('UL' + row(k), 'L')));
      out.push(rect(O + 3 + G, O + k, T, 1, at('UR' + row(k), 'R')));
    }
    if (kind === 'pll') out.push(...pllArrows(s, O));
    return `<svg class="diagram" viewBox="0 0 ${W} ${W}" role="img">${out.join('')}</svg>`;
  }

  /** An arrow from each top piece to its spot (one with two heads for a swap). */
  function pllArrows(s: State, O: number) {
    const cell = (slot: string): [number, number] => [O + 1.5 + (slot.includes('R') ? 1 : slot.includes('L') ? -1 : 0), O + 1.5 + (slot.includes('F') ? 1 : slot.includes('B') ? -1 : 0)];
    const goes = new Map<string, string>();
    for (const slot of TOP) {
      const to = TOP.find((h) => h.length === slot.length && sameSet(colorsAt(s, slot), [...h].map((f) => center(s, f))))!;
      if (to !== slot) goes.set(slot, to);
    }
    const out: string[] = [];
    const head = (x: number, y: number, dx: number, dy: number) => {
      const w = 0.17, l = 0.3;
      return poly([[x, y], [x - dx * l - dy * w, y - dy * l + dx * w], [x - dx * l + dy * w, y - dy * l - dx * w]], 'currentColor');
    };
    for (const [from, to] of goes) {
      const swap = goes.get(to) === from;
      if (swap && from > to) continue;
      const [x1, y1] = cell(from), [x2, y2] = cell(to);
      const len = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / len, dy = (y2 - y1) / len;
      // the ends, kept off the cell centers; the line stops short of each head
      const a = [x1 + dx * 0.2, y1 + dy * 0.2], b = [x2 - dx * 0.2, y2 - dy * 0.2];
      const back = swap ? 0.2 : 0;
      out.push(`<line x1="${a[0] + dx * back}" y1="${a[1] + dy * back}" x2="${b[0] - dx * 0.2}" y2="${b[1] - dy * 0.2}" stroke="currentColor" stroke-width="0.09" stroke-linecap="round"/>`);
      out.push(head(b[0], b[1], dx, dy));
      if (swap) out.push(head(a[0], a[1], -dx, -dy));
    }
    return [`<g class="arrows">`, ...out, '</g>'];
  }

  // ---------- 1. cross ----------

  const crossEdges = [...'FRBL'].map((f) => [white, center(home, f)]);
  const cross: TutorialStep = {
    name: 'Cross',
    goal: CFOP_STAGES[0].goal,
    html: `<p>Hold the cube with the <b>white center down</b> and green in front. The cross is the four white edges on the bottom, each beside the center of its other color.</p>
      <p>There’s no algorithm to learn here: the cross takes at most eight moves, and with practice you plan all of it while you inspect the cube. These examples show the usual ways to bring one edge home, the white–green one, without disturbing the others.</p>
      <p class="muted">Tip: solve the cross on the bottom from the start, even though it’s harder to see. You’ll never have to flip the cube for the next stage.</p>`,
    groups: [{ name: 'Bringing one edge home', cases: CROSS_CASES.map(([name, a, note]) => make(name, a, note)) }],
    diagram: (c) => isoView(c.setup, new Set([...centers, ...pieceStickers(c.setup, crossEdges)])),
    focus: (s) => [...centers, ...pieceStickers(s, crossEdges)],
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
  const f2lCases = F2L_ALGS.map((a) => make('', a));
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
  const f2lShow = (s: State) => [...centers, ...pieceStickers(s, pair)];
  const f2l: TutorialStep = {
    name: 'F2L',
    goal: CFOP_STAGES[1].goal,
    html: `<p><b>F2L</b> stands for <b>F</b>irst <b>2</b> <b>L</b>ayers. Each white corner and the middle edge beside it go in together, as a pair, into the slot between their two centers.</p>
      <p>Hold the slot you’re working on at the <b>front right</b>. Find its corner and edge, turn the top until they look like one of the pictures, and do its algorithm. Every case keeps the cross and the other slots.</p>
      <p>There are 41 cases, but don’t learn them by heart: they’re all built from the same few moves (<code>R U R'</code>, <code>F' U' F</code>), which join the pair in the top layer and then insert it. Watch a few on the cube and you’ll see the idea.</p>`,
    groups: f2lGroups,
    diagram: (c) => isoView(c.setup, new Set(f2lShow(c.setup))),
    // the pair, the centers, the cross and the other slots: not whatever sits in the top or the pair's slot
    focus: (s) => {
      const keep = new Set(pieceStickers(s, pair));
      const other = (slot: string) => slot.length === 1 || (!slot.includes('U') && slot !== 'FR' && slot !== 'DRF');
      return M.facelets.map((f) => f.index).filter((i) => keep.has(i) || other(slotOf[i]));
    },
  };

  // ---------- 3. OLL ----------

  const oll: TutorialStep = {
    name: 'OLL',
    goal: CFOP_STAGES[2].goal,
    html: `<p><b>OLL</b> stands for <b>O</b>rient the <b>L</b>ast <b>L</b>ayer: with the first two layers solved, one algorithm turns every top piece so yellow faces up.</p>
      <p>Hold the cube with yellow on top and look at it from above. The pictures show which stickers are yellow, on top and on the sides of the top layer. Turn the top until your cube matches one, then do its algorithm.</p>
      <p>There are 57 cases. Start with the first group: once all four edges show yellow, these seven fix the corners. With the three edge cases in the T, I and P groups (<code>F R U R' U' F'</code> and friends) you have two-look OLL, and can learn the rest one at a time.</p>`,
    groups: OLL_GROUPS.map((g) => ({
      name: g,
      cases: OLL.filter((o) => o.group === g).map((o) => make(`OLL ${o.n} · ${o.name}`, o.alg)),
    })),
    diagram: (c) => topView(c.setup, 'oll'),
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
    diagram: (c) => topView(c.setup, 'pll'),
    focus: focusTop,
  };

  return {
    id: 'cfop',
    name: 'CFOP',
    intro: 'Every case of each CFOP stage, with its algorithm. Hold your own cube white down, green in front, and follow along — no need to enter it here. Pick a case to watch it on the 3D cube.',
    notation: WIDE_NOTATION,
    steps: [cross, f2l, oll, pll],
  };
}
