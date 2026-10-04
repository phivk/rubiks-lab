// CFOP (Fridrich), the method most speedcubers use, as a lesson:
//
//   1. Cross   the four white edges on the bottom, planned all at once (the shortest cross,
//              from a distance table over the four edges)
//   2. F2L     corner and edge paired up in the top and inserted together, slot by slot;
//              each pair is the cheapest run of R U R'-style triggers that keeps the cross
//              and the finished slots (a search over the pair's two pieces)
//   3. OLL     one of 57 algorithms makes the top yellow
//   4. PLL     one of 21 algorithms moves the top pieces home
//
// Like the beginner lesson it works on the actual state, so the text, phrases and highlights
// always match the cube.

import type { Guide, GuideStep, Phrase, State } from '../core/types';
import { OLL } from './algs';
import { ollStep, pllStep } from './lastLayer';
import { countMoves, FACE_MOVES, lessonKit, list, plural, ROTATIONS, sameSet, U_TURNS, type Macro } from './lessonKit';
import type { CubeModel } from './model';

export const CFOP_STAGES = [
  { name: 'Cross', goal: 'The four white edges on the bottom, matching the side centers — planned in one go.' },
  { name: 'F2L', goal: 'Pair each white corner with its edge and insert them together: the first two layers.' },
  { name: 'OLL', goal: 'One algorithm turns the whole top yellow.' },
  { name: 'PLL', goal: 'One algorithm moves the top pieces to their spots.' },
];

const SIDES = [...'FRBL'];
const SLOT_PAIRS = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']];

export function cfopGuide(M: CubeModel): Guide {
  if (M.n !== 3) throw new Error('CFOP is for the 3×3');
  const K = lessonKit(M);
  const { at, center, find, apply, name, piece, plain, code } = K;

  // the cross goal never changes: the edges' white stickers on the bottom, in F R B L order
  let crossTable: ReturnType<typeof K.table> | null = null;
  const crossGoal = SIDES.map((f) => at('D' + f, 'D'));

  // ---------- 1. cross ----------

  function crossStage(s: State, steps: GuideStep[]) {
    const white = 0;
    const setup = K.first(s, ['', 'x2', 'z2', 'x', "x'", 'z', "z'"], (t) => center(t, 'D') === white);
    if (setup) {
      steps.push({
        stage: 0,
        title: 'Hold white on the bottom',
        html: `<p>CFOP builds the cross on the bottom, so the first two layers are solved upside-down from the beginner method and you never flip the cube. Hold it with the ${name(white)} center down.</p>`,
        phrases: K.rotatePhrase(setup),
        focus: (t) => [at('D', 'D'), ...[...'UFRBL'].map((f) => at(f, f))].filter((i) => t[i] === white),
      });
      s = apply(s, [setup]);
    }
    const edges = SIDES.map((f) => [white, center(s, f)]);
    const whiteAt = (t: State) => edges.map((cols) => K.stickerOf(t, cols, white));
    crossTable ??= K.table(crossGoal, FACE_MOVES);
    const moves = crossTable.descend(whiteAt(s));
    if (!moves.length) return s;

    // split the moves where each edge lands for good
    const doneAt = edges.map(() => 0);
    let t = s;
    moves.forEach((m, k) => {
      t = apply(t, [m]);
      whiteAt(t).forEach((i, e) => {
        if (i !== crossGoal[e]) doneAt[e] = -1;
        else if (doneAt[e] === -1) doneAt[e] = k + 1;
      });
    });
    // edges that start home and never leave keep 0; the rest land at doneAt
    const phrases: Phrase[] = [];
    let from = 0;
    [...new Set(doneAt.filter((k) => k > 0))].sort((a, b) => a - b).forEach((k) => {
      const landed = edges.filter((_, e) => doneAt[e] === k).map((cols) => plain(cols));
      phrases.push({ label: `Places the ${list(landed)} edge${landed.length > 1 ? 's' : ''}`, moves: moves.slice(from, k) });
      from = k;
    });
    if (from < moves.length) phrases.push({ label: 'Finish', moves: moves.slice(from) });
    const home = edges.filter((cols) => K.placed(s, find(s, cols)) && find(s, cols).includes('D')).length;
    steps.push({
      stage: 0,
      title: 'Plan the cross',
      html: `<p>Find the four ${name(white)} edges: ${edges.map((c) => piece(c)).join(', ')}. ` +
        (home ? `${home === 1 ? 'One is' : `${home} are`} already in place. ` : '') +
        `Each belongs on the bottom, white facing down, beside the center of its other color.</p>` +
        `<p>Rather than placing them one by one, plan the whole cross while you inspect the cube — it never takes more than eight moves. This one takes ${plural(moves.length, 'move')}.</p>` +
        `<p class="muted">Tip: tilt the cube or use the net to watch the bottom.</p>`,
      phrases,
      focus: K.focusOn(edges),
    });
    return apply(s, moves);
  }

  // ---------- 2. F2L ----------

  const F2L_OUTER = ['R', "R'", 'F', "F'", 'L', "L'"];
  // R U R' and F' U F work on the front-right slot; the rest only free pieces from other slots
  const F2L_AWAY = ["R'", 'F', 'L', "L'"];

  function f2lStage(s: State, steps: GuideStep[]) {
    const white = center(s, 'D');
    const pairs = SLOT_PAIRS.map(([a, b]) => ({ corner: [white, center(s, a), center(s, b)], edge: [center(s, a), center(s, b)] }));
    const crossStickers = SIDES.flatMap((f) => K.stickersOf('D' + f));
    const done = (t: State, p: (typeof pairs)[number]) => K.placed(t, find(t, p.corner)) && K.placed(t, find(t, p.edge)) && find(t, p.corner).includes('D');

    const plan = (s: State, p: (typeof pairs)[number]) => {
      const r = K.first(s, ROTATIONS, (t) => sameSet([center(t, 'F'), center(t, 'R')], p.edge));
      const t = apply(s, [r]);
      const front = center(t, 'F');
      const right = center(t, 'R');
      // keep the cross and every finished slot
      const keep = [...crossStickers];
      for (const q of pairs) if (done(t, q)) keep.push(...K.stickersOf(find(t, q.corner)), ...K.stickersOf(find(t, q.edge)));
      const ms = K.macros(keep, U_TURNS.slice(1), F2L_OUTER, U_TURNS.slice(1), F2L_AWAY);
      const from = [K.stickerOf(t, p.corner, white), K.stickerOf(t, p.edge, front)];
      const path = K.route(from, [at('DRF', 'D'), at('FR', 'F')], ms);
      if (!path) throw new Error('cfop: no F2L route');
      return { r, t, front, right, path, n: path.reduce((k, m) => k + m.moves.length, 0) };
    };

    let todo = pairs.filter((p) => !done(s, p));
    while (todo.length) {
      const plans = todo.map((p) => ({ p, ...plan(s, p) }));
      const best = plans.reduce((x, y) => (y.n < x.n ? y : x));
      const { p, r, t, front, right, path } = best;
      const phrases: Phrase[] = [...K.rotatePhrase(r), ...K.pairPhrases(t, path as Macro[], p.corner, p.edge)];
      const where = K.pairWhere(t, p.corner, [front, right], { corner: 'DRF', edge: 'FR' }, white);
      const left = todo.length;
      steps.push({
        stage: 1,
        title: `The ${plain(p.edge)} pair`,
        html: `<p>Find the ${piece(p.corner)} corner and the ${piece(p.edge)} edge, and hold the cube so their slot, between the ${name(front)} and ${name(right)} centers, is at the front-right${r ? '' : ' (it already is)'}. ` +
          `${r ? 'Then ' : ''}${where[0].toLowerCase()}${where.slice(1)}</p>` +
          `<p>Join them into a pair in the top layer, then insert it with ${code(['R', 'U', "R'"])} or ${code(["F'", 'U', 'F'])}-style moves, which leave the cross alone.</p>` +
          (left === 4 ? '<p class="muted">Pick the pair that looks quickest; here that’s this one.</p>' : '') +
          `<p>This pair takes ${plural(countMoves(phrases) - (r ? 1 : 0), 'move')}.</p>`,
        phrases,
        focus: K.focusOn([p.corner, p.edge]),
      });
      s = apply(t, path.flatMap((m) => m.moves));
      todo = todo.filter((q) => !done(s, q));
    }
    return s;
  }

  return {
    id: 'cfop',
    name: 'CFOP',
    short: 'CFOP',
    intro: 'The speedcuber’s method: an efficient cross, the first two layers in pairs, then the last layer in two algorithms (57 for OLL, 21 for PLL).',
    stages: CFOP_STAGES,
    steps: (state) => {
      const steps: GuideStep[] = [];
      let s = crossStage(state, steps);
      s = f2lStage(s, steps);
      const oll = ollStep(K, s, 2, OLL, 'OLL');
      if (oll.step) steps.push(oll.step);
      const pll = pllStep(K, oll.s, 3, (t) => M.isSolved(t));
      if (pll.step) steps.push(pll.step);
      if (!M.isSolved(pll.s)) throw new Error('cfop: not solved');
      return steps;
    },
  };
}
