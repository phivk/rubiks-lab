// Roux, Gilles Roux's method, as a lesson:
//
//   1. First block   a 1×2×3 block on the left: a square, then a corner–edge pair
//   2. Second block  the matching block on the right, turning only U, R, r and M, which
//                    leave the first block alone
//   3. CMLL          the four top corners, here in two looks: orient them (one of seven
//                    algorithms), then swap them into place (one of two)
//   4. LSE           the last six edges and the middle centers, with only M and U:
//                    4a orient the edges, 4b place the left and right edges, 4c the M slice
//
// The middle slice stays free until the end, so its centers may sit off by a turn during the
// blocks; every goal is a position on the cube rather than "match the center", and the last
// step lines the centers up. Nothing is placed by algorithm until CMLL — the blocks are the
// cheapest moves found by a search over the few pieces each step places.

import type { Guide, GuideStep, Phrase, State } from '../core/types';
import { OCLL, PLL } from './algs';
import {
  alg, FACE_MOVES, lessonKit, list, onceOnly, plural, ROTATIONS, TOP_CORNERS, turns, U_TURNS, type Macro,
} from './lessonKit';
import type { CubeModel } from './model';

export const ROUX_STAGES = [
  { name: 'First block', goal: 'Build a 1×2×3 block on the left: a square, then a corner–edge pair.' },
  { name: 'Second block', goal: 'Build the matching block on the right, turning only U, R, r and M.' },
  { name: 'CMLL', goal: 'Corners of the Last Layer, with the M slice still free: solve the four top corners without breaking the blocks.' },
  { name: 'LSE: orient edges', goal: 'Last Six Edges, part 1: with M and U only, turn each edge the right way up.' },
  { name: 'LSE: left & right edges', goal: 'Last Six Edges, part 2: put the top-left and top-right edges in place.' },
  { name: 'LSE: middle slice', goal: 'Last Six Edges, part 3: finish the four edges and the centers in the M slice.' },
];

const LSE_EDGES = ['UF', 'UB', 'UL', 'UR', 'DF', 'DB'];
const MU = [...turns('M'), ...turns('U')];

export function rouxGuide(M: CubeModel): Guide {
  if (M.n !== 3) throw new Error('Roux is for the 3×3');
  const K = lessonKit(M);
  const { at, center, apply, name, piece, plain, code } = K;
  const T_PERM = PLL.find((p) => p.name === 'T')!;
  const Y_PERM = PLL.find((p) => p.name === 'Y')!;
  let eoTable: ReturnType<typeof K.keyTable> | null = null;

  return {
    id: 'roux',
    name: 'Roux',
    short: 'Roux',
    intro: 'Two blocks on the sides, the top corners (CMLL: Corners of the Last Layer, M slice free), then the last six edges (LSE) with just M and U turns. Few moves and few algorithms — most of it is figured out, not memorised.',
    stages: ROUX_STAGES,
    steps: (state) => {
      const steps: GuideStep[] = [];
      const white = 0;
      const once = onceOnly();
      const ROUX_NAME = '<p>Roux is named after its inventor, Gilles Roux. It builds two 1×2×3 blocks on the left and right, solves the top corners, then the last six edges.</p>';
      const CMLL = '<p><b>CMLL</b> stands for <b>C</b>orners of the <b>L</b>ast <b>L</b>ayer, with the <b>M</b> slice (the middle layer between L and R) still unsolved — so these algorithms may scramble the top edges freely. Full CMLL has 42 algorithms; this is the two-look version: orient the corners, then swap them.</p>';
      const LSE = '<p><b>LSE</b> stands for <b>L</b>ast <b>S</b>ix <b>E</b>dges: the four top edges and the two in the bottom of the M slice, plus the middle centers. Only M (the middle slice, turning like L) and U turns are needed, in three parts.</p>';
      const down = K.first(state, ['', 'x2', 'z2', 'x', "x'", 'z', "z'"], (t) => center(t, 'D') === white);

      // the colors each face should end up, fixed for the whole solve
      let ref: Record<string, number> = {};
      const setRef = (t: State) => (ref = Object.fromEntries([...'URFDLB'].map((f) => [f, center(t, f)])));
      /** where the sticker of color `c` on the piece with these colors is now */
      const sticker = (t: State, cols: number[], c: number) => K.stickerOf(t, cols, c);
      const stickers = (slots: string[]) => slots.flatMap((slot) => K.stickersOf(slot));

      // ---------- 1. first block ----------

      /** the square at one end of a block on `side`, and the pair at the other */
      const blockPieces = (side: 'L' | 'R', end: 'F' | 'B') => {
        const other = end === 'B' ? 'F' : 'B';
        return {
          line: [ref.D, ref[side]],
          sqEdge: [ref[end], ref[side]],
          sqCorner: [ref.D, ref[end], ref[side]],
          pairEdge: [ref[other], ref[side]],
          pairCorner: [ref.D, ref[other], ref[side]],
          sqSlots: ['D' + side, end + side, 'D' + end + side],
          pairSlots: ['D' + other + side, other + side],
          other,
        };
      };
      const squareRoute = (t: State, side: 'L' | 'R', end: 'F' | 'B', ms: Macro[]) => {
        const b = blockPieces(side, end);
        const from = [sticker(t, b.line, ref.D), sticker(t, b.sqEdge, ref[side]), sticker(t, b.sqCorner, ref.D)];
        const goal = [at('D' + side, 'D'), at(end + side, side), at('D' + end + side, 'D')];
        return K.route(from, goal, ms)?.flatMap((m) => m.moves) ?? null;
      };

      // face the side with the cheapest first-block square to the left
      const faceMs = K.macros([], FACE_MOVES);
      const options = ROTATIONS.flatMap((y) => {
        const setup = [down, y].filter(Boolean);
        const t = apply(state, setup);
        setRef(t);
        return (['B', 'F'] as const).map((end) => ({ setup, t, end, path: squareRoute(t, 'L', end, faceMs)! }));
      });
      const fb = options.reduce((x, y) => (y.path.length < x.path.length ? y : x));
      let s = fb.t;
      setRef(s);
      if (fb.setup.length) {
        steps.push({
          stage: 0,
          title: 'Hold the cube',
          html: once('roux', ROUX_NAME) + `<p>Hold the cube with ${name(white)} on the bottom and ${name(ref.L)} on the left. The first block goes on the left; of the four sides, this one is quickest to build.</p>`,
          phrases: [{ label: 'Turn the whole cube', moves: fb.setup }],
          focus: () => [at('D', 'D'), at('L', 'L')],
        });
      }
      const b1 = blockPieces('L', fb.end);
      if (fb.path.length) {
        steps.push({
          stage: 0,
          title: 'The first square',
          html: once('roux', ROUX_NAME) + `<p>Start with a 2×2 square at the bottom-left-${fb.end === 'B' ? 'back' : 'front'}: the ${piece(b1.line)} edge, the ${piece(b1.sqCorner)} corner and the ${piece(b1.sqEdge)} edge, matching the ${name(ref.L)} center.</p>` +
            `<p>There’s no algorithm for this — look for pieces that are already close together and join them. Here it takes ${plural(fb.path.length, 'move')}.</p>`,
          phrases: [{ label: 'Build the square', moves: fb.path }],
          focus: K.focusOn([b1.line, b1.sqEdge, b1.sqCorner]),
        });
        s = apply(s, fb.path);
      }

      /** the corner–edge pair that finishes a block, keeping `keep` */
      const pairStep = (side: 'L' | 'R', b: ReturnType<typeof blockPieces>, keep: number[], singles: string[], outer: string[], inner: string[], stage: number) => {
        const corner = b.pairCorner;
        const edge = b.pairEdge;
        const [cSlot, eSlot] = b.pairSlots;
        const ms = K.macros(keep, singles, outer, inner);
        const path = K.route([sticker(s, corner, ref.D), sticker(s, edge, ref[side])], [at(cSlot, 'D'), at(eSlot, side)], ms);
        if (!path) throw new Error('roux: no pair route');
        if (!path.length) return;
        const phrases = K.pairPhrases(s, path, corner, edge);
        const blockName = side === 'L' ? 'first' : 'second';
        steps.push({
          stage,
          title: `The ${plain(edge)} pair`,
          html: once('roux', ROUX_NAME) + `<p>Finish the ${blockName} block with the ${piece(corner)} corner and ${piece(edge)} edge. ` +
            K.pairWhere(s, corner, [ref[side], ref[b.other]], { corner: cSlot, edge: side + b.other }, ref.D) + '</p>' +
            `<p>Pair them up, then insert the pair beside the square without breaking it. This takes ${plural(path.reduce((k, m) => k + m.moves.length, 0), 'move')}.</p>`,
          phrases,
          focus: K.focusOn([corner, edge]),
        });
        s = apply(s, path.flatMap((m) => m.moves));
      };

      pairStep('L', b1, stickers(b1.sqSlots), [...FACE_MOVES, ...turns('M')], [...turns('FBDL')].filter((m) => !m.endsWith('2')), [...turns('UR'), ...turns('M')], 0);
      const firstBlock = stickers([...b1.sqSlots, ...b1.pairSlots, 'L']);

      // ---------- 2. second block: U, R, r and M leave the first block alone ----------

      const sbMoves = [...turns('URM'), ...turns('r')];
      const sbMs = K.macros(firstBlock, sbMoves);
      const sb = (['B', 'F'] as const).map((end) => ({ end, path: squareRoute(s, 'R', end, sbMs)! })).reduce((x, y) => (y.path.length < x.path.length ? y : x));
      const b2 = blockPieces('R', sb.end);
      if (sb.path.length) {
        steps.push({
          stage: 1,
          title: 'The second square',
          html: `<p>Now the right side: a square at the bottom-right-${sb.end === 'B' ? 'back' : 'front'} with the ${piece(b2.line)} edge, the ${piece(b2.sqCorner)} corner and the ${piece(b2.sqEdge)} edge.</p>` +
            `<p>Turn only ${code(['U'])}, ${code(['R'])}, ${code(['r'])} and ${code(['M'])}: none of them touches the first block. ` +
            `The middle slice is free for now, so don’t worry if its centers are off — they’re fixed at the end. This takes ${plural(sb.path.length, 'move')}.</p>`,
          phrases: [{ label: 'Build the square', moves: sb.path }],
          focus: K.focusOn([b2.line, b2.sqEdge, b2.sqCorner]),
        });
        s = apply(s, sb.path);
      }
      pairStep('R', b2, [...firstBlock, ...stickers(b2.sqSlots)], [...turns('UM')], ['R', "R'", 'r', "r'"], [...turns('U'), ...turns('M')], 1);

      // ---------- 3. CMLL, two-look ----------

      const cornersUp = (t: State) => TOP_CORNERS.every((c) => t[at(c, 'U')] === ref.U);
      const cornersHome = (t: State) => TOP_CORNERS.every((c) => [...c].every((f) => t[at(c, f)] === ref[f]));
      if (!cornersUp(s)) {
        let best: { u: string; o: (typeof OCLL)[number]; n: number } | null = null;
        for (const o of OCLL) {
          for (const u of U_TURNS) {
            const n = alg(o.alg).length + (u ? 1 : 0);
            if (cornersUp(apply(s, [u, ...alg(o.alg)])) && (!best || n < best.n)) best = { u, o, n };
          }
        }
        if (!best) throw new Error('roux: no corner orientation fits');
        const moves = alg(best.o.alg);
        const up = TOP_CORNERS.filter((c) => s[at(c, 'U')] === ref.U).length;
        steps.push({
          stage: 2,
          title: `Orient the corners: ${best.o.name}`,
          html: once('cmll', CMLL) + `<p>Look only at the four top corners; the edges don’t matter yet. ${up === 0 ? 'None shows' : up === 1 ? 'One shows' : `${up} show`} ${name(ref.U)} on top — the “${best.o.name}” case.</p>` +
            `<p>${best.u ? 'Turn the top to the starting angle, then do' : 'Do'} ${code(moves)} to turn all four ${name(ref.U)}-side up. It keeps both blocks.</p>`,
          phrases: [...K.topPhrase(best.u), { label: best.o.name, moves }],
          focus: () => [at('U', 'U'), ...TOP_CORNERS.flatMap((c) => K.stickersOf(c))],
        });
        s = apply(s, [best.u, ...moves]);
      }
      if (!cornersHome(s)) {
        let best: { u: string; v: string; p: typeof T_PERM | null; n: number } | null = null;
        for (const p of [null, T_PERM, Y_PERM]) {
          const moves = p ? alg(p.alg) : [];
          for (const u of U_TURNS) {
            for (const v of U_TURNS) {
              if (!p && u) continue;
              const n = moves.length + (u ? 1 : 0) + (v ? 1 : 0);
              if (cornersHome(apply(s, [u, ...moves, v])) && (!best || n < best.n)) best = { u, v, p, n };
            }
          }
        }
        if (!best) throw new Error('roux: no corner swap fits');
        const { u, v, p } = best;
        const phrases: Phrase[] = p
          ? [...K.topPhrase(u), { label: p === T_PERM ? 'Swap neighbours' : 'Swap opposites', moves: alg(p.alg) }, ...K.topPhrase(v, 'Line up the corners')]
          : K.topPhrase(v, 'Line up the corners');
        const lights = [...'FRBL'].filter((f) => {
          const cs = TOP_CORNERS.filter((c) => c.includes(f));
          return s[at(cs[0], f)] === s[at(cs[1], f)];
        });
        steps.push({
          stage: 2,
          title: p ? 'Swap the corners' : 'Line up the corners',
          html: once('cmll', CMLL) + (!p
            ? `<p>The corners are already in order around the top; turn it to line them up with the blocks.</p>`
            : p === T_PERM
              ? `<p>One side shows headlights — two corners with the same color there. Hold that side on the left, so the two corners on the right need to swap, and do ${code(alg(p.alg))} (the T-perm, borrowed from PLL — Permute the Last Layer; it moves top edges too, which is fine).</p>`
              : `<p>No side shows headlights${lights.length ? '' : ' (two matching corner colors)'}, so two opposite corners need to swap. Do ${code(alg(p.alg))} (the Y-perm, borrowed from PLL — Permute the Last Layer; it moves top edges too, which is fine).</p>`),
          phrases,
          focus: () => [at('U', 'U'), ...TOP_CORNERS.flatMap((c) => K.stickersOf(c))],
        });
        s = apply(s, [u, ...(p ? alg(p.alg) : []), v].filter(Boolean));
      }

      // ---------- 4. last six edges ----------

      // an LSE edge is good when its top or bottom color faces up or down; bit 6 is set while the
      // centers are a quarter turn off, which an edge-orienting finish also has to undo
      const ud = [ref.U, ref.D];
      const eoKey = (t: State) => LSE_EDGES.reduce((k, slot, i) => {
        const f = [...slot].find((x) => ud.includes(t[at(slot, x)]));
        return f === 'U' || f === 'D' ? k : k | (1 << i);
      }, ud.includes(t[at('U', 'U')]) ? 0 : 1 << 6);
      const bad = (t: State) => LSE_EDGES.filter((_, i) => eoKey(t) & (1 << i));
      // white is always on the bottom, so the table (built from a solved cube) is the same every time
      eoTable ??= K.keyTable(M.solved(), MU, eoKey);
      const eoMoves = eoTable.descend(s);
      if (eoMoves.length) {
        const n = bad(s).length;
        const centersOff = !ud.includes(s[at('U', 'U')]);
        steps.push({
          stage: 3,
          title: 'Orient the edges',
          html: once('lse', LSE) + `<p>From here on, only ${code(['M'])} and ${code(['U'])} turns. An edge is <b>bad</b> if its ${name(ref.U)} or ${name(ref.D)} sticker faces front, back or sideways instead of up or down. ` +
            `There ${n === 1 ? 'is' : 'are'} ${plural(n, 'bad edge')}` +
            (centersOff ? `, and the centers are a quarter turn off: finish with ${name(ref.U)} or ${name(ref.D)} on top, or the edges in the slice count the other way round` : '') + '.</p>' +
            `<p>A quarter turn of M flips the four edges in the middle slice. Use U turns to bring bad edges into the slice, then flip them with ${code(["M'"])} or ${code(['M'])}. This takes ${plural(eoMoves.length, 'move')}.</p>`,
          phrases: [{ label: plural(eoMoves.length, 'move'), moves: eoMoves }],
          focus: (t) => bad(t).flatMap((e) => K.stickersOf(e)),
        });
        s = apply(s, eoMoves);
      }

      // 4b: the top-left and top-right edges, with moves that keep every edge oriented
      // a move sequence flips the same edges whatever the state, so check it on this one
      const keepsEo = (moves: string[]) => eoKey(apply(s, moves)) === 0;
      const lr = [[ref.U, ref.L], [ref.U, ref.R]];
      const msB = K.macros([], [...turns('U'), 'M2'], ['M', "M'"], [...turns('U')]).concat(
        [["M'", 'U2', "M'"], ['M', 'U2', 'M']].map((moves) => ({ moves, cost: 12 })),
      ).filter((m) => keepsEo(m.moves));
      const corner = [ref.U, ref.L, ref.F];
      const fromB = [...lr.map((c) => sticker(s, c, ref.U)), sticker(s, corner, ref.U)];
      const pathB = K.route(fromB, [at('UL', 'U'), at('UR', 'U'), at('ULF', 'U')], msB);
      if (!pathB) throw new Error('roux: no 4b route');
      const movesB = pathB.flatMap((m) => m.moves);
      if (movesB.length) {
        steps.push({
          stage: 4,
          title: 'Place the left and right edges',
          html: once('lse', LSE) + `<p>Find the ${piece(lr[0])} and ${piece(lr[1])} edges. They go on top, at the left and right, matching the corners beside them.</p>` +
            `<p>A common way: bring one to the bottom of the M slice, line it up opposite its partner with U, and bring both up with ${code(['M2'])}. Keep the edges oriented — M quarter turns only in pairs like ${code(["M'", 'U2', "M'"])}. This takes ${plural(movesB.length, 'move')}.</p>`,
          phrases: [{ label: plural(movesB.length, 'move'), moves: movesB }],
          focus: K.focusOn(lr),
        });
        s = apply(s, movesB);
      }

      // 4c: the M slice — M turns, and M turns between two U2s, keep the corners and UL/UR
      const slice = [[ref.U, ref.F], [ref.U, ref.B], [ref.D, ref.F], [ref.D, ref.B]];
      const msC: Macro[] = [...turns('M').map((m) => ({ moves: [m], cost: 4 })), ...turns('M').map((m) => ({ moves: ['U2', m, 'U2'], cost: 12 }))];
      const centerAt = (t: State) => [...'UFDB'].map((f) => at(f, f)).find((i) => t[i] === ref.U)!;
      const fromC = [...slice.map((c) => sticker(s, c, c[0])), centerAt(s)];
      const goalC = [at('UF', 'U'), at('UB', 'U'), at('DF', 'D'), at('DB', 'D'), at('U', 'U')];
      const pathC = K.route(fromC, goalC, msC);
      if (!pathC) throw new Error('roux: no 4c route');
      const movesC = pathC.flatMap((m) => m.moves);
      if (movesC.length) {
        const off = fromC[4] !== goalC[4];
        steps.push({
          stage: 5,
          title: 'Finish the middle slice',
          html: once('lse', LSE) + `<p>Last: the ${list(slice.map((c) => piece(c)))} edges${off ? ', and the centers, which are off by a turn' : ''}. ` +
            `They all live in the M slice, so it’s ${code(['M'])} turns, with ${code(['U2'])} to swap the two top edges.</p>` +
            `<p>This takes ${plural(movesC.length, 'move')}.</p>`,
          phrases: [{ label: plural(movesC.length, 'move'), moves: movesC }],
          focus: (t) => [...K.focusOn(slice)(t), ...[...'UFDB'].map((f) => at(f, f))],
        });
        s = apply(s, movesC);
      }
      if (!M.isSolved(s)) throw new Error('roux: not solved');
      return steps;
    },
  };
}
