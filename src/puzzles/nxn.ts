import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { invertMove } from '../cube/model';
import { COLORS, COLOR_NAMES } from '../cube/validate';
import { SolverClient } from '../cube/solverClient';
import { CubeModel, FACES, UNSET, type LayerTurn } from '../nxn/model';
import { Solver2 } from '../nxn/solver2';
import { syncSolver } from './syncSolver';
import type { DragOption, MoveButton, Puzzle, StickerDef, Turn, Vec3 } from './types';

const unit = (axis: number): Vec3 => [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];

// Map layout: U on top, then L F R B, then D (row, col of each face's top-left cell, in faces).
const NET_ORIGIN = [[0, 1], [1, 2], [1, 1], [2, 1], [1, 0], [1, 3]];

const btn = (move: string): MoveButton => {
  const face = FACES.indexOf(move.replace(/^2/, '')[0]);
  return { move, color: face >= 0 ? COLORS[face] : undefined };
};
const rows = (letters: string[]) => ['', "'", '2'].map((suf) => letters.map((f) => btn(f + suf)));

type Shared = Omit<Puzzle, 'id' | 'name' | 'scramble' | 'solve' | 'cancelSolve' | 'keyToMove' | 'shortcutsHtml' | 'algPlaceholder'>;

/** Everything the 2×2 and 4×4 have in common; each adds its name, scramble, solver and keys. */
function makeCube(M: CubeModel): Shared {
  const n = M.n;
  // world units: one cubie per unit, so doubled coordinates halve
  const stickers: StickerDef[] = M.facelets.map((f) => {
    const a = f.normal.findIndex((x) => x !== 0);
    let u = unit((a + 1) % 3), v = unit((a + 2) % 3);
    if (f.normal[a] < 0) [u, v] = [v, u];
    const h = 0.42;
    const c = f.pos.map((x, k) => x / 2 + f.normal[k] * 0.487) as Vec3;
    const corner = (su: number, sv: number) => c.map((x, k) => x + su * h * u[k] + sv * h * v[k]) as Vec3;
    const [r0, c0] = NET_ORIGIN[f.face];
    const i = f.index % (n * n);
    const x = c0 * n + (i % n) + 0.06, y = r0 * n + Math.floor(i / n) + 0.06, s = 0.88;
    return {
      index: f.index,
      color: f.face,
      piece: M.pieceIndex(f.pos),
      normal: f.normal,
      outline: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
      net: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]],
    };
  });

  const pieceCache = new Map<string, number[]>();
  const layerPieces = (axis: number, layers: number[]) => {
    const key = `${axis}:${layers}`;
    let pieces = pieceCache.get(key);
    if (!pieces) {
      pieces = Array.from({ length: n ** 3 }, (_, i) => i).filter((i) => layers.includes(M.piecePos(i)[axis]));
      pieceCache.set(key, pieces);
    }
    return pieces;
  };
  const toTurn = (t: LayerTurn): Turn => ({
    axis: unit(t.axis),
    pieces: layerPieces(t.axis, t.layers),
    angle: (t.quarters * Math.PI) / 2,
    perm: M.permutation(t),
  });
  const zoom = (n + 1) / 4;

  return {
    colors: COLORS,
    colorNames: [...COLOR_NAMES, 'Eraser'],
    unset: UNSET,
    paletteOrder: [0, 2, 1, 5, 4, 3, UNSET],
    stickers,
    pieceCount: n ** 3,
    buildPiece: (i) => {
      const p = M.piecePos(i);
      if (p.every((x) => Math.abs(x) < n - 1)) return null;
      return new RoundedBoxGeometry(0.97, 0.97, 0.97, 4, 0.1).translate(p[0] / 2, p[1] / 2, p[2] / 2);
    },
    stickerCornerRadius: 0.13,
    cameraHome: [6.3 * zoom, 5.3 * zoom, 8.6 * zoom],
    cameraTarget: [0, 0, 0],
    netSize: [4 * n, 3 * n],

    solved: () => M.solved(),
    isSolved: (s) => M.isSolved(s),
    parseMove: (move) => {
      const t = M.parseMove(move);
      return t && toTurn(t);
    },
    parseAlg: (text) => M.parseAlg(text),
    invertMove,
    validate: (s) => M.validate(s),
    dragOptions: (i) => {
      const f = M.facelets[i];
      const nAxis = f.normal.findIndex((x) => x !== 0);
      const opts: DragOption[] = [];
      for (const axis of [0, 1, 2] as const) {
        if (axis === nAxis) continue;
        const layers = [f.pos[axis]];
        opts.push({ axis: unit(axis), pieces: layerPieces(axis, layers), step: Math.PI / 2, toMove: (quarters) => M.moveName({ axis, layers, quarters }) ?? '' });
      }
      return opts;
    },

    movePad: rows(['U', 'D', 'R', 'L', 'F', 'B']),
    paintIntroHtml: `Pick a color, then tap stickers on the cube or the map below. There are no fixed centers, so any way up is fine — the solver works out the orientation from the corners.`,

    encode: (s) => M.encode(s),
    decode: (text) => M.decode(text),
  };
}

const keyToMove = (wide: boolean): Puzzle['keyToMove'] => (code, shift, alt) => {
  const m = /^Key([A-Z])$/.exec(code);
  if (!m) return null;
  const k = m[1];
  const letter = FACES.includes(k) ? (alt && wide ? k + 'w' : k) : 'XYZ'.includes(k) ? k.toLowerCase() : null;
  return letter ? letter + (shift ? "'" : '') : null;
};

const faceShortcuts = `<div><kbd>U</kbd><kbd>R</kbd><kbd>F</kbd><kbd>D</kbd><kbd>L</kbd><kbd>B</kbd></div><span>Turn a face clockwise</span>`;
const rotationShortcuts = `
    <div><kbd>X</kbd><kbd>Y</kbd><kbd>Z</kbd></div><span>Rotate the whole cube</span>
    <div><kbd>⇧</kbd> + key</div><span>Counter-clockwise (prime)</span>`;

// ---------- 2×2 ----------

const model2 = new CubeModel(2);
const solver2 = new Solver2(model2);

export const cube2: Puzzle = {
  ...makeCube(model2),
  id: '2x2',
  name: '2×2',
  scramble: () => solver2.randomState(),
  ...syncSolver(
    (s) => solver2.solve(model2.toFaces(s)),
    (s, moves) => model2.isSolved(model2.applyAll(s, moves)),
  ),
  movePadExtra: rows(['x', 'y', 'z']),
  movePadExtraLabel: 'Rotations',
  keyToMove: keyToMove(false),
  shortcutsHtml: faceShortcuts + rotationShortcuts,
  algPlaceholder: "Type an algorithm… R U R' U'",
};

// ---------- 4×4 ----------

const model4 = new CubeModel(4);
// started on first use, so the 4×4's tables are only built if someone solves one
let solver4: SolverClient | null = null;

/** Random turns of outer and wide layers, never repeating an axis twice in a row. */
function scramble4(length = 40): string[] {
  const out: string[] = [];
  let lastAxis = -1;
  while (out.length < length) {
    const f = Math.floor(Math.random() * 6);
    if (f % 3 === lastAxis) continue;
    lastAxis = f % 3;
    const wide = f < 3 && Math.random() < 0.5;
    out.push(FACES[f] + (wide ? 'w' : '') + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return out;
}

export const cube4: Puzzle = {
  ...makeCube(model4),
  id: '4x4',
  name: '4×4',
  solveHint: 'Reduces to a 3×3, then solves that',
  scramble: () => scramble4(),
  solve: (state, budgetMs, h) => {
    solver4 ??= new SolverClient(() => new Worker(new URL('../nxn/solver4.worker.ts', import.meta.url), { type: 'module' }));
    void solver4.solve(state, budgetMs, h);
  },
  cancelSolve: () => solver4?.cancel(),
  movePadExtra: [...rows(['Uw', 'Dw', 'Rw', 'Lw', 'Fw', 'Bw']).slice(0, 2), ['x', "x'", 'y', "y'", 'z', "z'"].map(btn)],
  movePadExtraLabel: 'Wide turns & rotations',
  keyToMove: keyToMove(true),
  shortcutsHtml: faceShortcuts + `
    <div><kbd>⌥</kbd> + key</div><span>Wide turn (two layers)</span>` + rotationShortcuts,
  algPlaceholder: "Type an algorithm… Rw U2 2R' F",
};
