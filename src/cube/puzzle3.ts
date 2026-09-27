import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  FACELETS, UNSET, Vec3, fromFaceletString, invertMove, isSolved, parseAlg, parseMove,
  randomScramble, solvedState, toFaceletString, turnPermutation, turnToMove,
} from './model3';
import { validate } from './validate3';
import { COLORS, COLOR_NAMES } from '../core/colors';
import { SolverClient } from '../core/worker';
import type { DragOption, Puzzle, StickerDef, Turn } from '../core/types';

const cubieIndex = (p: Vec3) => (p[0] + 1) * 9 + (p[1] + 1) * 3 + (p[2] + 1);
const cubiePos = (i: number): Vec3 => [Math.floor(i / 9) - 1, (Math.floor(i / 3) % 3) - 1, (i % 3) - 1];
const unit = (axis: number): Vec3 => [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];
const layerPieces = (axis: number, layers: number[]) =>
  Array.from({ length: 27 }, (_, i) => i).filter((i) => layers.includes(cubiePos(i)[axis]));

// Map layout: U on top, then L F R B, then D (row, col of each face's top-left cell).
const NET_ORIGIN: Record<number, [number, number]> = { 0: [0, 3], 4: [3, 0], 2: [3, 3], 1: [3, 6], 5: [3, 9], 3: [6, 3] };

const stickers: StickerDef[] = FACELETS.map((f) => {
  const a = f.normal.findIndex((x) => x !== 0);
  const sign = f.normal[a];
  let u = unit((a + 1) % 3), v = unit((a + 2) % 3);
  if (sign < 0) [u, v] = [v, u];
  const h = 0.42;
  const c = f.pos.map((x, k) => x + f.normal[k] * 0.487) as Vec3;
  const corner = (su: number, sv: number) => c.map((x, k) => x + su * h * u[k] + sv * h * v[k]) as Vec3;
  const [r0, c0] = NET_ORIGIN[f.face];
  const i = f.index % 9;
  const x = c0 + (i % 3) + 0.06, y = r0 + Math.floor(i / 3) + 0.06, s = 0.88;
  return {
    index: f.index,
    color: f.face,
    piece: cubieIndex(f.pos),
    normal: f.normal,
    outline: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
    net: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]],
    netLabel: i === 4 ? 'URFDLB'[f.face] : undefined,
  };
});

function toTurn(move: string): Turn | null {
  const t = parseMove(move);
  if (!t) return null;
  return { axis: unit(t.axis), pieces: layerPieces(t.axis, t.layers), angle: (t.quarters * Math.PI) / 2, perm: turnPermutation(t) };
}

const solver = new SolverClient(() => new Worker(new URL('./workers/3x3.worker.ts', import.meta.url), { type: 'module' }));

const btn = (move: string): { move: string; color?: string } => {
  const face = 'URFDLB'.indexOf(move[0]);
  return { move, color: face >= 0 ? COLORS[face] : undefined };
};

export const cube: Puzzle = {
  id: '3x3',
  name: '3×3',
  colors: COLORS,
  colorNames: [...COLOR_NAMES, 'Eraser'],
  unset: UNSET,
  paletteOrder: [0, 2, 1, 5, 4, 3, UNSET],
  stickers,
  pieceCount: 27,
  buildPiece: (i) => new RoundedBoxGeometry(0.97, 0.97, 0.97, 4, 0.1).translate(...cubiePos(i)),
  stickerCornerRadius: 0.13,
  cameraHome: [6.3, 5.3, 8.6],
  cameraTarget: [0, 0, 0],
  netSize: [12, 9],

  solved: solvedState,
  isSolved,
  parseMove: toTurn,
  parseAlg,
  invertMove,
  scramble: () => randomScramble(),
  validate,
  dragOptions: (i) => {
    const f = FACELETS[i];
    const nAxis = f.normal.findIndex((x) => x !== 0);
    const opts: DragOption[] = [];
    for (const axis of [0, 1, 2]) {
      if (axis === nAxis) continue;
      const layer = f.pos[axis];
      opts.push({ axis: unit(axis), pieces: layerPieces(axis, [layer]), step: Math.PI / 2, toMove: (q) => turnToMove(axis, layer, q) });
    }
    return opts;
  },
  lockedSticker: (i) => (i % 9 === 4 ? 'Centers are fixed — they define which face is which' : null),

  movePad: ['', "'", '2'].map((suf) => ['U', 'D', 'R', 'L', 'F', 'B'].map((f) => btn(f + suf))),
  movePadExtra: ['', "'", '2'].map((suf) => ['M', 'E', 'S', 'x', 'y', 'z'].map((f) => btn(f + suf))),
  movePadExtraLabel: 'Slices & rotations',
  keyToMove: (code, shift) => {
    const m = /^Key([A-Z])$/.exec(code);
    if (!m) return null;
    const k = m[1];
    const letter = 'URFDLBMES'.includes(k) ? k : 'XYZ'.includes(k) ? k.toLowerCase() : null;
    return letter ? letter + (shift ? "'" : '') : null;
  },
  shortcutsHtml: `
    <div><kbd>U</kbd><kbd>R</kbd><kbd>F</kbd><kbd>D</kbd><kbd>L</kbd><kbd>B</kbd></div><span>Turn a face clockwise</span>
    <div><kbd>M</kbd><kbd>E</kbd><kbd>S</kbd></div><span>Turn a middle slice</span>
    <div><kbd>X</kbd><kbd>Y</kbd><kbd>Z</kbd></div><span>Rotate the whole cube</span>
    <div><kbd>⇧</kbd> + key</div><span>Counter-clockwise (prime)</span>`,
  paintIntroHtml: 'Pick a color, then tap stickers on the cube or the map below. Hold your cube with the <b>white</b> center up and <b>green</b> facing you.',
  algPlaceholder: "Type an algorithm… R U R' U'",

  encode: toFaceletString,
  decode: fromFaceletString,

  solve: (state, budgetMs, h) => void solver.solve(state, budgetMs, h),
  cancelSolve: () => solver.cancel(),
};

