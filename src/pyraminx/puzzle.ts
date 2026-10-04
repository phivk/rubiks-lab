import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { parity } from '../core/perm';
import { syncSolver } from '../core/syncSolver';
import type { DragOption, Puzzle, State, Validation, Vec3 } from '../core/types';
import {
  AXES, CENTER, COLORS, COLOR_LETTERS, COLOR_NAMES, EDGE_PAIRS, H2, N, S2, TIP, UNSET, VERTEX_NAMES,
  applyAll, bigLayer, invertMove, isSolved, parseAlg, parseMove, pieceCorners, piecesOf, shrinkToPiece, solved, stickers,
} from './model';
import { pyraminxGuide } from './lesson';
import { scramble, solveOptimal } from './solver';

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
    const edgeStickers = [8, 9, 10, 11, 12, 13].flatMap(piecesOf);
    return {
      ok: false, kind: 'invalid', stickers: edgeStickers,
      message: parity(slotPieces)
        ? 'Two edges are swapped — this state is unreachable. Check your edge stickers.'
        : 'An edge is flipped in place — this state is unreachable. Check your edge stickers.',
    };
  }
  return { ok: true };
}

export const pyraminx: Puzzle = {
  id: 'pyra',
  name: 'Pyraminx',
  icon: '<path d="M12 3 21 19H3z"/><path d="M12 3 9.5 19M12 3l2.5 16"/>',
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
  notationHtml: "<code>R</code> turns the right corner’s layer a third of a turn clockwise, as you look at that corner, and <code>R'</code> turns it back. <code>U</code> is the top corner, <code>L</code> and <code>R</code> the front-left and front-right, <code>B</code> the back; lowercase <code>r</code> turns just the tip.",
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

  ...syncSolver(solveOptimal, (s, moves) => isSolved(applyAll(s, moves))),
  guides: [pyraminxGuide()],
};
