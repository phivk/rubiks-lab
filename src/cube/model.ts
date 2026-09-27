// Facelet model of a 3x3 cube.
//
// A state is an array of 54 color ids in Kociemba order: U1..U9, R1..R9, F1..F9,
// D1..D9, L1..L9, B1..B9. Color ids 0..5 are the colors of the solved faces in that
// same order (U, R, F, D, L, B); UNSET marks a sticker the user hasn't painted yet.
//
// Coordinates: x → R, y → U, z → F. Every move permutation is derived geometrically
// from sticker positions, so slices, wide turns and rotations come for free.

export type State = number[];
export const UNSET = 6;
export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];

export type Vec3 = [number, number, number];

export interface Facelet {
  index: number;
  face: number;
  /** position of the cubie this sticker is on */
  pos: Vec3;
  /** outward normal of the sticker */
  normal: Vec3;
}

const FACE_NORMALS: Vec3[] = [
  [0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1],
];

function faceletPos(face: number, row: number, col: number): Vec3 {
  switch (face) {
    case 0: return [col - 1, 1, row - 1];
    case 1: return [1, 1 - row, 1 - col];
    case 2: return [col - 1, 1 - row, 1];
    case 3: return [col - 1, -1, 1 - row];
    case 4: return [-1, 1 - row, col - 1];
    default: return [1 - col, 1 - row, -1];
  }
}

export const FACELETS: Facelet[] = [];
for (let f = 0; f < 6; f++) {
  for (let i = 0; i < 9; i++) {
    FACELETS.push({
      index: f * 9 + i,
      face: f,
      pos: faceletPos(f, Math.floor(i / 3), i % 3),
      normal: FACE_NORMALS[f],
    });
  }
}

const keyOf = (p: Vec3, n: Vec3) => `${p.join(',')}|${n.join(',')}`;
const FACELET_BY_KEY = new Map(FACELETS.map((f) => [keyOf(f.pos, f.normal), f.index]));

export function faceletAt(pos: Vec3, normal: Vec3): number | undefined {
  return FACELET_BY_KEY.get(keyOf(pos, normal));
}

/** Rotate an integer vector by quarter turns (+ = counter-clockwise, right-hand rule) about an axis. */
export function rotateVec(v: Vec3, axis: number, quarterTurns: number): Vec3 {
  let [x, y, z] = v;
  const q = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < q; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

/** A physical turn: rotate every cubie whose coordinate on `axis` is in `layers`. */
export interface Turn {
  axis: 0 | 1 | 2;
  layers: number[];
  /** quarter turns, right-hand rule about the positive axis */
  quarters: number;
}

// Base moves as (axis, layers, direction of a clockwise turn).
const BASE: Record<string, { axis: 0 | 1 | 2; layers: number[]; dir: number }> = {
  U: { axis: 1, layers: [1], dir: -1 },
  D: { axis: 1, layers: [-1], dir: 1 },
  R: { axis: 0, layers: [1], dir: -1 },
  L: { axis: 0, layers: [-1], dir: 1 },
  F: { axis: 2, layers: [1], dir: -1 },
  B: { axis: 2, layers: [-1], dir: 1 },
  M: { axis: 0, layers: [0], dir: 1 },
  E: { axis: 1, layers: [0], dir: 1 },
  S: { axis: 2, layers: [0], dir: -1 },
  u: { axis: 1, layers: [1, 0], dir: -1 },
  d: { axis: 1, layers: [-1, 0], dir: 1 },
  r: { axis: 0, layers: [1, 0], dir: -1 },
  l: { axis: 0, layers: [-1, 0], dir: 1 },
  f: { axis: 2, layers: [1, 0], dir: -1 },
  b: { axis: 2, layers: [-1, 0], dir: 1 },
  x: { axis: 0, layers: [-1, 0, 1], dir: -1 },
  y: { axis: 1, layers: [-1, 0, 1], dir: -1 },
  z: { axis: 2, layers: [-1, 0, 1], dir: -1 },
};

export const MOVE_RE = /^([URFDLBMESxyzurfdlb])(w?)(2|'|2'|)$/;

export function parseMove(token: string): Turn | null {
  const t = token.replace(/’/g, "'");
  const m = MOVE_RE.exec(t);
  if (!m) return null;
  let letter = m[1];
  if (m[2] === 'w') {
    if (!'URFDLB'.includes(letter)) return null;
    letter = letter.toLowerCase();
  }
  const base = BASE[letter];
  const amount = m[3] === "'" ? -1 : m[3].startsWith('2') ? 2 : 1;
  return { axis: base.axis, layers: base.layers, quarters: base.dir * amount };
}

export function parseAlg(alg: string): { moves: string[]; invalid: string[] } {
  const moves: string[] = [];
  const invalid: string[] = [];
  for (const tok of alg.replace(/[()[\],]/g, ' ').split(/\s+/).filter(Boolean)) {
    // allow compact input like "RUR'U'"
    const parts = tok.match(/[URFDLBMESxyzurfdlb]w?(?:2'|2|'|’)?/g);
    if (!parts || parts.join('') !== tok) {
      invalid.push(tok);
      continue;
    }
    for (const p of parts) moves.push(p.replace(/’/g, "'").replace("2'", '2'));
  }
  return { moves, invalid };
}

export function invertMove(move: string): string {
  if (move.endsWith('2')) return move;
  if (move.endsWith("'")) return move.slice(0, -1);
  return move + "'";
}

export function invertAlg(moves: string[]): string[] {
  return moves.slice().reverse().map(invertMove);
}

const permCache = new Map<string, number[]>();

/** perm[dest] = src: the sticker at `src` ends up at `dest`. */
export function turnPermutation(turn: Turn): number[] {
  const key = `${turn.axis}:${turn.layers.join(',')}:${((turn.quarters % 4) + 4) % 4}`;
  let perm = permCache.get(key);
  if (perm) return perm;
  perm = FACELETS.map((f) => f.index);
  for (const f of FACELETS) {
    if (!turn.layers.includes(f.pos[turn.axis])) continue;
    const dest = faceletAt(rotateVec(f.pos, turn.axis, turn.quarters), rotateVec(f.normal, turn.axis, turn.quarters))!;
    perm[dest] = f.index;
  }
  permCache.set(key, perm);
  return perm;
}

export function applyTurn(state: State, turn: Turn): State {
  const perm = turnPermutation(turn);
  return perm.map((src) => state[src]);
}

export function applyMove(state: State, move: string): State {
  const turn = parseMove(move);
  if (!turn) throw new Error(`Invalid move: ${move}`);
  return applyTurn(state, turn);
}

export function applyMoves(state: State, moves: string[]): State {
  return moves.reduce(applyMove, state);
}

export function solvedState(): State {
  return FACELETS.map((f) => f.face);
}

export function isSolved(state: State): boolean {
  for (let f = 0; f < 6; f++) {
    const c = state[f * 9];
    if (c === UNSET) return false;
    for (let i = 1; i < 9; i++) if (state[f * 9 + i] !== c) return false;
  }
  return true;
}

/** Map a physical turn back to standard notation (used for drag gestures). */
export function turnToMove(axis: number, layer: number, quarters: number): string {
  const q = ((quarters % 4) + 4) % 4;
  if (q === 0) return '';
  const names = [
    { '-1': 'L', '0': 'M', '1': 'R' },
    { '-1': 'D', '0': 'E', '1': 'U' },
    { '-1': 'B', '0': 'S', '1': 'F' },
  ][axis] as Record<string, string>;
  const letter = names[String(layer)];
  const dir = BASE[letter].dir;
  if (q === 2) return letter + '2';
  // q=1 means +90°; clockwise move has direction `dir`
  const cw = (q === 1 ? 1 : -1) === dir;
  return cw ? letter : letter + "'";
}

export function toFaceletString(state: State): string {
  return state.map((c) => (c === UNSET ? '?' : FACES[c])).join('');
}

export function fromFaceletString(s: string): State | null {
  if (s.length !== 54) return null;
  const out: State = [];
  for (const ch of s) {
    const i = FACES.indexOf(ch.toUpperCase() as Face);
    if (ch === '?' || ch === '-') out.push(UNSET);
    else if (i < 0) return null;
    else out.push(i);
  }
  return out;
}

/** Merge consecutive moves on the same layer (R R → R2, R R' → nothing). */
export function simplify(moves: string[]): string[] {
  const out: string[] = [];
  const amount = (m: string) => (m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1);
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last[0] === m[0] && last.includes('w') === m.includes('w')) {
      const base = m.replace(/2|'/g, '');
      const q = (amount(last) + amount(m)) % 4;
      out.pop();
      if (q === 1) out.push(base);
      else if (q === 2) out.push(base + '2');
      else if (q === 3) out.push(base + "'");
    } else out.push(m);
  }
  return out;
}

/** Random face-turn scramble without redundant sequences like R R or R L R. */
export function randomScramble(n = 22): string[] {
  const out: string[] = [];
  let last = -1, prev = -1;
  while (out.length < n) {
    const f = Math.floor(Math.random() * 6);
    if (f === last) continue;
    if (f % 3 === last % 3 && f % 3 === prev % 3) continue;
    prev = last;
    last = f;
    out.push('URFDLB'[f] + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return out;
}
