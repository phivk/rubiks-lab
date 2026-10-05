// The layer-by-layer beginner's method for the Pyraminx, as a lesson. Held yellow side
// down, green side toward you:
//
//   1. tips             turn each tip to match the center beside it
//   2. bottom centers   turn L, R and B until their centers show yellow on the bottom
//   3. bottom edges     bring each yellow edge home with moves like R U R' or L' U' L
//   4. top layer        one of five short algorithms for the last three edges, then
//                       turn the top
//
// A Pyraminx's centers never leave their corner, so every step only turns things in
// place; the edges are the only pieces that travel. The bottom edges come from a small
// search over moves that put the bottom centers back (X U X'), so they always read as
// "lift the slot, turn the top, put it back".

import type { Guide, GuideStep, Phrase, State } from '../core/types';
import { alg, lessonNotes } from '../cube/lessonKit';
import { CENTER, COLORS, COLOR_NAMES, EDGE_PAIRS, TIP, VERTEX_NAMES, apply, applyAll, invertMove, piecesOf, solved, stickers } from './model';

const SOLVED = solved();
const YELLOW = 3;
const code = (moves: string[]) => `<code>${moves.join(' ')}</code>`;
const name = (c: number) => `<span class="cname" style="--c:${COLORS[c]}">${COLOR_NAMES[c].toLowerCase()}</span>`;
const homeColors = (piece: number) => piecesOf(piece).map((i) => SOLVED[i]);
const pieceName = (piece: number) => homeColors(piece).map(name).join('–');
const plain = (piece: number) => homeColors(piece).map((c) => COLOR_NAMES[c].toLowerCase()).join('–');
const isHome = (s: State, piece: number) => piecesOf(piece).every((i) => s[i] === SOLVED[i]);
/** solved with yellow down and green in front (any other way round isn't, for this lesson) */
const allHome = (s: State) => s.every((c, i) => c === SOLVED[i]);
const PLACE = ['top', 'left', 'right', 'back'];
/** the edge sticker showing color `a` beside color `b` */
const whereIs = (s: State, a: number, b: number) => stickers.findIndex((st, i) => st.piece >= 8 && s[i] === a && s[partner(i)] === b);

const BOTTOM_EDGES = [3, 4, 5].map((k) => 8 + k); // L–R, L–B, R–B
const TOP_EDGES = [0, 1, 2].map((k) => 8 + k); // U–L, U–R, U–B
const TOP = [TIP(0), CENTER(0), ...TOP_EDGES];

// The last layer. Each is written as seen with the green side toward you; the flips are
// also done from the other two sides, which renames the corners.
const LL = [
  { id: 'cw', name: 'Three edges clockwise', moves: alg("R' U' R U' R' U' R") },
  { id: 'ccw', name: 'Three edges counter-clockwise', moves: alg("R' U R U R' U R") },
  { id: 'flip', name: 'Flip two edges', moves: alg("R' L R L' U L' U' L") },
  { id: 'flipcw', name: 'Flip two and cycle', moves: alg("L U R U' R' L'") },
  { id: 'flipccw', name: 'Flip two and cycle', moves: alg("R' U' L' U L R") },
];
/** holding another side toward you renames the bottom corners */
const SIDES = [
  { name: 'front', map: {} as Record<string, string> },
  { name: 'right', map: { L: 'R', R: 'B', B: 'L' } as Record<string, string> },
  { name: 'left', map: { L: 'B', B: 'R', R: 'L' } as Record<string, string> },
];
const rename = (moves: string[], map: Record<string, string>) => moves.map((m) => (map[m[0]] ?? m[0]) + m.slice(1));
const U_TURNS = ['', 'U', "U'"];

const focusPieces = (pieces: number[]) => () => pieces.flatMap(piecesOf);

export const STAGES = [
  { name: 'Tips', goal: 'Turn each tip to match the center beside it.' },
  { name: 'Bottom centers', goal: 'Turn the bottom corners until their centers show yellow below.' },
  { name: 'Bottom edges', goal: 'Bring the three yellow edges home to finish the bottom.' },
  { name: 'Top layer', goal: 'Solve the last three edges with one algorithm.' },
];

/** The cheapest run of macros putting the edges `pieces` home, by uniform-cost search. */
function route(s: State, pieces: number[], macros: { moves: string[]; cost: number }[]) {
  // follow one sticker per edge: where it is says where the edge is and which way round
  const goal = pieces.map((p) => piecesOf(p)[0]).join();
  // where each sticker goes under a macro: apply it to the stickers' own indices, then invert
  const maps = macros.map((m) => {
    const to: number[] = [];
    applyAll(stickers.map((st) => st.index), m.moves).forEach((src, d) => (to[src] = d));
    return to;
  });
  const start = pieces.map((p) => {
    const [i, j] = piecesOf(p);
    return whereIs(s, SOLVED[i], SOLVED[j]);
  });
  const best = new Map<string, { cost: number; prev: string | null; via: number }>([[start.join(), { cost: 0, prev: null, via: -1 }]]);
  const buckets: number[][][] = [[start]];
  for (let c = 0; c < buckets.length && c < 200; c++) {
    for (const pos of buckets[c] ?? []) {
      const k = pos.join();
      if (best.get(k)!.cost !== c) continue;
      if (k === goal) {
        const path: string[][] = [];
        for (let cur = k; best.get(cur)!.prev !== null; cur = best.get(cur)!.prev!) path.unshift(macros[best.get(cur)!.via].moves);
        return path;
      }
      macros.forEach((m, j) => {
        const next = pos.map((i) => maps[j][i]);
        const nk = next.join();
        const cost = c + m.cost;
        const old = best.get(nk);
        if (!old || cost < old.cost) {
          best.set(nk, { cost, prev: k, via: j });
          (buckets[cost] ??= []).push(next);
        }
      });
    }
  }
  throw new Error('pyraminx guide: no route');
}
/** the other sticker of an edge */
function partner(i: number) {
  return piecesOf(stickers[i].piece).find((j) => j !== i)!;
}

export function pyraminxGuide(): Guide {
  let notes = lessonNotes();

  // ---------- 1. tips ----------

  function tips(s: State, steps: GuideStep[]) {
    const phrases: Phrase[] = [];
    for (let v = 0; v < 4; v++) {
      const tip = VERTEX_NAMES[v].toLowerCase();
      const m = ['', tip, tip + "'"].find((mv) => {
        const t = mv ? apply(s, mv) : s;
        // a tip matches when each of its stickers has the color of the center sticker on the same face
        return piecesOf(TIP(v)).every((i) => t[i] === t[piecesOf(CENTER(v)).find((j) => stickers[j].color === stickers[i].color)!]);
      })!;
      if (m) {
        phrases.push({ label: `The ${PLACE[v]} tip`, moves: [m] });
        s = apply(s, m);
      }
    }
    const hold = `<p>Hold the Pyraminx with the ${name(YELLOW)} side down and the ${name(0)} side toward you, and keep holding it that way.</p>`;
    if (phrases.length) {
      steps.push({
        stage: 0,
        title: 'Turn the tips',
        html: hold +
          `<p>The four tips turn on their own and never disturb anything else, so start with them: turn each one until its colors match the three-colored center piece right below it. ` +
          `Lowercase moves turn just a tip: <code>u</code>, <code>l</code>, <code>r</code> and <code>b</code>.</p>` +
          `<p>From now on the tips turn along with their centers, so they stay matched.</p>`,
        phrases,
        focus: focusPieces([0, 1, 2, 3].flatMap((v) => [TIP(v), CENTER(v)])),
      });
    } else notes.add(steps, hold);
    return s;
  }

  // ---------- 2. bottom centers ----------

  function centers(s: State, steps: GuideStep[]) {
    const phrases: Phrase[] = [];
    for (const v of [1, 2, 3]) {
      const big = VERTEX_NAMES[v];
      const m = ['', big, big + "'"].find((mv) => isHome(mv ? apply(s, mv) : s, CENTER(v)))!;
      if (m) {
        phrases.push({ label: `The ${PLACE[v]} corner`, moves: [m] });
        s = apply(s, m);
      }
    }
    if (phrases.length) {
      steps.push({
        stage: 1,
        title: 'Yellow centers down',
        html: `<p>The three bottom corners each have a center piece with ${name(YELLOW)} on it. Turn each corner (<code>L</code>, <code>R</code>, <code>B</code> — capitals turn the whole corner layer) until its center shows yellow on the bottom.</p>` +
          `<p>Each center has three colors, so it takes at most one turn either way. The edges get mixed up on the way, but they aren’t solved yet anyway.</p>`,
        phrases,
        focus: focusPieces([1, 2, 3].flatMap((v) => [TIP(v), CENTER(v)])),
      });
    }
    return s;
  }

  // ---------- 3. bottom edges ----------

  // U turns, and lifting a bottom slot with a corner turn, turning the top and putting it back
  const macros = [
    ...['U', "U'"].map((m) => ({ moves: [m], cost: 4 })),
    ...['L', "L'", 'R', "R'", 'B', "B'"].flatMap((x) => ['U', "U'"].map((y) => ({ moves: [x, y, invertMove(x)], cost: 12 }))),
  ];

  function bottomEdges(s: State, steps: GuideStep[]) {
    let done = BOTTOM_EDGES.filter((p) => isHome(s, p));
    let first = true;
    while (done.length < 3) {
      const plans = BOTTOM_EDGES.filter((p) => !done.includes(p)).map((p) => ({ p, path: route(s, [...done, p], macros) }));
      const { p, path } = plans.reduce((a, b) => (b.path.flat().length < a.path.flat().length ? b : a));
      // where is it now?
      const [i, j] = piecesOf(p);
      const slotPiece = stickers[whereIs(s, SOLVED[i], SOLVED[j])].piece;
      const [a, b] = EDGE_PAIRS[slotPiece - 8];
      const where = slotPiece === p ? 'It’s in its slot, but flipped.'
        : a === 0 || b === 0 ? 'It’s in the top layer.'
        : 'It’s in the wrong bottom slot.';
      // group each lift-turn-replace with the U turns before it
      const phrases: Phrase[] = [];
      let pending: string[] = [];
      for (const m of path) {
        if (m.length === 1) pending.push(...m);
        else {
          if (pending.length) phrases.push({ label: 'Turn the top', moves: pending });
          pending = [];
          phrases.push({ label: phrases.some((x) => x.moves.length === 3) ? 'Again' : 'Lift, turn, put back', moves: m });
        }
      }
      if (pending.length) phrases.push({ label: 'Turn the top', moves: pending });
      const homeSides = homeColors(p).filter((c) => c !== YELLOW);
      steps.push({
        stage: 2,
        title: `The ${plain(p)} edge`,
        html: `<p>Find the ${pieceName(p)} edge. ${where}</p>` +
          `<p>Its home is the bottom edge below the ${name(homeSides[0])} side, between the two corners whose centers match it.` +
          (first ? ` To move edges without undoing the centers, turn a bottom corner to lift its slot into the top, turn the top (<code>U</code>), and turn the corner back — like <code>R U R'</code>. Done in the right order, that drops the edge in with its colors matching.` : '') +
          (done.length ? ' The moves put the edges you’ve already placed back where they were.' : '') + '</p>',
        phrases,
        focus: focusPieces([p, ...done, CENTER(1), CENTER(2), CENTER(3)]),
      });
      s = applyAll(s, path.flat());
      done = BOTTOM_EDGES.filter((q) => isHome(s, q));
      first = false;
    }
    return s;
  }

  // ---------- 4. top layer ----------

  function topLayer(s: State, steps: GuideStep[]) {
    if (allHome(s)) return s;
    let best: { u: string; a: (typeof LL)[number] | null; side: number; v: string; n: number } | null = null;
    for (const u of U_TURNS) {
      for (const a of [null, ...LL]) {
        for (const [side, { map }] of SIDES.entries()) {
          if (!a && side) continue;
          const moves = a ? rename(a.moves, map) : [];
          for (const v of U_TURNS) {
            const all = [u, ...moves, v].filter(Boolean);
            if (allHome(applyAll(s, all)) && (!best || all.length < best.n)) best = { u, a, side, v, n: all.length };
          }
        }
      }
    }
    if (!best) throw new Error('pyraminx guide: no last-layer case fits');
    const top = (t: string, label = 'Turn the top') => (t ? [{ label, moves: [t] }] : []);
    if (!best.a) {
      steps.push({
        stage: 3,
        title: 'Turn the top',
        html: '<p>The top edges are already right relative to each other. Turn the top to line them up with the bottom.</p>',
        phrases: top(best.u || best.v),
        focus: focusPieces(TOP),
      });
      return applyAll(s, [best.u || best.v]);
    }
    const a = best.a;
    const moves = rename(a.moves, SIDES[best.side].map);
    const side = best.side
      ? `Do it from the <b>${SIDES[best.side].name}</b> side: turn the puzzle in your hands so that side faces you and do ${code(a.moves)} as you see it then. Without turning the puzzle, those are the moves shown below.`
      : `Do ${code(a.moves)} from the front.`;
    steps.push({
      stage: 3,
      title: a.name,
      html: '<p>Only the top layer is left: its three edges, and the top center. There are five cases, each with its own short algorithm.</p>' +
        (a.id === 'cw' || a.id === 'ccw'
          ? `<p>No top edge is flipped, but all three are in the wrong place: they need to cycle ${a.id === 'cw' ? 'clockwise' : 'counter-clockwise'} seen from above. ${best.u ? 'Turn the top, then do' : 'Do'} ${code(a.moves)}.</p>`
          : a.id === 'flip'
            ? `<p>Two top edges are in their places but flipped. ${side}</p>`
            : `<p>Two top edges are flipped and the edges also need to move round one place. ${best.u ? 'Turn the top first. ' : ''}${side}</p>`) +
        (best.v ? '<p>Finish by turning the top to line it up.</p>' : ''),
      phrases: [...top(best.u), { label: a.name, moves }, ...top(best.v, 'Line up the top')],
      focus: focusPieces(TOP),
    });
    return applyAll(s, [best.u, ...moves, best.v].filter(Boolean));
  }

  return {
    id: 'lbl',
    name: 'Layer by layer',
    short: 'Beginner',
    intro: 'The beginner’s way to solve a Pyraminx: the tips, then the bottom layer, then the last three edges with one short algorithm.',
    stages: STAGES,
    steps: (state) => {
      const steps: GuideStep[] = [];
      notes = lessonNotes();
      let s = tips(state, steps);
      s = centers(s, steps);
      s = bottomEdges(s, steps);
      s = topLayer(s, steps);
      if (!allHome(s)) throw new Error('pyraminx guide: not solved');
      return notes.place(steps);
    },
  };
}
