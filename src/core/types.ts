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

/** One face to point the camera at while scanning, and how to hold the puzzle for it. */
export interface ScanFace {
  /** which face, by its color id when solved */
  face: number;
  /** the face that should be on top, likewise, if it goes by color */
  top?: number;
  /** a triangular face (a Pyraminx's), pointing up or down; square without */
  shape?: 'up' | 'down';
  /** how to get there from the face before; `{side}` is the camera's right, which is your left in front of a webcam */
  how: string;
  /** stickers as the camera sees them, row by row from the top left (see scan/cells.ts) */
  stickers: number[];
  /**
   * index in `stickers` of a fixed center, whose color tells which face this is; without
   * one (an even cube), the puzzle can be held any way round and faces go by position
   */
  center?: number;
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
  /** index into the method's stages */
  stage: number;
  title: string;
  /** the explanation, as HTML */
  html: string;
  phrases: Phrase[];
  /** the stickers to keep lit while this step is on screen, for any state */
  focus: (s: State) => number[];
  /** the case this step is, if it is one (a Case id), so it can link to it in the method's course */
  caseId?: string;
}

/** One case of a stage: a picture of it and the algorithm that solves it. */
export interface Case {
  /** the same everywhere it comes up: in each course that has it, and on a guided solve's step (GuideStep.caseId) */
  id: string;
  name: string;
  /** its number in the full list, shown beside the name ("OLL 27") */
  alias?: string;
  moves: string[];
  /** the state the algorithm solves, held the way it starts; stickers that don't matter yet are unset */
  setup: State;
  /** a sentence on how the moves work */
  note?: string;
  /** show the algorithm on a new line after this many moves */
  breakAfter?: number;
}

export interface CaseGroup {
  id: string;
  name: string;
  about?: string;
  cases: Case[];
}

/** A stage of a method: what it's for, how it's done, and the cases to learn for it, if it has any yet. */
export interface Stage {
  id: string;
  name: string;
  goal: string;
  /** the course's explanation, as HTML; without it the course shows the goal */
  html?: string;
  caseGroups?: CaseGroup[];
  /** how a case is pictured: the puzzle from its usual angle, or its top from above */
  view?: 'corner' | 'top';
  /** arrows on a case's picture, from sticker to sticker */
  arrows?: (c: Case) => [number, number][];
  /** the stickers to keep lit on the 3D cube while a case plays, for any state, if not all */
  focus?: (s: State) => number[];
}

/** A way to solve a puzzle by hand, taught stage by stage: a course of its stages and cases, and a guided solve of any scramble. */
export interface Method {
  id: string;
  name: string;
  /** the name on the method picker */
  short: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  intro: string;
  /** notation the method uses beyond the puzzle's basic moves */
  notation?: string;
  /** short move sequences worth spotting inside the algorithms, highlighted wherever they appear */
  triggers?: { name: string; moves: string[] }[];
  stages: Stage[];
  /** a guided solve: the moves that solve this state, explained step by step; throws if it can't be solved this way */
  solve?: (s: State) => GuideStep[];
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
  /** a move button's color in this state, when it can change as the whole puzzle is turned */
  moveColor?: (s: State, move: string) => string | undefined;
  /** keyboard → move, or null */
  keyToMove: (code: string, shift: boolean, alt: boolean) => string | null;
  shortcutsHtml: string;
  paintIntroHtml: string;
  /** how the basic moves are written, explained before a lesson */
  notationHtml: string;
  algPlaceholder: string;

  /** the faces to scan, in order, if the puzzle can be scanned with a camera */
  scan?: ScanFace[];
  /** the cube color id each of its colors is picked from (see pickColors), if not the cubes' own */
  cubeColorIds?: number[];
  /** a scan that goes by position, held any way round, turned the way the puzzle is drawn */
  orientScan?: (s: State) => State;

  encode: (s: State) => string;
  decode: (text: string) => State | null;

  /** subtitle of the solve button, if not "Finds the shortest route home" */
  solveHint?: string;
  solve: (state: State, budgetMs: number, handlers: SolveHandlers) => void;
  cancelSolve: () => void;
  /** the ways to solve it by hand that Learn teaches */
  methods?: Method[];
}
