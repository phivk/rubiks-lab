import { State, UNSET } from './model';

// Facelet indices of each corner / edge slot, in Kociemba order.
const CORNERS = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
const EDGES = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
// Faces of each corner / edge piece in solved position (U R F D L B = 0..5).
const CORNER_FACES = [
  [0, 1, 2], [0, 2, 4], [0, 4, 5], [0, 5, 1], [3, 2, 1], [3, 4, 2], [3, 5, 4], [3, 1, 5],
];
const EDGE_FACES = [
  [0, 1], [0, 2], [0, 4], [0, 5], [3, 1], [3, 2], [3, 4], [3, 5], [2, 1], [2, 4], [5, 4], [5, 1],
];

export const COLOR_NAMES = ['White', 'Red', 'Green', 'Yellow', 'Orange', 'Blue'];
/** sticker colors, plus the "unset" color used while painting */
export const COLORS = ['#f4f4ef', '#e02a3c', '#14a85a', '#ffd21f', '#ff7b1c', '#2166e6', '#2c313c'];

export type Validation =
  | { ok: true }
  | { ok: false; kind: 'incomplete' | 'invalid'; message: string; stickers?: number[] };

export function parity(perm: number[]): number {
  let p = 0;
  const seen = new Array(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) { seen[j] = true; len++; }
    p += len - 1;
  }
  return p % 2;
}

const names = (cols: number[]) => cols.map((c) => COLOR_NAMES[c]).join('–');

export function validate(state: State): Validation {
  const counts = new Array(7).fill(0);
  state.forEach((c) => counts[c]++);
  if (counts[UNSET] > 0) {
    return {
      ok: false,
      kind: 'incomplete',
      message: `${counts[UNSET]} sticker${counts[UNSET] === 1 ? '' : 's'} left to paint`,
      stickers: state.flatMap((c, i) => (c === UNSET ? [i] : [])),
    };
  }
  for (let c = 0; c < 6; c++) {
    if (counts[c] !== 9) {
      return {
        ok: false,
        kind: 'invalid',
        message: `${COLOR_NAMES[c]} appears ${counts[c]}× — every color needs exactly 9 stickers`,
        stickers: state.flatMap((x, i) => (x === c ? [i] : [])),
      };
    }
  }
  // Colors → faces via the (fixed) centers, so any whole-cube orientation works.
  const faceOfColor: number[] = [];
  for (let f = 0; f < 6; f++) faceOfColor[state[f * 9 + 4]] = f;
  if (new Set(faceOfColor).size !== 6 || faceOfColor.length !== 6) {
    return { ok: false, kind: 'invalid', message: 'Each center must be a different color', stickers: [4, 13, 22, 31, 40, 49] };
  }
  // Opposite centers must stay opposite (i.e. centers form a real rotation of the cube).
  const opposite = (f: number) => (f + 3) % 6;
  for (let f = 0; f < 3; f++) {
    if (state[opposite(f) * 9 + 4] !== ((state[f * 9 + 4] + 3) % 6)) {
      return { ok: false, kind: 'invalid', message: 'Centers are not arranged like a real cube', stickers: [4, 13, 22, 31, 40, 49] };
    }
  }
  const s = state.map((c) => faceOfColor[c]);

  const cp: number[] = [];
  let twist = 0;
  for (let i = 0; i < 8; i++) {
    const f = CORNERS[i].map((k) => s[k]);
    const ori = f.findIndex((x) => x === 0 || x === 3);
    const c1 = f[(ori + 1) % 3];
    const c2 = f[(ori + 2) % 3];
    const piece = ori < 0 ? -1 : CORNER_FACES.findIndex((cf) => cf[1] === c1 && cf[2] === c2 && cf[0] === f[ori]);
    if (piece < 0) {
      return { ok: false, kind: 'invalid', message: `Corner ${names(CORNERS[i].map((k) => state[k]))} can't exist on a real cube`, stickers: CORNERS[i] };
    }
    if (cp.includes(piece)) {
      const other = cp.indexOf(piece);
      return { ok: false, kind: 'invalid', message: `Two corners are both ${names(CORNER_FACES[piece].map((x) => state[x * 9 + 4]))}`, stickers: [...CORNERS[i], ...CORNERS[other]] };
    }
    cp.push(piece);
    twist += ori;
  }
  const ep: number[] = [];
  let flip = 0;
  for (let i = 0; i < 12; i++) {
    const [a, b] = EDGES[i].map((k) => s[k]);
    let piece = EDGE_FACES.findIndex(([x, y]) => x === a && y === b);
    let ori = 0;
    if (piece < 0) {
      piece = EDGE_FACES.findIndex(([x, y]) => x === b && y === a);
      ori = 1;
    }
    if (piece < 0) {
      return { ok: false, kind: 'invalid', message: `Edge ${names(EDGES[i].map((k) => state[k]))} can't exist on a real cube`, stickers: EDGES[i] };
    }
    if (ep.includes(piece)) {
      const other = ep.indexOf(piece);
      return { ok: false, kind: 'invalid', message: `Two edges are both ${names(EDGE_FACES[piece].map((x) => state[x * 9 + 4]))}`, stickers: [...EDGES[i], ...EDGES[other]] };
    }
    ep.push(piece);
    flip += ori;
  }
  if (twist % 3 !== 0) {
    return { ok: false, kind: 'invalid', message: 'A corner is twisted in place — this state is unreachable. Check your corner stickers.', stickers: CORNERS.flat() };
  }
  if (flip % 2 !== 0) {
    return { ok: false, kind: 'invalid', message: 'An edge is flipped in place — this state is unreachable. Check your edge stickers.', stickers: EDGES.flat() };
  }
  if (parity(cp) !== parity(ep)) {
    return { ok: false, kind: 'invalid', message: 'Two pieces are swapped (parity) — this state is unreachable. Check for a swapped pair.', stickers: [...CORNERS.flat(), ...EDGES.flat()] };
  }
  return { ok: true };
}
