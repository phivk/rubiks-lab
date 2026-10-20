// ZZ, Zbigniew Zborowski's method, as a lesson:
//
//   1. EOLine      orient every edge (fix the "bad" ones with F or B quarter turns), then
//                  place the white front and back edges on the bottom: the line
//   2. Left block  a 1×2×3 block on the left, turning only L, U and R
//   3. Right block the same on the right, turning only U and R
//   4. OCLL        the edges are already oriented, so one of seven algorithms makes the top
//                  yellow
//   5. PLL         one of 21 algorithms moves the top pieces home
//
// Once the edges are oriented, F and B quarter turns are never needed again — the rest of
// the solve is turning L, U and R, which is what makes ZZ fast and easy to look ahead in.
//
// The course is the same five stages, with their cases (cases.ts): example edge orientations
// and line edges, each block's last pair (the F2L pairs that go in with L and U, or R and U),
// then OCLL's seven cases and all 21 PLLs. The last-layer steps name their case.

import type { GuideStep, Method, Phrase, Stage, State } from '../core/types';
import { OCLL } from './algs';
import { cubeCases } from './cases';
import { ollStep, pllStep } from './lastLayer';
import { countMoves, EDGES, FACE_MOVES, lessonKit, macroMoves, onceOnly, plural, ROTATIONS, turns, WIDE_NOTATION, type Once } from './lessonKit';
import type { CubeModel } from './model';

const ZZ_STAGES = [
  { id: 'eoline', name: 'EOLine', goal: 'Edge Orientation plus a line: orient every edge, then line up the two white edges on the bottom, front and back.' },
  { id: 'left-block', name: 'Left block', goal: 'Build a 1×2×3 block on the left, turning only L, U and R.' },
  { id: 'right-block', name: 'Right block', goal: 'Build the matching block on the right with U and R: the first two layers.' },
  { id: 'ocll', name: 'OCLL', goal: 'Orient the Corners of the Last Layer: the edges are oriented, so one of seven algorithms turns the top yellow.' },
  { id: 'pll', name: 'PLL', goal: 'Permute the Last Layer: one algorithm moves the top pieces to their spots.' },
];

/** The course: each stage explained, with its cases. */
function zzCourse(M: CubeModel): Stage[] {
  const C = cubeCases(M);
  const [eoline, left, right, ocll, pll] = ZZ_STAGES;
  return [
    {
      ...eoline,
      html: `<p>Hold the cube with the <b>white center down</b> and green in front. An edge is <b>bad</b> if it can’t get home without a quarter turn of F or B; the EOLine makes every edge good, then puts the white–green and white–blue edges on the bottom, front and back: the line.</p>
        <p>To spot a bad edge, look at its sticker on the top or bottom face, or, in the middle layer, on the front or back. If that sticker is the left or right center’s color, the edge is bad. If it’s the front or back center’s, the edge is bad when its other sticker is yellow or white.</p>
        <p>A quarter turn of F or B flips the four edges on that face, so bring bad ones there and flip them in fours. The examples show the usual ways; in a solve you plan the whole EOLine while you inspect the cube.</p>`,
      caseGroups: C.zz.eoLine,
      view: 'corner',
    },
    {
      ...left,
      html: `<p>The <b>left block</b> is 1×2×3: the white–red edge on the bottom, plus the two corners and two edges beside it on the left. Build it as a square at the back, then a corner–edge pair at the front, turning only L, U and R so every edge stays good.</p>
        <p>The square has no algorithm: join pieces that are close. The pair goes in like an F2L pair, mirrored: the cases below are the ones that need only L and U.</p>`,
      caseGroups: C.zz.leftBlock,
      view: 'left',
    },
    {
      ...right,
      html: `<p>The <b>right block</b> is the same on the right, turning only U and R: anything else would break the left block. With it the first two layers are done.</p>
        <p>Build a square at the back, then put the last pair in at the front. These are the F2L pairs that go in with only R and U.</p>`,
      caseGroups: C.zz.rightBlock,
      view: 'corner',
    },
    {
      ...ocll,
      html: `<p><b>OCLL</b> stands for <b>O</b>rient the <b>C</b>orners of the <b>L</b>ast <b>L</b>ayer. The edges were oriented in the EOLine, so the top already shows a yellow cross: only the seven corner cases of OLL can come up.</p>
        <p>Count the yellow corners on top and look where the side ones face, turn the top until your cube matches a picture, and do its algorithm.</p>`,
      caseGroups: [C.ollCorners],
      view: 'top',
      focus: C.focusTop,
    },
    {
      ...pll,
      html: `<p><b>PLL</b> stands for <b>P</b>ermute the <b>L</b>ast <b>L</b>ayer: with the top all yellow, move its pieces to their spots, in one algorithm. There are 21, each a letter-named “perm”; the arrows show where each piece goes.</p>
        <p>Look at the sides of the top layer: two matching corner stickers on a side are <b>headlights</b>, and a side that’s all one color is a solved bar. Turn the top to match a picture, do the algorithm, and line the top up.</p>`,
      caseGroups: C.pll,
      view: 'top',
      arrows: C.pllArrows,
      focus: C.focusTop,
    },
  ];
}

export function zzMethod(M: CubeModel): Method {
  if (M.n !== 3) throw new Error('ZZ is for the 3×3');
  const K = lessonKit(M);
  const { at, center, apply, name, piece, plain, code } = K;

  /**
   * Bit i set when the edge in EDGES[i] is bad: it can't go home without an F or B quarter
   * turn. Each edge has a key sticker (its top or bottom color, or failing that its front or
   * back color) and each slot a key face (top or bottom, or for the middle layer front or
   * back); the edge is good when its key sticker is on the slot's key face.
   */
  // each slot's two stickers, key face first
  const EO_SLOTS = EDGES.map((slot) => {
    const faces = [...slot];
    const keyFace = faces.find((f) => 'UD'.includes(f)) ?? faces.find((f) => 'FB'.includes(f))!;
    return [at(slot, keyFace), at(slot, faces.find((f) => f !== keyFace)!)];
  });
  const eoKey = (s: State) => {
    const ud = [center(s, 'U'), center(s, 'D')];
    const fb = [center(s, 'F'), center(s, 'B')];
    let key = 0;
    EO_SLOTS.forEach(([onKey, other], i) => {
      const a = s[onKey];
      const b = s[other];
      // the key sticker is on the key face when it's showing there
      const good = ud.includes(a) || (!ud.includes(b) && fb.includes(a));
      if (!good) key |= 1 << i;
    });
    return key;
  };
  const badEdges = (s: State) => EDGES.filter((_, i) => eoKey(s) & (1 << i));
  let eoTable: ReturnType<typeof K.keyTable> | null = null;

  // once the edges are oriented, the line and the blocks use only these
  const LINE_MOVES = [...turns('UDLR'), 'F2', 'B2'];
  const LUR = turns('LUR');
  const UR = turns('UR');

  const EOLINE = '<p>ZZ is named after its inventor, Zbigniew Zborowski. It starts with the <b>EOLine</b>: <b>E</b>dge <b>O</b>rientation (every edge turned so it can go home without F or B quarter turns) plus a <b>line</b> of two edges on the bottom.</p>';

  function eoLine(s: State, steps: GuideStep[], once: Once) {
    const white = 0;
    const down = K.hold(s, 'D', white);
    eoTable ??= K.keyTable(M.solved(), FACE_MOVES, eoKey);
    // which way to face: the edge orientation depends on which faces are front and back
    const options = ROTATIONS.map((y) => {
      const setup = [down, y].filter(Boolean);
      const t = apply(s, setup);
      const eo = eoTable!.descend(t);
      const u = apply(t, eo);
      const lineCols = [[white, center(u, 'F')], [white, center(u, 'B')]];
      const line = K.route(lineCols.map((c) => K.stickerOf(u, c, white)), [at('DF', 'D'), at('DB', 'D')], K.macros([], LINE_MOVES))!;
      return { setup, t, eo, line: macroMoves(line), lineCols, n: eo.length + line.length };
    });
    const best = options.reduce((x, y) => (y.n < x.n ? y : x));
    const { setup, eo, line, lineCols } = best;
    let t = best.t;
    if (setup.length) {
      steps.push({
        stage: 0,
        title: 'Hold the cube',
        html: once('eoline', EOLINE) + `<p>Hold the cube with ${name(white)} on the bottom and ${name(center(t, 'F'))} in front. ` +
          `Which edges count as “bad” depends on which faces are front and back; this way round needs the fewest moves.</p>`,
        phrases: K.rotatePhrase(setup.join(' ')),
        focus: () => [at('D', 'D'), at('F', 'F')],
      });
    }
    const bad = badEdges(t);
    if (eo.length) {
      // split at each F or B quarter turn, which is what flips edges
      const phrases: Phrase[] = [];
      let cur: string[] = [];
      let u = t;
      let before = bad.length;
      for (const m of eo) {
        cur.push(m);
        u = apply(u, [m]);
        if (/^[FB]'?$/.test(m)) {
          const now = badEdges(u).length;
          phrases.push({ label: `Bad edges ${before} → ${now}`, moves: cur });
          cur = [];
          before = now;
        }
      }
      if (cur.length) phrases[phrases.length - 1].moves.push(...cur);
      const ud = `${name(center(t, 'U'))} or ${name(white)}`;
      steps.push({
        stage: 0,
        title: 'Orient the edges',
        html: once('eoline', EOLINE) + `<p>An edge is <b>bad</b> if it can’t get home without a quarter turn of F or B. To spot one, look at the edge’s sticker on the top or bottom face — or, in the middle layer, on the front or back. ` +
          `If that sticker is ${name(center(t, 'L'))} or ${name(center(t, 'R'))}, the edge is bad. If it’s ${name(center(t, 'F'))} or ${name(center(t, 'B'))}, the edge is bad when its other sticker is ${ud}. Otherwise it’s good.</p>` +
          `<p>There ${bad.length === 1 ? 'is' : 'are'} ${plural(bad.length, 'bad edge')} here. A quarter turn of F or B flips the four edges on that face, so gather bad ones there with the other faces and flip them in fours or twos. This takes ${plural(eo.length, 'move')}.</p>`,
        phrases,
        focus: (s) => badEdges(s).flatMap((e) => K.stickersOf(e)),
      });
      t = apply(t, eo);
    }
    if (line.length) {
      steps.push({
        stage: 0,
        title: 'Place the line',
        html: once('eoline', EOLINE) + `<p>Every edge is good now — keep it that way: no more quarter turns of F or B (half turns are fine).</p>` +
          `<p>Put the ${piece(lineCols[0])} and ${piece(lineCols[1])} edges on the bottom, front and back, with white facing down. Together with the centers they make a line.</p>`,
        phrases: [{ label: plural(line.length, 'move'), moves: line }],
        focus: K.focusOn(lineCols),
      });
      t = apply(t, line);
    }
    return t;
  }

  /** a 1×2×3 block on side X: a square at the back or front first, then the other pair */
  function block(s: State, steps: GuideStep[], side: 'L' | 'R', keep: number[]) {
    const white = center(s, 'D');
    const stage = side === 'L' ? 1 : 2;
    const sc = center(s, side);
    const moves = side === 'L' ? LUR : UR;
    const blockName = side === 'L' ? 'left' : 'right';
    const squareOf = (end: 'F' | 'B') => ({
      edgeD: [white, sc],
      edge: [center(s, end), sc],
      corner: [white, center(s, end), sc],
      corner2: 'D' + end + side,
      edge2: end + side,
    });
    const plans = (['B', 'F'] as const).map((end) => {
      const q = squareOf(end);
      const from = [K.stickerOf(s, q.edgeD, white), K.stickerOf(s, q.edge, sc), K.stickerOf(s, q.corner, white)];
      const goal = [at('D' + side, 'D'), at(q.edge2, side), at(q.corner2, 'D')];
      const path = K.route(from, goal, K.macros(keep, moves))!;
      return { end, q, path: macroMoves(path) };
    });
    const sq = plans.reduce((x, y) => (y.path.length < x.path.length ? y : x));
    const { end, q } = sq;
    if (sq.path.length) {
      steps.push({
        stage,
        title: `The ${blockName} square`,
        html: `<p>Start the ${blockName} block (the ${name(sc)} side) with a 2×2 square at the ${end === 'B' ? 'back' : 'front'}: ` +
          `the ${piece(q.edgeD)} edge on the bottom, plus the ${piece(q.corner)} corner and ${piece(q.edge)} edge beside it.</p>` +
          `<p>Use only ${side === 'L' ? `${code(['L'])}, ${code(['U'])} and ${code(['R'])}` : `${code(['U'])} and ${code(['R'])} — anything else would break the left block`}. ` +
          `This takes ${plural(sq.path.length, 'move')}.</p>`,
        phrases: [{ label: 'Build the square', moves: sq.path }],
        focus: K.focusOn([q.edgeD, q.edge, q.corner]),
      });
      s = apply(s, sq.path);
    }
    // the last pair goes in without disturbing the square
    const other = end === 'B' ? 'F' : 'B';
    const corner = [white, center(s, other), sc];
    const edge = [center(s, other), sc];
    const keep2 = [...keep, ...K.stickersOf('D' + side), ...K.stickersOf(q.edge2), ...K.stickersOf(q.corner2)];
    const outer = side === 'L' ? ['L', "L'"] : ['R', "R'"];
    const inner = side === 'L' ? [...turns('U'), ...turns('R')] : turns('U');
    const ms = K.macros(keep2, side === 'L' ? turns('UR') : turns('U'), outer, inner);
    const path = K.route([K.stickerOf(s, corner, white), K.stickerOf(s, edge, sc)], [at('D' + other + side, 'D'), at(other + side, side)], ms);
    if (!path) throw new Error('zz: no block pair route');
    if (path.length) {
      const phrases = K.pairPhrases(s, path, corner, edge);
      steps.push({
        stage,
        title: `The ${plain(edge)} pair`,
        html: `<p>Finish the ${blockName} block with the ${piece(corner)} corner and ${piece(edge)} edge. ` +
          K.pairWhere(s, corner, [sc, center(s, other)], { corner: 'D' + other + side, edge: side + other }, white) + '</p>' +
          `<p>Pair them up in the top, then insert them with ${side === 'L' ? code(['L\'', 'U', 'L']) + '-style' : code(['R', 'U', "R'"]) + '-style'} moves that keep the square. ` +
          `This takes ${plural(countMoves(phrases), 'move')}.</p>`,
        phrases,
        focus: K.focusOn([corner, edge]),
      });
      s = apply(s, macroMoves(path));
    }
    return s;
  }

  return {
    id: 'zz',
    name: 'ZZ',
    short: 'ZZ',
    level: 'Advanced',
    intro: 'Orient all the edges first, and the rest of the solve needs only L, U and R turns: the EOLine (Edge Orientation plus a line), two blocks, then the last layer with fewer cases (OCLL: Orient the Corners of the Last Layer, then PLL: Permute the Last Layer).',
    notation: WIDE_NOTATION,
    stages: zzCourse(M),
    solve: (state) => {
      const steps: GuideStep[] = [];
      let s = eoLine(state, steps, onceOnly());
      const line = [...K.stickersOf('DF'), ...K.stickersOf('DB'), at('D', 'D')];
      s = block(s, steps, 'L', line);
      const left = [...line, ...['DL', 'FL', 'BL', 'DFL', 'DLB'].flatMap((slot) => K.stickersOf(slot))];
      s = block(s, steps, 'R', left);
      const oll = ollStep(K, s, 3, OCLL, 'OLL',
        '<p><b>OCLL</b> stands for <b>O</b>rient the <b>C</b>orners of the <b>L</b>ast <b>L</b>ayer. Other methods use OLL here (Orient the Last Layer, 57 cases), but ZZ oriented the edges at the start, so only the seven corner cases — OLL 21 to 27 — can come up.</p>');
      if (oll.step) steps.push(oll.step);
      const pll = pllStep(K, oll.s, 4, (t) => M.isSolved(t));
      if (pll.step) steps.push(pll.step);
      if (!M.isSolved(pll.s)) throw new Error('zz: not solved');
      return steps;
    },
  };
}
