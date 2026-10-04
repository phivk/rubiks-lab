// The beginner's reduction method for the 4×4 and 5×5, as a lesson: make the big cube act
// like a 3×3, then solve it with the 3×3 beginner's method.
//
//   1. centers      one color at a time, a piece at a time: lift a piece into place with a
//                   slice, turn the face so it moves out of the slice, turn the slice back
//                   (Rw U Rw'), never undoing a finished center
//   2. edges        put the pieces of one edge at the front-left and front-right, turn a
//                   slice to join them, swap the finished edge out with R U R', turn the
//                   slice back (Uw' R U R' Uw); the last two with Uw' R U R' F R' F' R Uw
//                   (and, on the 5×5, sometimes a parity algorithm)
//   3. 3×3 stage    the 3×3 beginner's method on the outer layers, plus the 4×4's two
//                   parities: OLL parity before the yellow cross, PLL parity before the
//                   corners
//
// Centers and edges come from small searches. A center search follows the set of slots
// holding the color (pieces of one color are interchangeable), so it's tiny. An edge
// search follows one sticker per piece of the edge; moves that would break a finished
// edge are refused, by tracking which edge slots hold finished edges.

import { COLORS, COLOR_NAMES } from '../core/colors';
import { parity } from '../core/perm';
import type { Guide, GuideStep, Phrase, State, Vec3 } from '../core/types';
import { beginnerStages, STAGES as BEGINNER_STAGES } from './beginner';
import { alg, EDGES, lessonKit, sameSlot, TOP_CORNERS, type Macro } from './lessonKit';
import { CubeModel, FACES, invertMove, type LayerTurn } from './model';

const FACE_AXIS: Record<string, 0 | 1 | 2> = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };

const OLL_PARITY = alg("Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'");
const PLL_PARITY = alg("2R2 U2 2R2 Uw2 2R2 Uw2");
const FLIP = alg("R U R' F R' F' R");
const EDGE_PARITY_5 = alg("Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 3Rw' U2 Rw U2 Rw' U2 Rw'");

const cube3 = new CubeModel(3);

export function reductionGuide(M: CubeModel): Guide {
  const n = M.n;
  if (n !== 4 && n !== 5) throw new Error('The reduction lesson is for the 4×4 and 5×5');
  const odd = n % 2 === 1;
  const m = n - 1;
  const apply = (s: State, moves: string[]) => M.applyAll(s, moves.filter(Boolean));
  const name = (c: number) => `<span class="cname" style="--c:${COLORS[c]}">${COLOR_NAMES[c].toLowerCase()}</span>`;
  const plainName = (c: number) => COLOR_NAMES[c].toLowerCase();
  const code = (moves: string[]) => `<code>${moves.join(' ')}</code>`;
  const faceOf = (i: number) => FACES[M.facelets[i].face];

  /** where each sticker goes under `moves` */
  const destCache = new Map<string, Int16Array>();
  function dest(moves: string[]) {
    const k = moves.join(' ');
    let to = destCache.get(k);
    if (to) return to;
    to = Int16Array.from(M.facelets, (f) => f.index);
    for (const mv of moves) {
      const perm = M.permutation(M.parseMove(mv)!);
      const step = new Int16Array(perm.length);
      perm.forEach((src, d) => (step[src] = d));
      to = to.map((i) => step[i]);
    }
    destCache.set(k, to);
    return to;
  }

  // ---------- whole-cube turns ----------

  const HOLDS: string[][] = [[]];
  {
    const seen = new Set([M.solved().join()]);
    for (let i = 0; i < HOLDS.length; i++) {
      for (const r of ['y', "y'", 'x', "x'", 'z', "z'"]) {
        const moves = [...HOLDS[i], r];
        const k = apply(M.solved(), moves).join();
        if (!seen.has(k)) {
          seen.add(k);
          HOLDS.push(M.simplify(moves));
        }
      }
    }
  }

  // ---------- centers ----------

  /** every center sticker that can move between faces */
  const CENTERS = M.orbits.filter((o) => o.size === 1 && o.slots.length > 6).flatMap((o) => o.slots.map((sl) => sl.facelets[0]));
  const centersOn = (face: string) => CENTERS.filter((i) => faceOf(i) === face);
  const fixedOn = (face: string) => M.fixedCenters[FACES.indexOf(face)];
  const countOn = (s: State, face: string, c: number) => centersOn(face).filter((i) => s[i] === c).length;
  const centerDone = (s: State, face: string, c: number) => countOn(s, face, c) === centersOn(face).length;
  const PER_FACE = CENTERS.length / 6;

  /** the color of every face once `u` is on top and `f` in front, for a correctly colored cube */
  function scheme(u: number, f: number): Record<string, number> {
    for (const r of HOLDS) {
      const t = cube3.applyAll(cube3.solved(), r);
      const at = (face: string) => t[FACES.indexOf(face) * 9 + 4];
      if (at('U') === u && at('F') === f) return Object.fromEntries([...FACES].map((face) => [face, at(face)]));
    }
    throw new Error('reduction guide: no such color scheme');
  }

  const turnName = (t: LayerTurn) => M.moveName(t)!;
  /** single layers and outer wide pairs, as named turns: [axis, name] */
  function layerTurns(kind: 'outer' | 'wide' | 'inner') {
    const out: { axis: number; moves: string[] }[] = [];
    for (const axis of [0, 1, 2] as const) {
      const layerSets = kind === 'outer' ? [[-m], [m]]
        : kind === 'wide' ? [[-m, 2 - m], [m - 2, m]]
        : M.coords.filter((c) => Math.abs(c) < m).map((c) => [c]);
      for (const layers of layerSets) out.push({ axis, moves: [1, 2, 3].map((q) => turnName({ axis, layers, quarters: q })) });
    }
    return out;
  }
  const OUTER = layerTurns('outer');
  const WIDE = layerTurns('wide');
  const INNER = layerTurns('inner');
  /** the kinds of moving center piece (one on a 4×4; x- and t-centers on a 5×5), each a list of stickers */
  const CENTER_ORBITS = M.orbits.filter((o) => o.size === 1 && o.slots.length > 6).map((o) => o.slots.map((sl) => sl.facelets[0]));
  const posIndex = new Int16Array(M.size).fill(-1);
  for (const orbit of CENTER_ORBITS) orbit.forEach((i, k) => (posIndex[i] = k));

  /** maps the stickers in `slots` onto `slots`, as a set */
  const keepsSet = (to: Int16Array, slots: number[]) => slots.every((i) => slots.includes(to[i]));

  /**
   * Macros for building the center on `target` without undoing `keep` (sets of slots to keep
   * full): single turns, and X Y X' with X a slice or wide turn across the target and Y a
   * face turn.
   */
  function centerMacros(target: string, keep: number[][], orbit: number[], commutators = false): (Macro & { to: Int16Array })[] {
    const ok = (to: Int16Array) => M.fixedCenters.every((i) => to[i] === i) && keep.every((slots) => keepsSet(to, slots));
    const out = new Map<string, Macro & { to: Int16Array }>();
    const add = (moves: string[], cost: number) => {
      const to = dest(moves);
      if (!ok(to)) return;
      const key = orbit.map((i) => to[i]).join();
      if (orbit.every((i) => to[i] === i)) return;
      const old = out.get(key);
      if (!old || old.cost > cost) out.set(key, { moves, cost, to });
    };
    for (const t of OUTER) for (const mv of t.moves) add([mv], 4);
    for (const t of [...WIDE, ...INNER]) for (const mv of t.moves) add([mv], 5);
    for (const t of [...WIDE, ...INNER]) {
      if (t.axis === FACE_AXIS[target]) continue;
      for (const face of OUTER) {
        if (face.axis === t.axis) continue;
        // turning the target itself is the usual move; other faces cost a little more
        const cost = face.moves[0][0] === target ? 12 : 13;
        for (const x of [t.moves[0], t.moves[2]]) for (const y of face.moves) add([x, y, invertMove(x)], cost);
      }
    }
    if (commutators) {
      // A B A' B': a slice turn A, and B a face turn or a slice-face-slice; these cycle three
      // pieces where the simpler moves can only swap two pairs
      const quarter = [...WIDE, ...INNER].flatMap((t) => [t.moves[0], t.moves[2]].map((mv) => ({ axis: t.axis, mv })));
      const bs = [
        ...OUTER.flatMap((t) => t.moves.map((mv) => ({ axis: t.axis, moves: [mv] }))),
        ...quarter.flatMap((x) => OUTER.filter((t) => t.axis !== x.axis).flatMap((t) => t.moves.map((y) => ({ axis: x.axis, moves: [x.mv, y, invertMove(x.mv)] })))),
      ];
      for (const a of quarter) {
        for (const b of bs) {
          if (b.axis === a.axis) continue;
          add([a.mv, ...b.moves, invertMove(a.mv), ...b.moves.slice().reverse().map(invertMove)], b.moves.length === 1 ? 16 : 28);
        }
      }
    }
    return [...out.values()];
  }

  const pack = (pos: number[]) => pos.reduce((k, p) => k * 32 + p, 0);

  /**
   * The cheapest run of macros after which `target` holds at least `need` pieces of color c
   * from `orbit`. It follows the set of slots holding the color, as one sorted list.
   */
  function centerRoute(s: State, c: number, target: string, need: number, ms: (Macro & { to: Int16Array })[], orbit: number[]): Macro[] | null {
    const onTarget = new Set(orbit.filter((i) => faceOf(i) === target).map((i) => posIndex[i]));
    const start = orbit.flatMap((i, k) => (s[i] === c ? [k] : []));
    const maps = ms.map((mc) => orbit.map((i) => posIndex[mc.to[i]]));
    const best = new Map<number, { cost: number; prev: number; via: number }>([[pack(start), { cost: 0, prev: -1, via: -1 }]]);
    const buckets: number[][][] = [[start]];
    for (let cost = 0; cost < buckets.length && cost <= 160; cost++) {
      for (const pos of buckets[cost] ?? []) {
        const k = pack(pos);
        if (best.get(k)!.cost !== cost) continue;
        if (pos.filter((p) => onTarget.has(p)).length >= need) {
          const path: Macro[] = [];
          for (let cur = k; best.get(cur)!.prev !== -1; cur = best.get(cur)!.prev) path.unshift(ms[best.get(cur)!.via]);
          return path;
        }
        ms.forEach((mc, j) => {
          const next = pos.map((p) => maps[j][p]).sort((a, b) => a - b);
          const nk = pack(next);
          const nc = cost + mc.cost;
          const old = best.get(nk);
          if (!old || nc < old.cost) {
            best.set(nk, { cost: nc, prev: k, via: j });
            (buckets[nc] ??= []).push(next);
          }
        });
      }
    }
    return null;
  }

  /** text for the next step, when a step had nothing to do */
  let preface = '';

  /** Build the center of color c on `target` (U or F), as one step, keeping the centers on `done`. */
  function buildCenter(s: State, c: number, target: string, done: string[], hold: string[], steps: GuideStep[], intro: string) {
    const phrases: Phrase[] = hold.length ? [{ label: 'Turn the whole cube', moves: hold }] : [];
    s = apply(s, hold);
    const already = countOn(s, target, c);
    let pending: string[] = [];
    const keep = done.map(centersOn);
    // a kind of piece at a time (on a 5×5: the x-centers, then the t-centers), so the search stays small
    for (const orbit of CENTER_ORBITS) {
      const slots = orbit.filter((i) => faceOf(i) === target);
      const ms = centerMacros(target, keep, orbit);
      let more: (Macro & { to: Int16Array })[] | null = null;
      for (let have = slots.filter((i) => s[i] === c).length; have < slots.length; have = slots.filter((i) => s[i] === c).length) {
        let path = centerRoute(s, c, target, have + 1, ms, orbit);
        if (!path) {
          more ??= centerMacros(target, keep, orbit, true);
          path = centerRoute(s, c, target, have + 1, more, orbit);
        }
        if (!path) throw new Error('reduction guide: center search failed');
        for (const mc of path) {
          if (mc.moves.length === 1) pending.push(...mc.moves);
          else {
            if (pending.length) phrases.push({ label: 'Set up', moves: pending });
            pending = [];
            phrases.push({ label: mc.moves.length > 3 ? 'Cycle three' : target === 'U' ? 'Bring one up' : 'Bring one in', moves: mc.moves });
          }
        }
        if (pending.length) {
          phrases.push({ label: 'Move one in', moves: pending });
          pending = [];
        }
        s = apply(s, path.flatMap((mc) => mc.moves));
      }
      keep.push(slots);
    }
    if (!phrases.length) {
      preface += intro;
      return s;
    }
    const where = target === 'U' ? 'top' : 'front';
    steps.push({
      stage: 0,
      title: `The ${plainName(c)} center`,
      html: preface + intro +
        `<p>${already ? `${already} of the ${PER_FACE} ${name(c)} center pieces ${already === 1 ? 'is' : 'are'} already on the ${where}.` : `None of the ${name(c)} center pieces is on the ${where} yet.`} ` +
        `Each group below brings one more: a slice turn lifts a piece in, a turn of the ${where} moves it out of that slice, and the slice turns back` +
        (done.length ? `, which puts the finished center${done.length > 1 ? 's' : ''} back too` : '') + '.</p>' +
        (phrases.some((p) => p.label === 'Cycle three')
          ? '<p>The last pieces can need a <b>commutator</b>, <code>A B A\' B\'</code>: do two moves, then undo each in turn. Almost everything goes back, except three pieces that trade places.</p>'
          : ''),
      phrases,
      focus: (t) => [...CENTERS.filter((i) => t[i] === c), ...M.fixedCenters.filter((i) => t[i] === c)],
    });
    preface = '';
    return s;
  }

  function centersStage(s: State, steps: GuideStep[]) {
    const white = 0, yellow = 3;
    // 1. white on top: the fixed center says where on a 5×5; on a 4×4, the face with the most white
    const best = HOLDS.map((r) => ({ r, t: apply(s, r) }))
      .filter(({ t }) => !odd || t[fixedOn('U')] === white)
      .reduce((a, b) => (countOn(b.t, 'U', white) > countOn(a.t, 'U', white) || (countOn(b.t, 'U', white) === countOn(a.t, 'U', white) && b.r.length < a.r.length) ? b : a));
    const notation = n === 4
      ? '<p>A 4×4 has no fixed centers: each center is four loose pieces that you group together. Lowercase or <code>w</code> turns take two layers (<code>Rw</code>), and <code>2R</code> turns just the second layer.</p>'
      : '<p>A 5×5 has a fixed center on each face that says its color; the eight pieces around it move. <code>Rw</code> turns two layers, <code>2R</code> just the second.</p>';
    if (!centerDone(apply(s, best.r), 'U', white)) {
      s = buildCenter(s, white, 'U', [], best.r, steps,
        notation + `<p>Start with ${name(white)}. Hold the cube with ${odd ? `the white fixed center` : `the face with the most white center pieces`} on top${best.r.length ? '' : ' (it already is)'}.</p>`);
    } else s = apply(s, best.r);
    // 2. yellow, opposite: flip so it's on top
    s = buildCenter(s, yellow, 'U', ['D'], ['x2'], steps,
      `<p>Flip the cube so the white center is on the bottom. ${name(yellow)} goes opposite white, so build it on top. Slices still turn freely, as long as each one turns back before it can carry a white piece away.</p>`);
    // 3. the sides, each turned to the front. A 5×5's fixed centers say which color goes
    // where; on a 4×4 the first side can be any color, and the color scheme decides the rest.
    const sideColors = [1, 2, 4, 5];
    const sides = ['F', 'R', 'B', 'L'];
    const built: number[] = [];
    const want = (t: State) => odd ? Object.fromEntries([...FACES].map((f) => [f, t[fixedOn(f)]]))
      : built.length ? schemeFrom(t, built[0]) : null;
    // build the sides in a row round the cube, so the last two left are neighbours
    for (let k = 0; ; k++) {
      if (built.length === 3) break;
      const options = [[], ['y'], ["y'"], ['y2']].flatMap((r) => {
        const t = apply(s, r);
        const wt = want(t);
        // next to a built side: the color on a side face of a built face's neighbour
        const nextTo = (c: number) => !built.length || ['R', 'L'].some((f) => built.includes(wt![f])) && wt!.F === c;
        return (wt && (odd || built.length) ? [wt.F] : sideColors).filter((c) => !built.includes(c) && nextTo(c)).map((c) => ({ r, t, c }));
      });
      const pick = options.reduce((x, y) => (countOn(y.t, 'F', y.c) > countOn(x.t, 'F', x.c) || (countOn(y.t, 'F', y.c) === countOn(x.t, 'F', x.c) && y.r.length < x.r.length) ? y : x));
      const wt = want(pick.t);
      const facesDone = wt ? sides.filter((f) => built.includes(wt[f])) : [];
      built.push(pick.c);
      s = buildCenter(s, pick.c, 'F', ['U', 'D', ...facesDone], pick.r, steps,
        k === 0
          ? `<p>Now the sides, built on the front. ${odd ? 'The fixed centers say which color goes where.' : `Any color can go first; take ${name(pick.c)}, which has the most pieces together already. After that, the colors of a real cube decide where the others go.`} ` +
            `Turn the cube so that side faces you${pick.r.length ? '' : ' (it already does)'}. To keep the top and bottom centers, the slices now run sideways: <code>Uw</code>, <code>Dw</code> and their single layers.</p>`
          : `<p>Turn the cube so the side that needs ${name(pick.c)} faces you${pick.r.length ? '' : ' (it already does)'}` +
            (odd ? '.' : ` — on a real cube ${name(pick.c)} goes there, given the sides you’ve built.`) +
            (built.length === 3 ? ' It’s the last one to build: the last side finishes with it.' : '') + '</p>');
    }
    return s;
  }

  /** On a 4×4 with the side of color c built: the color scheme it implies. */
  function schemeFrom(t: State, c: number): Record<string, number> {
    const u = t[centersOn('U')[0]];
    const f = ['F', 'R', 'B', 'L'].find((face) => centerDone(t, face, c))!;
    for (const front of [1, 2, 4, 5]) {
      const sc = scheme(u, front);
      if (sc[f] === c) return sc;
    }
    throw new Error('reduction guide: no color scheme fits');
  }

  // ---------- edges ----------

  /** edge stickers (not corners) by slot */
  const isEdgeSticker = (i: number) => M.facelets[i].pos.filter((x) => Math.abs(x) === m).length === 2;
  const slotName = (i: number) => {
    const p = M.facelets[i].pos;
    const fs = [0, 1, 2].filter((a) => Math.abs(p[a]) === m).map((a) => (a === 0 ? (p[0] > 0 ? 'R' : 'L') : a === 1 ? (p[1] > 0 ? 'U' : 'D') : p[2] > 0 ? 'F' : 'B'));
    return EDGES.find((e) => sameSlot(e, fs.join('')))!;
  };
  const EDGE_STICKERS = M.facelets.filter((f) => isEdgeSticker(f.index)).map((f) => f.index);
  const slotIndex = new Int16Array(M.size).fill(-1);
  EDGE_STICKERS.forEach((i) => (slotIndex[i] = EDGES.indexOf(slotName(i))));
  const stickersIn = EDGES.map((_, k) => EDGE_STICKERS.filter((i) => slotIndex[i] === k));
  /** the slot's colors, if every sticker on each of its two faces matches */
  function slotColors(s: State, k: number): [number, number] | null {
    const [a, b] = [...EDGES[k]];
    const on = (f: string) => stickersIn[k].filter((i) => faceOf(i) === f).map((i) => s[i]);
    const ca = on(a), cb = on(b);
    return ca.every((c) => c === ca[0]) && cb.every((c) => c === cb[0]) ? [ca[0], cb[0]] : null;
  }
  const completeMask = (s: State) => EDGES.reduce((mask, _, k) => (slotColors(s, k) ? mask | (1 << k) : mask), 0);
  const edgeKey = (a: number, b: number) => Math.min(a, b) * 6 + Math.max(a, b);
  const completeEdges = (s: State) => new Set(EDGES.flatMap((_, k) => { const c = slotColors(s, k); return c ? [edgeKey(c[0], c[1])] : []; }));

  /**
   * The pieces of an edge, each as one sticker to follow: wings by the sticker that comes
   * first in the model's order for their slot (it never changes), the midge by its
   * lower-numbered color.
   */
  const wingOrbits = M.orbits.filter((o) => o.size === 2 && !o.twists);
  const midgeOrbit = M.orbits.find((o) => o.size === 2 && o.twists);
  function piecesOf(s: State, a: number, b: number) {
    const wings = wingOrbits.flatMap((o) => o.slots.filter((sl) => {
      const cols = sl.facelets.map((i) => s[i]);
      return (cols[0] === a && cols[1] === b) || (cols[0] === b && cols[1] === a);
    }).map((sl) => ({ sticker: sl.facelets[0], color: s[sl.facelets[0]] })));
    const midge = midgeOrbit?.slots.filter((sl) => {
      const cols = sl.facelets.map((i) => s[i]);
      return cols.includes(a) && cols.includes(b);
    }).map((sl) => {
      const lo = Math.min(a, b);
      return { sticker: sl.facelets.find((i) => s[i] === lo)!, color: lo };
    })[0];
    return { wings, midge };
  }

  interface EdgeMacro { moves: string[]; cost: number; to: Int16Array; safe: number; slotTo: Int8Array; label: string }

  /** a macro's effect on whole edges: which slots move as a consistent unit, and where to */
  function edgeMacro(moves: string[], cost: number, label: string): EdgeMacro {
    const to = dest(moves);
    let safe = 0;
    const slotTo = new Int8Array(12).fill(-1);
    EDGES.forEach((_, k) => {
      const targets = new Set(stickersIn[k].map((i) => slotIndex[to[i]]));
      if (targets.size !== 1) return;
      // stickers that shared a face must still share one
      const faceMap = new Map<string, string>();
      const consistent = stickersIn[k].every((i) => {
        const f = faceOf(i), g = faceOf(to[i]);
        if (faceMap.has(f)) return faceMap.get(f) === g;
        faceMap.set(f, g);
        return true;
      });
      if (!consistent) return;
      safe |= 1 << k;
      slotTo[k] = [...targets][0];
    });
    return { moves, cost, to, safe, slotTo, label };
  }
  const permuteMask = (mask: number, mc: EdgeMacro) => {
    let out = 0;
    for (let k = 0; k < 12; k++) if (mask & (1 << k)) out |= 1 << mc.slotTo[k];
    return out;
  };

  const centersKept = (to: Int16Array) => M.fixedCenters.every((i) => to[i] === i) && [...FACES].every((f) => keepsSet(to, centersOn(f)));
  const EDGE_SINGLES = OUTER.flatMap((t) => t.moves).map((mv) => edgeMacro([mv], 4, ''));
  const SLICES = ["Uw'", 'Uw', 'Dw', "Dw'"];
  const PAIRING: EdgeMacro[] = [];
  for (const sl of SLICES) {
    for (const x of ['R', "R'", 'L', "L'", 'F', "F'", 'B', "B'"]) {
      for (const y of ['U', "U'", 'U2', 'D', "D'", 'D2']) {
        const moves = [sl, x, y, invertMove(x), invertMove(sl)];
        if (!centersKept(dest(moves))) continue;
        PAIRING.push(edgeMacro(moves, 20, 'pair'));
      }
    }
  }
  const FLIPS = SLICES.map((sl) => edgeMacro([sl, ...FLIP, invertMove(sl)], 28, 'flip'));
  const PARITY = odd ? [edgeMacro(EDGE_PARITY_5, 60, 'parity')] : [];
  // keep one macro per effect on the edge stickers
  const dedupe = (ms: EdgeMacro[]) => {
    const seen = new Map<string, EdgeMacro>();
    for (const mc of ms) {
      const key = EDGE_STICKERS.map((i) => mc.to[i]).join();
      if (EDGE_STICKERS.every((i) => mc.to[i] === i)) continue;
      const old = seen.get(key);
      if (!old || old.cost > mc.cost) seen.set(key, mc);
    }
    return [...seen.values()];
  };
  const PAIR_MACROS = dedupe([...EDGE_SINGLES, ...PAIRING]);
  const LAST_MACROS = dedupe([...EDGE_SINGLES, ...PAIRING, ...FLIPS, ...PARITY]);

  /**
   * The cheapest run of macros after which `goal` holds for the followed stickers, never
   * breaking a finished edge outside them (`mask`: the slots holding one).
   */
  function edgeRoute(follow: number[], goal: (pos: number[]) => boolean, mask: number, ms: EdgeMacro[], maxCost: number) {
    type Node = { cost: number; prev: number; via: number; mask: number };
    const key = (pos: number[]) => pos.reduce((k, p) => k * 256 + p, 0);
    const start = follow;
    const best = new Map<number, Node>([[key(start), { cost: 0, prev: -1, via: -1, mask }]]);
    const buckets: number[][][] = [[start]];
    for (let cost = 0; cost < buckets.length && cost <= maxCost; cost++) {
      for (const pos of buckets[cost] ?? []) {
        const k = key(pos);
        const node = best.get(k)!;
        if (node.cost !== cost) continue;
        if (goal(pos)) {
          const path: EdgeMacro[] = [];
          for (let cur = k; best.get(cur)!.prev !== -1; cur = best.get(cur)!.prev) path.unshift(ms[best.get(cur)!.via]);
          return path;
        }
        for (let j = 0; j < ms.length; j++) {
          const mc = ms[j];
          if ((node.mask & ~mc.safe) !== 0) continue;
          const next = pos.map((p) => mc.to[p]);
          const nk = key(next);
          const nc = cost + mc.cost;
          const old = best.get(nk);
          if (!old || nc < old.cost) {
            best.set(nk, { cost: nc, prev: k, via: j, mask: permuteMask(node.mask, mc) });
            (buckets[nc] ??= []).push(next);
          }
        }
      }
    }
    return null;
  }

  /** the followed stickers form one consistent edge: all in one slot, and (with a midge) facing the same way */
  function together(pos: number[], colors: number[]) {
    const slot = slotIndex[pos[0]];
    if (pos.some((p) => slotIndex[p] !== slot)) return false;
    // stickers of the same color must be on the same face
    for (let a = 0; a < pos.length; a++) {
      for (let b = a + 1; b < pos.length; b++) {
        if ((colors[a] === colors[b]) !== (faceOf(pos[a]) === faceOf(pos[b]))) return false;
      }
    }
    return true;
  }

  function edgePhrases(path: EdgeMacro[]): Phrase[] {
    const out: Phrase[] = [];
    let pending: string[] = [];
    for (const mc of path) {
      if (mc.moves.length === 1) {
        pending.push(...mc.moves);
        continue;
      }
      if (pending.length) out.push({ label: 'Set up', moves: pending });
      pending = [];
      if (mc.label === 'pair') {
        out.push({ label: 'Join', moves: [mc.moves[0]] }, { label: 'Swap it out', moves: mc.moves.slice(1, 4) }, { label: 'Slice back', moves: [mc.moves[4]] });
      } else if (mc.label === 'flip') {
        out.push({ label: 'Join', moves: [mc.moves[0]] }, { label: 'Flip', moves: mc.moves.slice(1, -1) }, { label: 'Slice back', moves: [mc.moves[mc.moves.length - 1]] });
      } else out.push({ label: 'Edge parity', moves: mc.moves });
    }
    if (pending.length) out.push({ label: 'Set up', moves: pending });
    return out;
  }

  const ALL_PAIRS = [[0, 1], [0, 2], [0, 4], [0, 5], [3, 1], [3, 2], [3, 4], [3, 5], [1, 2], [2, 4], [4, 5], [5, 1]];

  function edgesStage(s: State, steps: GuideStep[]) {
    let firstStep = true;
    let current: number[] | null = null;
    const explain = () => {
      if (!firstStep) return '';
      firstStep = false;
      return `<p>Now pair up the edges, while keeping the centers. The trick: bring the pieces of one edge into the middle layer at different heights, so that turning a slice (<code>Uw</code> or <code>Dw</code>) lines them up — the centers move too, for a moment. ` +
        `Then swap the joined edge out of the middle layer with a move like <code>R U R'</code>, which brings an unfinished edge in, and turn the slice back to fix the centers. Turns of the outer faces never split an edge, so the set-up moves are safe.</p>`;
    };
    for (let guard = 0; guard < 60; guard++) {
      const done = completeEdges(s);
      const todo = ALL_PAIRS.filter(([a, b]) => !done.has(edgeKey(a, b)));
      if (!todo.length) break;
      const mask = completeMask(s);
      if (todo.length <= 2) {
        // the last two: everything about both at once
        const pieces = todo.map(([a, b]) => piecesOf(s, a, b));
        const follow = pieces.flatMap((p) => [...(p.midge ? [p.midge] : []), ...p.wings]);
        const sizes = pieces.map((p) => p.wings.length + (p.midge ? 1 : 0));
        const goal = (pos: number[]) => {
          let at = 0;
          return sizes.every((sz) => {
            const ok = together(pos.slice(at, at + sz), follow.slice(at, at + sz).map((f) => f.color));
            at += sz;
            return ok;
          });
        };
        const path = edgeRoute(follow.map((f) => f.sticker), goal, mask, LAST_MACROS, 400);
        if (!path) throw new Error('reduction guide: last edges');
        const moves = path.flatMap((mc) => mc.moves);
        const usesParity = path.some((mc) => mc.label === 'parity');
        steps.push({
          stage: 1,
          title: todo.length === 2 ? 'The last two edges' : 'The last edge',
          html: explain() +
            (todo.length === 2
              ? '<p>Two edges are left, so there’s no unfinished edge to swap in.' +
                (path.some((mc) => mc.label === 'flip') ? ` Instead, put them in the middle layer, join with the slice, and do ${code(FLIP)} — it flips the edge at the front-right, which trades the halves between the two — before slicing back.` : '') + '</p>'
              : '<p>One edge is left.</p>') +
            (usesParity ? `<p>On a 5×5 the last edge can end up with its two outer pieces swapped, which no pairing move fixes. That’s <b>edge parity</b>; ${code(EDGE_PARITY_5)} swaps them back, at the front of the top.</p>` : ''),
          phrases: edgePhrases(path),
          focus: (t) => {
            const ps = todo.map(([a, b]) => piecesOf(t, a, b));
            return ps.flatMap((p) => [...p.wings.map((w) => w.sticker), ...(p.midge ? [p.midge.sticker] : [])]).flatMap((i) => [i, partner(i)]);
          },
        });
        s = apply(s, moves);
        continue;
      }
      // the cheapest single join: an edge and (on a 5×5) one more wing for its midge
      let pick: { a: number; b: number; path: EdgeMacro[]; cost: number } | null = null;
      // finish an edge before starting the next: half-built ones aren't protected
      const candidates: number[][] = current && todo.some(([a, b]) => a === current![0] && b === current![1]) ? [current] : todo;
      for (const [a, b] of candidates) {
        const p = piecesOf(s, a, b);
        const groups: { follow: { sticker: number; color: number }[] }[] = [];
        if (!p.midge) groups.push({ follow: p.wings });
        else {
          const attached = p.wings.filter((w) => together([p.midge!.sticker, w.sticker], [p.midge!.color, w.color]));
          for (const w of p.wings) if (!attached.includes(w)) groups.push({ follow: [p.midge, ...attached, w] });
        }
        for (const g of groups) {
          const path = edgeRoute(g.follow.map((f) => f.sticker), (pos) => together(pos, g.follow.map((f) => f.color)), mask, PAIR_MACROS, pick ? pick.cost - 1 : 200);
          if (!path) continue;
          const cost = path.reduce((x, mc) => x + mc.cost, 0);
          if (!pick || cost < pick.cost) pick = { a, b, path, cost };
        }
      }
      if (!pick) throw new Error('reduction guide: no edge to pair');
      const { a, b, path } = pick;
      const before = piecesOf(s, a, b);
      s = apply(s, path.flatMap((mc) => mc.moves));
      const finished = completeEdges(s).has(edgeKey(a, b));
      current = finished ? null : [a, b];
      steps.push({
        stage: 1,
        title: odd && !finished ? `The ${plainName(a)}–${plainName(b)} edge, one piece` : `The ${plainName(a)}–${plainName(b)} edge`,
        html: explain() +
          `<p>${odd ? `Find the ${name(a)}–${name(b)} edge pieces: the middle one and the two beside it.` : `Find the two ${name(a)}–${name(b)} edge pieces.`} ` +
          (path.some((mc) => mc.label === 'pair')
            ? `Set them up in the middle layer, then join, swap out and slice back.`
            : `Face turns alone bring them together here.`) +
          (odd && !finished ? ' This joins one outer piece to the middle; the other comes next.' : '') +
          (odd && finished && before.wings.some((w) => before.midge && together([before.midge.sticker, w.sticker], [before.midge.color, w.color])) ? ' One piece was already joined; this adds the other.' : '') + '</p>',
        phrases: edgePhrases(path),
        focus: (t) => {
          const p = piecesOf(t, a, b);
          return [...p.wings.map((w) => w.sticker), ...(p.midge ? [p.midge.sticker] : [])].flatMap((i) => [i, partner(i)]);
        },
      });
    }
    if (completeEdges(s).size !== 12) throw new Error('reduction guide: edges not paired ' + completeEdges(s).size);
    return s;
  }
  /** the other sticker of an edge piece */
  const partnerCache = new Map<number, number>();
  function partner(i: number) {
    let j = partnerCache.get(i);
    if (j === undefined) {
      const p = M.facelets[i].pos.join();
      j = M.facelets.find((f) => f.index !== i && f.pos.join() === p)!.index;
      partnerCache.set(i, j);
    }
    return j;
  }

  // ---------- the 3×3 stage ----------

  // a 3×3 coordinate (-2, 0, 2) stands for the big cube's outer layer, or every inner one
  const span = (x: number) => (x === 2 ? [m] : x === -2 ? [-m] : M.coords.filter((c) => Math.abs(c) < m));
  const bigOf = cube3.facelets.map((f) => {
    const out: number[] = [];
    for (const x of span(f.pos[0])) for (const y of span(f.pos[1])) for (const z of span(f.pos[2])) {
      const i = M.faceletAt([x, y, z] as Vec3, f.normal);
      if (i !== undefined) out.push(i);
    }
    return out;
  });
  /** the reduced cube as a 3×3 */
  const reduce = (s: State) => bigOf.map((is) => s[is[0]]);
  const expand = (focus: number[]) => focus.flatMap((i) => bigOf[i]);

  const B = beginnerStages(cube3);
  const K3 = lessonKit(cube3);
  /** run a 3×3 stage on the reduced cube, then move its steps over to the big cube */
  function run3(s: State, stage: (s3: State, steps: GuideStep[]) => State, steps: GuideStep[]) {
    const own: GuideStep[] = [];
    stage(reduce(s), own);
    for (const st of own) {
      const focus3 = st.focus;
      steps.push({
        ...st,
        stage: st.stage + 2,
        focus: (t) => {
          try {
            return expand(focus3(reduce(t)));
          } catch {
            return [];
          }
        },
      });
      s = apply(s, st.phrases.flatMap((p) => p.moves));
    }
    return s;
  }

  const TOP_LAYER = M.facelets.filter((f) => f.pos[1] === m).map((f) => f.index);
  const topFocus = () => TOP_LAYER;

  function ollParity(s: State, steps: GuideStep[]) {
    const s3 = reduce(s);
    const yellow = K3.center(s3, 'U');
    const up = ['UF', 'UR', 'UB', 'UL'].filter((e) => s3[K3.at(e, 'U')] === yellow);
    if (up.length % 2 === 0) return s;
    // put a flipped edge at the front
    const u = ['', 'U', "U'", 'U2'].find((x) => {
      const t = reduce(apply(s, [x]));
      return t[K3.at('UF', 'U')] !== yellow;
    })!;
    steps.push({
      stage: 5,
      title: 'OLL parity',
      html: `<p>Look at the top: ${up.length === 1 ? 'only one edge shows' : 'three edges show'} ${name(yellow)} on top. On a 3×3 that can’t happen — edges flip in pairs — but on a 4×4 it can, because each edge is really two pieces. ` +
        `It’s called <b>OLL parity</b> (OLL: Orient the Last Layer).</p>` +
        `<p>${u ? 'Turn the top so an edge without yellow on top is at the front, then do' : 'An edge without yellow on top is at the front. Do'} ${code(OLL_PARITY)}. It flips that edge and keeps the first two layers; the rest of the top may move, which is fine.</p>`,
      phrases: [...(u ? [{ label: 'Turn the top', moves: [u] }] : []), { label: 'OLL parity', moves: OLL_PARITY }],
      focus: topFocus,
    });
    return apply(s, [u, ...OLL_PARITY]);
  }

  /** after the yellow edges: corners that need an odd permutation mean PLL parity */
  function pllParity(s: State, steps: GuideStep[]) {
    const s3 = reduce(s);
    // which top spot each top corner belongs in
    const perm = TOP_CORNERS.map((slot) => {
      const cols = K3.colorsAt(s3, slot);
      return TOP_CORNERS.findIndex((home) => [...home].every((f) => cols.includes(K3.center(s3, f))));
    });
    if (!parity(perm)) return s;
    const inPlace = TOP_CORNERS.filter((c) => K3.inSpot(s3, c)).length;
    steps.push({
      stage: 6,
      title: 'PLL parity',
      html: `<p>Before the corners, check them: ${inPlace === 2 ? 'two corners are in their spots and the other two would have to swap' : 'none is in its spot, and they’d have to move round in a cycle of four'}. ` +
        `The corner step only ever moves three corners at a time, so it can’t fix that. On a 4×4 this is <b>PLL parity</b> (PLL: Permute the Last Layer): really two edges are swapped.</p>` +
        `<p>Do ${code(PLL_PARITY)} — <code>2R</code> is the second layer from the right on its own. It swaps the front and back edges of the top. Then line up the edges again.</p>`,
      phrases: [{ label: 'PLL parity', moves: PLL_PARITY }],
      focus: topFocus,
    });
    return apply(s, PLL_PARITY);
  }

  // ---------- the lesson ----------

  const STAGES = [
    { name: 'Centers', goal: odd ? 'Build each 3×3 center around its fixed center.' : 'Group the four center pieces of each color, in the right color order.' },
    { name: 'Edges', goal: odd ? 'Join each edge’s three pieces into one long edge.' : 'Pair up the two pieces of each edge.' },
    ...BEGINNER_STAGES.map((st, k) => (n === 4 && k === 3 ? { ...st, goal: st.goal + ' Fix OLL parity first if it shows up.' } : n === 4 && k === 4 ? { ...st, goal: st.goal + ' Then check for PLL parity.' } : st)),
  ];

  return {
    id: 'reduction',
    name: 'Reduction method',
    short: 'Beginner',
    notation: '<code>Rw</code> turns the right two layers together and <code>2R</code> just the second layer; <code>x</code> and <code>z</code> turn the whole cube like <code>R</code> and <code>F</code>.',
    intro: `Turn the ${n}×${n} into a big 3×3: build the centers, pair up the edges, then solve it with the 3×3 beginner’s method${n === 4 ? ', plus two parity algorithms a 3×3 never needs' : ''}.`,
    stages: STAGES,
    steps: (state) => {
      const steps: GuideStep[] = [];
      preface = '';
      let s = centersStage(state, steps);
      s = edgesStage(s, steps);
      s = run3(s, B.crossStage, steps);
      s = run3(s, B.cornersStage, steps);
      s = run3(s, B.middleStage, steps);
      if (n === 4) s = ollParity(s, steps);
      s = run3(s, B.yellowCross, steps);
      s = run3(s, B.yellowEdges, steps);
      if (n === 4) {
        const before = steps.length;
        s = pllParity(s, steps);
        if (steps.length > before) s = run3(s, B.yellowEdges, steps);
      }
      s = run3(s, B.cornerSpots, steps);
      s = run3(s, B.cornerTwists, steps);
      if (!M.isSolved(s)) throw new Error('reduction guide: not solved');
      return steps;
    },
  };
}
