// CFOP (Fridrich), the method most speedcubers use, as a lesson:
//
//   1. Cross   the four white edges on the bottom, planned all at once (the shortest cross,
//              from a distance table over the four edges)
//   2. F2L     corner and edge paired up in the top and inserted together, slot by slot;
//              each pair is the cheapest run of R U R'-style triggers that keeps the cross
//              and the finished slots (a search over the pair's two pieces)
//   3. OLL     in two looks, as the CFOP tutorial teaches it: one of 3 algorithms makes a
//              yellow cross, then one of 7 turns the corners yellow
//   4. PLL     in two looks: one of 2 algorithms puts the corners in place, then one of 4
//              moves the edges home
//
// The last-layer steps name the case they are (GuideStep.caseId), so a guided solve can
// send you to practise it.
//
// Like the beginner lesson it works on the actual state, so the text, phrases and highlights
// always match the cube. The course is the same four stages, with their cases (cases.ts).

import type { GuideStep, Method, Phrase, Stage, State } from '../core/types';
import { OLL_CORNERS, OLL_EDGES, PLL_CORNERS, PLL_EDGES, type TwoLookAlg } from './algs';
import { cubeCases, SEXY } from './cases';
import { bestAlg, edgeShape, focusTop, headlights, oriented, pllStep, yellowCorners } from './lastLayer';
import { alg, countMoves, FACE_MOVES, lessonKit, list, macroMoves, onceOnly, plural, ROTATIONS, sameSet, SIDE_NAME, TOP_EDGES, U_TURNS, WIDE_NOTATION, type Once } from './lessonKit';
import type { CubeModel } from './model';

const CFOP_STAGES = [
  { id: 'cross', name: 'Cross', goal: 'The four white edges on the bottom, matching the side centers — planned in one go.' },
  { id: 'f2l', name: 'F2L', goal: 'First Two Layers: pair each white corner with its edge and insert them together.' },
  { id: 'oll', name: 'OLL', goal: 'Orient the Last Layer: make the whole top yellow, in two looks.' },
  { id: 'pll', name: 'PLL', goal: 'Permute the Last Layer: move the top pieces to their spots, in two looks.' },
];

const SIDES = [...'FRBL'];
const SLOT_PAIRS = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']];

/** The course: each stage explained, with its cases. */
function cfopCourse(M: CubeModel): Stage[] {
  const C = cubeCases(M);
  const [cross, f2l, oll, pll] = CFOP_STAGES;
  return [
    {
      ...cross,
      html: `<p>Hold the cube with the <b>white center down</b> and green in front. The cross is the four white edges on the bottom, each beside the center of its other color.</p>
        <p>There’s no algorithm to learn here: the cross takes at most eight moves, and with practice you plan all of it while you inspect the cube. These examples show the usual ways to bring one edge home, the white–green one, without disturbing the others.</p>
        <p class="muted">Tip: solve the cross on the bottom from the start, even though it’s harder to see. You’ll never have to flip the cube for the next stage.</p>`,
      caseGroups: C.cross,
      view: 'corner',
    },
    {
      ...f2l,
      html: `<p><b>F2L</b> stands for <b>F</b>irst <b>2</b> <b>L</b>ayers. Each white corner and the middle edge beside it go in together, as a pair, into the slot between their two centers.</p>
        <p>Think of a corner and its edge as two halves of one block: bring them together in the top layer, then drop the block into its slot. Hold the slot you’re filling at the <b>front right</b>.</p>
        <p>The cases below aren’t a list to learn by heart. They show that one idea from a few angles, so you can work out any pair yourself. Before you build a block, turn the top so your moves only pass through slots that aren’t done yet.</p>`,
      caseGroups: C.f2l,
      view: 'corner',
    },
    {
      ...oll,
      html: `<p><b>OLL</b> stands for <b>O</b>rient the <b>L</b>ast <b>L</b>ayer: with the first two layers solved, turn every top piece so yellow faces up.</p>
        <p>Do it in two looks: first the edges, making a yellow cross, then the corners. That’s 10 algorithms instead of the 57 it takes in one go, for a few extra moves.</p>
        <p>Hold the cube with yellow on top and look at it from above. The pictures show which stickers are yellow, on top and on the sides of the top layer. Turn the top until your cube matches one, then do its algorithm.</p>`,
      caseGroups: [C.ollEdges, C.ollCorners],
      view: 'top',
      focus: C.focusTop,
    },
    {
      ...pll,
      html: `<p><b>PLL</b> stands for <b>P</b>ermute the <b>L</b>ast <b>L</b>ayer: with the top all yellow, move its pieces to their spots. Each case is a letter-named “perm”.</p>
        <p>Again in two looks: first the corners, then the edges. That’s 6 algorithms instead of 21. The arrows show where each piece goes.</p>
        <p>Look at the sides of the top layer. Two matching corner stickers on a side are <b>headlights</b>. Turn the top to match the picture, do the algorithm, and at the end turn the top to line it up with the rest.</p>`,
      caseGroups: [C.pllCorners, C.pllEdges],
      view: 'top',
      arrows: C.pllArrows,
      focus: C.focusTop,
    },
  ];
}

export function cfopMethod(M: CubeModel): Method {
  if (M.n !== 3) throw new Error('CFOP is for the 3×3');
  const K = lessonKit(M);
  const { at, center, find, apply, name, piece, plain, code } = K;

  // the cross goal never changes: the edges' white stickers on the bottom, in F R B L order
  let crossTable: ReturnType<typeof K.table> | null = null;
  const crossGoal = SIDES.map((f) => at('D' + f, 'D'));

  // ---------- 1. cross ----------

  const CFOP_NAME = '<p><b>CFOP</b> is named after its four stages: <b>C</b>ross, <b>F</b>2L (the First Two Layers), <b>O</b>LL (Orient the Last Layer) and <b>P</b>LL (Permute the Last Layer).</p>';

  function crossStage(s: State, steps: GuideStep[], once: Once) {
    const white = 0;
    const setup = K.hold(s, 'D', white);
    if (setup) {
      steps.push({
        stage: 0,
        title: 'Hold white on the bottom',
        html: once('cfop', CFOP_NAME) + `<p>CFOP builds the cross on the bottom, so the first two layers are solved upside-down from the beginner method and you never flip the cube. Hold it with the ${name(white)} center down.</p>`,
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
      html: once('cfop', CFOP_NAME) + `<p>Find the four ${name(white)} edges: ${edges.map((c) => piece(c)).join(', ')}. ` +
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

  function f2lStage(s: State, steps: GuideStep[], once: Once) {
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
      return { r, t, front, right, path, n: macroMoves(path).length };
    };

    let todo = pairs.filter((p) => !done(s, p));
    while (todo.length) {
      const plans = todo.map((p) => ({ p, ...plan(s, p) }));
      const best = plans.reduce((x, y) => (y.n < x.n ? y : x));
      const { p, r, t, front, right, path } = best;
      const phrases: Phrase[] = [...K.rotatePhrase(r), ...K.pairPhrases(t, path, p.corner, p.edge)];
      const where = K.pairWhere(t, p.corner, [front, right], { corner: 'DRF', edge: 'FR' }, white);
      const left = todo.length;
      steps.push({
        stage: 1,
        title: `The ${plain(p.edge)} pair`,
        html: once('f2l', '<p><b>F2L</b> stands for <b>F</b>irst <b>2</b> <b>L</b>ayers: the bottom and middle layers, solved together as four corner–edge pairs, one per slot.</p>') +
          `<p>Find the ${piece(p.corner)} corner and the ${piece(p.edge)} edge, and hold the cube so their slot, between the ${name(front)} and ${name(right)} centers, is at the front-right${r ? '' : ' (it already is)'}. ` +
          `${r ? 'Then ' : ''}${where[0].toLowerCase()}${where.slice(1)}</p>` +
          `<p>Join them into a pair in the top layer, then insert it with ${code(['R', 'U', "R'"])} or ${code(["F'", 'U', 'F'])}-style moves, which leave the cross alone.</p>` +
          (left === 4 ? '<p class="muted">Pick the pair that looks quickest; here that’s this one.</p>' : '') +
          `<p>This pair takes ${plural(countMoves(phrases) - (r ? 1 : 0), 'move')}.</p>`,
        phrases,
        focus: K.focusOn([p.corner, p.edge]),
      });
      s = apply(t, macroMoves(path));
      todo = todo.filter((q) => !done(s, q));
    }
    return s;
  }

  // ---------- 3 and 4. OLL and PLL, in two looks ----------

  /** One look: the shortest algorithm from `set` that makes `ok` hold, as a step named after its case. */
  function look(s: State, steps: GuideStep[], stage: number, set: TwoLookAlg[], ok: (t: State) => boolean, text: (a: TwoLookAlg, moves: string[], u: string, v: string) => string, after = false) {
    const best = bestAlg(K, s, set, ok, after);
    if (!best) throw new Error('cfop: no two-look case fits');
    const { u, v, t } = best;
    const a = best.a!;
    const moves = alg(a.alg);
    steps.push({
      stage,
      title: a.name,
      html: text(a, moves, u, v),
      phrases: [...K.topPhrase(u), { label: a.name, moves }, ...K.topPhrase(v, 'Line up the top')],
      focus: focusTop(K),
      caseId: a.id,
    });
    return t;
  }

  const OLL_ABOUT = '<p><b>OLL</b> stands for <b>O</b>rient the <b>L</b>ast <b>L</b>ayer: turn every top piece so yellow faces up. It’s done in two looks: first the edges make a yellow cross, then the corners. That’s 10 algorithms instead of the 57 it takes in one go.</p>';
  const PLL_ABOUT = '<p><b>PLL</b> stands for <b>P</b>ermute the <b>L</b>ast <b>L</b>ayer: with the top all yellow, move its pieces to their spots. Again in two looks, corners then edges: 6 algorithms instead of 21. Each case is a letter-named “perm”.</p>';
  const SHAPE = { dot: 'no edge shows yellow on top: just the center, a dot', line: 'two opposite edges show yellow: a line', L: 'two neighbouring edges show yellow: an L', cross: '' };
  const turnThen = (u: string) => (u ? 'Turn the top until it matches the case’s picture, then do' : 'It’s already at the right angle. Do');
  const edgesUp = (t: State) => TOP_EDGES.every((e) => t[at(e, 'U')] === center(t, 'U'));
  const cornersDone = (t: State) => headlights(K, t).length === 4;

  function ollStage(s: State, steps: GuideStep[], once: Once) {
    if (!edgesUp(s)) {
      s = look(s, steps, 2, OLL_EDGES, edgesUp, (a, moves, u) => once('oll', OLL_ABOUT) +
        `<p><b>Look 1, the yellow cross.</b> Ignore the corners: ${SHAPE[edgeShape(K, s)]}. That’s the <b>${a.name}</b> case.</p>` +
        `<p>${turnThen(u)} ${code(moves)}. Afterwards the top shows a yellow cross.</p>`);
    }
    if (!oriented(K, s)) {
      const n = yellowCorners(K, s);
      s = look(s, steps, 2, OLL_CORNERS, (t) => oriented(K, t), (a, moves, u) => once('oll', OLL_ABOUT) +
        `<p><b>Look 2, the yellow corners.</b> With the cross done, ${n === 0 ? 'no corner shows yellow on top' : n === 1 ? 'one corner shows yellow on top' : 'two corners show yellow on top'}. That’s <b>${a.name}</b>.</p>` +
        `<p>${turnThen(u)} ${code(moves)}. Afterwards the whole top is yellow.</p>`);
    }
    return s;
  }

  function pllStage(s: State, steps: GuideStep[], once: Once) {
    if (!cornersDone(s)) {
      const lights = headlights(K, s);
      s = look(s, steps, 3, PLL_CORNERS, cornersDone, (a, moves, u) => once('pll', PLL_ABOUT) +
        `<p><b>Look 1, the corners.</b> Ignore the edges and look for <b>headlights</b>, two matching corner stickers on a side. ` +
        (lights.length ? `The ${list(lights.map((f) => SIDE_NAME[f]))} side has them, so two neighbouring corners swap: the <b>${a.name}</b>, with the headlights on the left.` : `No side has them, so two opposite corners swap: the <b>${a.name}</b>.`) + '</p>' +
        `<p>${turnThen(u)} ${code(moves)}. Afterwards every side shows headlights.</p>`);
    }
    // only the top's angle left: pllStep lines it up
    if (U_TURNS.some((u) => M.isSolved(K.apply(s, [u])))) {
      const done = pllStep(K, s, 3, (t) => M.isSolved(t));
      if (done.step) steps.push(done.step);
      return done.s;
    }
    return look(s, steps, 3, PLL_EDGES, (t) => M.isSolved(t), (a, moves, u, v) => once('pll', PLL_ABOUT) +
      `<p><b>Look 2, the edges.</b> Every side shows headlights now. ` +
      (a.id === 'pll-H' || a.id === 'pll-Z' ? 'No side is all one color, so no edge is home yet' : 'One side is all one color: its edge is already home. Hold it at the back') +
      `: that’s the <b>${a.name}</b>.</p>` +
      `<p>${turnThen(u)} ${code(moves)}${v ? ', then turn the top to line it up with the rest' : ''}.</p>`, true);
  }

  return {
    id: 'cfop',
    name: 'CFOP',
    short: 'CFOP',
    level: 'Intermediate',
    intro: 'The speedcuber’s method, named after its stages: Cross, F2L (First Two Layers, solved in corner–edge pairs), OLL (Orient the Last Layer) and PLL (Permute the Last Layer). OLL and PLL come in two looks: 16 algorithms instead of 78.',
    notation: WIDE_NOTATION,
    triggers: [{ name: 'sexy move', moves: SEXY }],
    stages: cfopCourse(M),
    solve: (state) => {
      const steps: GuideStep[] = [];
      const once = onceOnly();
      let s = crossStage(state, steps, once);
      s = f2lStage(s, steps, once);
      s = ollStage(s, steps, once);
      s = pllStage(s, steps, once);
      if (!M.isSolved(s)) throw new Error('cfop: not solved');
      return steps;
    },
  };
}
