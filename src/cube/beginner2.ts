// The beginner's method for the 2×2, as a lesson: the same layer-by-layer idea as the
// 3×3 beginner's method, with only corners.
//
//   1. white layer      hold a white corner at the bottom, then R U R' U' until each
//                       other corner drops in beside it
//   2. yellow top       R U R' U R U2 R' (the Sune), held by a simple rule, until the
//                       top is all yellow
//   3. swap corners     R' F R' B2 R F' R' B2 R2 with the matching pair ("headlights")
//                       at the back, then turn the top
//
// A 2×2 has no centers, so the corner the lesson starts from decides which color goes on
// each side: every other corner is matched to it, and opposite faces get opposite colors.

import type { Guide, GuideStep, Phrase, State } from '../core/types';
import { headlights } from './lastLayer';
import {
  alg, allRotations, CORNERS, countMoves, lessonKit, lessonNotes, repeat, ROTATIONS, rounds, SIDE_NAME, TOP_CORNERS, U_TURNS,
} from './lessonKit';
import type { CubeModel } from './model';

const SEXY = alg("R U R' U'");
const SUNE = alg("R U R' U R U2 R'");
const APERM = alg("R' F R' B2 R F' R' B2 R2");
const BOTTOM_CORNERS = CORNERS.slice(4);
const OPPOSITE: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };

export const STAGES = [
  { name: 'White layer', goal: 'Four white corners on the bottom, their side colors matching.' },
  { name: 'Yellow top', goal: 'Turn the top corners until the whole top is yellow.' },
  { name: 'Swap corners', goal: 'Move the top corners to their spots.' },
];

export function beginner2Guide(M: CubeModel): Guide {
  if (M.n !== 2) throw new Error('This lesson is for the 2×2');
  const K = lessonKit(M);
  const { at, colorsAt, stickersOf, find, focusOn, apply, name, piece, plain, code, first, rotatePhrase, topPhrase } = K;
  const white = 0;
  const yellow = 3;
  const HOLDS = allRotations(M);


  /**
   * The color each face should end up, read off the starting corner `ref` (white facing
   * down): its colors say three faces, and opposite faces take opposite colors.
   */
  function faceColors(s: State, ref: number[]) {
    const slot = find(s, ref);
    const out: Record<string, number> = {};
    for (const f of slot) {
      out[f] = s[at(slot, f)];
      out[OPPOSITE[f]] = (s[at(slot, f)] + 3) % 6;
    }
    return out;
  }
  const placedFor = (ref: number[]) => (s: State, slot: string) => {
    const want = faceColors(s, ref);
    return [...slot].every((f) => s[at(slot, f)] === want[f]);
  };

  // ---------- 1. white layer ----------

  let notes = lessonNotes();

  function whiteLayer(s: State, steps: GuideStep[]) {
    // start from the white corner (and way of holding the cube) that has the most of the
    // layer done already, then the fewest turns
    const options = HOLDS.flatMap((r) => {
      const t = apply(s, r);
      return BOTTOM_CORNERS.filter((slot) => t[at(slot, 'D')] === white).map((slot) => {
        const ref = colorsAt(t, slot);
        const placed = placedFor(ref);
        return { r, t, ref, done: BOTTOM_CORNERS.filter((c) => placed(t, c)).length };
      });
    });
    const start = options.reduce((a, b) => (b.done > a.done || (b.done === a.done && b.r.length < a.r.length) ? b : a));
    const { ref } = start;
    const placed = placedFor(ref);
    const intro = `<p>A 2×2 has no centers to tell you which color goes where, so pick one white corner and build around it. ` +
        `Here that’s the ${piece(ref)} corner: hold the cube so it’s on the bottom with white facing down${start.r.length ? '' : ' (it already is)'}.</p>` +
        (start.done > 1 ? `<p>${start.done - 1 === 1 ? 'Another white corner already sits' : `${start.done - 1} white corners already sit`} around it the right way, so that’s a head start.</p>` : '') +
        `<p>Every other corner goes in to match this one: its side colors decide the colors of the sides.</p>`;
    // with nothing to turn, the introduction goes on the first corner's step instead
    if (start.r.length) {
      steps.push({
        stage: 0,
        title: 'Hold a white corner at the bottom',
        html: intro,
        phrases: [{ label: 'Turn the whole cube', moves: start.r }],
        focus: focusOn([ref]),
      });
    } else notes.add(steps, intro);
    s = start.t;

    // the other three white corners: each is white plus the colors of the two sides it sits between
    const plan = (s: State, cols: number[]) => {
      const phrases: Phrase[] = [];
      let text = '';
      if (find(s, cols).includes('D')) {
        const r = first(s, ROTATIONS, (t) => find(t, cols) === 'DRF');
        phrases.push(...rotatePhrase(r), { label: 'Lift it out', moves: SEXY });
        const held = apply(s, [r]);
        const want = faceColors(held, ref);
        const twisted = [want.F, want.R].every((c) => cols.includes(c));
        text += `<p>It’s on the bottom, but ${twisted ? 'twisted' : 'in the wrong spot'}. ` +
          `Hold it at the front-right and do ${code(SEXY)} once to lift it to the top.</p>`;
        s = apply(s, [r, ...SEXY]);
      }
      // hold the cube so the corner's spot is at the front-right of the bottom
      const r = first(s, ROTATIONS, (t) => {
        const want = faceColors(t, ref);
        return cols.includes(want.F) && cols.includes(want.R);
      });
      s = apply(s, [r]);
      const u = first(s, U_TURNS, (t) => find(t, cols) === 'UFR');
      s = apply(s, [u]);
      let n = 0;
      while (!placed(s, 'DRF')) {
        s = apply(s, SEXY);
        if (++n > 6) throw new Error('2×2 guide: corner would not go in');
      }
      const want = faceColors(s, ref);
      phrases.push(...rotatePhrase(r), ...topPhrase(u), { label: `${SEXY.join(' ')} ×${n}`, moves: repeat(SEXY, n) });
      text += `<p>Its spot is where ${name(want.F)} and ${name(want.R)} meet on the bottom. Turn the cube so that spot is at the front-right${r ? '' : ' (it already is)'}` +
        (u ? ', then turn the top until the corner sits right above it' : '') + '.</p>' +
        `<p>Repeat ${code(SEXY)} until it drops in with white facing down. This one takes ${rounds(n)}.</p>`;
      return { s, phrases, text, length: countMoves(phrases) };
    };

    const want = faceColors(s, ref);
    const corners = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']].map(([a, b]) => [white, want[a], want[b]]).filter((cols) => !cols.every((c) => ref.includes(c)));
    let todo = corners.filter((cols) => !placed(s, find(s, cols)));
    while (todo.length) {
      const best = todo.map((cols) => ({ cols, ...plan(s, cols) })).reduce((x, y) => (y.length < x.length ? y : x));
      steps.push({
        stage: 0,
        title: `The ${plain(best.cols)} corner`,
        html: `<p>Find the ${piece(best.cols)} corner.</p>` + best.text,
        phrases: best.phrases,
        focus: focusOn([ref, best.cols]),
      });
      s = best.s;
      todo = todo.filter((cols) => !placed(s, find(s, cols)));
    }
    return s;
  }

  // ---------- 2. yellow top ----------

  const top = (t: State) => TOP_CORNERS.filter((c) => t[at(c, 'U')] === yellow);
  const focusTop = () => TOP_CORNERS.flatMap((slot) => stickersOf(slot));

  function yellowTop(s: State, steps: GuideStep[]) {
    for (let round = 0; top(s).length < 4; round++) {
      if (round > 4) throw new Error('2×2 guide: yellow top');
      const up = top(s).length;
      // the rule: one yellow on top → it goes front-left; none → yellow faces left on the
      // front-left corner; two → yellow faces you on the front-left corner
      const rule = up === 1 ? (t: State) => t[at('ULF', 'U')] === yellow
        : up === 0 ? (t: State) => t[at('ULF', 'L')] === yellow
        : (t: State) => t[at('ULF', 'F')] === yellow;
      const u = first(s, U_TURNS, rule);
      const t = apply(s, [u, ...SUNE]);
      const html = (round === 0
        ? `<p>Now the yellow stickers on top. One algorithm does it, the <b>Sune</b>: ${code(SUNE)}. It twists the top corners and leaves the white layer alone, and a simple rule says how to hold the cube each time.</p>`
        : '') +
        (up === 1
          ? `<p>One corner shows yellow on top. Turn the top so it’s at the front-left, then do the Sune.</p>`
          : up === 0
            ? `<p>No corner shows yellow on top. Turn the top until the front-left corner’s yellow faces left, then do the Sune.</p>`
            : `<p>${up} corners show yellow on top. Turn the top until the front-left corner’s yellow faces you, then do the Sune.</p>`) +
        `<p>${top(t).length === 4 ? 'That makes the whole top yellow.' : `Afterwards ${top(t).length === 1 ? 'one corner shows' : `${top(t).length} corners show`} yellow on top; go again.`}</p>`;
      steps.push({
        stage: 1,
        title: up === 1 ? 'One yellow corner up' : up === 0 ? 'No yellow corner up' : `${up} yellow corners up`,
        html,
        phrases: [...topPhrase(u), { label: 'Sune', moves: SUNE }],
        focus: focusTop,
      });
      s = t;
    }
    return s;
  }

  // ---------- 3. swap corners ----------

  function swapCorners(s: State, steps: GuideStep[]) {
    for (let round = 0; ; round++) {
      if (round > 3) throw new Error('2×2 guide: swap corners');
      const lights = headlights(K, s);
      if (lights.length === 4) break;
      const u = lights.length ? first(s, U_TURNS, (t) => headlights(K, t).includes('B')) : '';
      const t = apply(s, [u, ...APERM]);
      const done = headlights(K, t).length === 4;
      steps.push({
        stage: 2,
        title: lights.length ? 'Headlights at the back' : 'No headlights',
        html: (round === 0
          ? `<p>Look at the sides of the top layer. Where both corners on a side show the same color, that’s a pair of <b>headlights</b>. This step uses ${code(APERM)}, which swaps the two front corners.</p>`
          : '') +
          (lights.length
            ? `<p>The ${SIDE_NAME[lights[0]]} side has headlights. Turn the top so they’re at the back${u ? '' : ' (they already are)'}, then do the algorithm.</p>`
            : `<p>No side has headlights, so two corners across from each other need to swap. Do the algorithm from any side: afterwards there will be headlights.</p>`) +
          (done ? '<p>Afterwards every side of the top matches itself.</p>' : ''),
        phrases: [...topPhrase(u), { label: 'Swap corners', moves: APERM }],
        focus: focusTop,
      });
      s = t;
    }
    const u = first(s, U_TURNS, (t) => M.isSolved(t));
    if (u) {
      steps.push({
        stage: 2,
        title: 'Line up the top',
        html: '<p>Each side of the top matches itself. Turn the top to line it up with the white layer.</p>',
        phrases: topPhrase(u),
        focus: focusTop,
      });
      s = apply(s, [u]);
    }
    return s;
  }

  return {
    id: 'beginner',
    name: 'Beginner method',
    short: 'Beginner',
    notation: '<code>x</code> and <code>z</code> turn the whole cube like <code>R</code> and <code>F</code>.',
    intro: 'Solve the 2×2 layer by layer: the white layer with one short move you repeat, then the top with two algorithms.',
    stages: STAGES,
    steps: (state) => {
      const steps: GuideStep[] = [];
      notes = lessonNotes();
      let s = whiteLayer(state, steps);
      s = yellowTop(s, steps);
      s = swapCorners(s, steps);
      if (!M.isSolved(s)) throw new Error('2×2 guide: not solved');
      return notes.place(steps);
    },
  };
}
