import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLORS, COLOR_NAMES } from '../core/colors';
import { syncSolver } from '../core/syncSolver';
import type { DragOption, MoveButton, Puzzle, ScanFace, StickerDef, Turn, Vec3 } from '../core/types';
import { SolverClient } from '../core/worker';
import { CubeModel, FACES, UNSET, invertMove, type LayerTurn } from './model';
import { ringMap } from './rings';
import { Solver2 } from './solve2';

const unit = (axis: number): Vec3 => [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];

// Map layout: U on top, then L F R B, then D (row, col of each face's top-left cell, in faces).
const NET_ORIGIN = [[0, 1], [1, 2], [1, 1], [2, 1], [1, 0], [1, 3]];

const btn = (move: string): MoveButton => {
  const face = FACES.indexOf(move.replace(/^\d+/, '')[0]);
  return { move, color: face >= 0 ? COLORS[face] : undefined };
};
const rows = (letters: string[]) => ['', "'", '2'].map((suf) => letters.map((f) => btn(f + suf)));

type Shared = Omit<Puzzle, 'id' | 'name' | 'icon' | 'scramble' | 'solve' | 'cancelSolve' | 'movePadExtra' | 'movePadExtraLabel' | 'algPlaceholder'>;

const CUBE_ICON = '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M12 12 20 7.5M12 12v9M12 12 4 7.5"/>';

/**
 * Everything N×N cubes have in common; each adds its name, scramble, solver and extra
 * moves. An odd cube has fixed centers, which can't be painted and get M, E and S.
 */
function makeCube(M: CubeModel, { wide }: { wide: boolean }): Shared {
  const n = M.n;
  const fixed = new Set(M.fixedCenters);
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
      netLabel: fixed.has(f.index) ? FACES[f.face] : undefined,
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
    step: Math.PI / 2,
    perm: M.permutation(t),
  });
  const zoom = (n + 1) / 4;
  const slices = n % 2 === 1;

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
    rings: ringMap(M),

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
    lockedSticker: slices ? (i) => (fixed.has(i) ? 'Centers are fixed — they define which face is which' : null) : undefined,

    movePad: rows(['U', 'D', 'R', 'L', 'F', 'B']),
    keyToMove: (code, shift, alt) => {
      const m = /^Key([A-Z])$/.exec(code);
      if (!m) return null;
      const k = m[1];
      const letter = FACES.includes(k) ? (alt && wide ? k + 'w' : k) : slices && 'MES'.includes(k) ? k : 'XYZ'.includes(k) ? k.toLowerCase() : null;
      return letter ? letter + (shift ? "'" : '') : null;
    },
    shortcutsHtml: `
    <div><kbd>U</kbd><kbd>R</kbd><kbd>F</kbd><kbd>D</kbd><kbd>L</kbd><kbd>B</kbd></div><span>Turn a face clockwise</span>` +
      (wide ? `
    <div><kbd>⌥</kbd> + key</div><span>Wide turn (two layers)</span>` : '') +
      (slices ? `
    <div><kbd>M</kbd><kbd>E</kbd><kbd>S</kbd></div><span>Turn a middle slice</span>` : '') + `
    <div><kbd>X</kbd><kbd>Y</kbd><kbd>Z</kbd></div><span>Rotate the whole cube</span>
    <div><kbd>⇧</kbd> + key</div><span>Counter-clockwise (prime)</span>`,
    paintIntroHtml: slices
      ? 'Pick a color, then tap stickers on the cube or the map below. Hold your cube with the <b>white</b> center up and <b>green</b> facing you.'
      : 'Pick a color, then tap stickers on the cube or the map below. There are no fixed centers, so any way up is fine — the solver works out the orientation from the corners.',

    encode: (s) => M.encode(s),
    decode: (text) => M.decode(text),
  };
}

/** Random face turns without redundant sequences like R R or R L R. */
function faceScramble(length: number): string[] {
  const out: string[] = [];
  let last = -1, prev = -1;
  while (out.length < length) {
    const f = Math.floor(Math.random() * 6);
    if (f === last) continue;
    if (f % 3 === last % 3 && f % 3 === prev % 3) continue;
    prev = last;
    last = f;
    out.push(FACES[f] + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return out;
}

/** Random turns of outer and wide layers, never repeating an axis twice in a row. */
function wideScramble(length: number): string[] {
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

const rotations = ['x', "x'", 'y', "y'", 'z', "z'"].map(btn);

/**
 * Front, then turning the cube to the left (right, back, left), then tipped forwards (up)
 * and backwards (down). Each face's stickers are stored the way a camera sees it held like
 * that, so the scan reads straight across. An odd cube's fixed centers say which face to
 * show; an even cube can start from any side.
 */
// Each step says which side ends up facing the camera, since "turn it left" is ambiguous with the
// near and far sides moving opposite ways. The next side is on the camera's right, which is your
// right behind a phone and your left in front of a webcam.
const SCAN_HOW = [
  'Hold the cube up to the camera',
  'Turn the side on your {side} to face the camera',
  'Again: turn the side on your {side} to the camera',
  'Once more: the side on your {side}',
  'Back to the start, then tip it so the top faces the camera',
  'Keep tipping the same way until the opposite side faces the camera',
];
const scanFaces = (M: CubeModel): ScanFace[] => [2, 1, 5, 4, 0, 3].map((f, k) => ({
  face: f,
  top: f === 0 ? 5 : f === 3 ? 2 : 0,
  how: k === 0 && M.n % 2 === 0 ? 'Hold any side of the cube up to the camera' : SCAN_HOW[k],
  stickers: Array.from({ length: M.n ** 2 }, (_, i) => f * M.n ** 2 + i),
  center: M.n % 2 ? (M.n ** 2 - 1) / 2 : undefined,
}));

// ---------- 2×2 ----------

const model2 = new CubeModel(2);
const solver2 = new Solver2(model2);

export const cube2: Puzzle = {
  ...makeCube(model2, { wide: false }),
  id: '2x2',
  name: '2×2',
  icon: CUBE_ICON,
  scramble: () => solver2.randomState(),
  ...syncSolver(
    (s) => solver2.solve(model2.toFaces(s)),
    (s, moves) => model2.isSolved(model2.applyAll(s, moves)),
  ),
  movePadExtra: rows(['x', 'y', 'z']),
  movePadExtraLabel: 'Rotations',
  algPlaceholder: "Type an algorithm… R U R' U'",
  scan: scanFaces(model2),
};

// ---------- 3×3 ----------

const model3 = new CubeModel(3);
const solver3 = new SolverClient(() => new Worker(new URL('./workers/3x3.worker.ts', import.meta.url), { type: 'module' }));

export const cube3: Puzzle = {
  ...makeCube(model3, { wide: false }),
  id: '3x3',
  name: '3×3',
  icon: CUBE_ICON,
  scramble: () => faceScramble(22),
  solve: (state, budgetMs, h) => void solver3.solve(state, budgetMs, h),
  cancelSolve: () => solver3.cancel(),
  movePadExtra: rows(['M', 'E', 'S', 'x', 'y', 'z']),
  movePadExtraLabel: 'Slices & rotations',
  algPlaceholder: "Type an algorithm… R U R' U'",
  scan: scanFaces(model3),
};

// ---------- 4×4 ----------

// One worker for every big cube, started on first use so its tables are only built if
// someone solves one.
let bigSolver: SolverClient | null = null;
const solveBig: Pick<Puzzle, 'solve' | 'cancelSolve'> = {
  solve: (state, budgetMs, h) => {
    bigSolver ??= new SolverClient(() => new Worker(new URL('./workers/bigcube.worker.ts', import.meta.url), { type: 'module' }));
    void bigSolver.solve(state, budgetMs, h);
  },
  cancelSolve: () => bigSolver?.cancel(),
};

const model4 = new CubeModel(4);

export const cube4: Puzzle = {
  ...makeCube(model4, { wide: true }),
  id: '4x4',
  name: '4×4',
  icon: CUBE_ICON,
  solveHint: 'Reduces to a 3×3, then solves that',
  scramble: () => wideScramble(40),
  ...solveBig,
  movePadExtra: [...rows(['Uw', 'Dw', 'Rw', 'Lw', 'Fw', 'Bw']).slice(0, 2), rotations],
  movePadExtraLabel: 'Wide turns & rotations',
  algPlaceholder: "Type an algorithm… Rw U2 2R' F",
  scan: scanFaces(model4),
};

// ---------- 5×5 ----------

const model5 = new CubeModel(5);

export const cube5: Puzzle = {
  ...makeCube(model5, { wide: true }),
  id: '5x5',
  name: '5×5',
  icon: CUBE_ICON,
  solveHint: 'Reduces to a 3×3, then solves that',
  scramble: () => wideScramble(60),
  ...solveBig,
  movePadExtra: [...rows(['Uw', 'Dw', 'Rw', 'Lw', 'Fw', 'Bw']).slice(0, 2), ['M', "M'", 'E', "E'", 'S', "S'"].map(btn), rotations],
  movePadExtraLabel: 'Wide turns, slices & rotations',
  algPlaceholder: "Type an algorithm… Rw U2 3R' M",
  scan: scanFaces(model5),
};
