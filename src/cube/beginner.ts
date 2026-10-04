// The beginner's method for the 3×3, as a lesson: solve the cube the way a person learns
// to, layer by layer, and explain each step.
//
//   1. white cross        (white on top, so it's in view)
//   2. white corners      flip the cube, then R U R' U' until each corner drops in
//   3. middle layer       U R U' R' U' F' U F and its mirror
//   4. yellow cross       F R U R' U' F'
//   5. yellow edges       R U R' U R U2 R' U
//   6. corner positions   U R U' L' U R' U' L
//   7. corner twists      R' D' R D, turning only the top in between
//
// Every step works on the actual state: it finds the piece, decides the case and simulates
// the moves, so the text always describes what's on screen. Pieces are named by colors and
// found relative to the centers, so whole-cube turns (x, y, z) need no bookkeeping.

import type { Guide, GuideStep, Phrase, State } from '../core/types';
import {
  alg, countMoves, FACE_MOVES, lessonKit, list, repeat, ROTATIONS, rounds, sameSet, SIDE_NAME, TOP_CORNERS, TOP_EDGES, U_TURNS,
} from './lessonKit';
import type { CubeModel } from './model';

const SEXY = alg("R U R' U'");
const RIGHT = alg("U R U' R' U' F' U F");
const LEFT = alg("U' L' U L U F U' F'");
const CROSS = alg("F R U R' U' F'");
const SUNE = alg("R U R' U R U2 R' U");
const NIKLAS = alg("U R U' L' U R' U' L");
const TWIST = alg("R' D' R D");

export const STAGES = [
  { name: 'White cross', goal: 'A white plus on top, each edge matching the center beside it.' },
  { name: 'White corners', goal: 'Flip the cube and drop in the corners to finish the first layer.' },
  { name: 'Middle layer', goal: 'Slot in the four edges between the centers.' },
  { name: 'Yellow cross', goal: 'Make a yellow plus on top.' },
  { name: 'Yellow edges', goal: 'Line the plus up with the side centers.' },
  { name: 'Corner spots', goal: 'Move each top corner to its spot.' },
  { name: 'Corner twists', goal: 'Twist the corners until yellow faces up.' },
];

/**
 * The method's stages, in order: each takes a state, adds its steps (numbered as in
 * STAGES) and returns the state after them. The big-cube lessons reuse them for their
 * 3×3 finish.
 */
export function beginnerStages(M: CubeModel) {
  if (M.n !== 3) throw new Error('The beginner method is for the 3×3');

  const K = lessonKit(M);
  const { at, center, colorsAt, find, faceShowing, placed, inSpot, apply, focusOn, name, piece, plain, code, first, rotatePhrase, topPhrase } = K;

  // ---------- 1. white cross: a short search per edge ----------

  const faceTurns = K.macros([], FACE_MOVES);
  /** Fewest face turns taking the stickers at `from` to `goal` (each sticker tracked on its own). */
  function search(from: number[], goal: number[]): string[] {
    const path = K.route(from, goal, faceTurns);
    if (!path) throw new Error('beginner guide: cross search failed');
    return path.flatMap((m) => m.moves);
  }

  function crossStage(s: State, steps: GuideStep[]) {
    const white = 0;
    const setup = K.hold(s, 'U', white);
    if (setup) {
      steps.push({
        stage: 0,
        title: 'Hold white on top',
        html: `<p>The cross is built around the ${name(white)} center, so start with it on top, where you can see it.</p>`,
        phrases: rotatePhrase(setup),
        focus: (t) => [at('U', 'U'), ...[...'FRBLD'].map((f) => at(f, f))].filter((i) => t[i] === white),
      });
      s = apply(s, [setup]);
    }
    // the white sticker of each cross edge, and where it belongs
    const colorsOf = (side: string) => [white, center(s, side)];
    let todo = [...'FRBL'];
    const done: string[] = [];
    const whiteAt = (t: State, side: string) => K.stickerOf(t, colorsOf(side), white);
    while (todo.length) {
      const plans = todo.map((side) => {
        const from = [...done, side].map((f) => whiteAt(s, f));
        const goal = [...done, side].map((f) => at('U' + f, 'U'));
        return { side, moves: search(from, goal) };
      });
      const { side, moves } = plans.reduce((a, b) => (b.moves.length < a.moves.length ? b : a));
      todo = todo.filter((f) => f !== side);
      if (moves.length) {
        const c = center(s, side);
        const slot = find(s, colorsOf(side));
        const whiteFace = faceShowing(s, slot, white);
        let where: string;
        if (slot.includes('U')) where = whiteFace === 'U' ? 'It’s on top with white facing up, but beside the wrong center.' : 'It’s on top, but flipped: white faces sideways.';
        else if (slot.includes('D')) where = whiteFace === 'D' ? 'It’s on the bottom, white facing down.' : 'It’s on the bottom, white facing sideways.';
        else where = 'It’s in the middle layer.';
        // does the route move an edge that's already placed out of the way?
        let t = s;
        let borrows = false;
        for (const m of moves) {
          t = apply(t, [m]);
          if (done.some((f) => whiteAt(t, f) !== at('U' + f, 'U'))) borrows = true;
        }
        steps.push({
          stage: 0,
          title: `The ${plain([white, c])} edge`,
          html:
            `<p>Find the ${piece([white, c])} edge. ${where}</p>` +
            `<p>Bring it to the top with white facing up and ${name(c)} lined up with the ${name(c)} center.` +
            (borrows ? ' The route moves an edge you placed out of the way and puts it back.' : '') + '</p>',
          phrases: [{ label: moves.length === 1 ? 'One turn' : `${moves.length} turns`, moves }],
          focus: focusOn([[white, c]]),
        });
        s = apply(s, moves);
      }
      done.push(side);
    }
    return s;
  }

  // ---------- 2. white corners: R U R' U' ----------

  function cornersStage(s: State, steps: GuideStep[]) {
    const white = center(s, 'U');
    const flip = ['z2'];
    steps.push({
      stage: 1,
      title: 'Flip the cube',
      html: `<p>Turn the cube upside down, so the ${name(white)} cross is on the bottom. It stays there from now on.</p>` +
        `<p>The corners go in from the top, where you can watch them. Press play, or flip it yourself with the <b>Flip</b> button at the top.</p>`,
      phrases: rotatePhrase(flip[0]),
      focus: focusOn([...'FRBL'].map((f) => [white, center(s, f)])),
    });
    s = apply(s, flip);

    const corners = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']].map(([a, b]) => [white, center(s, a), center(s, b)]);
    const plan = (s: State, cols: number[]) => {
      const phrases: Phrase[] = [];
      let text = '';
      if (find(s, cols).includes('D')) {
        // in the bottom layer, but in the wrong spot or twisted: lift it out first
        const r = first(s, ROTATIONS, (t) => find(t, cols) === 'DRF');
        const twisted = inSpot(apply(s, [r]), 'DRF');
        phrases.push(...rotatePhrase(r), { label: 'Lift it out', moves: SEXY });
        text += `<p>It’s stuck in the bottom layer ${twisted ? 'in its spot, but twisted' : 'in the wrong spot'}. ` +
          `Hold it at the front-right and do ${code(SEXY)} once to lift it to the top.</p>`;
        s = apply(s, [r, ...SEXY]);
      }
      const [, a, b] = cols;
      const r = first(s, ROTATIONS, (t) => sameSet([center(t, 'F'), center(t, 'R')], [a, b]));
      s = apply(s, [r]);
      const u = first(s, U_TURNS, (t) => find(t, cols) === 'UFR');
      s = apply(s, [u]);
      let n = 0;
      while (!placed(s, 'DRF')) {
        s = apply(s, SEXY);
        if (++n > 6) throw new Error('beginner guide: corner would not go in');
      }
      phrases.push(...rotatePhrase(r), ...topPhrase(u), { label: `${SEXY.join(' ')} ×${n}`, moves: repeat(SEXY, n) });
      text += `<p>Turn the cube so its spot, between the ${name(a)} and ${name(b)} centers, is at the front-right of the bottom${r ? '' : ' (it already is)'}` +
        (u ? ', then turn the top until the corner sits right above it' : '') + '.</p>' +
        `<p>Now repeat ${code(SEXY)} until it drops in with white facing down. This one takes ${rounds(n)}.</p>`;
      return { s, phrases, text, length: countMoves(phrases) };
    };

    let todo = corners.filter((cols) => !placed(s, find(s, cols)));
    while (todo.length) {
      const plans = todo.map((cols) => ({ cols, ...plan(s, cols) }));
      const best = plans.reduce((x, y) => (y.length < x.length ? y : x));
      steps.push({
        stage: 1,
        title: `The ${plain(best.cols)} corner`,
        html: `<p>Find the ${piece(best.cols)} corner.</p>` + best.text,
        phrases: best.phrases,
        focus: focusOn([best.cols]),
      });
      s = best.s;
      todo = todo.filter((cols) => !placed(s, find(s, cols)));
    }
    return s;
  }

  // ---------- 3. middle layer ----------

  function middleStage(s: State, steps: GuideStep[]) {
    const edges = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']].map(([a, b]) => [center(s, a), center(s, b)]);
    const plan = (s: State, cols: number[]) => {
      const phrases: Phrase[] = [];
      let text = '';
      if (!find(s, cols).includes('U')) {
        // in the middle layer, but in the wrong spot or flipped
        const r = first(s, ROTATIONS, (t) => find(t, cols) === 'FR');
        phrases.push(...rotatePhrase(r), { label: 'Pop it out', moves: RIGHT });
        text += `<p>It’s in the middle layer, but ${inSpot(apply(s, [r]), 'FR') ? 'flipped' : 'in the wrong spot'}. ` +
          `Hold it at the front-right and do ${code(RIGHT)} to swap it out for an edge from the top.</p>`;
        s = apply(s, [r, ...RIGHT]);
      }
      const slot = find(s, cols);
      const sideFace = [...slot].find((f) => f !== 'U')!;
      const side = s[at(slot, sideFace)];
      const top = s[at(slot, 'U')];
      const r = first(s, ROTATIONS, (t) => center(t, 'F') === side);
      s = apply(s, [r]);
      const u = first(s, U_TURNS, (t) => find(t, cols) === 'UF');
      s = apply(s, [u]);
      const right = center(s, 'R') === top;
      const moves = right ? RIGHT : LEFT;
      s = apply(s, moves);
      phrases.push(...rotatePhrase(r), ...topPhrase(u), { label: right ? 'Insert to the right' : 'Insert to the left', moves });
      text += `<p>Turn the cube so the ${name(side)} center faces you${r ? '' : ' (it already does)'}` +
        (u ? ', then turn the top until the edge’s front sticker sits above it' : '; the edge’s front sticker is already above it') +
        ` — together they make an upside-down T.</p>` +
        `<p>Its top color, ${name(top)}, belongs on the ${right ? 'right' : 'left'}, so move it down that way with ${code(moves)}.</p>`;
      return { s, phrases, text, length: countMoves(phrases) };
    };

    const yellow = center(s, 'U');
    let todo = edges.filter((cols) => !placed(s, find(s, cols)));
    let firstEdge = true;
    while (todo.length) {
      // prefer an edge waiting on top; one stuck in the middle takes two goes
      const plans = todo.map((cols) => ({ cols, ...plan(s, cols) }));
      const best = plans.reduce((x, y) => (y.length < x.length ? y : x));
      steps.push({
        stage: 2,
        title: `The ${plain(best.cols)} edge`,
        html: `<p>Find the ${piece(best.cols)} edge${firstEdge ? ` — an edge with no ${name(yellow)} on it` : ''}.</p>` + best.text,
        phrases: best.phrases,
        focus: focusOn([best.cols]),
      });
      firstEdge = false;
      s = best.s;
      todo = todo.filter((cols) => !placed(s, find(s, cols)));
    }
    return s;
  }

  // ---------- 4–7. last layer ----------

  /** the top's color, and a focus on the top layer's pieces, wherever they go */
  function topOf(s: State) {
    const yellow = center(s, 'U');
    const topPieces = focusOn([...TOP_EDGES, ...TOP_CORNERS].map((slot) => colorsAt(s, slot)));
    return { yellow, focusTop: (t: State) => [at('U', 'U'), ...topPieces(t)] };
  }
  const sides = (edges: string[]) => list(edges.map((e) => SIDE_NAME[e[1]]));

  // 4. yellow cross
  function yellowCross(s: State, steps: GuideStep[]) {
    const { yellow, focusTop } = topOf(s);
    const edgesUp = (t: State) => TOP_EDGES.filter((e) => t[at(e, 'U')] === yellow);
    for (let round = 0; edgesUp(s).length < 4; round++) {
      if (round > 3) throw new Error('beginner guide: yellow cross');
      const up = edgesUp(s);
      const shape = up.length === 0 ? 'dot' : at(up[0], 'U') + at(up[1], 'U') === 2 * at('U', 'U') ? 'line' : 'L';
      // an L goes at the back and left, a line left to right
      const want = shape === 'dot' ? [] : shape === 'L' ? ['UB', 'UL'] : ['UL', 'UR'];
      const u = first(s, U_TURNS, (t) => want.every((e) => edgesUp(t).includes(e)));
      const held = edgesUp(apply(s, [u]));
      const best = { u, t: apply(s, [u, ...CROSS]) };
      const after = edgesUp(best.t).length;
      steps.push({
        stage: 3,
        title: shape === 'dot' ? 'From a dot' : shape === 'L' ? 'From an L' : 'From a line',
        html: (shape === 'dot'
          ? `<p>Only the ${name(yellow)} center is yellow: a dot. Do ${code(CROSS)} from any side.</p>`
          : `<p>Two yellow edges make ${shape === 'L' ? 'an L' : 'a line'}. Turn the top so they’re at the ${sides(held)}, then do ${code(CROSS)}.</p>`) +
          `<p>Ignore the corners for now — ${after === 4 ? 'this finishes the plus' : `this gives ${after === 2 ? (shape === 'dot' ? 'an L' : 'a line') : 'more yellow edges'}`}.</p>`,
        phrases: [...topPhrase(best.u), { label: 'Yellow cross', moves: CROSS }],
        focus: focusTop,
      });
      s = best.t;
    }

    return s;
  }

  // 5. yellow edges: match the side centers
  function yellowEdges(s: State, steps: GuideStep[]) {
    const { focusTop } = topOf(s);
    const matched = (t: State) => TOP_EDGES.filter((e) => t[at(e, e[1])] === center(t, e[1]));
    const align = (t: State, score: (x: State) => number) => U_TURNS.reduce((a, u) => (score(apply(t, [u])) > score(apply(t, [a])) ? u : a));
    for (let round = 0; ; round++) {
      if (round > 3) throw new Error('beginner guide: yellow edges');
      const u = align(s, (t) => matched(t).length);
      const lined = apply(s, [u]);
      const ok = matched(lined);
      if (ok.length === 4) {
        if (u) {
          steps.push({
            stage: 4,
            title: 'Line up the edges',
            html: `<p>Turn the top until every edge of the yellow plus matches the center below it.</p>`,
            phrases: topPhrase(u),
            focus: focusTop,
          });
        }
        s = lined;
        break;
      }
      // hold the cube so the algorithm fixes the most, and finish with the top lined up again
      const options = ROTATIONS.map((r) => {
        const t = apply(lined, [r, ...SUNE]);
        const v = align(t, (x) => matched(x).length);
        return { r, v, t: apply(t, [v]) };
      });
      const best = options.reduce((x, y) => (matched(y.t).length > matched(x.t).length ? y : x));
      const keep = matched(apply(lined, [best.r]));
      const adjacent = ok.length === 2 && ok[0][1] !== { F: 'B', B: 'F', R: 'L', L: 'R' }[ok[1][1]];
      steps.push({
        stage: 4,
        title: matched(best.t).length === 4 ? 'Swap the last two edges' : 'Swap edges',
        html: `<p>Turn the top until at least two edges match the centers below them` + (u ? '' : ' (they already do)') + '.</p>' +
          (adjacent
            ? `<p>The two that match sit side by side. Hold the cube with them at the ${sides(keep)}, then do ${code(SUNE)}.</p>`
            : `<p>${ok.length === 2 ? 'The two that match are opposite each other.' : 'Only one matches.'} Do ${code(SUNE)} once; afterwards two neighbouring edges will match.</p>`) +
          (best.v ? '<p>Then turn the top to line them up again.</p>' : ''),
        phrases: [...topPhrase(u), ...rotatePhrase(best.r), { label: 'Swap edges', moves: SUNE }, ...topPhrase(best.v, 'Line up')],
        focus: focusTop,
      });
      s = best.t;
    }

    return s;
  }

  // 6. corner positions
  /** the top corners in their spots */
  const spots = (t: State) => TOP_CORNERS.filter((c) => inSpot(t, c));
  function cornerSpots(s: State, steps: GuideStep[]) {
    const { yellow, focusTop } = topOf(s);
    for (let round = 0; spots(s).length < 4; round++) {
      if (round > 3) throw new Error('beginner guide: corner spots');
      const good = spots(s);
      let r = '';
      let html: string;
      if (good.length === 0) {
        html = `<p>A corner is in its spot when it has the colors of the three centers around it, however it’s twisted. None is yet.</p>` +
          `<p>Do ${code(NIKLAS)} from any side; it cycles three corners, and then one will be in its spot.</p>`;
      } else {
        const cols = colorsAt(s, good[0]).sort((a, b) => +(b === yellow) - +(a === yellow));
        r = first(s, ROTATIONS, (t) => sameSet(colorsAt(t, 'UFR'), cols));
        const again = round > 0 && good.length === 1 && steps[steps.length - 1]?.stage === 5;
        html = again
          ? `<p>The other three corners moved one place, but not far enough. Do ${code(NIKLAS)} once more.</p>`
          : `<p>The ${piece(cols)} corner is in its spot — it has the colors of the three centers around it. Twists don’t matter yet.</p>` +
            `<p>Hold it at the front-right of the top and do ${code(NIKLAS)}. It cycles the other three corners.</p>`;
      }
      steps.push({ stage: 5, title: 'Cycle the corners', html, phrases: [...rotatePhrase(r), { label: 'Cycle corners', moves: NIKLAS }], focus: focusTop });
      s = apply(s, [r, ...NIKLAS]);
    }

    return s;
  }

  // 7. corner twists: R' D' R D at the front-right, turning only the top in between
  function cornerTwists(s: State, steps: GuideStep[]) {
    const { yellow, focusTop } = topOf(s);
    const twisted = (t: State) => TOP_CORNERS.filter((c) => t[at(c, 'U')] !== yellow);
    let count = 0;
    while (twisted(s).length) {
      const pre = count === 0 ? first(s, ROTATIONS, (t) => t[at('UFR', 'U')] !== yellow) : first(s, U_TURNS.slice(1), (t) => t[at('UFR', 'U')] !== yellow);
      s = apply(s, [pre]);
      let n = 0;
      while (s[at('UFR', 'U')] !== yellow) {
        s = apply(s, TWIST);
        if (++n > 4) throw new Error('beginner guide: corner twist');
      }
      const cols = colorsAt(s, 'UFR');
      count++;
      steps.push({
        stage: 6,
        title: `Twist corner ${count}`,
        html: (count === 1
          ? `<p>Hold the cube with a corner that doesn’t show yellow on top at the front-right${pre ? '' : ' (one already is)'}. Keep holding it this way until the very end.</p>` +
            `<p>Repeat ${code(TWIST)} until yellow faces up. The lower layers get scrambled — that’s fine, they come back.</p>`
          : `<p>Turn <b>only the top</b> to bring the next corner without yellow on top to the front-right. Don’t turn the whole cube.</p>` +
            `<p>Repeat ${code(TWIST)} until yellow faces up.</p>`) +
          `<p>This one takes ${rounds(n)}.</p>`,
        phrases: [...(count === 1 ? rotatePhrase(pre) : topPhrase(pre)), { label: `${TWIST.join(' ')} ×${n}`, moves: repeat(TWIST, n) }],
        focus: focusOn([cols]),
      });
    }
    const u = first(s, U_TURNS, (t) => M.isSolved(t));
    if (u) {
      steps.push({
        stage: 6,
        title: 'Line up the top',
        html: `<p>Every corner shows yellow on top, and the lower layers are back. Turn the top to finish.</p>`,
        phrases: topPhrase(u),
        focus: focusTop,
      });
      s = apply(s, [u]);
    }
    return s;
  }

  return { crossStage, cornersStage, middleStage, yellowCross, yellowEdges, cornerSpots, cornerTwists, spots };
}

export function beginnerGuide(M: CubeModel): Guide {
  const B = beginnerStages(M);
  const STAGE_FNS = [B.crossStage, B.cornersStage, B.middleStage, B.yellowCross, B.yellowEdges, B.cornerSpots, B.cornerTwists];
  return {
    id: 'beginner',
    name: 'Beginner method',
    short: 'Beginner',
    notation: '<code>x</code> and <code>z</code> turn the whole cube like <code>R</code> and <code>F</code>.',
    intro: 'Solve the cube layer by layer, the way most people first learn it: seven stages and a handful of short algorithms.',
    stages: STAGES,
    steps: (state) => {
      const steps: GuideStep[] = [];
      let s = state;
      for (const stage of STAGE_FNS) s = stage(s, steps);
      if (!M.isSolved(s)) throw new Error('beginner guide: not solved');
      return steps;
    },
  };
}
