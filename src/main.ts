import './style.css';
import { cubeKind, useCubeColors, type CubeKind } from './core/colors';
import type { Guide, GuideStep, Puzzle, State, TutorialCase, TutorialStep, Validation } from './core/types';
import { cube2, cube3, cube4, cube5 } from './cube/puzzles';
import { countMoves, stepMoves } from './cube/lessonKit';
import { pyraminx } from './pyraminx/puzzle';
import { Mode, PuzzleView } from './view/PuzzleView';
import { NetView } from './view/net';
import { RingView } from './view/rings';
import { Scanner } from './view/scanner';
import { snapshot } from './view/snapshot';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const PUZZLES: Puzzle[] = [cube2, cube3, cube4, cube5, pyraminx];

// ---------- state ----------

/** Each puzzle keeps its own state and history, so switching back and forth loses nothing. */
interface Session {
  state: State;
  moveHistory: string[];
  redoStack: string[];
}
const sessions = new Map<string, Session>(PUZZLES.map((p) => [p.id, { state: p.solved(), moveHistory: [], redoStack: [] }]));

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
  /** a lesson: the method, its moves explained step by step, and the move each step starts at */
  lesson?: { guide: Guide; steps: GuideStep[]; starts: number[] };
  /** a tutorial case: which one */
  tutorial?: CaseRef;
}
/** a tutorial case, by its step, group and place in the group */
interface CaseRef { step: number; group: number; index: number }
let solution: Solution | null = null;
let playing = false;
/** where playback last started: a lesson pauses at the end of each step */
let playFrom = 0;

/** the right panel solves the puzzle outright, teaches how (puzzles with guides), or shows every case of a method (puzzles with a tutorial) */
type Tab = 'solve' | 'learn' | 'tutorial';
let tab: Tab = 'solve';
/** the method the Learn tab teaches, by guide id */
let methodId = '';
try { methodId = localStorage.getItem('method') ?? ''; } catch { /* storage unavailable */ }
const currentGuide = () => puzzle.guides?.find((g) => g.id === methodId) ?? puzzle.guides?.[0];
/** the tutorial step on screen */
let tutStep = 0;
try { tutStep = Number(localStorage.getItem('tutorialStep')) || 0; } catch { /* storage unavailable */ }

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
  canDragTurn: () => queue.length === 0 && !running,
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
    maps.forEach((m) => m.animateTurn(turn, next, job.duration * hurry));
    await view.animateTurn(turn, next, job.duration * hurry);
    const wasSolved = puzzle.isSolved(session.state);
    session.state = next;
    onStateChanged();
    if (!wasSolved && puzzle.isSolved(session.state) && queue.length === 0 && job.kind === 'user') celebrate();
  }
  running = false;
  if (solution && playing) scheduleNextPlayback();
  if (pendingSolve) { pendingSolve = false; void startSolve(); }
}

const idle = () => new Promise<void>((resolve) => {
  const check = () => (!running && queue.length === 0 ? resolve() : setTimeout(check, 30));
  check();
});

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
  } else invalidateSolution();
}

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

function setStateDirect(s: State) {
  queue.length = 0;
  session.state = s.slice();
  view.setState(session.state);
  session.moveHistory.length = 0;
  session.redoStack.length = 0;
  invalidateSolution(true);
  renderHistory();
  onStateChanged();
}

function scramble() {
  if (mode === 'paint') setMode('play');
  const moves = puzzle.scramble();
  session.moveHistory.length = 0;
  session.redoStack.length = 0;
  invalidateSolution(true);
  for (const m of moves) {
    session.moveHistory.push(m);
    enqueue({ move: m, duration: 110, kind: 'user' });
  }
  renderHistory();
  toast(`Scrambled: ${moves.join(' ')}`);
  fadeHint();
}

// ---------- switching puzzles ----------

async function switchPuzzle(p: Puzzle) {
  if (p === puzzle) return;
  queue.length = 0;
  await idle();
  invalidateSolution(true);
  puzzle.cancelSolve();
  puzzle = p;
  session = sessions.get(p.id)!;
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
  session.state = session.state.slice();
  session.state[i] = paintColor;
  session.moveHistory.length = 0;
  session.redoStack.length = 0;
  invalidateSolution(true);
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
    : 'Drag a face to turn it · Drag the background to orbit';
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
  if (tab === 'learn' && currentGuide()) return startLesson();
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
function showInvalid(v: Validation & { ok: false }, prefix = '') {
  const bad = v.stickers;
  if (bad) {
    view.setHighlight(bad);
    view.flashHighlight();
    maps.forEach((m) => m.flash(bad));
  }
  toast(prefix + (v.kind === 'incomplete' ? `Almost there — ${v.message}` : v.message), 'bad');
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
  tutRendered = '';
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
  setStateDirect(state);
  const v = puzzle.validate(session.state);
  if (!v.ok) {
    showInvalid(v, 'Scanned, but some colors need fixing: ');
    return;
  }
  setMode('play');
  if (puzzle.isSolved(session.state)) toast('Scanned — your cube is already solved', 'good');
  else toast('Scanned — hit Solve to find the way home', 'good');
}

/** Walk through solving the puzzle as it is now (scrambling it first if it's solved). */
async function startLesson() {
  const guide = currentGuide()!;
  if (!checkValid()) return;
  if (puzzle.isSolved(session.state)) {
    const forPuzzle = puzzle;
    scramble();
    await idle();
    // the puzzle or tab may have changed while it scrambled
    if (puzzle !== forPuzzle || tab !== 'learn' || currentGuide() !== guide) return;
  }
  let steps: GuideStep[];
  try {
    steps = guide.steps(session.state);
  } catch {
    toast('Couldn’t build a lesson for this cube', 'bad');
    return;
  }
  const { moves, starts } = flattenLesson(steps);
  playing = false;
  solution = {
    start: session.state.slice(),
    moves,
    index: 0, optimal: false, searching: false, elapsed: 0, stale: false,
    lesson: { guide, steps, starts },
  };
  renderSolution(true);
}

function setTab(t: Tab) {
  if (t === tab) return;
  // a tutorial case blanks the stickers that don't matter yet; don't leave them behind
  const blanked = tab === 'tutorial' && session.state.includes(puzzle.unset);
  tab = t;
  if (blanked) setStateDirect(puzzle.solved());
  invalidateSolution(true);
  renderSolution();
}

function setMethod(id: string) {
  if (id === currentGuide()?.id) return;
  methodId = id;
  try { localStorage.setItem('method', id); } catch { /* storage unavailable */ }
  invalidateSolution(true);
  renderSolution();
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
  if (solution && !solution.stale) renderPlayback();
  // the lesson button's subtitle says whether it will scramble first
  else if (!solution && tab === 'learn') renderSolution();
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
  ($('#btn-undo') as HTMLButtonElement).disabled = session.moveHistory.length === 0;
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

function renderSolution(fresh = false) {
  const el = $('#solution');
  if (tab === 'tutorial' && !puzzle.tutorial) tab = 'solve';
  const learn = tab === 'learn' && !!currentGuide();
  const tut = tab === 'tutorial';
  el.classList.toggle('learn', learn);
  el.classList.toggle('tutorial', tut);
  document.body.classList.toggle('tutorial', tut);
  $('#btn-solve').classList.toggle('hidden', tut);
  el.classList.toggle('empty', !solution);
  el.classList.toggle('stale', !!solution?.stale);
  renderTabs();
  if (!(solution?.lesson || solution?.tutorial) || solution.stale) view.setFocus(null);
  renderDrilling();
  if (learn) {
    renderLearn();
    return;
  }
  if (tut) {
    renderTutorial(fresh);
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
}

/** The solution's moves as chips; clicking one jumps to after it. */
function renderChips(fresh: boolean) {
  const s = solution!;
  const chips = $('#chips');
  const runs = s.tutorial ? triggerRuns(s.moves) : [];
  chips.replaceChildren();
  s.moves.forEach((m, i) => {
    const c = document.createElement('button');
    c.className = 'chip';
    // in the tutorial, chips of a trigger (the sexy move) are marked, each run on its own
    if (runs[i]) c.classList.add('trig', runs[i] % 2 ? 'odd' : 'even');
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
    renderStages();
  } else {
    const focus = s.tutorial && puzzle.tutorial?.steps[s.tutorial.step].focus;
    if (focus) view.setFocus(s.stale ? null : focus(session.state));
    followCurrentChip();
  }
  renderDrilling();
}

const phone = () => matchMedia('(max-width: 860px)').matches;

/** The open tutorial case's card shows where its algorithm is: played moves fade, the next one stands out. */
function renderDrilling() {
  const s = solution;
  const on = tab === 'tutorial' && !!s?.tutorial;
  document.body.classList.toggle('drilling', on);
  keepAwake(on);
  document.querySelectorAll<HTMLElement>('#tut-groups .case').forEach((card) => {
    const open = on && !!s && s.tutorial!.step === tutStep && sameCase(s.tutorial!, { step: tutStep, group: Number(card.dataset.group), index: Number(card.dataset.index) });
    card.querySelectorAll<HTMLElement>('.mv').forEach((m) => {
      const i = Number(m.dataset.mv);
      m.classList.toggle('done', open && !s!.stale && i < s!.index);
      m.classList.toggle('next', open && !s!.stale && i === s!.index);
    });
    card.classList.toggle('playing', open && playing);
    card.querySelector<HTMLElement>('.case-back')?.classList.toggle('off', !open || !!s!.stale || s!.index === 0);
  });
}

/** Keep a phone's screen on while a case is open: both hands are on the real cube. */
let wakeLock: { release: () => Promise<void> } | null = null;
let wantAwake = false;
function keepAwake(on: boolean) {
  wantAwake = on;
  const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
  if (on && !wakeLock && nav.wakeLock && document.visibilityState === 'visible') {
    nav.wakeLock.request('screen').then((lock) => {
      if (wantAwake) wakeLock = lock;
      else void lock.release();
    }).catch(() => { /* not allowed or unsupported: the screen may sleep */ });
  } else if (!on && wakeLock) {
    void wakeLock.release();
    wakeLock = null;
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

function renderTabs() {
  $('#sol-tabs').classList.toggle('hidden', !puzzle.guides?.length && !puzzle.tutorial);
  document.querySelectorAll<HTMLButtonElement>('#sol-tabs button').forEach((b) => {
    if (b.dataset.tab === 'learn') b.classList.toggle('hidden', !puzzle.guides?.length);
    if (b.dataset.tab === 'tutorial') b.classList.toggle('hidden', !puzzle.tutorial);
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
}

/** The step whose moves come next, or the number of steps once the lesson is done. */
function currentStep(s: Solution) {
  const { starts } = s.lesson!;
  return s.index >= s.moves.length ? starts.length : stepAt(starts, s.index);
}

/** the step the lesson card shows */
let lessonStep = -1;

function renderLearn() {
  const guide = currentGuide()!;
  const solved = puzzle.isSolved(session.state);
  $('#methods').innerHTML = puzzle.guides!.map((g) =>
    `<button role="tab" data-method="${g.id}" class="${g === guide ? 'active' : ''}" aria-selected="${g === guide}">${g.short}</button>`).join('');
  $('.solve-label').textContent = solution ? 'Restart lesson' : 'Start lesson';
  $('#solve-sub').textContent = solved ? 'Scrambles it first, then teaches'
    : solution ? 'From the cube as it is now' : 'Walks you through solving this cube';
  $('#lesson-intro').innerHTML = `
    <p><b>${guide.name}.</b> ${guide.intro}</p>
    <p class="muted small">Moves use standard notation: ${puzzle.notationHtml}${guide.notation ? ' ' + guide.notation : ''}</p>
    <p class="muted small">Make the moves yourself, here or on a real cube, and the lesson follows along.</p>`;
  if (solution?.lesson) {
    renderLesson();
    renderPlayback();
  } else renderStages();
}

function renderLesson() {
  const s = solution!;
  const { steps, starts } = s.lesson!;
  const k = currentStep(s);
  lessonStep = k;
  const stale = s.stale
    ? `<div class="lesson-stale">You turned the cube, so this lesson no longer fits it. <button class="link" data-act="resume">Continue from here</button></div>`
    : '';
  if (k >= steps.length) {
    $('#lesson').innerHTML = stale + `
      <div class="lesson-title">Solved!</div>
      <div class="lesson-text"><p>That’s the whole method: ${steps.length} steps and ${s.moves.length} moves. Every lesson starts from your own scramble, so practise until the algorithms stick.</p></div>
      <div class="lesson-nav"><button class="btn small ghost" data-act="prev"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>Previous step</button><button class="btn small primary-soft" data-act="again">Practise again</button></div>`;
    return;
  }
  const step = steps[k];
  let i = starts[k];
  const phrases = step.phrases.map((p) => `
    <div class="phrase">
      <span class="phrase-label">${p.label}</span>
      <div class="phrase-moves">${p.moves.map((m) => `<button class="chip" data-i="${i}" title="Jump to after this move">${m}<sub>${++i - starts[k]}</sub></button>`).join('')}</div>
    </div>`).join('');
  $('#lesson').innerHTML = stale + `
    <div class="lesson-head"><span class="eyebrow">${s.lesson!.guide.stages[step.stage].name}</span><span class="step">Step ${k + 1} of ${steps.length}</span></div>
    <div class="lesson-title">${step.title}</div>
    <div class="lesson-text">${step.html}</div>
    <div class="phrases">${phrases}</div>
    <div class="lesson-nav">
      <button class="btn small ghost" data-act="prev"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>Previous step</button>
      <button class="btn small ghost" data-act="next">Next step<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
    </div>`;
}

function renderStages() {
  const lesson = solution?.lesson;
  const guide = lesson?.guide ?? currentGuide()!;
  const k = lesson ? currentStep(solution!) : -1;
  const cur = !lesson ? -1 : k < lesson.steps.length ? lesson.steps[k].stage : guide.stages.length;
  $('#stages').innerHTML = guide.stages.map((st, i) => {
    const has = !lesson || lesson.steps.some((x) => x.stage === i);
    const state = !lesson ? '' : i < cur ? 'done' : i === cur ? 'current' : '';
    return `<li class="${state}${has ? '' : ' skipped'}" data-stage="${i}">
      <span class="num">${state === 'done' ? '✓' : i + 1}</span>
      <span class="stage-text">
        <span class="stage-name">${st.name}${lesson && !has ? '<small>already done</small>' : ''}</span>
        ${!lesson || i === cur ? `<span class="stage-goal">${st.goal}</span>` : ''}
      </span>
    </li>`;
  }).join('');
}

function onLessonClick(e: Event) {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  const s = solution;
  if (!b || !s?.lesson) return;
  const { starts } = s.lesson;
  const k = currentStep(s);
  if (b.dataset.i) jumpTo(Number(b.dataset.i) + 1);
  else if (b.dataset.act === 'prev') jumpTo(starts[s.index > (starts[k] ?? s.moves.length) ? k : k - 1] ?? 0);
  else if (b.dataset.act === 'next') jumpTo(starts[k + 1] ?? s.moves.length);
  else if (b.dataset.act === 'resume' || b.dataset.act === 'again') void startSolve();
}

function onStageClick(e: Event) {
  const li = (e.target as HTMLElement).closest<HTMLElement>('li');
  const lesson = solution?.lesson;
  if (!li || !lesson) return;
  const k = lesson.steps.findIndex((x) => x.stage === Number(li.dataset.stage));
  if (k >= 0) jumpTo(lesson.starts[k]);
}

// ---------- tutorial ----------

/** the step and cube colors the case pictures were drawn for */
let tutRendered = '';

const sameCase = (a: CaseRef, b: CaseRef) => a.step === b.step && a.group === b.group && a.index === b.index;

/**
 * For each move, the trigger run it belongs to (counted from 1), or 0: the tutorial's
 * triggers found in `moves`, left to right, without overlaps.
 */
function triggerRuns(moves: string[]) {
  const runs = moves.map(() => 0);
  let run = 0;
  for (let i = 0; i < moves.length;) {
    const t = puzzle.tutorial?.triggers?.find((tr) => tr.moves.every((m, k) => moves[i + k] === m));
    if (!t) { i++; continue; }
    run++;
    for (let k = 0; k < t.moves.length; k++) runs[i + k] = run;
    i += t.moves.length;
  }
  return runs;
}

/** Moves as text, with each trigger run marked. */
function movesHtml(moves: string[], breakAfter?: number) {
  const runs = triggerRuns(moves);
  return moves.map((m, i) => {
    const open = runs[i] && runs[i] !== runs[i - 1] ? '<span class="trig">' : '';
    const close = runs[i] && runs[i] !== runs[i + 1] ? '</span>' : '';
    return (i === breakAfter ? '<br>' : i ? ' ' : '') + open + `<span class="mv" data-mv="${i}">${m}</span>` + close;
  }).join('');
}

/** HTML with the moves inside each <code> marked where they hold a trigger. */
const markCode = (html: string) => html.replace(/<code>([^<]*)<\/code>/g, (_, text: string) => `<code>${movesHtml(text.split(' ').filter(Boolean))}</code>`);

/** a case's picture, drawn as the 3D view draws the puzzle */
const diagram = (step: TutorialStep, c: TutorialCase) => snapshot(puzzle, c.setup, step.view, step.arrows?.(c));

function setTutorialStep(k: number) {
  tutStep = k;
  try { localStorage.setItem('tutorialStep', String(k)); } catch { /* storage unavailable */ }
  renderSolution();
}

/** Set a case up on the cube, ready to play its algorithm. */
async function openCase(ref: CaseRef) {
  const T = puzzle.tutorial;
  if (!T) return;
  const c = T.steps[ref.step].groups[ref.group].cases[ref.index];
  if (mode === 'paint') setMode('play');
  queue.length = 0;
  await idle();
  if (tab !== 'tutorial' || puzzle.tutorial !== T) return;
  setStateDirect(c.setup);
  playing = false;
  solution = { start: c.setup.slice(), moves: c.moves.slice(), index: 0, optimal: false, searching: false, elapsed: 0, stale: false, tutorial: ref };
  tutStep = ref.step;
  renderSolution(true);
  // on a phone, keep the tapped card in view below the pinned cube
  if (phone()) {
    document.querySelector(`#tut-groups .case[data-group="${ref.group}"][data-index="${ref.index}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function renderTutorial(fresh: boolean) {
  const T = puzzle.tutorial!;
  tutStep = Math.min(tutStep, T.steps.length - 1);
  const step = T.steps[tutStep];
  const open = solution?.tutorial;
  const key = `${tutStep}:${cubeKind()}`;
  if (tutRendered !== key) {
    tutRendered = key;
    $('#tut-steps').innerHTML = T.steps.map((st, i) =>
      `<button role="tab" data-step="${i}" class="${i === tutStep ? 'active' : ''}" aria-selected="${i === tutStep}"><span class="num">${i + 1}</span>${st.name}</button>`).join('');
    // a long explanation shows just its first paragraph on a phone, with a button for the rest
    const long = (step.html.match(/<p[ >]/g) ?? []).length > 1;
    $('#tut-intro').innerHTML = `<div class="lesson-title">${step.goal}</div><div class="lesson-text${long ? ' collapsible' : ''}">${markCode(step.html)}</div>` +
      (long ? '<button class="link more" data-act="more" aria-expanded="false">Show more</button>' : '');
    $('#tut-groups').innerHTML = step.groups.map((g, gi) => `
      <section class="tut-group">
        <div class="label-row"><span class="eyebrow">${g.name}</span><span class="muted small">${g.cases.length}</span></div>
        ${g.about ? `<p class="muted small">${g.about}</p>` : ''}
        <div class="cases">${g.cases.map((c, i) => `
          <button class="case" data-group="${gi}" data-index="${i}" title="Set up ${c.name} on the cube">
            ${diagram(step, c)}<span class="case-name">${c.name}</span>${c.note ? `<span class="case-note">${c.note}</span>` : ''}<code class="case-alg">${movesHtml(c.moves, c.breakAfter)}</code><span class="case-ctl"><span class="case-back" data-ctl="back" role="button" aria-label="Previous move"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></span><span class="case-play" data-ctl="play" role="button" aria-label="Play all moves"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg></span></span>
          </button>`).join('')}</div>
      </section>`).join('');
    const prev = T.steps[tutStep - 1], next = T.steps[tutStep + 1];
    $('#tut-nav').innerHTML =
      (prev ? `<button class="btn small ghost" data-step="${tutStep - 1}"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>${prev.name}</button>` : '<span></span>') +
      (next ? `<button class="btn small primary-soft" data-step="${tutStep + 1}">Next: ${next.name}<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>` : '');
    $('#tutorial').scrollTop = 0;
  }
  document.querySelectorAll<HTMLElement>('#tut-groups .case').forEach((b) => {
    const on = !!open && sameCase(open, { step: tutStep, group: Number(b.dataset.group), index: Number(b.dataset.index) });
    b.classList.toggle('active', on);
  });
  renderCaseCard();
  if (!solution) return;
  $('#sol-count').textContent = String(solution.moves.length);
  $('#sol-meta').innerHTML = '';
  renderChips(fresh);
  renderPlayback();
}

/** The case on the cube, or how to pick one. */
function renderCaseCard() {
  const T = puzzle.tutorial!;
  const el = $('#case-card');
  const notation = `<p class="muted small">Moves use standard notation: ${puzzle.notationHtml}${T.notation ? ' ' + T.notation : ''}</p>`;
  const ref = solution?.tutorial;
  if (!ref) {
    el.innerHTML = `<div class="lesson-title">${T.name} tutorial</div><p class="lesson-text">${T.intro}</p>${notation}`;
    return;
  }
  const step = T.steps[ref.step];
  const group = step.groups[ref.group];
  const c = group.cases[ref.index];
  el.innerHTML = `
    <div class="lesson-head"><span class="eyebrow">${step.name} · ${group.name}</span><span class="step">${ref.index + 1} of ${group.cases.length}</span></div>
    <div class="lesson-title">${c.name}</div>
    <div class="case-big">${diagram(step, c)}</div>
    ${solution!.stale ? '<div class="lesson-stale">You turned the cube, so it no longer shows this case. <button class="link" data-act="reset">Set it up again</button></div>' : ''}`;
}

function onCaseCardClick(e: Event) {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  const ref = solution?.tutorial;
  if (b?.dataset.act === 'reset' && ref) void openCase(ref);
}

function onTutorialClick(e: Event) {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!b) return;
  if (b.dataset.act === 'more') {
    const open = $('#tut-intro .collapsible').classList.toggle('open');
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? 'Show less' : 'Show more';
  } else if (b.dataset.step) setTutorialStep(Number(b.dataset.step));
  else if (b.dataset.group) {
    const ref = { step: tutStep, group: Number(b.dataset.group), index: Number(b.dataset.index) };
    const s = solution;
    // on a phone the open case's card is the controller: tap it for the next move, tap a move to go back to it
    if (phone() && s?.tutorial && sameCase(s.tutorial, ref) && !s.stale) {
      const mv = (e.target as HTMLElement).closest<HTMLElement>('.mv');
      const ctl = (e.target as HTMLElement).closest<HTMLElement>('[data-ctl]')?.dataset.ctl;
      if (ctl === 'back') stepBack();
      else if (ctl === 'play') {
        // the whole sequence from the start; tapping again while it plays pauses it
        if (!playing && s.index > 0) jumpTo(0);
        togglePlay();
      } else if (mv) jumpTo(Number(mv.dataset.mv));
      else if (s.index < s.moves.length) { playing = false; stepForward(); renderPlayback(); }
      else void openCase(ref);
    } else void openCase(ref);
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

function toast(message: string, kind: '' | 'good' | 'bad' = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  const box = $('#toasts');
  box.append(el);
  while (box.children.length > 3) box.firstElementChild!.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 2600);
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
    const solvedHome = puzzle.encode(session.state) === puzzle.encode(puzzle.solved());
    const hash = solvedHome ? (puzzle === cube3 ? '' : `#${puzzle.id}`) : `#${puzzle.id}:${puzzle.encode(session.state)}`;
    window.history.replaceState(null, '', location.pathname + location.search + hash);
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
  }
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
  $('#btn-scramble').addEventListener('click', scramble);
  $('#btn-reset').addEventListener('click', () => {
    setStateDirect(puzzle.solved());
    toast('Reset to solved');
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
    setStateDirect(session.state.map((c, i) => (puzzle.lockedSticker?.(i) ? c : puzzle.unset)));
    paintColor = puzzle.paletteOrder[0];
    renderPalette();
  });
  $('#btn-solved').addEventListener('click', () => setStateDirect(puzzle.solved()));

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
  document.querySelectorAll<HTMLButtonElement>('#sol-tabs button').forEach((b) =>
    b.addEventListener('click', () => setTab(b.dataset.tab as Tab)),
  );
  $('#methods').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (b?.dataset.method) setMethod(b.dataset.method);
  });
  $('#lesson').addEventListener('click', onLessonClick);
  $('#tutorial').addEventListener('click', onTutorialClick);
  $('#case-card').addEventListener('click', onCaseCardClick);
  $('#stages').addEventListener('click', onStageClick);
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
    if (k === ' ') { e.preventDefault(); togglePlay(); return; }
    if (k === 'ArrowRight') { e.preventDefault(); playing = false; stepForward(); renderPlayback(); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); stepBack(); return; }
    if (k === 'Home') { jumpTo(0); return; }
    if (k === 'End') { if (solution) jumpTo(solution.moves.length); return; }
    if (k === 'Enter' && target.tagName !== 'BUTTON') { void startSolve(); return; }
    if (k === '?') { ($('#help') as HTMLDialogElement).showModal(); return; }
    if (e.code === 'KeyP' && !e.altKey) { setMode(mode === 'paint' ? 'play' : 'paint'); return; }
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
  if (fromUrl?.loaded) {
    const v = puzzle.validate(session.state);
    toast(v.ok ? 'Loaded puzzle from link' : 'Loaded puzzle from link — ' + v.message);
    if (!v.ok) setMode('paint');
  }
});
