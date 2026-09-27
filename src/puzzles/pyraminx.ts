// Pyraminx: a tetrahedron cut twice along each of its four vertex axes.
//
// Every point inside the tetrahedron has barycentric weights (b_U, b_L, b_R, b_B)
// summing to 1. The cuts sit at b = 1/3 and b = 2/3, which gives:
//   tip i     b_i ≥ 2/3                      (turned alone by u, l, r, b)
//   center i  1/3 ≤ b_i ≤ 2/3, others ≤ 1/3  (turned with its tip by U, L, R, B)
//   edge i-j  b_i ≥ 1/3 and b_j ≥ 1/3
//   core      every b ≤ 1/3                  (never moves)
// Stickers, pieces and move permutations are all derived from that description.

import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { DragOption, Puzzle, State, StickerDef, Turn, Validation, Vec3 } from './types';

const COLORS = ['#14a85a', '#2166e6', '#e02a3c', '#ffd21f', '#2c313c'];
const COLOR_NAMES = ['Green', 'Blue', 'Red', 'Yellow', 'Eraser'];
const UNSET = 4;
const COLOR_LETTERS = 'GBRY';
const VERTEX_NAMES = ['U', 'L', 'R', 'B'];

// ---------- geometry ----------

const SIZE = 2.6; // circumradius
const rr = (2 * Math.SQRT2) / 3;
const VERTICES: THREE.Vector3[] = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3((-rr * Math.sqrt(3)) / 2, -1 / 3, rr / 2),
  new THREE.Vector3((rr * Math.sqrt(3)) / 2, -1 / 3, rr / 2),
  new THREE.Vector3(0, -1 / 3, -rr),
].map((v) => v.multiplyScalar(SIZE));
const AXES = VERTICES.map((v) => v.clone().normalize());

const fromBary = (b: number[]) => {
  const p = new THREE.Vector3();
  b.forEach((w, i) => p.addScaledVector(VERTICES[i], w));
  return p;
};

// Faces: color, the vertices it touches, and where those vertices sit on the 2D map.
const S2 = 6, H2 = (S2 * Math.sqrt(3)) / 2;
const FACES: { color: number; verts: number[]; map: [number, number][] }[] = [
  { color: 0, verts: [0, 1, 2], map: [[S2, 0], [S2 / 2, H2], [S2 * 1.5, H2]] }, // front: U L R
  { color: 1, verts: [0, 2, 3], map: [[S2, 0], [S2 * 1.5, H2], [S2 * 2, 0]] }, // right: U R B
  { color: 2, verts: [0, 3, 1], map: [[S2, 0], [0, 0], [S2 / 2, H2]] }, // left: U B L
  { color: 3, verts: [1, 2, 3], map: [[S2 / 2, H2], [S2 * 1.5, H2], [S2, 2 * H2]] }, // down: L R B
];

// piece ids
const TIP = (i: number) => i;
const CENTER = (i: number) => 4 + i;
const EDGE_PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const EDGE = (i: number, j: number) => 8 + EDGE_PAIRS.findIndex(([a, b]) => (a === i && b === j) || (a === j && b === i));
const CORE = 14;

function pieceOfBary(b: number[]): number {
  const hi = b.findIndex((x) => x > 2 / 3);
  if (hi >= 0) return TIP(hi);
  const big = b.flatMap((x, i) => (x > 1 / 3 ? [i] : []));
  if (big.length === 2) return EDGE(big[0], big[1]);
  if (big.length === 1) return CENTER(big[0]);
  return CORE;
}

/** Half-space constraints (coordinate, ≥ or ≤, value) describing each piece. */
function pieceConstraints(piece: number): [number, 1 | -1, number][] {
  const c: [number, 1 | -1, number][] = [0, 1, 2, 3].map((i) => [i, 1, 0]);
  if (piece < 4) c.push([piece, 1, 2 / 3]);
  else if (piece < 8) {
    const i = piece - 4;
    c.push([i, 1, 1 / 3], [i, -1, 2 / 3]);
    for (let j = 0; j < 4; j++) if (j !== i) c.push([j, -1, 1 / 3]);
  } else if (piece < 14) {
    const [i, j] = EDGE_PAIRS[piece - 8];
    c.push([i, 1, 1 / 3], [j, 1, 1 / 3]);
  } else for (let j = 0; j < 4; j++) c.push([j, -1, 1 / 3]);
  return c;
}

/** Corners of a piece: every point where three constraints on distinct coordinates are tight. */
function pieceCorners(piece: number): THREE.Vector3[] {
  const cons = pieceConstraints(piece);
  const pts: THREE.Vector3[] = [];
  const feasible = (b: number[]) => cons.every(([i, dir, v]) => (dir > 0 ? b[i] >= v - 1e-9 : b[i] <= v + 1e-9));
  for (let a = 0; a < cons.length; a++)
    for (let b = a + 1; b < cons.length; b++)
      for (let c = b + 1; c < cons.length; c++) {
        const tight = [cons[a], cons[b], cons[c]];
        const coords = new Set(tight.map((t) => t[0]));
        if (coords.size !== 3) continue;
        const bary = [0, 0, 0, 0];
        let rest = 1;
        for (const [i, , v] of tight) { bary[i] = v; rest -= v; }
        const free = [0, 1, 2, 3].find((i) => !coords.has(i))!;
        bary[free] = rest;
        if (!feasible(bary)) continue;
        const p = fromBary(bary);
        if (!pts.some((q) => q.distanceTo(p) < 1e-6)) pts.push(p);
      }
  return pts;
}

const PIECE_SHRINK = 0.955;
const pieceCentroids = Array.from({ length: 15 }, (_, i) => {
  const pts = pieceCorners(i);
  return pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
});
const shrinkToPiece = (p: THREE.Vector3, piece: number) =>
  p.clone().sub(pieceCentroids[piece]).multiplyScalar(PIECE_SHRINK).add(pieceCentroids[piece]);

interface PyraSticker extends StickerDef {
  center: THREE.Vector3;
  bary: number[];
}

const stickers: PyraSticker[] = [];
for (const face of FACES) {
  const tris: number[][][] = [];
  for (let i = 0; i <= 2; i++)
    for (let j = 0; j <= 2 - i; j++) {
      const k = 2 - i - j;
      tris.push([[i + 1, j, k], [i, j + 1, k], [i, j, k + 1]]); // pointing the same way as the face
    }
  for (let i = 0; i <= 1; i++)
    for (let j = 0; j <= 1 - i; j++) {
      const k = 1 - i - j;
      tris.push([[i, j + 1, k + 1], [i + 1, j, k + 1], [i + 1, j + 1, k]]); // pointing the other way
    }
  const faceNormal = fromBary([1, 1, 1, 1].map((_, v) => (face.verts.includes(v) ? 1 / 3 : 0))).normalize();
  for (const tri of tris) {
    const faceBary = tri.map((t) => t.map((x) => x / 3));
    const toTetra = (fb: number[]) => {
      const b = [0, 0, 0, 0];
      fb.forEach((w, k) => (b[face.verts[k]] = w));
      return b;
    };
    const cb = [0, 1, 2].map((k) => (faceBary[0][k] + faceBary[1][k] + faceBary[2][k]) / 3);
    const bary = toTetra(cb);
    const piece = pieceOfBary(bary);
    const center = fromBary(bary);
    let pts = faceBary.map((fb) => fromBary(toTetra(fb)));
    // counter-clockwise seen from outside
    const n = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0]));
    let mapPts = faceBary.map((fb) => {
      const x = fb.reduce((s, w, k) => s + w * face.map[k][0], 0);
      const y = fb.reduce((s, w, k) => s + w * face.map[k][1], 0);
      return [x, y] as [number, number];
    });
    if (n.dot(faceNormal) < 0) { pts = pts.reverse(); mapPts = mapPts.reverse(); }
    const onPiece = pts.map((p) => shrinkToPiece(p, piece));
    const sc = onPiece.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(3);
    // inset each sticker so there's an even black border around it
    const outline = onPiece.map((p) => p.clone().sub(sc).multiplyScalar(0.84).add(sc).addScaledVector(faceNormal, 0.006));
    const mc = mapPts.reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]);
    stickers.push({
      index: stickers.length,
      color: face.color,
      piece,
      normal: faceNormal.toArray() as Vec3,
      outline: outline.map((p) => p.toArray() as Vec3),
      net: mapPts.map(([x, y]) => [mc[0] + (x - mc[0]) * 0.84, mc[1] + (y - mc[1]) * 0.84]),
      center,
      bary,
    });
  }
}

const N = stickers.length; // 36
const piecesOf = (piece: number) => stickers.filter((s) => s.piece === piece).map((s) => s.index);

// ---------- moves ----------

const bigLayer = (v: number) => [TIP(v), CENTER(v), ...EDGE_PAIRS.flatMap(([a, b], k) => (a === v || b === v ? [8 + k] : []))];

function permutation(v: number, pieces: number[], angle: number): number[] {
  const perm = Array.from({ length: N }, (_, i) => i);
  const q = new THREE.Quaternion().setFromAxisAngle(AXES[v], angle);
  for (const s of stickers) {
    if (!pieces.includes(s.piece)) continue;
    const p = s.center.clone().applyQuaternion(q);
    let best = -1, bestD = Infinity;
    for (const t of stickers) {
      const d = t.center.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = t.index; }
    }
    perm[best] = s.index;
  }
  return perm;
}

const MOVE_RE = /^([ULRBulrb])('?)$/;
const turnCache = new Map<string, Turn>();

function parseMove(move: string): Turn | null {
  const m = MOVE_RE.exec(move.replace(/’/g, "'"));
  if (!m) return null;
  const key = m[1] + m[2];
  let t = turnCache.get(key);
  if (!t) {
    const v = VERTEX_NAMES.indexOf(m[1].toUpperCase());
    const pieces = m[1] === m[1].toUpperCase() ? bigLayer(v) : [TIP(v)];
    // clockwise as seen from outside, looking at the vertex
    const angle = ((m[2] ? 1 : -1) * 2 * Math.PI) / 3;
    t = { axis: AXES[v].toArray() as Vec3, pieces, angle, perm: permutation(v, pieces, angle) };
    turnCache.set(key, t);
  }
  return t;
}

const apply = (s: State, move: string) => parseMove(move)!.perm.map((src) => s[src]);
const applyAll = (s: State, moves: string[]) => moves.reduce(apply, s);
const invertMove = (m: string) => (m.endsWith("'") ? m.slice(0, -1) : m + "'");

function parseAlg(text: string) {
  const moves: string[] = [];
  const invalid: string[] = [];
  for (const tok of text.replace(/[()[\],]/g, ' ').split(/\s+/).filter(Boolean)) {
    const parts = tok.match(/[ULRBulrb](?:2'|2|'|’)?/g);
    if (!parts || parts.join('') !== tok) { invalid.push(tok); continue; }
    for (const p of parts) {
      const base = p[0];
      const suffix = p.slice(1).replace('’', "'");
      // a double turn on a 3-fold axis is the inverse turn
      if (suffix.startsWith('2')) moves.push(suffix === '2' ? base + "'" : base);
      else moves.push(base + suffix);
    }
  }
  return { moves, invalid };
}

const solved = () => stickers.map((s) => s.color);
const FIRST_OF_FACE = [0, 1, 2, 3].map((c) => stickers.find((x) => x.color === c)!.index);
const isSolved = (s: State) => stickers.every((st, i) => s[i] !== UNSET && s[i] === s[FIRST_OF_FACE[st.color]]);

// ---------- solver ----------

const CORE_MOVES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"];
const coreStickers = stickers.filter((s) => s.piece >= 4).map((s) => s.index);
const coreKey = (s: State) => coreStickers.map((i) => s[i]).join('');
let table: Map<string, { dist: number; move: number }> | null = null;
const TABLE_DEPTH = 6, SEARCH_DEPTH = 5; // 6 + 5 ≥ 11, the Pyraminx's God's number (without tips)

function buildTable() {
  if (table) return table;
  table = new Map();
  let frontier: State[] = [solved()];
  table.set(coreKey(frontier[0]), { dist: 0, move: -1 });
  for (let d = 1; d <= TABLE_DEPTH; d++) {
    const next: State[] = [];
    for (const s of frontier)
      CORE_MOVES.forEach((m, mi) => {
        const t = apply(s, m);
        const k = coreKey(t);
        if (!table!.has(k)) { table!.set(k, { dist: d, move: mi ^ 1 }); next.push(t); }
      });
    frontier = next;
  }
  return table;
}

/** Tip moves needed so each tip matches its axial center. Tips never affect anything else. */
function tipMoves(s: State): string[] {
  const out: string[] = [];
  for (let v = 0; v < 4; v++) {
    const tip = piecesOf(TIP(v));
    const matches = (st: State) =>
      tip.every((i) => {
        const center = stickers.find((x) => x.piece === CENTER(v) && x.color === stickers[i].color)!;
        return st[i] === st[center.index];
      });
    const name = VERTEX_NAMES[v].toLowerCase();
    if (matches(s)) continue;
    if (matches(apply(s, name))) out.push(name);
    else out.push(name + "'");
  }
  return out;
}

/** Shortest solution, or null if the state is unreachable. */
function solveOptimal(s: State): string[] | null {
  const T = buildTable();
  const tips = tipMoves(s);
  const start = applyAll(s, tips);
  let best: string[] | null = null;
  const path: string[] = [];
  const visit = (st: State, depth: number, lastAxis: number) => {
    const hit = T.get(coreKey(st));
    if (hit && (!best || depth + hit.dist < best.length)) {
      const rest: string[] = [];
      let cur = st, e = hit;
      while (e.dist > 0) {
        const m = CORE_MOVES[e.move];
        rest.push(m);
        cur = apply(cur, m);
        e = T.get(coreKey(cur))!;
      }
      best = [...path, ...rest];
    }
    if (depth === SEARCH_DEPTH || (best && depth + 1 >= best.length)) return;
    CORE_MOVES.forEach((m, mi) => {
      if (mi >> 1 === lastAxis) return;
      path.push(m);
      visit(apply(st, m), depth + 1, mi >> 1);
      path.pop();
    });
  };
  visit(start, 0, -1);
  return best ? [...tips, ...(best as string[])] : null;
}

function scramble(): string[] {
  // a random walk long enough to reach any core state, then random tips
  let s = solved();
  const moves: string[] = [];
  let last = -1;
  while (moves.length < 12) {
    const mi = Math.floor(Math.random() * 8);
    if (mi >> 1 === last) continue;
    last = mi >> 1;
    moves.push(CORE_MOVES[mi]);
    s = apply(s, CORE_MOVES[mi]);
  }
  // re-derive a clean scramble from a random state: the inverse of its optimal solution
  const sol = solveOptimal(s) ?? moves;
  const out = sol.slice().reverse().map(invertMove).filter((m) => m === m.toUpperCase());
  for (const t of 'ulrb') {
    const r = Math.floor(Math.random() * 3);
    if (r) out.push(r === 1 ? t : t + "'");
  }
  return out.length ? out : ['U', 'r'];
}

// ---------- validation ----------

let lastReach: { key: string; ok: boolean } | null = null;
function reachable(s: State) {
  const key = s.join('');
  if (lastReach?.key !== key) lastReach = { key, ok: solveOptimal(s) !== null };
  return lastReach.ok;
}

const names = (cols: number[]) => cols.map((c) => COLOR_NAMES[c]).join('–');
const PLACE = ['top', 'left', 'right', 'back'];

function validate(s: State): Validation {
  const counts = new Array(5).fill(0);
  s.forEach((c) => counts[c]++);
  if (counts[UNSET] > 0) {
    return { ok: false, kind: 'incomplete', message: `${counts[UNSET]} sticker${counts[UNSET] === 1 ? '' : 's'} left to paint`, stickers: s.flatMap((c, i) => (c === UNSET ? [i] : [])) };
  }
  for (let c = 0; c < 4; c++) {
    if (counts[c] !== 9) {
      return { ok: false, kind: 'invalid', message: `${COLOR_NAMES[c]} appears ${counts[c]}× — every color needs exactly 9 stickers`, stickers: s.flatMap((x, i) => (x === c ? [i] : [])) };
    }
  }
  const cyclic = (home: number[], cur: number[]) => [0, 1, 2].some((r) => home.every((h, k) => cur[(k + r) % 3] === h));
  for (let v = 0; v < 4; v++) {
    for (const [piece, label] of [[CENTER(v), 'center'], [TIP(v), 'tip']] as const) {
      const idx = piecesOf(piece);
      const home = idx.map((i) => stickers[i].color);
      if (!cyclic(home, idx.map((i) => s[i]))) {
        return {
          ok: false, kind: 'invalid', stickers: idx,
          message: `The ${PLACE[v]} ${label} shows ${names(idx.map((i) => s[i]))} — it should be ${names(home)} in some rotation. Hold the puzzle yellow-down, green-front.`,
        };
      }
    }
  }
  const slotPieces: number[] = [];
  for (let e = 0; e < 6; e++) {
    const idx = piecesOf(8 + e);
    const cur = idx.map((i) => s[i]);
    if (cur[0] === cur[1]) return { ok: false, kind: 'invalid', message: `An edge is ${COLOR_NAMES[cur[0]]} on both sides — that piece doesn't exist`, stickers: idx };
    const piece = [0, 1, 2, 3, 4, 5].find((p) => {
      const home = piecesOf(8 + p).map((i) => stickers[i].color);
      return (home[0] === cur[0] && home[1] === cur[1]) || (home[0] === cur[1] && home[1] === cur[0]);
    })!;
    if (slotPieces.includes(piece)) {
      const other = piecesOf(8 + slotPieces.indexOf(piece));
      return { ok: false, kind: 'invalid', message: `Two edges are both ${names(cur)}`, stickers: [...idx, ...other] };
    }
    slotPieces.push(piece);
  }
  if (!reachable(s)) {
    let parity = 0;
    const seen = new Array(6).fill(false);
    for (let i = 0; i < 6; i++) {
      if (seen[i]) continue;
      let len = 0;
      for (let j = i; !seen[j]; j = slotPieces[j]) { seen[j] = true; len++; }
      parity += len - 1;
    }
    const edgeStickers = [8, 9, 10, 11, 12, 13].flatMap(piecesOf);
    return {
      ok: false, kind: 'invalid', stickers: edgeStickers,
      message: parity % 2
        ? 'Two edges are swapped — this state is unreachable. Check your edge stickers.'
        : 'An edge is flipped in place — this state is unreachable. Check your edge stickers.',
    };
  }
  return { ok: true };
}

// ---------- puzzle ----------

let solveTimer = 0;

export const pyraminx: Puzzle = {
  id: 'pyra',
  name: 'Pyraminx',
  colors: COLORS,
  colorNames: COLOR_NAMES,
  unset: UNSET,
  paletteOrder: [0, 1, 2, 3, UNSET],
  stickers,
  pieceCount: 15,
  buildPiece: (piece) => new ConvexGeometry(pieceCorners(piece).map((p) => shrinkToPiece(p, piece))),
  stickerCornerRadius: 0.1,
  cameraHome: [8.1, 3.4, 6.6],
  cameraTarget: [0, 0.5, 0],
  netSize: [S2 * 2, H2 * 2],

  solved,
  isSolved,
  parseMove,
  parseAlg,
  invertMove,
  scramble,
  validate,
  dragOptions: (i) => {
    const st = stickers[i];
    const opt = (v: number, tip: boolean): DragOption => ({
      axis: AXES[v].toArray() as Vec3,
      pieces: tip ? [TIP(v)] : bigLayer(v),
      step: (2 * Math.PI) / 3,
      toMove: (steps) => {
        const r = ((steps % 3) + 3) % 3;
        if (r === 0) return '';
        const name = tip ? VERTEX_NAMES[v].toLowerCase() : VERTEX_NAMES[v];
        return r === 1 ? name + "'" : name;
      },
    });
    if (st.piece < 4) return [opt(st.piece, true)];
    if (st.piece < 8) return [opt(st.piece - 4, false)];
    const [a, b] = EDGE_PAIRS[st.piece - 8];
    return [opt(a, false), opt(b, false)];
  },

  movePad: [
    ['U', 'L', 'R', 'B'].map((move) => ({ move })),
    ["U'", "L'", "R'", "B'"].map((move) => ({ move })),
  ],
  movePadExtra: [
    ['u', 'l', 'r', 'b'].map((move) => ({ move })),
    ["u'", "l'", "r'", "b'"].map((move) => ({ move })),
  ],
  movePadExtraLabel: 'Tips',
  keyToMove: (code, shift, alt) => {
    const m = /^Key([ULRB])$/.exec(code);
    if (!m) return null;
    return (alt ? m[1].toLowerCase() : m[1]) + (shift ? "'" : '');
  },
  shortcutsHtml: `
    <div><kbd>U</kbd><kbd>L</kbd><kbd>R</kbd><kbd>B</kbd></div><span>Turn a corner layer clockwise</span>
    <div><kbd>⌥</kbd> + key</div><span>Turn just the tip</span>
    <div><kbd>⇧</kbd> + key</div><span>Counter-clockwise (prime)</span>`,
  paintIntroHtml: 'Pick a color, then tap stickers on the puzzle or the map below. Hold it with <b>yellow</b> on the bottom and <b>green</b> facing you.',
  algPlaceholder: "Type an algorithm… R U' L r",

  encode: (s) => s.map((c) => (c === UNSET ? '?' : COLOR_LETTERS[c])).join(''),
  decode: (text) => {
    if (text.length !== N) return null;
    const out: State = [];
    for (const ch of text.toUpperCase()) {
      if (ch === '?') out.push(UNSET);
      else if (COLOR_LETTERS.includes(ch)) out.push(COLOR_LETTERS.indexOf(ch));
      else return null;
    }
    return out;
  },

  solve: (state, _budget, h) => {
    clearTimeout(solveTimer);
    solveTimer = window.setTimeout(() => {
      const t0 = performance.now();
      const moves = solveOptimal(state);
      const elapsed = performance.now() - t0;
      if (!moves || !isSolved(applyAll(state, moves))) return h.onError('Could not solve this state');
      h.onSolution(moves, elapsed);
      h.onDone(true, elapsed);
    }, 30);
  },
  cancelSolve: () => clearTimeout(solveTimer),
};

// exported for tests
export const pyraminxInternals = { apply, applyAll, solveOptimal, stickers };
