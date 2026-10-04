// Shared tools for the 3×3 lessons (beginner, CFOP, Roux, ZZ): naming pieces by their colors,
// finding them in a state, phrasing the moves, and small searches that solve a few pieces at
// a time while leaving the solved ones alone.
//
// Slots are named by the faces they touch ('UF', 'DRF'), and a piece is found by its colors,
// so whole-cube turns need no bookkeeping. Searches track one sticker per piece: an edge or
// corner sticker's position fixes where its piece is and which way it's turned.

import { COLORS, COLOR_NAMES } from '../core/colors';
import type { GuideStep, Phrase, State, Vec3 } from '../core/types';
import { FACES, invertMove, type CubeModel } from './model';

export const NORMAL: Record<string, Vec3> = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
export const EDGES = ['UF', 'UR', 'UB', 'UL', 'FR', 'FL', 'BR', 'BL', 'DF', 'DR', 'DB', 'DL'];
export const CORNERS = ['UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'];
export const TOP_EDGES = EDGES.slice(0, 4);
export const TOP_CORNERS = CORNERS.slice(0, 4);
export const SIDE_NAME: Record<string, string> = { F: 'front', R: 'right', B: 'back', L: 'left', U: 'top', D: 'bottom' };

export const ROTATIONS = ['', 'y', "y'", 'y2'];
export const U_TURNS = ['', 'U', "U'", 'U2'];
/** the quarter and half turns of each face */
export const turns = (faces: string) => [...faces].flatMap((f) => [f, f + "'", f + '2']);
export const FACE_MOVES = turns(FACES);

export const alg = (text: string) => text.split(' ').filter(Boolean);
export const repeat = (moves: string[], n: number) => Array.from({ length: n }, () => moves).flat();
export const rounds = (n: number) => (n === 1 ? 'one round' : `${n} rounds`);
export const list = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
export const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
/** two slot names for the same place ('DRF', 'DFR') */
export const sameSlot = (a: string, b: string) => a.length === b.length && [...a].every((f) => b.includes(f));
export const countMoves = (phrases: Phrase[]) => phrases.reduce((k, p) => k + p.moves.length, 0);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** the moves of a search's route */
export const macroMoves = (path: Macro[]) => path.flatMap((m) => m.moves);
/** a step's moves, in order */
export const stepMoves = (step: GuideStep) => step.phrases.flatMap((p) => p.moves);
/** the notation note for lessons with wide, slice and x turns */
export const WIDE_NOTATION = 'Lowercase <code>r</code> turns the right two layers together, <code>M</code> turns the middle slice like <code>L</code>, and <code>x</code> and <code>z</code> turn the whole cube like <code>R</code> and <code>F</code>.';
/** the whole-cube turns that bring any face to any other */
const REORIENT = ['', 'x2', 'z2', 'x', "x'", 'z', "z'"];

/** A move sequence the searches treat as one step; `cost` is in quarter-moves (4 per move). */
export interface Macro {
  moves: string[];
  cost: number;
}

export type Kit = ReturnType<typeof lessonKit>;

// a position packs into one number, six bits per tracked sticker (there are 54 stickers)
const pack = (p: number[]) => p.reduce((k, i) => (k << 6) | i, 0);
/** where each macro takes a packed position */
const stepper = (maps: number[][], n: number) => {
  const digits = new Int32Array(n);
  return (k: number, m: number) => {
    const to = maps[m];
    let out = 0;
    for (let j = n - 1; j >= 0; j--) digits[j] = (k >> (6 * (n - 1 - j))) & 63;
    for (let j = 0; j < n; j++) out = (out << 6) | to[digits[j]];
    return out;
  };
};
// dense scratch arrays for searches over up to three stickers, shared by every kit (one
// search runs at a time)
const DENSE = 64 ** 3;
let dense: { cost: Int32Array; parent: Int32Array; via: Int16Array; seen: Int32Array } | null = null;
let epoch = 0;

export function lessonKit(M: CubeModel) {
  const atCache = new Map<string, number>();
  /** the sticker of `slot` (e.g. 'UFR') on `face`; on a big cube, corners, midges and fixed centers */
  const at = (slot: string, face: string) => {
    const k = slot + face;
    let i = atCache.get(k);
    if (i === undefined) {
      const pos = [0, 1, 2].map((d) => [...slot].reduce((sum, f) => sum + (M.n - 1) * NORMAL[f][d], 0)) as Vec3;
      i = M.faceletAt(pos, NORMAL[face])!;
      atCache.set(k, i);
    }
    return i;
  };
  const stickersOf = (slot: string) => [...slot].map((f) => at(slot, f));
  const center = (s: State, face: string) => s[at(face, face)];
  const colorsAt = (s: State, slot: string) => stickersOf(slot).map((i) => s[i]);
  const find = (s: State, colors: number[]) =>
    (colors.length === 2 ? EDGES : CORNERS).find((slot) => sameSet(colorsAt(s, slot), colors))!;
  /** the face of `slot` showing color `c` */
  const faceShowing = (s: State, slot: string, c: number) => [...slot].find((f) => s[at(slot, f)] === c)!;
  /** where the sticker of color `c` on the piece with `colors` is now */
  const stickerOf = (s: State, colors: number[], c: number) => {
    const slot = find(s, colors);
    return at(slot, faceShowing(s, slot, c));
  };
  const placed = (s: State, slot: string) => [...slot].every((f) => s[at(slot, f)] === center(s, f));
  /** the piece's colors match the centers around its slot, in any orientation */
  const inSpot = (s: State, slot: string) => sameSet(colorsAt(s, slot), [...slot].map((f) => center(s, f)));
  /** apply moves, skipping '' (no move) */
  const apply = (s: State, moves: string[]) => M.applyAll(s, moves.filter(Boolean));
  const focusOn = (pieces: number[][]) => (s: State) => pieces.flatMap((p) => stickersOf(find(s, p)));

  const name = (c: number) => `<span class="cname" style="--c:${COLORS[c]}">${COLOR_NAMES[c].toLowerCase()}</span>`;
  const piece = (cols: number[]) => cols.map(name).join('–');
  const plain = (cols: number[]) => cols.map((c) => COLOR_NAMES[c].toLowerCase()).join('–');
  const code = (moves: string[]) => `<code>${moves.join(' ')}</code>`;

  /** the first move in `options` (some may be '') after which `ok` holds */
  const first = (s: State, options: string[], ok: (t: State) => boolean) => {
    const m = options.find((o) => ok(apply(s, [o])));
    if (m === undefined) throw new Error('lesson: no option fits');
    return m;
  };
  const rotatePhrase = (m: string): Phrase[] => (m ? [{ label: 'Turn the whole cube', moves: m.split(' ') }] : []);
  const topPhrase = (m: string, label = 'Turn the top'): Phrase[] => (m ? [{ label, moves: [m] }] : []);
  /** the whole-cube turn that brings the center of `color` to `face` */
  const hold = (s: State, face: string, color: number) => first(s, REORIENT, (t) => center(t, face) === color);

  // ---------- where stickers go ----------

  const destCache = new Map<string, number[]>();
  /** to[i] is where the sticker at i goes under `moves` */
  function dest(moves: string[]) {
    const k = moves.join(' ');
    let to = destCache.get(k);
    if (to) return to;
    to = M.facelets.map((f) => f.index);
    for (const m of moves) {
      const perm = M.permutation(M.parseMove(m)!);
      const step: number[] = [];
      perm.forEach((src, d) => (step[src] = d));
      to = to.map((i) => step[i]);
    }
    destCache.set(k, to);
    return to;
  }
  /** the moves leave every sticker in `keep` where it is */
  const fixes = (moves: string[], keep: number[]) => {
    const to = dest(moves);
    return keep.every((i) => to[i] === i);
  };

  /**
   * Macros for solving pieces without disturbing `keep`: every single move in `singles` that
   * leaves it alone, and every X Y X' (X from `outer`, Y from `inner`) that puts it back.
   * Conjugates whose X is in `penalized` cost a little more, so the search prefers the others.
   */
  function macros(keep: number[], singles: string[], outer: string[] = [], inner: string[] = [], penalized: string[] = []): Macro[] {
    const out: Macro[] = singles.filter((m) => fixes([m], keep)).map((m) => ({ moves: [m], cost: 4 }));
    for (const x of outer) {
      for (const y of inner) {
        if (x[0] === y[0]) continue;
        const moves = [x, y, invertMove(x)];
        if (fixes(moves, keep)) out.push({ moves, cost: 12 + (penalized.includes(x) ? 2 : 0) });
      }
    }
    return out;
  }

  /**
   * The cheapest run of macros taking the stickers at `from` to `goal` (each tracked on its
   * own), or null if there's none. A uniform-cost search; costs are small integers.
   */
  function route(from: number[], goal: number[], ms: Macro[], maxCost = 400): Macro[] | null {
    const n = from.length;
    if (n > 5) throw new Error('lesson: too many stickers to track');
    const next = stepper(ms.map((m) => dest(m.moves)), n);
    const target = pack(goal);
    const start = pack(from);
    // cost, parent and the macro that got there, in typed arrays when they fit
    let getCost: (k: number) => number;
    let set: (k: number, c: number, parent: number, via: number) => void;
    let back: (k: number) => [number, number];
    if (n <= 3) {
      dense ??= { cost: new Int32Array(DENSE), parent: new Int32Array(DENSE), via: new Int16Array(DENSE), seen: new Int32Array(DENSE) };
      const e = ++epoch;
      const { cost, parent, via, seen } = dense;
      getCost = (k) => (seen[k] === e ? cost[k] : -1);
      set = (k, c, p, m) => { seen[k] = e; cost[k] = c; parent[k] = p; via[k] = m; };
      back = (k) => [parent[k], via[k]];
    } else {
      const map = new Map<number, [number, number, number]>();
      getCost = (k) => map.get(k)?.[0] ?? -1;
      set = (k, c, p, m) => void map.set(k, [c, p, m]);
      back = (k) => [map.get(k)![1], map.get(k)![2]];
    }
    set(start, 0, -1, -1);
    const buckets: number[][] = [[start]];
    for (let c = 0; c < buckets.length && c <= maxCost; c++) {
      const bucket = buckets[c];
      if (!bucket) continue;
      for (const k of bucket) {
        if (getCost(k) !== c) continue;
        if (k === target) {
          const path: Macro[] = [];
          for (let cur = k; cur !== start; ) {
            const [p, m] = back(cur);
            path.unshift(ms[m]);
            cur = p;
          }
          return path;
        }
        for (let m = 0; m < ms.length; m++) {
          const kq = next(k, m);
          const cq = c + ms[m].cost;
          const old = getCost(kq);
          if (old < 0 || cq < old) {
            set(kq, cq, k, m);
            (buckets[cq] ??= []).push(kq);
          }
        }
      }
    }
    return null;
  }

  /**
   * Distances to `goal` for every arrangement of the tracked stickers reachable with `moves`
   * (which must include each move's inverse). Built once, then `descend` reads a route off it.
   */
  function table(goal: number[], moves: string[]) {
    const maps = moves.map((m) => dest([m]));
    const n = goal.length;
    // number each tracked sticker's reachable positions, so a position is an index into one array
    const orbits = goal.map((g) => {
      const seen = [g];
      for (let j = 0; j < seen.length; j++) for (const to of maps) if (!seen.includes(to[seen[j]])) seen.push(to[seen[j]]);
      return seen;
    });
    const rank = orbits.map((o) => {
      const r = new Int32Array(64).fill(-1);
      o.forEach((pos, i) => (r[pos] = i));
      return r;
    });
    const size = orbits.reduce((k, o) => k * o.length, 1);
    if (size > 1 << 24) throw new Error('lesson: table too big');
    const index = (p: number[]) => p.reduce((k, pos, j) => k * orbits[j].length + rank[j][pos], 0);
    const dist = new Int8Array(size).fill(-1);
    dist[index(goal)] = 0;
    let frontier = [index(goal)];
    // the hot loop: decode into a reused array and index without allocating
    const p = new Int32Array(n);
    for (let d = 1; frontier.length; d++) {
      const next: number[] = [];
      for (const k0 of frontier) {
        let k = k0;
        for (let j = n - 1; j >= 0; j--) {
          const len = orbits[j].length;
          p[j] = orbits[j][k % len];
          k = (k - (k % len)) / len;
        }
        for (const to of maps) {
          let kq = 0;
          for (let j = 0; j < n; j++) kq = kq * orbits[j].length + rank[j][to[p[j]]];
          if (dist[kq] < 0) {
            dist[kq] = d;
            next.push(kq);
          }
        }
      }
      frontier = next;
    }
    return {
      descend(from: number[]) {
        let p = from;
        let d = dist[index(p)];
        if (!(d >= 0)) throw new Error('lesson: unreachable');
        const path: string[] = [];
        while (d > 0) {
          const m = maps.findIndex((to) => dist[index(p.map((i) => to[i]))] === d - 1);
          path.push(moves[m]);
          p = p.map((i) => maps[m][i]);
          d--;
        }
        return path;
      },
    };
  }

  /**
   * Distances for a property of the state (`key`) that moves change the same way whatever the
   * rest of the cube is doing — like which edges are flipped. Built from `start`.
   */
  function keyTable(start: State, moves: string[], key: (s: State) => number) {
    const dist = new Map<number, number>([[key(start), 0]]);
    let frontier = [start];
    for (let d = 1; frontier.length; d++) {
      const next: State[] = [];
      for (const s of frontier) {
        for (const m of moves) {
          const t = M.apply(s, m);
          const k = key(t);
          if (!dist.has(k)) {
            dist.set(k, d);
            next.push(t);
          }
        }
      }
      frontier = next;
    }
    return {
      dist: (s: State) => dist.get(key(s)),
      descend(s: State) {
        let d = dist.get(key(s));
        if (d === undefined) throw new Error('lesson: unreachable');
        const path: string[] = [];
        while (d > 0) {
          const m = moves.find((mv) => dist.get(key(M.apply(s, mv))) === d! - 1)!;
          path.push(m);
          s = M.apply(s, m);
          d--;
        }
        return path;
      },
    };
  }

  // ---------- pairs: a corner and an edge solved together ----------

  /** The corner and edge sit side by side with matching colors: they move as one block. */
  const paired = (s: State, corner: number[], edge: number[]) => {
    const c = find(s, corner);
    const e = find(s, edge);
    return [...e].every((f) => c.includes(f) && s[at(e, f)] === s[at(c, f)]);
  };

  /**
   * Turn a pair's macros into phrases: each conjugate takes the single moves before it along,
   * and is labelled by what it did — took a piece out of a slot, joined the pair, or put it in.
   */
  function pairPhrases(s: State, ms: Macro[], corner: number[], edge: number[], low = (slot: string) => !slot.includes('U')): Phrase[] {
    const groups: string[][] = [];
    let cur: string[] = [];
    ms.forEach((m, k) => {
      cur.push(...m.moves);
      if (m.moves.length > 1 || k === ms.length - 1) {
        groups.push(cur);
        cur = [];
      }
    });
    return groups.map((moves, k) => {
      const t = apply(s, moves);
      const wasLow = low(find(s, corner)) || low(find(s, edge));
      const nowLow = low(find(t, corner)) || low(find(t, edge));
      const label = k === groups.length - 1 ? 'Insert the pair'
        : paired(t, corner, edge) ? (paired(s, corner, edge) ? 'Move the pair' : 'Pair them up')
        : wasLow && !nowLow ? 'Take it out of the slot'
        : 'Set up';
      s = t;
      return { label, moves };
    });
  }

  /** Describe where a pair's pieces are, for the step's text. `edge` lists its colors in the order of `home.edge`'s faces. */
  function pairWhere(s: State, corner: number[], edge: number[], home: { corner: string; edge: string }, bottom: number) {
    const c = find(s, corner);
    const e = find(s, edge);
    const cBottom = faceShowing(s, c, bottom);
    let cText: string;
    if (sameSlot(c, home.corner))
      cText = cBottom === 'D' ? 'already in its slot' : 'in its slot, but twisted';
    else if (c.includes('U')) cText = cBottom === 'U' ? `in the top layer with ${name(bottom)} facing up` : `in the top layer with ${name(bottom)} facing ${SIDE_NAME[cBottom]}`;
    else cText = 'stuck in another slot';
    let eText: string;
    if (sameSlot(e, home.edge))
      eText = [...e].every((f) => s[at(e, f)] === edge[[...home.edge].indexOf(f)]) ? 'already in its slot' : 'in its slot, but flipped';
    else if (e.includes('U')) eText = 'in the top layer';
    else eText = e.includes('D') ? 'in the bottom layer' : 'in another slot';
    return `The corner is ${cText}; the edge is ${eText}.`;
  }

  return {
    at, stickersOf, center, find, faceShowing, stickerOf, placed, inSpot, apply, focusOn, colorsAt, hold,
    name, piece, plain, code, first, rotatePhrase, topPhrase,
    macros, route, table, keyTable, pairPhrases, pairWhere,
  };
}

/**
 * Say something only the first time it's asked for: spells out an acronym (F2L, CMLL, …) in
 * the first step that uses it. Make one per lesson.
 */
export type Once = ReturnType<typeof onceOnly>;
export function onceOnly() {
  const said = new Set<string>();
  return (key: string, text: string) => (said.has(key) ? '' : (said.add(key), text));
}

