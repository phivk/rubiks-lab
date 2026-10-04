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
import { pickColors } from '../core/colors';
import type { State, StickerDef, Turn, Vec3 } from '../core/types';

/** green, blue, red and yellow, by the cubes' color ids */
export const CUBE_COLOR_IDS = [2, 5, 1, 3];
export const COLORS = pickColors(CUBE_COLOR_IDS, '#2c313c');
export const COLOR_NAMES = ['Green', 'Blue', 'Red', 'Yellow', 'Eraser'];
export const UNSET = 4;
export const COLOR_LETTERS = 'GBRY';
export const VERTEX_NAMES = ['U', 'L', 'R', 'B'];

// ---------- geometry ----------

const SIZE = 2.6; // circumradius
const rr = (2 * Math.SQRT2) / 3;
const VERTICES: THREE.Vector3[] = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3((-rr * Math.sqrt(3)) / 2, -1 / 3, rr / 2),
  new THREE.Vector3((rr * Math.sqrt(3)) / 2, -1 / 3, rr / 2),
  new THREE.Vector3(0, -1 / 3, -rr),
].map((v) => v.multiplyScalar(SIZE));
export const AXES = VERTICES.map((v) => v.clone().normalize());

const fromBary = (b: number[]) => {
  const p = new THREE.Vector3();
  b.forEach((w, i) => p.addScaledVector(VERTICES[i], w));
  return p;
};

// Faces: color, the vertices it touches, and where those vertices sit on the 2D map.
export const S2 = 6, H2 = (S2 * Math.sqrt(3)) / 2;
const FACES: { color: number; verts: number[]; map: [number, number][] }[] = [
  { color: 0, verts: [0, 1, 2], map: [[S2, 0], [S2 / 2, H2], [S2 * 1.5, H2]] }, // front: U L R
  { color: 1, verts: [0, 2, 3], map: [[S2, 0], [S2 * 1.5, H2], [S2 * 2, 0]] }, // right: U R B
  { color: 2, verts: [0, 3, 1], map: [[S2, 0], [0, 0], [S2 / 2, H2]] }, // left: U B L
  { color: 3, verts: [1, 2, 3], map: [[S2 / 2, H2], [S2 * 1.5, H2], [S2, 2 * H2]] }, // down: L R B
];

// piece ids
export const TIP = (i: number) => i;
export const CENTER = (i: number) => 4 + i;
export const EDGE_PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
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
export function pieceCorners(piece: number): THREE.Vector3[] {
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
export const shrinkToPiece = (p: THREE.Vector3, piece: number) =>
  p.clone().sub(pieceCentroids[piece]).multiplyScalar(PIECE_SHRINK).add(pieceCentroids[piece]);

interface PyraSticker extends StickerDef {
  center: THREE.Vector3;
  bary: number[];
}

export const stickers: PyraSticker[] = [];
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

export const N = stickers.length; // 36
export const piecesOf = (piece: number) => stickers.filter((s) => s.piece === piece).map((s) => s.index);

// ---------- moves ----------

export const bigLayer = (v: number) => [TIP(v), CENTER(v), ...EDGE_PAIRS.flatMap(([a, b], k) => (a === v || b === v ? [8 + k] : []))];

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

export function parseMove(move: string): Turn | null {
  const m = MOVE_RE.exec(move.replace(/’/g, "'"));
  if (!m) return null;
  const key = m[1] + m[2];
  let t = turnCache.get(key);
  if (!t) {
    const v = VERTEX_NAMES.indexOf(m[1].toUpperCase());
    const pieces = m[1] === m[1].toUpperCase() ? bigLayer(v) : [TIP(v)];
    // clockwise as seen from outside, looking at the vertex
    const angle = ((m[2] ? 1 : -1) * 2 * Math.PI) / 3;
    t = { axis: AXES[v].toArray() as Vec3, pieces, angle, step: (2 * Math.PI) / 3, perm: permutation(v, pieces, angle) };
    turnCache.set(key, t);
  }
  return t;
}

/** The 12 ways to turn the whole puzzle, as sticker permutations, starting with not at all. */
export const rotations: number[][] = [Array.from({ length: N }, (_, i) => i)];
const allPieces = Array.from({ length: 15 }, (_, i) => i);
const turnWhole = [0, 1].map((v) => permutation(v, allPieces, (2 * Math.PI) / 3));
for (let k = 0; k < rotations.length; k++) {
  for (const t of turnWhole) {
    const next = t.map((i) => rotations[k][i]);
    if (!rotations.some((r) => r.every((x, i) => x === next[i]))) rotations.push(next);
  }
}

export const apply = (s: State, move: string) => parseMove(move)!.perm.map((src) => s[src]);
export const applyAll = (s: State, moves: string[]) => moves.reduce(apply, s);
export const invertMove = (m: string) => (m.endsWith("'") ? m.slice(0, -1) : m + "'");

export function parseAlg(text: string) {
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

export const solved = () => stickers.map((s) => s.color);
const FIRST_OF_FACE = [0, 1, 2, 3].map((c) => stickers.find((x) => x.color === c)!.index);
export const isSolved = (s: State) => stickers.every((st, i) => s[i] !== UNSET && s[i] === s[FIRST_OF_FACE[st.color]]);
