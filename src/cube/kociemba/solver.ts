// Kociemba two-phase solver, run in "optimal" mode.
//
// Phase 1 brings the cube into G1 = <U, D, R2, L2, F2, B2>; phase 2 solves it using
// only G1 moves. Instead of stopping at the first solution, the search keeps
// increasing the phase-1 depth while demanding strictly shorter totals. Every
// solution of length n can be split at the last moment it enters G1 (necessarily
// via a quarter turn of R/L/F/B), so once phase-1 depth reaches the best length
// found, no shorter solution can exist: the result is proven optimal.

import { buildPruning, permRank, permUnrank } from '../../core/perm';

// ---------- cubie level ----------

interface CubieCube {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

/** Facelets of each corner / edge slot, in Kociemba order (see `CubeModel`'s 3×3 sticker order). */
export const CORNER_FACELETS = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
export const EDGE_FACELETS = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
const CORNER_FACES = [
  [0, 1, 2], [0, 2, 4], [0, 4, 5], [0, 5, 1], [3, 2, 1], [3, 4, 2], [3, 5, 4], [3, 1, 5],
];
const EDGE_FACES = [
  [0, 1], [0, 2], [0, 4], [0, 5], [3, 1], [3, 2], [3, 4], [3, 5], [2, 1], [2, 4], [5, 4], [5, 1],
];

/** Facelets given as face ids (0..5, relative to the centers) → cubie cube. Assumes a valid state. */
export function toCubie(faces: number[]): CubieCube {
  const cc: CubieCube = { cp: [], co: [], ep: [], eo: [] };
  for (let i = 0; i < 8; i++) {
    const f = CORNER_FACELETS[i].map((k) => faces[k]);
    const ori = f.findIndex((x) => x === 0 || x === 3);
    const c1 = f[(ori + 1) % 3];
    const c2 = f[(ori + 2) % 3];
    cc.cp[i] = CORNER_FACES.findIndex((cf) => cf[1] === c1 && cf[2] === c2);
    cc.co[i] = ori;
  }
  for (let i = 0; i < 12; i++) {
    const [a, b] = EDGE_FACELETS[i].map((k) => faces[k]);
    const j = EDGE_FACES.findIndex(([x, y]) => x === a && y === b);
    if (j >= 0) { cc.ep[i] = j; cc.eo[i] = 0; }
    else { cc.ep[i] = EDGE_FACES.findIndex(([x, y]) => x === b && y === a); cc.eo[i] = 1; }
  }
  return cc;
}

function mult(a: CubieCube, b: CubieCube): CubieCube {
  const r: CubieCube = { cp: [], co: [], ep: [], eo: [] };
  for (let i = 0; i < 8; i++) {
    r.cp[i] = a.cp[b.cp[i]];
    r.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    r.ep[i] = a.ep[b.ep[i]];
    r.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  }
  return r;
}

const identity = (): CubieCube => ({
  cp: [0, 1, 2, 3, 4, 5, 6, 7], co: new Array(8).fill(0),
  ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: new Array(12).fill(0),
});

// ---------- coordinates ----------

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

const getTwist = (c: CubieCube) => c.co.slice(0, 7).reduce((a, x) => a * 3 + x, 0);
function setTwist(c: CubieCube, t: number) {
  let sum = 0;
  for (let i = 6; i >= 0; i--) { c.co[i] = t % 3; sum += c.co[i]; t = Math.floor(t / 3); }
  c.co[7] = (3 - (sum % 3)) % 3;
}
const getFlip = (c: CubieCube) => c.eo.slice(0, 11).reduce((a, x) => a * 2 + x, 0);
function setFlip(c: CubieCube, f: number) {
  let sum = 0;
  for (let i = 10; i >= 0; i--) { c.eo[i] = f & 1; sum += c.eo[i]; f >>= 1; }
  c.eo[11] = sum % 2;
}
/** Which 4 of the 12 edge slots hold UD-slice edges (FR, FL, BL, BR), as a combination rank 0..494. */
function getSlice(c: CubieCube): number {
  let r = 0, k = 0;
  for (let i = 0; i < 12; i++) if (c.ep[i] >= 8) { k++; r += binom(i, k); }
  return r;
}
function setSlice(c: CubieCube, r: number) {
  const slot = new Array(12).fill(false);
  for (let k = 4; k >= 1; k--) {
    let i = k - 1;
    while (binom(i + 1, k) <= r) i++;
    r -= binom(i, k);
    slot[i] = true;
  }
  let s = 8, o = 0;
  for (let i = 0; i < 12; i++) c.ep[i] = slot[i] ? s++ : o++;
}
const getCornerPerm = (c: CubieCube) => permRank(c.cp);
const setCornerPerm = (c: CubieCube, r: number) => { c.cp = permUnrank(r, 8); };
const getUDEdgePerm = (c: CubieCube) => permRank(c.ep.slice(0, 8));
const setUDEdgePerm = (c: CubieCube, r: number) => { c.ep = [...permUnrank(r, 8), 8, 9, 10, 11]; };
const getSlicePerm = (c: CubieCube) => permRank(c.ep.slice(8).map((x) => x - 8));
const setSlicePerm = (c: CubieCube, r: number) => { c.ep = [0, 1, 2, 3, 4, 5, 6, 7, ...permUnrank(r, 4).map((x) => x + 8)]; };

// ---------- moves ----------

export const MOVE_NAMES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'", 'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'"];
const PHASE2_MOVES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16];
/** quarter turns of R, L, F, B: the only moves that can enter G1 */
const ENTERS_G1 = new Uint8Array(18);
[3, 5, 6, 8, 12, 14, 15, 17].forEach((m) => (ENTERS_G1[m] = 1));

const N_TWIST = 2187, N_FLIP = 2048, N_SLICE = 495, N_CP = 40320, N_EP = 40320, N_SP = 24;

interface Tables {
  moveCubes: CubieCube[];
  twistMove: Uint16Array; flipMove: Uint16Array; sliceMove: Uint16Array;
  cpMove: Uint16Array; epMove: Uint16Array; spMove: Uint8Array;
  pTwistSlice: Uint8Array; pFlipSlice: Uint8Array; pCpSp: Uint8Array; pEpSp: Uint8Array;
  goal: { slice: number };
}

let tables: Tables | null = null;

function buildMoveTable(n: number, moves: number[], nMoves: number, set: (c: CubieCube, x: number) => void, get: (c: CubieCube) => number, moveCubes: CubieCube[], Arr: typeof Uint16Array | typeof Uint8Array) {
  const t = new Arr(n * nMoves);
  const c = identity();
  for (let x = 0; x < n; x++) {
    set(c, x);
    moves.forEach((m, mi) => { t[x * nMoves + mi] = get(mult(c, moveCubes[m])); });
  }
  return t;
}

/** Build move and pruning tables. `faceMove(face)` returns the facelet state after a clockwise turn of that face. */
export function initSolver(faceMove: (face: number) => number[]) {
  if (tables) return;
  const quarter = [0, 1, 2, 3, 4, 5].map((f) => toCubie(faceMove(f)));
  const moveCubes: CubieCube[] = [];
  for (let f = 0; f < 6; f++) {
    let c = quarter[f];
    for (let k = 0; k < 3; k++) { moveCubes.push(c); c = mult(c, quarter[f]); }
  }
  const all = Array.from({ length: 18 }, (_, i) => i);
  const twistMove = buildMoveTable(N_TWIST, all, 18, setTwist, getTwist, moveCubes, Uint16Array) as Uint16Array;
  const flipMove = buildMoveTable(N_FLIP, all, 18, setFlip, getFlip, moveCubes, Uint16Array) as Uint16Array;
  const sliceMove = buildMoveTable(N_SLICE, all, 18, setSlice, getSlice, moveCubes, Uint16Array) as Uint16Array;
  const cpMove = buildMoveTable(N_CP, PHASE2_MOVES, 10, setCornerPerm, getCornerPerm, moveCubes, Uint16Array) as Uint16Array;
  const epMove = buildMoveTable(N_EP, PHASE2_MOVES, 10, setUDEdgePerm, getUDEdgePerm, moveCubes, Uint16Array) as Uint16Array;
  const spMove = buildMoveTable(N_SP, PHASE2_MOVES, 10, setSlicePerm, getSlicePerm, moveCubes, Uint8Array) as Uint8Array;
  const goalSlice = getSlice(identity());
  tables = {
    moveCubes, twistMove, flipMove, sliceMove, cpMove, epMove, spMove,
    pTwistSlice: buildPruning(N_TWIST, N_SLICE, twistMove, sliceMove, 18, goalSlice),
    pFlipSlice: buildPruning(N_FLIP, N_SLICE, flipMove, sliceMove, 18, goalSlice),
    pCpSp: buildPruning(N_CP, N_SP, cpMove, spMove, 10, 0),
    pEpSp: buildPruning(N_EP, N_SP, epMove, spMove, 10, 0),
    goal: { slice: goalSlice },
  };
}

// ---------- search ----------

export interface SearchCallbacks {
  onSolution: (moves: string[]) => void;
  onDepth?: (depth: number) => void;
  /** return true to abort */
  shouldStop: () => boolean;
}

class Abort extends Error {}

/**
 * Search for the shortest solution. `faces` is the state as face ids relative to the centers.
 * Returns 'optimal' if the search space was exhausted, 'stopped' if aborted.
 */
export function solve(faces: number[], cb: SearchCallbacks, startBound = 21): 'optimal' | 'stopped' {
  const T = tables!;
  const start = toCubie(faces);
  const faceOf = (m: number) => (m / 3) | 0;
  const path = new Int8Array(40);
  const path2 = new Int8Array(40);
  let best = startBound + 1; // looking for solutions strictly shorter than this
  let nodes = 0;

  const tick = () => {
    if ((++nodes & 0x3fff) === 0 && cb.shouldStop()) throw new Abort();
  };

  const emit = (n1: number, n2: number) => {
    const moves: string[] = [];
    for (let i = 0; i < n1; i++) moves.push(MOVE_NAMES[path[i]]);
    for (let i = 0; i < n2; i++) moves.push(MOVE_NAMES[PHASE2_MOVES[path2[i]]]);
    best = n1 + n2;
    cb.onSolution(moves);
  };

  const phase2 = (cp: number, ep: number, sp: number, depth: number, togo: number, lastFace: number, n1: number): boolean => {
    tick();
    if (togo === 0) {
      if (cp === 0 && ep === 0 && sp === 0) { emit(n1, depth); return true; }
      return false;
    }
    for (let mi = 0; mi < 10; mi++) {
      const m = PHASE2_MOVES[mi];
      const f = faceOf(m);
      if (f === lastFace || (f === lastFace - 3)) continue; // same face, or opposite face in canonical order
      const ncp = T.cpMove[cp * 10 + mi], nep = T.epMove[ep * 10 + mi], nsp = T.spMove[sp * 10 + mi];
      const h = Math.max(T.pCpSp[ncp * 24 + nsp], T.pEpSp[nep * 24 + nsp]);
      if (h >= togo) continue;
      path2[depth] = mi;
      if (phase2(ncp, nep, nsp, depth + 1, togo - 1, f, n1)) return true;
    }
    return false;
  };

  const startPhase2 = (n1: number) => {
    let c = start;
    for (let i = 0; i < n1; i++) c = mult(c, T.moveCubes[path[i]]);
    const cp = getCornerPerm(c), ep = getUDEdgePerm(c), sp = getSlicePerm(c);
    const h = Math.max(T.pCpSp[cp * 24 + sp], T.pEpSp[ep * 24 + sp]);
    const maxD2 = best - 1 - n1;
    const lastFace = n1 > 0 ? faceOf(path[n1 - 1]) : -1;
    for (let d2 = h; d2 <= maxD2; d2++) {
      if (phase2(cp, ep, sp, 0, d2, lastFace, n1)) return;
    }
  };

  const phase1 = (twist: number, flip: number, slice: number, depth: number, togo: number, lastFace: number) => {
    tick();
    if (togo === 0) {
      // In G1 by construction of the pruning test below. Must have entered via a quarter turn of R/L/F/B.
      if (depth === 0 || ENTERS_G1[path[depth - 1]]) startPhase2(depth);
      return;
    }
    for (let m = 0; m < 18; m++) {
      const f = faceOf(m);
      if (f === lastFace || f === lastFace - 3) continue;
      const nt = T.twistMove[twist * 18 + m], nf = T.flipMove[flip * 18 + m], ns = T.sliceMove[slice * 18 + m];
      const h = Math.max(T.pTwistSlice[nt * N_SLICE + ns], T.pFlipSlice[nf * N_SLICE + ns]);
      if (h > togo - 1) continue;
      // at the leaf we need to be exactly in G1
      if (togo === 1 && h !== 0) continue;
      path[depth] = m;
      phase1(nt, nf, ns, depth + 1, togo - 1, f);
    }
  };

  try {
    const t0 = getTwist(start), f0 = getFlip(start), s0 = getSlice(start);
    const h0 = Math.max(T.pTwistSlice[t0 * N_SLICE + s0], T.pFlipSlice[f0 * N_SLICE + s0]);
    for (let d1 = h0; d1 < best; d1++) {
      cb.onDepth?.(d1);
      phase1(t0, f0, s0, 0, d1, -1);
    }
    return 'optimal';
  } catch (e) {
    if (e instanceof Abort) return 'stopped';
    throw e;
  }
}
