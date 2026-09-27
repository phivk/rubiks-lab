import './style.css';
import {
  State, UNSET, applyMove, fromFaceletString, invertMove, isSolved, parseAlg, parseMove,
  solvedState, toFaceletString, turnToMove,
} from './cube/model';
import { COLOR_NAMES, validate } from './cube/validate';
import { SolverClient } from './cube/solverClient';
import { CubeView, Mode, STICKER_COLORS } from './view/CubeView';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

// ---------- state ----------

let state: State = solvedState();
let mode: Mode = 'play';
let paintColor = 0;
const moveHistory: string[] = [];
const redoStack: string[] = [];

interface Solution {
  start: State;
  moves: string[];
  index: number;
  optimal: boolean;
  searching: boolean;
  elapsed: number;
  stale: boolean;
}
let solution: Solution | null = null;
let playing = false;

const SPEEDS = [0.35, 0.6, 1, 1.7, 3];
let speed = 1;
const BASE_MS = 340;

const solver = new SolverClient();
const stageEl = $('#stage');
const view = new CubeView(stageEl, {
  onDragTurn: (axis, layer, quarters) => {
    const move = turnToMove(axis, layer, quarters);
    if (!move) return;
    // the view already showed the animation — just commit
    commitUserMove(move, false);
  },
  onStickerClick: (i) => paintSticker(i),
  canDragTurn: () => queue.length === 0 && !running,
});

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
    const next = applyMove(state, job.move);
    // speed up when the queue backs up so input never feels laggy
    const hurry = queue.length > 2 ? 0.45 : queue.length > 0 ? 0.75 : 1;
    await view.animateTurn(parseMove(job.move)!, next, job.duration * hurry);
    const wasSolved = isSolved(state);
    state = next;
    onStateChanged();
    if (!wasSolved && isSolved(state) && queue.length === 0 && job.kind === 'user') celebrate();
  }
  running = false;
  if (solution && playing) scheduleNextPlayback();
  if (pendingSolve) { pendingSolve = false; startSolve(); }
}

const idle = () => new Promise<void>((resolve) => {
  const check = () => (!running && queue.length === 0 ? resolve() : setTimeout(check, 30));
  check();
});

function commitUserMove(move: string, animate = true) {
  invalidateSolution();
  moveHistory.push(move);
  redoStack.length = 0;
  if (animate) enqueue({ move, duration: BASE_MS / speed, kind: 'user' });
  else {
    const wasSolved = isSolved(state);
    state = applyMove(state, move);
    view.setState(state);
    onStateChanged();
    if (!wasSolved && isSolved(state)) celebrate();
  }
  flashMoveButton(move);
  renderHistory();
  fadeHint();
}

function doMoves(moves: string[], duration = BASE_MS / speed) {
  for (const m of moves) {
    invalidateSolution();
    moveHistory.push(m);
    enqueue({ move: m, duration, kind: 'user' });
  }
  redoStack.length = 0;
  renderHistory();
}

function undo() {
  const m = moveHistory.pop();
  if (!m) return;
  invalidateSolution();
  redoStack.push(m);
  enqueue({ move: invertMove(m), duration: BASE_MS / speed, kind: 'user' });
  renderHistory();
}
function redo() {
  const m = redoStack.pop();
  if (!m) return;
  invalidateSolution();
  moveHistory.push(m);
  enqueue({ move: m, duration: BASE_MS / speed, kind: 'user' });
  renderHistory();
}

function setStateDirect(s: State) {
  queue.length = 0;
  state = s.slice();
  view.setState(state);
  moveHistory.length = 0;
  redoStack.length = 0;
  invalidateSolution(true);
  renderHistory();
  onStateChanged();
}

// ---------- scramble ----------

function randomScramble(n = 22): string[] {
  const faces = 'URFDLB';
  const out: string[] = [];
  let last = -1, prev = -1;
  while (out.length < n) {
    const f = Math.floor(Math.random() * 6);
    if (f === last) continue;
    // avoid e.g. R L R (same axis three times)
    if (f % 3 === last % 3 && f % 3 === prev % 3) continue;
    prev = last;
    last = f;
    out.push(faces[f] + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return out;
}

function scramble() {
  if (mode === 'paint') setMode('play');
  const moves = randomScramble();
  moveHistory.length = 0;
  redoStack.length = 0;
  invalidateSolution(true);
  for (const m of moves) {
    moveHistory.push(m);
    enqueue({ move: m, duration: 110, kind: 'user' });
  }
  renderHistory();
  toast(`Scrambled: ${moves.join(' ')}`);
  fadeHint();
}

// ---------- painting ----------

function paintSticker(i: number) {
  if (i % 9 === 4) {
    toast('Centers are fixed — they define which face is which', 'bad');
    return;
  }
  if (state[i] === paintColor) return;
  state = state.slice();
  state[i] = paintColor;
  moveHistory.length = 0;
  redoStack.length = 0;
  invalidateSolution(true);
  view.setState(state);
  onStateChanged();
  renderHistory();
  // advance to the next color once this one is complete
  const count = state.filter((c) => c === paintColor).length;
  if (paintColor !== UNSET && count === 9) {
    const next = [0, 1, 2, 3, 4, 5].find((c) => state.filter((x) => x === c).length < 9);
    if (next !== undefined) {
      paintColor = next;
      renderPalette();
    }
  }
}

function setMode(m: Mode) {
  mode = m;
  view.setMode(m);
  document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  $('.mode-play').classList.toggle('hidden', m !== 'play');
  $('.mode-paint').classList.toggle('hidden', m !== 'paint');
  $('#net').classList.toggle('editable', m === 'paint');
  $('#net-hint').textContent = m === 'paint' ? 'Tap to paint' : 'Unfolded view';
  $('#stage-hint').textContent = m === 'paint'
    ? 'Tap a sticker to paint it · Drag to look around'
    : 'Drag a face to turn it · Drag the background to orbit';
  $('#stage-hint').classList.remove('fade');
  if (m === 'paint') {
    playing = false;
    if (state.every((c) => c !== UNSET)) {
      // start with the first color that isn't done, else white
      paintColor = [0, 1, 2, 3, 4, 5].find((c) => state.filter((x) => x === c).length !== 9) ?? 0;
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
  const v = validate(state);
  if (!v.ok) {
    if (v.stickers) {
      view.setHighlight(v.stickers);
      view.flashHighlight();
      flashNet(v.stickers);
    }
    toast(v.kind === 'incomplete' ? `Almost there — ${v.message}` : v.message, 'bad');
    if (mode !== 'paint') setMode('paint');
    return;
  }
  if (isSolved(state)) {
    toast('Already solved — scramble it first', 'good');
    return;
  }
  runSolver(1500);
}

function runSolver(budgetMs: number) {
  const start = state.slice();
  playing = false;
  solution = { start, moves: [], index: 0, optimal: false, searching: true, elapsed: 0, stale: false };
  renderSolution();
  $('#btn-solve').classList.add('busy');
  void solver.solve(start, budgetMs, {
    onSolution: (moves, elapsed) => {
      if (!solution || solution.start !== start) return;
      const first = solution.moves.length === 0;
      solution.moves = moves;
      solution.elapsed = elapsed;
      solution.index = 0;
      renderSolution(first);
    },
    onDone: (optimal, elapsed) => {
      $('#btn-solve').classList.remove('busy');
      if (!solution || solution.start !== start) return;
      solution.searching = false;
      solution.optimal = optimal;
      solution.elapsed = elapsed;
      renderSolution();
    },
    onError: (message) => {
      $('#btn-solve').classList.remove('busy');
      solution = null;
      renderSolution();
      toast(message, 'bad');
    },
  });
}

function invalidateSolution(clear = false) {
  if (!solution) return;
  if (solution.searching) {
    solver.cancel();
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
  enqueue({ move: invertMove(solution.moves[solution.index]), duration: BASE_MS / speed, kind: 'playback' });
  renderPlayback();
}
function jumpTo(k: number) {
  if (!solution || solution.stale) return;
  playing = false;
  const fast = Math.max(70, 160 / speed);
  while (solution.index < k) enqueue({ move: solution.moves[solution.index++], duration: fast, kind: 'playback' });
  while (solution.index > k) enqueue({ move: invertMove(solution.moves[--solution.index]), duration: fast, kind: 'playback' });
  renderPlayback();
}

let playTimer = 0;
function scheduleNextPlayback() {
  clearTimeout(playTimer);
  playTimer = window.setTimeout(() => {
    if (!playing || running) return;
    if (!stepForward()) {
      playing = false;
      renderPlayback();
    }
  }, 140 / speed);
}
function togglePlay() {
  if (!solution || solution.stale || solution.moves.length === 0) return;
  if (playing) {
    playing = false;
  } else {
    if (solution.index >= solution.moves.length) jumpTo(0);
    playing = true;
    if (!running) scheduleNextPlayback();
  }
  renderPlayback();
}

// ---------- rendering ----------

function onStateChanged() {
  renderNet();
  renderStatus();
  $('#solved-badge').classList.toggle('hidden', !isSolved(state));
  if (mode === 'paint') renderPalette();
  if (solution && !solution.stale) renderPlayback();
  view.setHighlight([]);
  ($('#btn-undo') as HTMLButtonElement).disabled = moveHistory.length === 0;
  ($('#btn-redo') as HTMLButtonElement).disabled = redoStack.length === 0;
  saveToUrl();
}

const FACE_COLOR_VARS = ['U', 'R', 'F', 'D', 'L', 'B'].map((_, i) => STICKER_COLORS[i]);

function buildMovepad() {
  const pad = $('#movepad');
  const faces = ['U', 'D', 'R', 'L', 'F', 'B'];
  const colorOf: Record<string, string> = { U: FACE_COLOR_VARS[0], R: FACE_COLOR_VARS[1], F: FACE_COLOR_VARS[2], D: FACE_COLOR_VARS[3], L: FACE_COLOR_VARS[4], B: FACE_COLOR_VARS[5] };
  for (const suffix of ['', "'", '2'])
    for (const f of faces) pad.append(moveButton(f + suffix, colorOf[f]));
  const extra = $('#movepad-extra');
  for (const suffix of ['', "'", '2'])
    for (const f of ['M', 'E', 'S', 'x', 'y', 'z']) extra.append(moveButton(f + suffix));
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

function renderHistory() {
  const el = $('#history');
  $('#history-count').textContent = `${moveHistory.length} move${moveHistory.length === 1 ? '' : 's'}`;
  if (!moveHistory.length) {
    el.innerHTML = '<span class="muted small">Your turns will show up here.</span>';
  } else {
    el.innerHTML = moveHistory.map((m) => `<span class="h">${m}</span>`).join('');
    el.scrollTop = el.scrollHeight;
  }
  ($('#btn-undo') as HTMLButtonElement).disabled = moveHistory.length === 0;
  ($('#btn-redo') as HTMLButtonElement).disabled = redoStack.length === 0;
}

// Net layout: U on top, then L F R B, then D.
const NET_ORIGIN: Record<number, [number, number]> = { 0: [0, 3], 4: [3, 0], 2: [3, 3], 1: [3, 6], 5: [3, 9], 3: [6, 3] };
const netCells: HTMLButtonElement[] = [];

function buildNet() {
  const net = $('#net');
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 9; i++) {
      const [r0, c0] = NET_ORIGIN[f];
      const cell = document.createElement('button');
      cell.className = 'cell' + (i === 4 ? ' center' : '');
      cell.style.gridRow = String(r0 + Math.floor(i / 3) + 1);
      cell.style.gridColumn = String(c0 + (i % 3) + 1);
      const idx = f * 9 + i;
      if (i === 4) cell.dataset.face = 'URFDLB'[f];
      cell.setAttribute('aria-label', `${'URFDLB'[f]}${i + 1}`);
      cell.addEventListener('click', () => {
        if (mode === 'paint') paintSticker(idx);
        else setMode('paint');
      });
      netCells[idx] = cell;
      net.append(cell);
    }
  }
}

function renderNet() {
  state.forEach((c, i) => netCells[i].style.setProperty('--c', STICKER_COLORS[c]));
}

function flashNet(indices: number[]) {
  for (const i of indices) {
    const c = netCells[i];
    c.classList.remove('bad');
    void c.offsetWidth;
    c.classList.add('bad');
  }
  setTimeout(() => indices.forEach((i) => netCells[i].classList.remove('bad')), 2600);
}

function renderPalette() {
  const el = $('#palette');
  const counts = new Array(7).fill(0);
  state.forEach((c) => counts[c]++);
  el.innerHTML = '';
  [0, 2, 1, 5, 4, 3, UNSET].forEach((c, k) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === paintColor ? ' active' : '') + (c === UNSET ? ' eraser' : '');
    b.style.setProperty('--c', STICKER_COLORS[c]);
    b.title = c === UNSET ? `Eraser (${k + 1})` : `${COLOR_NAMES[c]} (${k + 1})`;
    b.setAttribute('aria-label', b.title);
    if (c !== UNSET) {
      const left = 9 - counts[c];
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
const PALETTE_ORDER = [0, 2, 1, 5, 4, 3, UNSET];

function renderStatus() {
  const el = $('#status');
  const v = validate(state);
  el.className = 'status';
  if (v.ok) {
    if (mode === 'paint') {
      el.classList.add('ok');
      el.innerHTML = '<span class="dot"></span><span>Valid cube — ready to solve</span>';
    } else el.innerHTML = '';
  } else {
    el.classList.add(v.kind === 'incomplete' ? 'warn' : 'bad');
    el.innerHTML = `<span class="dot"></span><span>${v.message}</span>`;
  }
}

function renderSolution(fresh = false) {
  const el = $('#solution');
  el.classList.toggle('empty', !solution);
  el.classList.toggle('stale', !!solution?.stale);
  const sub = $('#solve-sub');
  if (!solution) {
    sub.textContent = 'Finds the shortest route home';
    return;
  }
  const s = solution;
  $('#sol-count').textContent = s.moves.length ? String(s.moves.length) : '…';
  const secs = (s.elapsed / 1000).toFixed(s.elapsed < 1000 ? 2 : 1);
  let meta = '';
  if (s.stale) meta = `<span class="badge stale">Cube changed</span><span>Solve again for a new route</span>`;
  else if (s.searching) meta = `<span class="badge searching">Searching for shorter</span>`;
  else if (s.optimal) meta = `<span class="badge optimal">✓ Optimal</span><span>proven in ${secs}s</span>`;
  else meta = `<span>Best found in ${secs}s ·</span><button class="link" id="btn-deeper">Search deeper</button>`;
  $('#sol-meta').innerHTML = meta;
  $('#btn-deeper')?.addEventListener('click', () => {
    if (!solution) return;
    // restart from the original position, searching for longer
    const target = solution.start;
    const back = solution.index;
    jumpTo(0);
    void idle().then(() => {
      if (toFaceletString(state) !== toFaceletString(target)) return;
      runSolver(12000);
      if (back) toast('Rewound to the start to search deeper');
    });
  });
  sub.textContent = s.searching ? 'Searching…' : 'Solve again';
  const chips = $('#chips');
  chips.innerHTML = '';
  s.moves.forEach((m, i) => {
    const c = document.createElement('button');
    c.className = 'chip';
    c.innerHTML = `${m}<sub>${i + 1}</sub>`;
    c.style.animationDelay = fresh ? `${i * 18}ms` : '0ms';
    if (!fresh) c.style.animation = 'none';
    c.title = `Jump to after move ${i + 1}`;
    c.addEventListener('click', () => jumpTo(i + 1));
    chips.append(c);
  });
  renderPlayback();
}

function renderPlayback() {
  if (!solution) return;
  const s = solution;
  const n = s.moves.length;
  document.querySelectorAll<HTMLElement>('#chips .chip').forEach((c, i) => {
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
  document.querySelector('#chips .current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
    const s = toFaceletString(state);
    const hash = isSolved(state) && s === toFaceletString(solvedState()) ? '' : `#${s}`;
    window.history.replaceState(null, '', location.pathname + location.search + hash);
  }, 200);
}

function loadFromUrl() {
  const s = fromFaceletString(decodeURIComponent(location.hash.slice(1)));
  if (s) {
    state = s;
    return true;
  }
  return false;
}

// ---------- wiring ----------

function bind() {
  document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode as Mode)),
  );
  $('#btn-scramble').addEventListener('click', scramble);
  $('#btn-reset').addEventListener('click', () => {
    setStateDirect(solvedState());
    toast('Reset to solved');
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-camera').addEventListener('click', () => view.resetCamera());
  $('#btn-help').addEventListener('click', () => ($('#help') as HTMLDialogElement).showModal());
  $('#btn-share').addEventListener('click', async () => {
    saveToUrl();
    await new Promise((r) => setTimeout(r, 220));
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Link copied — it opens this exact cube', 'good');
    } catch {
      toast('Copy the URL from the address bar to share');
    }
  });
  $('#btn-more-moves').addEventListener('click', () => {
    const ex = $('#movepad-extra');
    ex.classList.toggle('hidden');
    $('#btn-more-moves').textContent = ex.classList.contains('hidden') ? 'Slices & rotations' : 'Hide extras';
  });
  $('#btn-clear').addEventListener('click', () => {
    const s = state.map((c, i) => (i % 9 === 4 ? c : UNSET));
    setStateDirect(s);
    paintColor = 0;
    renderPalette();
  });
  $('#btn-solved').addEventListener('click', () => {
    setStateDirect(solvedState());
  });

  const algForm = $('#alg-form') as HTMLFormElement;
  const algInput = $('#alg-input') as HTMLInputElement;
  algForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const { moves, invalid } = parseAlg(algInput.value);
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
    if (mode === 'paint' && validate(state).ok) setMode('play');
    void startSolve();
  });
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
    if (($('#help') as HTMLDialogElement).open) return;
    const k = e.key;
    if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === ' ') { e.preventDefault(); togglePlay(); return; }
    if (k === 'ArrowRight') { e.preventDefault(); playing = false; stepForward(); renderPlayback(); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); stepBack(); return; }
    if (k === 'Home') { jumpTo(0); return; }
    if (k === 'End') { if (solution) jumpTo(solution.moves.length); return; }
    if (k === 'Enter' && target.tagName !== 'BUTTON') { void startSolve(); return; }
    if (k === '?') { ($('#help') as HTMLDialogElement).showModal(); return; }
    const lower = k.toLowerCase();
    if (lower === 'p') { setMode(mode === 'paint' ? 'play' : 'paint'); return; }
    if (lower === 'v') { view.resetCamera(); return; }
    if (mode === 'paint' && /^[1-7]$/.test(k)) {
      paintColor = PALETTE_ORDER[Number(k) - 1];
      renderPalette();
      return;
    }
    if (mode === 'play') {
      const letter = 'urfdlbmes'.includes(lower) ? lower.toUpperCase() : 'xyz'.includes(lower) ? lower : null;
      if (letter && lower.length === 1) {
        commitUserMove(letter + (e.shiftKey ? "'" : ''));
      }
    }
  });
}

buildMovepad();
buildNet();
const fromUrl = loadFromUrl();
view.setState(state);
bind();
onStateChanged();
renderHistory();
renderSolution();
if (fromUrl) {
  const v = validate(state);
  toast(v.ok ? 'Loaded cube from link' : 'Loaded cube from link — ' + v.message);
  if (!v.ok) setMode('paint');
}
