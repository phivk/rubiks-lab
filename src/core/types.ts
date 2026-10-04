import type { BufferGeometry } from 'three';

export type State = number[];
export type Vec3 = [number, number, number];

export type Validation =
  | { ok: true }
  | { ok: false; kind: 'incomplete' | 'invalid'; message: string; stickers?: number[] };

/** A physical turn: rotate `pieces` about `axis` (through the origin) by `angle` radians (right-hand rule). */
export interface Turn {
  axis: Vec3;
  pieces: number[];
  angle: number;
  /** the smallest turn of this kind, in radians (a quarter turn on a cube); `angle` is a whole number of them */
  step: number;
  /** perm[dest] = src */
  perm: number[];
}

export interface StickerDef {
  index: number;
  /** color in the solved state */
  color: number;
  piece: number;
  normal: Vec3;
  /** polygon outline in world coordinates, counter-clockwise seen from outside */
  outline: Vec3[];
  /** polygon outline in the 2D map, in map units */
  net: [number, number][];
  /** optional label drawn on the map (e.g. face letters on 3x3 centers) */
  netLabel?: string;
}

/** A second map: each layer a circle, each sticker a dot where its layers' circles cross. In map units. */
export interface RingMap {
  circles: {
    cx: number;
    cy: number;
    r: number;
    stickers: number[];
    /** names the move that turns this layer by some quarter turns */
    move: (quarters: number) => string;
    /** 1 if a +1 quarter turn carries the dots toward growing angle (clockwise on screen), else -1 */
    sense: 1 | -1;
    /** the layer's name, if it's short enough to draw */
    label?: string;
    /** the face this layer turns with, if it's an outer layer */
    face?: number;
    labelAt: [number, number];
  }[];
  /** dot center per sticker */
  points: [number, number][];
  /** dot radius */
  dot: number;
  /** radius of a ring's label */
  labelSize: number;
  size: [number, number];
}

/** One way a grabbed sticker can turn. `toMove(steps)` names the move for a number of `step`-sized right-hand rotations. */
export interface DragOption {
  axis: Vec3;
  pieces: number[];
  step: number;
  toMove: (steps: number) => string;
}

export interface MoveButton {
  move: string;
  color?: string;
}

export interface SolveHandlers {
  onSolution: (moves: string[], elapsed: number) => void;
  /** a worker solver reports each search depth it starts */
  onDepth?: (depth: number) => void;
  onDone: (optimal: boolean, elapsed: number) => void;
  onError: (message: string) => void;
}

/** A run of moves in a lesson step, labelled with what it does ("Turn the top", "R U R' U' ×3"). */
export interface Phrase {
  label: string;
  moves: string[];
}

export interface GuideStep {
  /** index into the guide's stages */
  stage: number;
  title: string;
  /** the explanation, as HTML */
  html: string;
  phrases: Phrase[];
  /** the stickers to keep lit while this step is on screen, for any state */
  focus: (s: State) => number[];
}

/** A method that solves a puzzle the way a person would, in explained steps. */
export interface Guide {
  id: string;
  name: string;
  /** the name on the method picker */
  short: string;
  intro: string;
  stages: { name: string; goal: string }[];
  /** throws if the state can't be solved this way */
  steps: (s: State) => GuideStep[];
}

export interface Puzzle {
  id: string;
  name: string;
  /** the switcher tab's icon: SVG content for a 24×24 viewBox */
  icon: string;
  /** colors by id; the last entry is the "unset" color used while painting */
  colors: string[];
  colorNames: string[];
  unset: number;
  /** the order swatches appear in the paint palette */
  paletteOrder: number[];
  stickers: StickerDef[];
  pieceCount: number;
  /** body geometry per piece, in world coordinates; null for pieces with no visible body */
  buildPiece: (piece: number) => BufferGeometry | null;
  stickerCornerRadius: number;
  cameraHome: Vec3;
  /** point the camera orbits around */
  cameraTarget: Vec3;
  netSize: [number, number];
  rings?: RingMap;

  solved: () => State;
  isSolved: (s: State) => boolean;
  parseMove: (move: string) => Turn | null;
  parseAlg: (text: string) => { moves: string[]; invalid: string[] };
  invertMove: (move: string) => string;
  scramble: () => string[];
  validate: (s: State) => Validation;
  dragOptions: (sticker: number) => DragOption[];
  /** turning the whole puzzle by hand is ok, but some stickers can't be painted */
  lockedSticker?: (i: number) => string | null;

  movePad: MoveButton[][];
  movePadExtra?: MoveButton[][];
  movePadExtraLabel?: string;
  /** keyboard → move, or null */
  keyToMove: (code: string, shift: boolean, alt: boolean) => string | null;
  shortcutsHtml: string;
  paintIntroHtml: string;
  algPlaceholder: string;

  encode: (s: State) => string;
  decode: (text: string) => State | null;

  /** subtitle of the solve button, if not "Finds the shortest route home" */
  solveHint?: string;
  solve: (state: State, budgetMs: number, handlers: SolveHandlers) => void;
  cancelSolve: () => void;
  /** tutorials that walk through solving this puzzle by hand, one per method */
  guides?: Guide[];
}
