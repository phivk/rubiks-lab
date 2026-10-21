import './style.css';
import { cubeKind, useCubeColors, type CubeKind } from './core/colors';
import type { Case, GuideStep, Method, Puzzle, Stage, State, Validation } from './core/types';
import { cube2, cube3, cube4, cube5 } from './cube/puzzles';
import { countMoves, list, plural, stepMoves } from './cube/lessonKit';
import { pyraminx } from './pyraminx/puzzle';
import { Mode, PuzzleView } from './view/PuzzleView';
import { NetView } from './view/net';
import { RingView } from './view/rings';
import { Scanner } from './view/scanner';
import { drillControlsHtml, drillStatus, markCode, movesHtml, offPlanHtml, stepperHtml, trigClass, triggerRuns } from './view/course';
import { snapshot } from './view/snapshot';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const PUZZLES: Puzzle[] = [cube2, cube3, cube4, cube5, pyraminx];

// ---------- state ----------

/** A cube as it was before a change to the whole of it (a reset, scramble, scan or painted sticker), to undo back to. */
interface Checkpoint {
  state: State;
  moveHistory: string[];
  base: number;
}

/** Each puzzle keeps its own state and history, so switching back and forth loses nothing. */
interface Session {
  state: State;
  moveHistory: string[];
  redoStack: string[];
  /** how many moves at the start of the history are a scramble: undo takes it back all at once, not move by move */
  base: number;
  /** the whole-cube changes undo can take back, newest last */
  checkpoints: Checkpoint[];
}
const newSession = (p: Puzzle): Session => ({ state: p.solved(), moveHistory: [], redoStack: [], base: 0, checkpoints: [] });
/** your cube, one per puzzle */
const sessions = new Map<string, Session>(PUZZLES.map((p) => [p.id, newSession(p)]));
/** Learn's own cubes, one for the cases and one for a guided solve, so neither ever touches yours or the other */
const practice = new Map<string, Session>();
const practiceCube = (p: Puzzle, k: Practice) => {
  const key = `${p.id}:${k}`;
  if (!practice.has(key)) practice.set(key, newSession(p));
  return practice.get(key)!;
};

let puzzle: Puzzle = cube3;
let session = sessions.get(cube3.id)!;
let mode: Mode = 'play';
let paintColor = 0;

interface Solution {
  start: State;
  moves: string[];
  index: number;
  optimal: boolean;
  searching: boolean;
  elapsed: number;
  stale: boolean;
  /**
   * A guided solve or case the cube was turned away from: the turns since, the state they
   * left and where they've taken it. Once that's back where it left, it carries on.
   */
  drift?: { moves: string[]; from: State; now: State };
  /**
   * a guided solve (a lesson): the method, its moves explained step by step, and the move each
   * step starts at; practising one stage on a scramble, which stage
   */
  lesson?: { method: Method; steps: GuideStep[]; starts: number[]; stage?: number };
  /** a case being practised: which one */
  drill?: CaseRef;
}
/** a case of the method, by its stage, group and place in the group */
interface CaseRef { stage: number; group: number; index: number }
let solution: Solution | null = null;
let playing = false;
/** where playback last started: a lesson pauses at the end of each step */
let playFrom = 0;

/**
 * The two places: Cube, your own puzzle, to set up and solve; and Learn, a method stage by
 * stage, with its cases to practise and a guided solve, on practice cubes of its own.
 */
type Place = 'cube' | 'learn';
let place: Place = 'cube';
/** which of Learn's cubes is on screen: the one cases are set up on, or the guided solve's */
type Practice = 'cases' | 'guided';
let practiceKind: Practice = 'guided';
/** the method Learn teaches, by id */
let methodId = '';
try { methodId = localStorage.getItem('method') ?? ''; } catch { /* storage unavailable */ }
const currentMethod = () => puzzle.methods?.find((m) => m.id === methodId) ?? puzzle.methods?.[0];
/** the cube a place works on: yours, or one of Learn's */
const sessionFor = (p: Puzzle, pl: Place, k: Practice) => (pl === 'learn' ? practiceCube(p, k) : sessions.get(p.id)!);
/** where a solution belongs: the puzzle, the place and, in Learn, the method and its cube */
const placeKey = (k = practiceKind) => `${puzzle.id}:${place}${place === 'learn' ? `:${currentMethod()?.id}:${k}` : ''}`;
/** the solution each place was left with, to pick up on coming back to it */
const parked = new Map<string, Solution>();
/** the guided solve, open or put aside while a case is practised */
const guidedLesson = () => (practiceKind === 'guided' ? solution : parked.get(placeKey('guided')) ?? null);
/** the stage Learn shows, for this puzzle and method */
let stageIdx = 0;
const stageKey = () => `stage:${puzzle.id}:${currentMethod()?.id}`;
function loadStage() {
  try { stageIdx = Number(localStorage.getItem(stageKey())) || 0; } catch { stageIdx = 0; }
}

const SPEEDS = [0.35, 0.6, 1, 1.7, 3];
let speed = 1;
const BASE_MS = 340;

// every view shows the sticker under the pointer and the layers being turned, wherever that happens
type Linked = { showHover: (i: number) => void; showGrab: (i: number, pieces?: number[]) => void };
const others = (self: Linked) => [view, ...maps].filter((v) => v !== self);
const link = (self: () => Linked) => ({
  onHover: (i: number) => others(self()).forEach((v) => v.showHover(i)),
  onGrab: (i: number, pieces?: number[]) => others(self()).forEach((v) => v.showGrab(i, pieces)),
});

const view: PuzzleView = new PuzzleView($('#stage'), {
  onDragTurn: (move) => commitUserMove(move, false),
  onStickerClick: (i) => paintSticker(i),
  // on a phone, with a case open, a swipe on the cube (often meant to scroll) only turns the view
  canDragTurn: () => queue.length === 0 && !running && !(phone() && drilling()),
  ...link(() => view),
  onDrag: (move, steps) => maps.forEach((m) => m.showDrag(move, steps)),
});
// on the maps, dragging a sticker turns its layer, so tapping only paints
const mapHandlers = (self: () => Linked) => ({
  onClick: (i: number) => { if (mode === 'paint') paintSticker(i); },
  onTurn: (move: string) => commitUserMove(move),
  canTurn: () => mode === 'play',
  ...link(self),
});
const net: NetView = new NetView($('#net'), mapHandlers(() => net));
const rings: RingView = new RingView($('#rings'), mapHandlers(() => rings));
const maps = [net, rings];
const scanner = new Scanner({ onDone: loadScan, onError: (message) => toast(message, 'bad') });
type MapKind = 'net' | 'rings';
let mapKind: MapKind = 'net';
try { if (localStorage.getItem('map') === 'rings') mapKind = 'rings'; } catch { /* storage unavailable */ }

/** how many stickers of each color a complete puzzle has */
const perColor = () => puzzle.stickers.filter((s) => s.color === 0).length;

const applyMove = (s: State, move: string) => puzzle.parseMove(move)!.perm.map((src) => s[src]);

// ---------- move queue ----------

type Job = { move: string; duration: number; kind: 'user' | 'playback' };
const queue: Job[] = [];
let running = false;
/** the state the turn being animated lands on */
let landing: State | null = null;
/** counts the times the cube was put in a new state outright, so a turn in flight from before doesn't land on it */
let epoch = 0;

function enqueue(job: Job) {
  queue.push(job);
  if (!running) void runQueue();
}

async function runQueue() {
  running = true;
  while (queue.length) {
    const job = queue.shift()!;
    const next = applyMove(session.state, job.move);
    // speed up when the queue backs up so input never feels laggy
    const hurry = queue.length > 2 ? 0.45 : queue.length > 0 ? 0.75 : 1;
    const turn = puzzle.parseMove(job.move)!;
    landing = next;
    const was = epoch;
    maps.forEach((m) => m.animateTurn(turn, next, job.duration * hurry));
    await view.animateTurn(turn, next, job.duration * hurry);
    landing = null;
    if (epoch !== was) {
      // the cube was set outright meanwhile: show that, not this turn
      view.setState(session.state);
      onStateChanged();
      continue;
    }
    const wasSolved = puzzle.isSolved(session.state);
    session.state = next;
    onStateChanged();
    if (!wasSolved && puzzle.isSolved(session.state) && queue.length === 0 && job.kind === 'user') celebrate();
  }
  running = false;
  if (solution && playing) scheduleNextPlayback();
  if (pendingSolve) { pendingSolve = false; void startSolve(); }
}

/** the state once the queued turns have landed */
const settled = () => queue.reduce((t, j) => applyMove(t, j.move), landing ?? session.state);
const same = (a: State, b: State) => a.length === b.length && a.every((x, i) => x === b[i]);

const idle = () => new Promise<void>((resolve) => {
  const check = () => (!running && queue.length === 0 ? resolve() : setTimeout(check, 30));
  check();
});

/** Land the queued turns at once rather than animate them all: the turn in progress finishes, the rest jump. */
async function finishTurns() {
  const rest = queue.splice(0);
  await idle();
  if (!rest.length) return;
  session.state = rest.reduce((t, j) => applyMove(t, j.move), session.state);
  view.setState(session.state);
  onStateChanged();
}

/** Making the solution's next move yourself steps along it; any other move leaves it behind. */
function follow(move: string, back = false) {
  const s = solution;
  // queued moves are already counted in the index, so it always describes the state after the queue
  const live = s && !s.stale && !s.searching;
  if (live && s.moves[back ? s.index - 1 : s.index] === move) {
    s.index += back ? -1 : 1;
    playing = false;
  } else if (live && !back && isHalfOf(s.moves[s.index], move)) {
    // a half turn made as two quarter turns: split it, and the first quarter is done
    splitMove(s, s.index, move);
    s.index++;
    playing = false;
    renderSolution();
  } else {
    // a guided solve or case picks up where it was once the stray turns cancel out (undone, or turned back by hand);
    // one that went stale some other way (the cube changed while it was put aside) can't
    if ((s?.drill || s?.lesson) && !s.searching && (!s.stale || s.drift)) {
      if (!s.stale) {
        const from = s.moves.slice(0, s.index).reduce(applyMove, s.start);
        s.drift = { moves: [], from, now: from };
      }
      const d = s.drift!;
      const turn = back ? puzzle.invertMove(move) : move;
      // a turn and its undo cancel, so the button only offers what's left to turn back
      if (d.moves.at(-1) === puzzle.invertMove(turn)) d.moves.pop();
      else d.moves.push(turn);
      d.now = applyMove(d.now, turn);
      if (same(d.now, d.from)) {
        s.stale = false;
        s.drift = undefined;
        playing = false;
        // this move isn't on the cube yet: draw the case once it is, so its focus fits the cube
        resumeOnTurn = true;
        return;
      }
    }
    invalidateSolution();
  }
}

/** whether the open case just picked up again, to draw once the turn that did it lands */
let resumeOnTurn = false;

/** Turn the cube back through the turns that left the guided solve or open case, so it carries on. */
function undoStray() {
  const d = solution?.stale && solution.drift;
  if (d) doMoves(d.moves.slice().reverse().map((m) => puzzle.invertMove(m)));
}

/** "Undo turn", or "Undo 3 turns": what undoStray will turn back. */
const undoLabel = () => {
  const n = solution?.drift?.moves.length ?? 1;
  return n === 1 ? 'Undo turn' : `Undo ${n} turns`;
};

/** whether `quarter` (R or R') is half of the half turn `half` (R2) */
const isHalfOf = (half: string | undefined, quarter: string) =>
  !!half?.endsWith('2') && [half.slice(0, -1), half.slice(0, -1) + "'"].includes(quarter);

/** A lesson's moves in order, and the move each step starts at. */
function flattenLesson(steps: GuideStep[]) {
  const starts: number[] = [];
  let total = 0;
  for (const step of steps) {
    starts.push(total);
    total += countMoves(step.phrases);
  }
  return { moves: steps.flatMap(stepMoves), starts };
}

/** the step that move `i` belongs to */
function stepAt(starts: number[], i: number) {
  let k = 0;
  while (k + 1 < starts.length && starts[k + 1] <= i) k++;
  return k;
}

/** Replace the solution's move at `i` with two `quarter`s, in the lesson's steps too. */
function splitMove(s: Solution, i: number, quarter: string) {
  if (!s.lesson) {
    s.moves.splice(i, 1, quarter, quarter);
    return;
  }
  // the steps hold the lesson's moves; split the move there and lay them out again
  const { steps, starts } = s.lesson;
  const k = stepAt(starts, i);
  let at = starts[k];
  for (const p of steps[k].phrases) {
    if (i < at + p.moves.length) {
      p.moves.splice(i - at, 1, quarter, quarter);
      break;
    }
    at += p.moves.length;
  }
  const flat = flattenLesson(steps);
  s.moves = flat.moves;
  s.lesson.starts = flat.starts;
  lessonStep = -1;
}

function commitUserMove(move: string, animate = true) {
  follow(move);
  session.moveHistory.push(move);
  session.redoStack.length = 0;
  if (animate) enqueue({ move, duration: BASE_MS / speed, kind: 'user' });
  else {
    const wasSolved = puzzle.isSolved(session.state);
    session.state = applyMove(session.state, move);
    view.setState(session.state);
    onStateChanged();
    if (!wasSolved && puzzle.isSolved(session.state)) celebrate();
  }
  flashMoveButton(move);
  renderHistory();
  fadeHint();
}

function doMoves(moves: string[], duration = BASE_MS / speed) {
  for (const m of moves) {
    follow(m);
    session.moveHistory.push(m);
    enqueue({ move: m, duration, kind: 'user' });
  }
  session.redoStack.length = 0;
  renderHistory();
}

function undo() {
  if (session.moveHistory.length <= session.base) {
    void restoreCheckpoint();
    return;
  }
  const m = session.moveHistory.pop();
  if (!m) return;
  follow(m, true);
  session.redoStack.push(m);
  enqueue({ move: puzzle.invertMove(m), duration: BASE_MS / speed, kind: 'user' });
  renderHistory();
}
function redo() {
  const m = session.redoStack.pop();
  if (!m) return;
  follow(m);
  session.moveHistory.push(m);
  enqueue({ move: m, duration: BASE_MS / speed, kind: 'user' });
  renderHistory();
}

/** Remember the cube as it is, before a change to the whole of it, so undo can take that back. */
function checkpoint() {
  const c = session.checkpoints;
  // the cube as it will be once the turns under way have landed: they're in the history already
  c.push({ state: settled(), moveHistory: session.moveHistory.slice(), base: session.base });
  if (c.length > 200) c.shift();
}

/** Undo the last whole-cube change: put the cube back as it was before it. */
async function restoreCheckpoint() {
  const s = session;
  if (!s.checkpoints.length) return;
  queue.length = 0;
  await idle();
  // the cube changed meanwhile: keep the checkpoint for when it's back
  if (s !== session) return;
  const c = s.checkpoints.pop();
  if (!c) return;
  s.state = c.state.slice();
  s.moveHistory = c.moveHistory.slice();
  s.base = c.base;
  s.redoStack.length = 0;
  view.setState(s.state);
  invalidateSolution();
  renderHistory();
  onStateChanged();
}

/** A toast's Undo button: takes back the whole-cube change just made, as long as nothing has happened since. */
function undoAction() {
  const s = session;
  const n = s.checkpoints.length;
  return { label: 'Undo', run: () => { if (s === session && s.checkpoints.length === n && s.moveHistory.length <= s.base) void restoreCheckpoint(); } };
}

/** A fresh start for the cube's history, its first `base` moves the scramble's; any solution is now off. */
function resetHistory(base = 0) {
  session.moveHistory.length = 0;
  session.base = base;
  session.redoStack.length = 0;
  invalidateSolution(true);
}

/**
 * Put the cube in a new state; undo can take it back unless it's a practice cube being set up.
 * Returns a toast's Undo button for it, if there's anything to undo.
 */
function setStateDirect(s: State, undoable = true) {
  // a change that changes nothing needs no undoing
  const changed = !same(s, settled()) || session.moveHistory.length > 0;
  if (undoable && changed) checkpoint();
  queue.length = 0;
  epoch++;
  session.state = s.slice();
  view.setState(session.state);
  resetHistory();
  renderHistory();
  onStateChanged();
  return undoable && changed ? undoAction() : undefined;
}

function scramble(undoable = true) {
  if (mode === 'paint') setMode('play');
  const moves = puzzle.scramble();
  // a practice cube's scramble isn't undoable: undo then stops at it, the guided solve intact
  if (undoable) checkpoint();
  resetHistory(moves.length);
  for (const m of moves) {
    session.moveHistory.push(m);
    enqueue({ move: m, duration: 110, kind: 'user' });
  }
  renderHistory();
  toast(`Scrambled: ${moves.join(' ')}`, '', undoable ? undoAction() : undefined);
  fadeHint();
}

// ---------- switching puzzles ----------

async function switchPuzzle(p: Puzzle) {
  if (p === puzzle) return;
  // the queued turns are in the history already: land them before swapping cubes
  playing = false;
  await finishTurns();
  park();
  puzzle.cancelSolve();
  puzzle = p;
  session = sessionFor(p, place, practiceKind);
  loadStage();
  ($('#puzzle-select') as HTMLSelectElement).value = p.id;
  // on a phone the tabs scroll sideways
  selectTab('.puzzle-switch button', 'puzzle', p.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  document.body.dataset.puzzle = p.id;
  $('#btn-flip').classList.toggle('hidden', !p.parseMove('z2'));
  view.setPuzzle(p, session.state);
  maps.forEach((m) => m.setPuzzle(p));
  renderMapKind();
  buildMovepad();
  ($('#alg-input') as HTMLInputElement).placeholder = p.algPlaceholder;
  $('#alg-error').textContent = '';
  $('.mode-paint .intro').innerHTML = p.paintIntroHtml;
  $('#puzzle-shortcuts').innerHTML = p.shortcutsHtml;
  $('#btn-scan').classList.toggle('hidden', !p.scan);
  renderCubeKind();
  paintColor = p.paletteOrder[0];
  setMode(mode);
  unpark();
  renderHistory();
  renderSolution();
  onStateChanged();
  try { localStorage.setItem('puzzle', p.id); } catch { /* storage unavailable */ }
}

// ---------- painting ----------

function paintSticker(i: number) {
  const locked = puzzle.lockedSticker?.(i);
  if (locked) {
    toast(locked, 'bad');
    return;
  }
  if (session.state[i] === paintColor) return;
  checkpoint();
  session.state = session.state.slice();
  session.state[i] = paintColor;
  resetHistory();
  view.setState(session.state);
  onStateChanged();
  renderHistory();
  // advance to the next color once this one is complete
  const count = (c: number) => session.state.filter((x) => x === c).length;
  if (paintColor !== puzzle.unset && count(paintColor) === perColor()) {
    const next = puzzle.paletteOrder.find((c) => c !== puzzle.unset && count(c) < perColor());
    if (next !== undefined) {
      paintColor = next;
      renderPalette();
    }
  }
}

function setMode(m: Mode) {
  mode = m;
  view.setMode(m);
  document.querySelectorAll<HTMLButtonElement>('#mode-seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  $('.mode-play').classList.toggle('hidden', m !== 'play');
  $('.mode-paint').classList.toggle('hidden', m !== 'paint');
  $('#net').classList.toggle('editable', m === 'paint');
  $('#rings').classList.toggle('editable', m === 'paint');
  renderMapKind();
  $('#stage-hint').textContent = m === 'paint'
    ? 'Tap a sticker to paint it · Drag to look around'
    : 'Drag a face to turn it · Drag the background to turn the view';
  $('#stage-hint').classList.remove('fade');
  if (m === 'paint') {
    playing = false;
    if (!session.state.includes(puzzle.unset)) {
      paintColor = puzzle.paletteOrder.find((c) => c !== puzzle.unset && session.state.filter((x) => x === c).length !== perColor()) ?? puzzle.paletteOrder[0];
    }
    renderPalette();
  }
  renderStatus();
}

// ---------- solving ----------

let pendingSolve = false;

async function startSolve() {
  if (running || queue.length) {
    pendingSolve = true;
    return;
  }
  // in Learn, the big button starts a guided solve
  if (place === 'learn') {
    if (!solution) void startLesson('scramble');
    return;
  }
  if (!checkValid()) return;
  if (puzzle.isSolved(session.state)) {
    toast('Already solved — scramble it first', 'good');
    return;
  }
  runSolver(1500);
}

/** Point out what's wrong with the puzzle, if anything. */
function checkValid() {
  const v = puzzle.validate(session.state);
  if (!v.ok) {
    showInvalid(v);
    return false;
  }
  return true;
}

/** Point out what's wrong with the puzzle and open paint mode to fix it. */
function showInvalid(v: Validation & { ok: false }, prefix = '', action?: ToastAction) {
  const bad = v.stickers;
  if (bad) {
    view.setHighlight(bad);
    view.flashHighlight();
    maps.forEach((m) => m.flash(bad));
  }
  toast(prefix + (v.kind === 'incomplete' ? `Almost there — ${v.message}` : v.message), 'bad', action);
  if (mode !== 'paint') setMode('paint');
}

// ---------- scanning ----------

async function startScan() {
  queue.length = 0;
  await idle();
  void scanner.open(puzzle);
}

/** Draw the puzzles the way they look: a bright stickerless one in its sky blue and lime green. */
function setCubeKind(kind: CubeKind) {
  if (kind === cubeKind()) return;
  useCubeColors(kind);
  try { localStorage.setItem('cubeKind', kind); } catch { /* storage unavailable */ }
  maps.forEach((m) => m.setPuzzle(puzzle));
  buildMovepad();
  renderCubeKind();
  view.setState(session.state);
  onStateChanged();
}

function renderCubeKind() {
  selectTab('#cube-kind button', 'kind', cubeKind());
}

/** Mark the tab whose `data-<key>` is `value` as selected, and return it. */
function selectTab(selector: string, key: string, value: string) {
  let active: HTMLButtonElement | undefined;
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((b) => {
    const on = b.dataset[key] === value;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    if (on) active = b;
  });
  return active;
}

function loadScan(state: State, kind: CubeKind) {
  setCubeKind(kind);
  const undo = setStateDirect(state);
  const v = puzzle.validate(session.state);
  if (!v.ok) {
    showInvalid(v, 'Scanned, but some colors need fixing: ', undo);
    return;
  }
  setMode('play');
  if (puzzle.isSolved(session.state)) toast('Scanned — your cube is already solved', 'good', undo);
  else toast('Scanned — hit Solve to find the way home', 'good', undo);
}

/**
 * A guided solve, on Learn's own cube: of a new scramble, of a copy of your cube, or of the
 * guided cube as it is now (after it was turned off the lesson's path). With `stage`, only up to
 * the end of that stage: "here" carries on practising it, and "scramble" starts on a scramble
 * with the stages before it already done.
 */
async function startLesson(from: 'scramble' | 'mine' | 'here', stage?: number) {
  const method = currentMethod()!;
  if (!method.solve) return;
  const forPuzzle = puzzle;
  if (from === 'mine') {
    const mine = sessions.get(puzzle.id)!.state;
    const v = puzzle.validate(mine);
    if (!v.ok) return toast(`Your cube isn’t complete yet: ${v.message}`, 'bad');
    if (puzzle.isSolved(mine)) return toast('Your cube is solved — scramble it first', 'good');
  }
  await go('learn', 'guided');
  const moved = () => puzzle !== forPuzzle || place !== 'learn' || practiceKind !== 'guided' || currentMethod() !== method;
  if (moved()) return;
  let steps: GuideStep[] | null = null;
  try {
    if (from === 'mine') setStateDirect(sessions.get(puzzle.id)!.state, false);
    else if (from === 'scramble' && stage !== undefined) {
      const at = stageStart(method, stage);
      setStateDirect(at.state, false);
      steps = at.steps;
      const before = method.stages.slice(0, stage).map((st) => st.name);
      toast(before.length ? `Here’s a cube with ${list(before)} done. Now do ${method.stages[stage].name}.` : `Here’s a scramble. Now do ${method.stages[stage].name}.`);
    } else if (from === 'scramble') {
      scramble(false);
      await idle();
      // the puzzle, place or method may have changed while it scrambled
      if (moved()) return;
    } else if (!checkValid()) return;
    steps ??= method.solve(session.state);
  } catch {
    toast('Couldn’t build a lesson for this cube', 'bad');
    return;
  }
  if (stage !== undefined) {
    steps = steps.filter((st) => st.stage <= stage);
    if (!steps.length) {
      toast(`${method.stages[stage].name} is done on this cube`, 'good');
      return;
    }
  }
  const { moves, starts } = flattenLesson(steps);
  playing = false;
  solution = {
    start: session.state.slice(),
    moves,
    index: 0, optimal: false, searching: false, elapsed: 0, stale: false,
    lesson: { method, steps, starts, stage },
  };
  followedStage = -1;
  renderSolution(true);
}

/**
 * A cube to practise a stage on: a scramble, with the guided solve played silently up to the
 * start of the stage. Its steps for that stage, and for any after it, come with it. A scramble
 * that skips the stage (it's done by the stages before) is passed over for another.
 */
function stageStart(method: Method, stage: number) {
  for (let tries = 0; ; tries++) {
    const scrambled = puzzle.scramble().reduce(applyMove, puzzle.solved());
    const steps = method.solve!(scrambled);
    const first = steps.findIndex((st) => st.stage >= stage);
    if (tries < 20 && (first < 0 || steps[first].stage !== stage)) continue;
    const skip = first < 0 ? steps.length : first;
    return { state: steps.slice(0, skip).flatMap(stepMoves).reduce(applyMove, scrambled), steps: steps.slice(skip) };
  }
}

/** Go to a place and, in Learn, one of its cubes; whatever was open where you left waits for you to come back. */
async function go(to: Place, k: Practice = practiceKind) {
  if (to === place && (to === 'cube' || k === practiceKind)) return;
  if (sessionFor(puzzle, to, k) !== session) {
    // the queued turns belong to the cube on screen: land them before swapping cubes
    playing = false;
    await finishTurns();
    if (to === place && (to === 'cube' || k === practiceKind)) return;
  }
  park();
  place = to;
  practiceKind = k;
  try {
    localStorage.setItem('place', to);
    localStorage.setItem('practice', k);
  } catch { /* storage unavailable */ }
  // painting is for your own cube
  if (to === 'learn' && mode === 'paint') setMode('play');
  const was = session;
  session = sessionFor(puzzle, place, practiceKind);
  if (session !== was) {
    view.setState(session.state);
    renderHistory();
    onStateChanged();
  }
  unpark();
  renderSolution();
}

function setMethod(id: string) {
  if (id === currentMethod()?.id) return;
  park();
  methodId = id;
  try { localStorage.setItem('method', id); } catch { /* storage unavailable */ }
  loadStage();
  unpark();
  renderSolution();
}

/** Put the solution on screen aside, to pick up on coming back to this puzzle, tab and method. */
function park() {
  if (!solution) return;
  // a search in progress stops; what it found so far is no use without it
  if (solution.searching) {
    invalidateSolution(true);
    return;
  }
  playing = false;
  parked.set(placeKey(), solution);
  solution = null;
}

/** Pick up the solution this place was left with: live if the cube is still where it was, out of date if not. */
function unpark() {
  const s = parked.get(placeKey());
  if (!s) return;
  parked.delete(placeKey());
  const left = s.drift ? s.drift.now : s.moves.slice(0, s.index).reduce(applyMove, s.start);
  if (!same(left, settled())) {
    s.stale = true;
    s.drift = undefined;
  }
  solution = s;
  lessonStep = -1;
  // the course may have moved on meanwhile: follow the guided solve back to its stage
  followedStage = -1;
}
function runSolver(budgetMs: number) {
  const start = session.state.slice();
  const forPuzzle = puzzle;
  playing = false;
  solution = { start, moves: [], index: 0, optimal: false, searching: true, elapsed: 0, stale: false };
  renderSolution();
  $('#btn-solve').classList.add('busy');
  const current = () => solution && solution.start === start && puzzle === forPuzzle;
  puzzle.solve(start, budgetMs, {
    onSolution: (moves, elapsed) => {
      if (!current()) return;
      const first = solution!.moves.length === 0;
      solution!.moves = moves;
      solution!.elapsed = elapsed;
      solution!.index = 0;
      renderSolution(first);
    },
    onDone: (optimal, elapsed) => {
      $('#btn-solve').classList.remove('busy');
      if (!current()) return;
      solution!.searching = false;
      solution!.optimal = optimal;
      solution!.elapsed = elapsed;
      renderSolution();
    },
    onError: (message) => {
      $('#btn-solve').classList.remove('busy');
      if (!current()) return;
      solution = null;
      renderSolution();
      toast(message, 'bad');
    },
  });
}

function invalidateSolution(clear = false) {
  if (!solution) return;
  if (solution.searching) {
    puzzle.cancelSolve();
    $('#btn-solve').classList.remove('busy');
    solution = null;
  } else if (clear) solution = null;
  else solution.stale = true;
  playing = false;
  renderSolution();
}

function stepForward() {
  if (!solution || solution.stale || solution.index >= solution.moves.length) return false;
  enqueue({ move: solution.moves[solution.index], duration: BASE_MS / speed, kind: 'playback' });
  solution.index++;
  renderPlayback();
  return true;
}
function stepBack() {
  if (!solution || solution.stale || solution.index <= 0) return;
  playing = false;
  solution.index--;
  enqueue({ move: puzzle.invertMove(solution.moves[solution.index]), duration: BASE_MS / speed, kind: 'playback' });
  renderPlayback();
}
function jumpTo(k: number) {
  if (!solution || solution.stale) return;
  playing = false;
  const fast = Math.max(70, 160 / speed);
  while (solution.index < k) enqueue({ move: solution.moves[solution.index++], duration: fast, kind: 'playback' });
  while (solution.index > k) enqueue({ move: puzzle.invertMove(solution.moves[--solution.index]), duration: fast, kind: 'playback' });
  renderPlayback();
}

let playTimer = 0;
function scheduleNextPlayback() {
  clearTimeout(playTimer);
  playTimer = window.setTimeout(() => {
    if (!playing || running) return;
    if (solution?.lesson && solution.index !== playFrom && solution.lesson.starts.includes(solution.index)) {
      playing = false;
      renderPlayback();
      return;
    }
    if (!stepForward()) {
      playing = false;
      renderPlayback();
    }
  }, 140 / speed);
}
function togglePlay() {
  if (!solution || solution.stale || solution.moves.length === 0) return;
  if (playing) playing = false;
  else {
    if (solution.index >= solution.moves.length) jumpTo(0);
    playing = true;
    playFrom = solution.index;
    if (!running) scheduleNextPlayback();
  }
  renderPlayback();
}

// ---------- rendering ----------

function setMapKind(k: MapKind) {
  mapKind = k;
  try { localStorage.setItem('map', k); } catch { /* storage unavailable */ }
  renderMapKind();
}

/** Puzzles without a ring map always show the net. */
function renderMapKind() {
  const hasRings = !!puzzle.rings;
  const k = hasRings ? mapKind : 'net';
  $('#map-switch').classList.toggle('hidden', !hasRings);
  selectTab('#map-switch button', 'map', k);
  $('#net').classList.toggle('hidden', k !== 'net');
  $('#rings').classList.toggle('hidden', k !== 'rings');
  $('#net-hint').textContent = mode === 'paint' ? 'Tap to paint' : k === 'rings' ? 'Drag a dot to turn' : 'Drag a sticker to turn';
}

function onStateChanged() {
  maps.forEach((m) => m.update(session.state));
  recolorMovepad();
  renderStatus();
  $('#solved-badge').classList.toggle('hidden', !puzzle.isSolved(session.state));
  if (mode === 'paint') renderPalette();
  if (resumeOnTurn) {
    resumeOnTurn = false;
    renderSolution();
  } else if (solution && !solution.stale) renderPlayback();
  // in Learn, whether to use your cube for a guided solve; elsewhere, only when the offer to learn to solve it changes
  else if (!solution && (place === 'learn' || offerMine() !== mineOffered)) renderSolution();
  view.setHighlight([]);
  renderUndo();
  saveToUrl();
}

function buildMovepad() {
  const fill = (el: HTMLElement, rows: { move: string; color?: string }[][]) => {
    el.replaceChildren();
    el.style.gridTemplateColumns = `repeat(${rows[0]?.length ?? 1}, 1fr)`;
    for (const row of rows) for (const b of row) el.append(moveButton(b.move, b.color));
  };
  fill($('#movepad'), puzzle.movePad);
  fill($('#movepad-extra'), puzzle.movePadExtra ?? []);
  const more = $('#btn-more-moves');
  more.classList.toggle('hidden', !puzzle.movePadExtra);
  more.textContent = $('#movepad-extra').classList.contains('hidden') ? puzzle.movePadExtraLabel ?? '' : 'Hide extras';
  recolorMovepad();
}

function recolorMovepad() {
  if (!puzzle.moveColor) return;
  for (const b of document.querySelectorAll<HTMLElement>('#movepad .move, #movepad-extra .move')) {
    const c = puzzle.moveColor(session.state, b.dataset.move!);
    if (c) b.style.setProperty('--c', c);
  }
}

function moveButton(move: string, color?: string) {
  const b = document.createElement('button');
  b.className = 'move';
  b.textContent = move;
  b.dataset.move = move;
  if (color) b.style.setProperty('--c', color);
  b.addEventListener('click', () => commitUserMove(move));
  return b;
}

function flashMoveButton(move: string) {
  const b = document.querySelector<HTMLElement>(`.move[data-move="${CSS.escape(move)}"]`);
  if (!b) return;
  b.classList.add('flash');
  setTimeout(() => b.classList.remove('flash'), 160);
}

function renderUndo() {
  ($('#btn-undo') as HTMLButtonElement).disabled = session.moveHistory.length <= session.base && session.checkpoints.length === 0;
  ($('#btn-redo') as HTMLButtonElement).disabled = session.redoStack.length === 0;
}

function renderHistory() {
  const el = $('#history');
  const h = session.moveHistory;
  $('#history-count').textContent = `${h.length} move${h.length === 1 ? '' : 's'}`;
  if (!h.length) el.innerHTML = '<span class="muted small">Your turns will show up here.</span>';
  else {
    el.innerHTML = h.map((m) => `<span class="h">${m}</span>`).join('');
    el.scrollTop = el.scrollHeight;
  }
  renderUndo();
}

function renderPalette() {
  const el = $('#palette');
  const counts = new Array(puzzle.colors.length).fill(0);
  session.state.forEach((c) => counts[c]++);
  el.replaceChildren();
  el.style.gridTemplateColumns = `repeat(${puzzle.paletteOrder.length}, minmax(0, 40px))`;
  puzzle.paletteOrder.forEach((c, k) => {
    const b = document.createElement('button');
    const eraser = c === puzzle.unset;
    b.className = 'swatch' + (c === paintColor ? ' active' : '') + (eraser ? ' eraser' : '');
    b.style.setProperty('--c', puzzle.colors[c]);
    b.title = `${puzzle.colorNames[c]} (${k + 1})`;
    b.setAttribute('aria-label', b.title);
    if (!eraser) {
      const left = perColor() - counts[c];
      const n = document.createElement('span');
      n.className = 'n' + (left === 0 ? ' done' : left < 0 ? ' over' : '');
      n.textContent = left === 0 ? '✓' : String(left);
      b.append(n);
    }
    b.addEventListener('click', () => {
      paintColor = c;
      renderPalette();
    });
    el.append(b);
  });
}

function renderStatus() {
  const el = $('#status');
  const v = puzzle.validate(session.state);
  el.className = 'status';
  if (v.ok) {
    if (mode === 'paint') {
      el.classList.add('ok');
      el.innerHTML = '<span class="dot"></span><span>Valid puzzle — ready to solve</span>';
    } else el.innerHTML = '';
  } else {
    el.classList.add(v.kind === 'incomplete' ? 'warn' : 'bad');
    el.innerHTML = `<span class="dot"></span><span>${v.message}</span>`;
  }
}

/** your cube, ready to solve: you could learn to solve it yourself instead */
const offerMine = () => !puzzle.isSolved(session.state) && puzzle.validate(session.state).ok && !!puzzle.methods?.some((m) => m.solve);
/** whether the offer is showing */
let mineOffered = false;

function renderSolution(fresh = false) {
  const el = $('#solution');
  const learn = place === 'learn' && !!currentMethod();
  el.classList.toggle('learn', learn);
  el.classList.toggle('drill', learn && !!solution?.drill);
  el.classList.toggle('guided', learn && !!solution?.lesson);
  document.body.classList.toggle('learn', learn);
  // in Learn the big button starts a guided solve, so it goes once one is open
  $('#btn-solve').classList.toggle('hidden', learn && !!solution);
  el.classList.toggle('empty', !solution);
  el.classList.toggle('stale', !!solution?.stale);
  renderPlaces();
  mineOffered = !learn && offerMine();
  $('#btn-learn-mine').classList.toggle('hidden', !mineOffered);
  if (!(solution?.lesson || solution?.drill) || solution.stale) view.setFocus(null);
  renderDrilling();
  if (learn) {
    renderLearn(fresh);
    return;
  }
  $('.solve-label').textContent = 'Solve';
  const sub = $('#solve-sub');
  if (!solution) {
    sub.textContent = puzzle.solveHint ?? 'Finds the shortest route home';
    return;
  }
  const s = solution;
  $('#sol-count').textContent = s.moves.length ? String(s.moves.length) : '…';
  const secs = (s.elapsed / 1000).toFixed(s.elapsed < 1000 ? 2 : 1);
  let meta = '';
  if (s.stale) meta = `<span class="badge stale">Puzzle changed</span><span>Solve again for a new route</span>`;
  else if (s.searching) meta = `<span class="badge searching">Searching for shorter</span>`;
  else if (s.optimal) meta = `<span class="badge optimal">✓ Optimal</span><span>proven in ${secs}s</span>`;
  else meta = `<span>Best found in ${secs}s ·</span><button class="link" id="btn-deeper">Search deeper</button>`;
  $('#sol-meta').innerHTML = meta;
  $('#btn-deeper')?.addEventListener('click', () => {
    if (!solution) return;
    // restart from the original position, searching for longer
    const target = puzzle.encode(solution.start);
    const rewound = solution.index > 0;
    jumpTo(0);
    void idle().then(() => {
      if (puzzle.encode(session.state) !== target) return;
      runSolver(12000);
      if (rewound) toast('Rewound to the start to search deeper');
    });
  });
  sub.textContent = s.searching ? 'Searching…' : 'Solve again';
  renderChips(fresh);
  renderPlayback();
  // on a phone the solution is below your cube's setup: bring a new one into view
  if (fresh && phone()) $('.panel.right').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** The solution's moves as chips; clicking one jumps to after it. */
function renderChips(fresh: boolean) {
  const s = solution!;
  const chips = $('#chips');
  // in Learn, chips of a trigger (the sexy move) are marked
  const runs = s.drill ? triggerRuns(s.moves, currentMethod()?.triggers) : [];
  chips.replaceChildren();
  s.moves.forEach((m, i) => {
    const c = document.createElement('button');
    c.className = 'chip' + trigClass(runs[i]);
    c.dataset.i = String(i);
    c.innerHTML = `${m}<sub>${i + 1}</sub>`;
    if (fresh) c.style.animationDelay = `${i * 18}ms`;
    else c.style.animation = 'none';
    c.title = `Jump to after move ${i + 1}`;
    c.addEventListener('click', () => jumpTo(i + 1));
    chips.append(c);
  });
}

function renderPlayback() {
  if (!solution) return;
  const s = solution;
  const n = s.moves.length;
  if (s.lesson && currentStep(s) !== lessonStep) renderLesson();
  document.querySelectorAll<HTMLElement>(s.lesson ? '#lesson .chip' : '#chips .chip').forEach((c) => {
    const i = Number(c.dataset.i);
    c.classList.toggle('done', i < s.index);
    c.classList.toggle('current', i === s.index && !s.stale && s.index < n);
  });
  $('#step-label').textContent = `${s.index} / ${n}`;
  $('#progress-fill').style.width = n ? `${(s.index / n) * 100}%` : '0';
  $('#btn-play').classList.toggle('playing', playing);
  ($('#btn-prev') as HTMLButtonElement).disabled = s.index === 0;
  ($('#btn-first') as HTMLButtonElement).disabled = s.index === 0;
  ($('#btn-next') as HTMLButtonElement).disabled = s.index >= n;
  ($('#btn-last') as HTMLButtonElement).disabled = s.index >= n;
  if (s.lesson) {
    const step = s.lesson.steps[currentStep(s)];
    view.setFocus(step && !s.stale ? step.focus(session.state) : null);
  } else {
    const focus = s.drill && currentMethod()?.stages[s.drill.stage].focus;
    if (focus) view.setFocus(s.stale ? null : focus(session.state));
    followCurrentChip();
  }
  renderDrilling();
}

const phoneMQ = matchMedia('(max-width: 860px)');
const phone = () => phoneMQ.matches;
// crossing the breakpoint changes what tapping a case does, so its labels follow
phoneMQ.addEventListener('change', () => renderDrilling());
/** a case is open, in Learn */
const drilling = () => place === 'learn' && !!solution?.drill;

/** The open case's card shows where its algorithm is: played moves fade, the next one stands out. */
function renderDrilling() {
  const s = solution;
  const on = drilling();
  document.body.classList.toggle('drilling', on);
  const live = on && !s!.stale;
  if (live) {
    const k = s!.index;
    if (k > 0 && k < s!.moves.length) caseProgress.set(caseKey(s!.drill!), k);
    else caseProgress.delete(caseKey(s!.drill!));
  }
  keepAwake(on);
  document.querySelectorAll<HTMLElement>('#tut-groups .case').forEach((card) => {
    const open = on && sameCase(s!.drill!, cardRef(card));
    const here = open && !s!.stale;
    card.classList.toggle('active', open);
    card.querySelectorAll<HTMLElement>('.mv').forEach((m) => {
      const i = Number(m.dataset.mv);
      m.classList.toggle('done', here && i < s!.index);
      m.classList.toggle('next', here && i === s!.index);
    });
    card.classList.toggle('playing', open && playing);
    // until you've tapped through a case once, the next move pulses: this is what a tap plays
    card.classList.toggle('teach', here && !playing && !tapLearned);
    // ▶ only at the start; once moves are played its place goes to ↻, back to the start
    card.classList.toggle('begun', here && !playing && s!.index > 0);
    // only when it changes, so a focused Undo button isn't replaced under the keyboard
    setHtml(card.querySelector<HTMLElement>('.case-status'), caseStatus(open));
    card.querySelector<HTMLElement>('.case-back')?.classList.toggle('off', !here || s!.index === 0);
    const play = card.querySelector<HTMLElement>('.case-play');
    play?.classList.toggle('off', !here);
    play?.setAttribute('aria-label', open && playing ? 'Pause' : here && s!.index > 0 ? 'Back to the start' : 'Play the moves');
    // what tapping the card does: on a phone the open case's card steps through its moves
    const name = card.querySelector('.case-name')!.textContent;
    const next = here && phone() && s!.index < s!.moves.length ? s!.moves[s!.index] : '';
    const hit = card.querySelector('.case-hit')!;
    const label = next ? `Next move: ${next}` : open ? `Set up ${name} again` : `Set up ${name}`;
    hit.setAttribute('aria-label', label);
    hit.setAttribute('title', label);
  });
}

/** Replace an element's HTML, only if it changed: a focused button inside stays put. */
function setHtml(el: HTMLElement | null, html: string) {
  if (el && el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
}

/** where a case is in the course: its stage and group, and the case */
function caseIn(r: CaseRef) {
  const stage = currentMethod()!.stages[r.stage];
  const group = stage.caseGroups![r.group];
  return { stage, group, c: group.cases[r.index] };
}
/** a case's name, with its number in the full list: Sune (OLL 27) */
const caseName = (c: Case) => c.name + (c.alias ? ` <span class="alias">(${c.alias})</span>` : '');

/** What the open case's card says under its moves. */
function caseStatus(open: boolean) {
  const s = solution!;
  if (!open) return '';
  return drillStatus({
    stale: s.stale, undo: s.drift ? undoLabel() : null, playing,
    atStart: s.index === 0, atEnd: s.index >= s.moves.length, tapLearned,
  });
}

/** Keep a phone's screen on while a case is open: both hands are on the real cube. */
let wakeLock: { release: () => Promise<void> } | null = null;
let wantAwake = false;
let askingAwake = false;
function keepAwake(on: boolean) {
  wantAwake = on;
  const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
  if (on && !wakeLock && !askingAwake && nav.wakeLock && document.visibilityState === 'visible') {
    askingAwake = true;
    nav.wakeLock.request('screen').then((lock) => {
      if (wantAwake) wakeLock = lock;
      else void lock.release();
    }).catch(() => { /* not allowed or unsupported: the screen may sleep */ }).finally(() => { askingAwake = false; });
  } else if (!on && wakeLock) {
    void wakeLock.release();
    wakeLock = null;
  }
}
// the stepper fades out what scrolls under it, but only once something does
{
  const steps = $('#tut-steps'), intro = $('#tut-intro');
  for (const scroller of [window, $('#tutorial')]) {
    scroller.addEventListener('scroll', () => {
      steps.classList.toggle('stuck', intro.getBoundingClientRect().top < steps.getBoundingClientRect().bottom + 8);
    }, { passive: true });
  }
}

// the browser drops the lock when the page is hidden; take it again on return
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantAwake) {
    wakeLock = null;
    keepAwake(true);
  }
});

// ---------- lessons ----------

/** the puzzle's move notation, and any extra moves a method uses */
const notationText = (extra?: string) => `${puzzle.notationHtml}${extra ? ' ' + extra : ''}`;
/** the notation, folded away until it's wanted */
const notationHelp = (extra?: string) =>
  `<details class="notation"><summary>How to read the moves</summary><p class="muted small">${notationText(extra)}</p></details>`;

function renderPlaces() {
  selectTab('#places button', 'place', place);
}

/** The step whose moves come next, or the number of steps once the lesson is done. */
function currentStep(s: Solution) {
  const { starts } = s.lesson!;
  return s.index >= s.moves.length ? starts.length : stepAt(starts, s.index);
}

/** the step the lesson card shows */
let lessonStep = -1;

/** Learn: the course on the left, and on the right the open case or guided solve, or how to start one. */
function renderLearn(fresh: boolean) {
  const method = currentMethod()!;
  renderCourse();
  $('.solve-label').textContent = 'Start a guided solve';
  $('#solve-sub').textContent = 'On a new scramble, step by step';
  const mine = sessions.get(puzzle.id)!.state;
  const useMine = !puzzle.isSolved(mine) && puzzle.validate(mine).ok;
  // only when it changes: an opened "How to read the moves" stays open as the cube turns
  setHtml($('#lesson-intro'), `
    <p><b>${method.name}</b> <span class="level">${method.level}</span> ${method.intro}</p>
    ${method.stages.some((st) => st.caseGroups?.some((g) => g.cases.length)) ? '<p class="muted small">Every case of each stage is on the left, with its algorithm: pick one to practise it on the cube.</p>' : ''}
    <p class="muted small">Make the moves yourself, here or on a real cube, and the guided solve follows along.</p>
    ${useMine ? '<button class="link use-mine" data-act="mine">Use my cube instead ›</button>' : ''}
    ${notationHelp(method.notation)}`);
  if (solution?.lesson) {
    $('#case-card').innerHTML = '';
    renderLesson();
    renderPlayback();
  } else if (solution?.drill) {
    $('#lesson').innerHTML = '';
    renderCaseCard();
    $('#sol-count').textContent = String(solution.moves.length);
    $('#sol-meta').innerHTML = '';
    renderChips(fresh);
    renderPlayback();
  } else {
    $('#lesson').innerHTML = '';
    $('#case-card').innerHTML = '';
  }
}

function renderLesson() {
  const s = solution!;
  const { method, steps, starts, stage } = s.lesson!;
  const k = currentStep(s);
  lessonStep = k;
  const stale = s.stale ? offPlanHtml('this guided solve no longer fits it', s.drift ? undoLabel() : null, { act: 'resume', label: 'start again from here' }) : '';
  const prevBtn = '<button class="btn small ghost" data-act="prev"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>Previous step</button>';
  if (k >= steps.length) {
    // practising one stage: again on another scramble, or on to the next stage
    const next = stage !== undefined ? method.stages[stage + 1] : undefined;
    $('#lesson').innerHTML = stale + (stage !== undefined ? `
      <div class="lesson-title">${method.stages[stage].name} done ✓</div>
      <div class="lesson-text"><p>That’s the stage: ${plural(steps.length, 'step')} and ${plural(s.moves.length, 'move')}. Practise it on a few more scrambles until it comes without thinking.</p></div>
      <div class="lesson-nav">${prevBtn}<button class="btn small ghost" data-act="again">Again</button>${next ? `<button class="btn small primary-soft" data-act="next-stage">Next: ${next.name}<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>` : ''}</div>` : `
      <div class="lesson-title">Solved!</div>
      <div class="lesson-text"><p>That’s the whole method: ${steps.length} steps and ${s.moves.length} moves. Every lesson starts from your own scramble, so practise until the algorithms stick.</p></div>
      <div class="lesson-nav">${prevBtn}<button class="btn small primary-soft" data-act="again">New scramble</button></div>`);
    return;
  }
  const step = steps[k];
  // the course follows the guided solve into each new stage
  if (step.stage !== followedStage) {
    followedStage = step.stage;
    if (stageIdx !== step.stage) setStage(step.stage, false);
  }
  let i = starts[k];
  const phrases = step.phrases.map((p) => {
    // a phrase's triggers (the sexy move) are marked, as on a case
    const runs = triggerRuns(p.moves, method.triggers);
    return `
    <div class="phrase">
      <span class="phrase-label">${p.label}</span>
      <div class="phrase-moves">${p.moves.map((m, j) => `<button class="chip${trigClass(runs[j])}" data-i="${i}" title="Jump to after this move">${m}<sub>${++i - starts[k]}</sub></button>`).join('')}</div>
    </div>`;
  }).join('');
  $('#lesson').innerHTML = stale + `
    <div class="lesson-head"><span class="eyebrow">${method.stages[step.stage].name}${stage !== undefined ? ' practice' : ''}</span><span class="step">Step ${k + 1} of ${steps.length}</span></div>
    <div class="lesson-title">${step.title}</div>
    <div class="lesson-text">${step.html}</div>
    <div class="phrases">${phrases}</div>
    ${caseLink(step.caseId)}
    <div class="lesson-nav">
      <button class="btn small ghost" data-act="prev"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>Previous step</button>
      <button class="btn small ghost" data-act="next">Next step<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
    </div>
    <div class="lesson-foot"><button class="link" data-act="again">New scramble</button><button class="link" data-act="end">End guided solve</button></div>`;
}

/** the stage the course was last moved to by the guided solve */
let followedStage = -1;

function onLessonClick(e: Event) {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  const s = solution;
  if (!b || !s?.lesson) return;
  const { starts } = s.lesson;
  const k = currentStep(s);
  if (b.dataset.i) jumpTo(Number(b.dataset.i) + 1);
  else if (b.dataset.act === 'prev') jumpTo(starts[s.index > (starts[k] ?? s.moves.length) ? k : k - 1] ?? 0);
  else if (b.dataset.act === 'next') jumpTo(starts[k + 1] ?? s.moves.length);
  else if (b.dataset.act === 'again') void startLesson('scramble', s.lesson.stage);
  else if (b.dataset.act === 'next-stage') void startLesson('scramble', s.lesson.stage! + 1);
  else if (b.dataset.act === 'resume') void startLesson('here', s.lesson.stage);
  else if (b.dataset.act === 'end') {
    solution = null;
    playing = false;
    renderSolution();
  }
  else if (b.dataset.act === 'undo') undoStray();
  else if (b.dataset.act === 'case') void practiseCase(b.dataset.case!);
}

/** A guided solve step's case, if the method's course has it: its picture, and a way to practise it. */
function caseLink(id?: string) {
  const ref = id ? findCase(id) : null;
  if (!ref) return '';
  const { stage, group, c } = caseIn(ref);
  return `<button class="case-link" data-act="case" data-case="${id}">${diagram(stage, c)}<span class="case-link-text"><b>${caseName(c)}</b><small>${stage.name} · ${group.name}</small><span class="case-link-go">Practise this case ›</span></span></button>`;
}

/** the method's case with this id, if its course has it */
function findCase(id: string): CaseRef | null {
  const stages = currentMethod()?.stages ?? [];
  for (let stage = 0; stage < stages.length; stage++) {
    const groups = stages[stage].caseGroups ?? [];
    for (let group = 0; group < groups.length; group++) {
      const index = groups[group].cases.findIndex((c) => c.id === id);
      if (index >= 0) return { stage, group, index };
    }
  }
  return null;
}

/** Open a guided solve step's case to practise, on the cases cube; the guided solve waits where it is. */
async function practiseCase(id: string) {
  const ref = findCase(id);
  if (ref) await openCase(ref);
}

// ---------- the course ----------

/** the puzzle, method, stage and cube colors the course was drawn for */
let tutRendered = '';

const sameCase = (a: CaseRef, b: CaseRef) => a.stage === b.stage && a.group === b.group && a.index === b.index;
/** the case a card on screen shows */
const cardRef = (el: HTMLElement): CaseRef => ({ stage: stageIdx, group: Number(el.dataset.group), index: Number(el.dataset.index) });

/** a case's picture, drawn as the 3D view draws the puzzle */
const diagram = (stage: Stage, c: Case) => snapshot(puzzle, c.setup, stage.view ?? 'corner', stage.arrows?.(c));

/** Show a stage of the course; `scroll` brings its start into view on a phone. */
function setStage(k: number, scroll = true) {
  stageIdx = k;
  try { localStorage.setItem(stageKey(), String(k)); } catch { /* storage unavailable */ }
  renderCourse();
  // on a phone the page scrolls, not the panel: bring the new step's start up under the stepper
  if (scroll && phone()) {
    const top = $('#tut-steps').getBoundingClientRect();
    const intro = $('#tut-intro').getBoundingClientRect();
    if (intro.top < top.bottom || intro.top > innerHeight) scrollBy({ top: intro.top - top.bottom - 12 });
  }
}

/** how far into each case you got this session, so coming back to one resumes it */
const caseProgress = new Map<string, number>();
const caseKey = (r: CaseRef) => `${puzzle.id}:${currentMethod()?.id}:${r.stage}:${r.group}:${r.index}`;

/** Set a case up on the cases cube, ready to play its algorithm. */
async function openCase(ref: CaseRef, resume = false) {
  const method = currentMethod();
  const c = method?.stages[ref.stage].caseGroups?.[ref.group].cases[ref.index];
  if (!c) return;
  await go('learn', 'cases');
  queue.length = 0;
  await idle();
  if (place !== 'learn' || practiceKind !== 'cases' || currentMethod() !== method) return;
  const k = resume ? caseProgress.get(caseKey(ref)) ?? 0 : 0;
  setStateDirect(c.moves.slice(0, k).reduce(applyMove, c.setup), false);
  playing = false;
  solution = { start: c.setup.slice(), moves: c.moves.slice(), index: k, optimal: false, searching: false, elapsed: 0, stale: false, drill: ref };
  if (stageIdx !== ref.stage) setStage(ref.stage, false);
  renderSolution(true);
  // on a phone, keep the tapped card in view below the pinned cube
  if (phone()) {
    document.querySelector(`#tut-groups .case[data-group="${ref.group}"][data-index="${ref.index}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/** Learn's left panel: the method, its stages, and the stage on screen with its cases if it has any. */
function renderCourse() {
  const method = currentMethod()!;
  stageIdx = Math.min(stageIdx, method.stages.length - 1);
  const stage = method.stages[stageIdx];
  renderMethods();
  // practising a case with a guided solve put aside: the way back to it
  const g = practiceKind === 'cases' ? guidedLesson() : null;
  const back = $('#btn-back-lesson');
  back.classList.toggle('hidden', !g?.lesson);
  if (g?.lesson) {
    const k = currentStep(g);
    back.textContent = k < g.lesson.steps.length ? `‹ Back to your guided solve, step ${k + 1} of ${g.lesson.steps.length}` : '‹ Back to your guided solve';
  }
  renderStepper();
  const key = `${puzzle.id}:${method.id}:${stageIdx}:${cubeKind()}`;
  if (tutRendered === key) return;
  tutRendered = key;
  const html = stage.html ?? `<p>${stage.goal}</p>`;
  // a long explanation shows just its first paragraph on a phone, with a button for the rest
  const long = (html.match(/<p[ >]/g) ?? []).length > 1;
  $('#tut-intro').innerHTML = `<div class="lesson-title">${stage.html ? stage.goal : stage.name}</div><div class="lesson-text${long ? ' collapsible' : ''}">${markCode(html, method.triggers)}</div>` +
    (long ? '<button class="link more" data-act="more" aria-expanded="false">Show more</button>' : '') +
    (method.solve ? `<button class="btn small primary-soft practise-stage" data-act="practise-stage"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Practise ${stage.name} on a scramble</button>` : '') +
    // the notation is explained once, on the first stage
    (stageIdx > 0 ? '' : notationHelp(method.notation));
  const groups = stage.caseGroups;
  $('#tut-groups').innerHTML = !groups ? `<p class="no-cases muted small">Guided solve only — cases coming. ${method.solve ? `Practise ${stage.name} on a scramble, step by step.` : ''}</p>`
    : groups.map((g, gi) => `
      <section class="tut-group">
        <div class="label-row"><span class="eyebrow">${g.name}</span><span class="muted small">${plural(g.cases.length, 'case')}</span></div>
        ${g.about ? `<p class="muted small">${g.about}</p>` : ''}
        <div class="cases">${g.cases.map((c, i) => `
          <div class="case" data-group="${gi}" data-index="${i}">
            <button class="case-hit" title="Set up ${c.name}" aria-label="Set up ${c.name}"></button>
            ${diagram(stage, c)}<span class="case-name">${caseName(c)}</span>${c.note ? `<span class="case-note">${c.note}</span>` : ''}<code class="case-alg">${movesHtml(c.moves, method.triggers, c.breakAfter)}</code>${drillControlsHtml()}
          </div>`).join('')}</div>
      </section>`).join('');
  const prev = method.stages[stageIdx - 1], next = method.stages[stageIdx + 1];
  $('#tut-nav').innerHTML =
    (prev ? `<button class="btn small ghost" data-step="${stageIdx - 1}"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>${prev.name}</button>` : '<span></span>') +
    (next ? `<button class="btn small primary-soft" data-step="${stageIdx + 1}">Next: ${next.name}<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>` : '');
  $('#tutorial').scrollTop = 0;
  renderDrilling();
}

/** The method's stages, ‹ one › after another, with the one on screen marked. */
function renderStepper() {
  setHtml($('#tut-steps'), stepperHtml(currentMethod()!.stages, stageIdx));
}

/** The method picker, or the method's name when there's no choice. */
function renderMethods() {
  const method = currentMethod()!;
  const methods = puzzle.methods!;
  $('#methods').classList.toggle('single', methods.length < 2);
  setHtml($('#methods'), methods.length < 2 ? `<span class="method-name">${method.name}</span>` : methods.map((m) =>
    `<button role="tab" data-method="${m.id}" class="${m === method ? 'active' : ''}" aria-selected="${m === method}" title="${m.name} · ${m.level}">${m.short}</button>`).join(''));
}

/** The open case, big. */
function renderCaseCard() {
  const el = $('#case-card');
  const ref = solution!.drill!;
  const { stage, group, c } = caseIn(ref);
  el.innerHTML = `
    <div class="lesson-head"><span class="eyebrow">${stage.name} · ${group.name}</span><span class="step">${ref.index + 1} of ${group.cases.length}</span></div>
    <div class="lesson-title">${caseName(c)}</div>
    <div class="case-big">${diagram(stage, c)}</div>
    ${solution!.stale ? offPlanHtml('it no longer shows this case', solution!.drift ? undoLabel() : null, { act: 'reset', label: 'set it up again' }) : ''}
    <div class="lesson-foot"><button class="link" data-act="close">Close the case</button></div>`;
  renderDrilling();
}

function onCaseCardClick(e: Event) {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  const ref = solution?.drill;
  if (b?.dataset.act === 'undo') undoStray();
  else if (b?.dataset.act === 'reset' && ref) void openCase(ref, true);
  else if (b?.dataset.act === 'close') {
    solution = null;
    playing = false;
    renderSolution();
  }
}

let lastCardTap = -1e9;
/** whether you've stepped a case by tapping its card, so the how-to hint has done its job */
let tapLearned = false;
try { tapLearned = localStorage.getItem('tapLearned') === '1'; } catch { /* storage unavailable */ }
// practised-case ticks are gone: forget the ones earlier versions kept
try { for (const p of PUZZLES) localStorage.removeItem(`practised:${p.id}`); } catch { /* storage unavailable */ }
function onCourseClick(e: Event) {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!b) return;
  if (b.dataset.act === 'more') {
    const open = $('#tut-intro .collapsible').classList.toggle('open');
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? 'Show less' : 'Show more';
  } else if (b.dataset.act === 'practise-stage') void startLesson('scramble', stageIdx);
  else if (b.dataset.step) setStage(Number(b.dataset.step));
  else if (b.dataset.method) setMethod(b.dataset.method);
  else if (b === $('#btn-back-lesson')) void go('learn', 'guided');
  else if (b.closest('.case')) {
    const ref = cardRef(b.closest<HTMLElement>('.case')!);
    const s = solution;
    const ctl = b.dataset.ctl;
    if (ctl === 'undo') return undoStray();
    // on a phone the open case's card is the controller: tap it for the next move, tap a move to go back to it
    if (phone() && s?.drill && sameCase(s.drill, ref) && !s.stale) {
      // a second tap within a moment is a bounce, not a wish for two moves
      if (!ctl && e.timeStamp - lastCardTap < 250) return;
      lastCardTap = e.timeStamp;
      if (ctl === 'back') stepBack();
      // at the start ▶ plays the moves (tap again to pause); once begun, ↻ goes back to the start
      else if (ctl === 'play') {
        if (!playing && s.index > 0) jumpTo(0);
        else togglePlay();
      }
      else if (s.index < s.moves.length) {
        if (!tapLearned) {
          tapLearned = true;
          try { localStorage.setItem('tapLearned', '1'); } catch { /* storage unavailable */ }
        }
        navigator.vibrate?.(8); // a tick per move, where the phone can (not iOS)
        playing = false; stepForward(); renderPlayback();
      }
      else void openCase(ref);
    } else void openCase(ref, true);
  }
}

/** Keep the current move in view by scrolling the chip list only, never the panel around it. */
function followCurrentChip() {
  const chips = $('#chips');
  // past the last move there's no current one: follow the last played
  const cur = chips.querySelector<HTMLElement>('.current') ?? [...chips.querySelectorAll<HTMLElement>('.done')].pop();
  if (!cur) return;
  const pad = 6;
  if (cur.offsetTop - pad < chips.scrollTop) chips.scrollTo({ top: cur.offsetTop - pad, behavior: 'smooth' });
  else if (cur.offsetTop + cur.offsetHeight + pad > chips.scrollTop + chips.clientHeight) {
    chips.scrollTo({ top: cur.offsetTop + cur.offsetHeight + pad - chips.clientHeight, behavior: 'smooth' });
  }
}

// ---------- chrome ----------

type ToastAction = { label: string; run: () => void };

/** A short message; with an action (Undo), a button for it, and a little longer to reach it. */
function toast(message: string, kind: '' | 'good' | 'bad' = '', action?: ToastAction) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  if (action) {
    // only the newest change can be undone from a toast
    $('#toasts').querySelectorAll('.has-action').forEach((t) => t.remove());
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.run();
      el.remove();
    });
    el.classList.add('has-action');
    el.append(b);
  }
  const box = $('#toasts');
  box.append(el);
  while (box.children.length > 3) box.firstElementChild!.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, action ? 5000 : 2600);
}

let hintFaded = false;
function fadeHint() {
  if (hintFaded) return;
  hintFaded = true;
  setTimeout(() => $('#stage-hint').classList.add('fade'), 1500);
}

function celebrate() {
  view.celebrateSolve();
  toast('Solved! 🎉', 'good');
}

let urlTimer = 0;
function saveToUrl() {
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => {
    // your cube, never one of Learn's
    const code = puzzle.encode(sessions.get(puzzle.id)!.state);
    const solvedHome = code === puzzle.encode(puzzle.solved());
    const hash = solvedHome ? (puzzle === cube3 ? '' : `#${puzzle.id}`) : `#${puzzle.id}:${code}`;
    window.history.replaceState(null, '', location.pathname + location.search + hash);
    // and kept for next time, for a link without the cube in it
    try { localStorage.setItem(`cube:${puzzle.id}`, code); } catch { /* storage unavailable */ }
  }, 200);
}

/** `#pyra:GGG…`, `#3x3:UUU…`, `#5x5:UUU…`, `#pyra`, or a bare 54-letter cube (older links). */
function loadFromUrl(): { puzzle: Puzzle; loaded: boolean } | null {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw) return null;
  const [id, data] = raw.includes(':') ? raw.split(':') : PUZZLES.some((p) => p.id === raw) ? [raw, ''] : ['3x3', raw];
  const p = PUZZLES.find((x) => x.id === id);
  if (!p) return null;
  const s = data ? p.decode(data) : null;
  if (s) sessions.get(p.id)!.state = s;
  return { puzzle: p, loaded: !!s };
}

// ---------- wiring ----------

function bind() {
  for (const p of PUZZLES) {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.dataset.puzzle = p.id;
    b.innerHTML = `<svg viewBox="0 0 24 24">${p.icon}</svg>`;
    b.append(p.name);
    b.addEventListener('click', () => void switchPuzzle(p));
    $('.puzzle-switch').append(b);
    $('#puzzle-select').append(new Option(p.name, p.id));
  }
  // on a phone the puzzles are a dropdown
  const select = $('#puzzle-select') as HTMLSelectElement;
  select.addEventListener('change', () => void switchPuzzle(PUZZLES.find((p) => p.id === select.value)!));
  $('#btn-scan').addEventListener('click', () => void startScan());
  document.querySelectorAll<HTMLButtonElement>('#mode-seg button').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode as Mode)),
  );
  document.querySelectorAll<HTMLButtonElement>('#map-switch button').forEach((b) =>
    b.addEventListener('click', () => setMapKind(b.dataset.map as MapKind)),
  );
  document.querySelectorAll<HTMLButtonElement>('#cube-kind button').forEach((b) =>
    b.addEventListener('click', () => setCubeKind(b.dataset.kind as CubeKind)),
  );
  $('#btn-scramble').addEventListener('click', () => scramble());
  $('#btn-reset').addEventListener('click', () => {
    toast('Reset to solved', '', setStateDirect(puzzle.solved()));
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-camera').addEventListener('click', () => view.resetCamera());
  // turning the whole cube by dragging isn't possible, and lessons ask for a flip
  $('#btn-flip').addEventListener('click', () => commitUserMove('z2'));
  $('#btn-help').addEventListener('click', () => ($('#help') as HTMLDialogElement).showModal());
  const showAbout = () => ($('#about') as HTMLDialogElement).showModal();
  $('#btn-about').addEventListener('click', showAbout);
  $('#lesson-intro').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-about]')) showAbout();
  });
  $('#btn-share').addEventListener('click', async () => {
    saveToUrl();
    await new Promise((r) => setTimeout(r, 220));
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Link copied — it opens this exact puzzle', 'good');
    } catch {
      toast('Copy the URL from the address bar to share');
    }
  });
  $('#btn-more-moves').addEventListener('click', () => {
    const ex = $('#movepad-extra');
    ex.classList.toggle('hidden');
    $('#btn-more-moves').textContent = ex.classList.contains('hidden') ? puzzle.movePadExtraLabel ?? '' : 'Hide extras';
  });
  $('#btn-clear').addEventListener('click', () => {
    const undo = setStateDirect(session.state.map((c, i) => (puzzle.lockedSticker?.(i) ? c : puzzle.unset)));
    paintColor = puzzle.paletteOrder[0];
    renderPalette();
    toast('Cleared every sticker', '', undo);
  });
  $('#btn-solved').addEventListener('click', () => {
    toast('Filled in solved', '', setStateDirect(puzzle.solved()));
  });

  const algForm = $('#alg-form') as HTMLFormElement;
  const algInput = $('#alg-input') as HTMLInputElement;
  algForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const { moves, invalid } = puzzle.parseAlg(algInput.value);
    if (invalid.length) {
      $('#alg-error').textContent = `Didn't understand: ${invalid.join(', ')}`;
      return;
    }
    $('#alg-error').textContent = '';
    if (!moves.length) return;
    doMoves(moves);
    algInput.value = '';
    algInput.blur();
  });
  algInput.addEventListener('input', () => ($('#alg-error').textContent = ''));

  $('#btn-solve').addEventListener('click', () => {
    if (mode === 'paint' && puzzle.validate(session.state).ok) setMode('play');
    void startSolve();
  });
  document.querySelectorAll<HTMLButtonElement>('#places button').forEach((b) =>
    b.addEventListener('click', () => void go(b.dataset.place as Place)),
  );
  $('#btn-learn-mine').addEventListener('click', () => void startLesson('mine'));
  $('#lesson-intro').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-act="mine"]')) void startLesson('mine');
  });
  $('#lesson').addEventListener('click', onLessonClick);
  $('#tutorial').addEventListener('click', onCourseClick);
  $('#case-card').addEventListener('click', onCaseCardClick);
  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-next').addEventListener('click', () => { playing = false; stepForward(); renderPlayback(); });
  $('#btn-prev').addEventListener('click', stepBack);
  $('#btn-first').addEventListener('click', () => jumpTo(0));
  $('#btn-last').addEventListener('click', () => solution && jumpTo(solution.moves.length));
  $('#btn-copy').addEventListener('click', async () => {
    if (!solution) return;
    try {
      await navigator.clipboard.writeText(solution.moves.join(' '));
      toast('Solution copied', 'good');
    } catch {
      toast('Clipboard unavailable', 'bad');
    }
  });
  const speedInput = $('#speed') as HTMLInputElement;
  const applySpeed = () => {
    speed = SPEEDS[Number(speedInput.value)];
    $('#speed-label').textContent = `${speed}×`;
  };
  speedInput.addEventListener('input', applySpeed);
  applySpeed();

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') return;
    if (document.querySelector('dialog[open]') || scanner.isOpen) return;
    const k = e.key;
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (e.metaKey || e.ctrlKey) return;
    if (k === ' ' && target.tagName !== 'BUTTON') { e.preventDefault(); togglePlay(); return; }
    if (k === 'ArrowRight') { e.preventDefault(); playing = false; stepForward(); renderPlayback(); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); stepBack(); return; }
    if (k === 'Home') { jumpTo(0); return; }
    if (k === 'End') { if (solution) jumpTo(solution.moves.length); return; }
    if (k === 'Enter' && target.tagName !== 'BUTTON') { void startSolve(); return; }
    if (k === '?') { ($('#help') as HTMLDialogElement).showModal(); return; }
    // painting is for your own cube, in Cube
    if (e.code === 'KeyP' && !e.altKey) { if (place === 'cube') setMode(mode === 'paint' ? 'play' : 'paint'); return; }
    if (e.code === 'KeyV' && !e.altKey) { view.resetCamera(); return; }
    if (mode === 'paint' && /^Digit[1-9]$/.test(e.code)) {
      const c = puzzle.paletteOrder[Number(e.code.slice(5)) - 1];
      if (c !== undefined) { paintColor = c; renderPalette(); }
      return;
    }
    if (mode === 'play') {
      const move = puzzle.keyToMove(e.code, e.shiftKey, e.altKey);
      if (move) {
        e.preventDefault();
        commitUserMove(move);
      }
    }
  });
}

// ---------- boot ----------

// your cubes as you left them, unless the link brings one
for (const p of PUZZLES) {
  try {
    const saved = localStorage.getItem(`cube:${p.id}`);
    const s = saved ? p.decode(saved) : null;
    if (s) sessions.get(p.id)!.state = s;
  } catch { /* storage unavailable */ }
}
const fromUrl = loadFromUrl();
let initial: Puzzle = cube3;
if (fromUrl) initial = fromUrl.puzzle;
else {
  try {
    initial = PUZZLES.find((p) => p.id === localStorage.getItem('puzzle')) ?? cube3;
  } catch { /* storage unavailable */ }
}
try { if (localStorage.getItem('cubeKind') === 'bright') useCubeColors('bright'); } catch { /* storage unavailable */ }
bind();
puzzle = initial === cube3 ? pyraminx : cube3; // force switchPuzzle to run
void switchPuzzle(initial).then(() => {
  // a link brings a cube to look at; otherwise come back to where you were, so a returning learner is back in Learn
  if (fromUrl?.loaded) {
    const v = puzzle.validate(session.state);
    toast(v.ok ? 'Loaded puzzle from link' : 'Loaded puzzle from link — ' + v.message);
    if (!v.ok) setMode('paint');
    return;
  }
  try {
    // from before Learn took in the Tutorial: the Learn and Tutorial tabs
    const old = localStorage.getItem('tab');
    const to = localStorage.getItem('place') ?? (old === 'learn' || old === 'tutorial' ? 'learn' : 'cube');
    const k = localStorage.getItem('practice') ?? (old === 'tutorial' ? 'cases' : 'guided');
    if (to === 'learn') void go('learn', k === 'cases' ? 'cases' : 'guided');
  } catch { /* storage unavailable */ }
});
