// Optimal Pyraminx solver: the tips are fixed directly, then the rest by a
// meet-in-the-middle search over the core moves.

import type { State } from '../core/types';
import { CENTER, TIP, VERTEX_NAMES, apply, applyAll, invertMove, piecesOf, solved, stickers } from './model';

const CORE_MOVES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"];
const coreStickers = stickers.filter((s) => s.piece >= 4).map((s) => s.index);
const coreKey = (s: State) => coreStickers.map((i) => s[i]).join('');
let table: Map<string, { dist: number; move: number }> | null = null;
const TABLE_DEPTH = 6, SEARCH_DEPTH = 5; // 6 + 5 ≥ 11, the Pyraminx's God's number (without tips)

function buildTable() {
  if (table) return table;
  table = new Map();
  let frontier: State[] = [solved()];
  table.set(coreKey(frontier[0]), { dist: 0, move: -1 });
  for (let d = 1; d <= TABLE_DEPTH; d++) {
    const next: State[] = [];
    for (const s of frontier)
      CORE_MOVES.forEach((m, mi) => {
        const t = apply(s, m);
        const k = coreKey(t);
        if (!table!.has(k)) { table!.set(k, { dist: d, move: mi ^ 1 }); next.push(t); }
      });
    frontier = next;
  }
  return table;
}

/** Tip moves needed so each tip matches its axial center. Tips never affect anything else. */
function tipMoves(s: State): string[] {
  const out: string[] = [];
  for (let v = 0; v < 4; v++) {
    const tip = piecesOf(TIP(v));
    const matches = (st: State) =>
      tip.every((i) => {
        const center = stickers.find((x) => x.piece === CENTER(v) && x.color === stickers[i].color)!;
        return st[i] === st[center.index];
      });
    const name = VERTEX_NAMES[v].toLowerCase();
    if (matches(s)) continue;
    if (matches(apply(s, name))) out.push(name);
    else out.push(name + "'");
  }
  return out;
}

/** Shortest solution, or null if the state is unreachable. */
export function solveOptimal(s: State): string[] | null {
  const T = buildTable();
  const tips = tipMoves(s);
  const start = applyAll(s, tips);
  let best: string[] | null = null;
  const path: string[] = [];
  const visit = (st: State, depth: number, lastAxis: number) => {
    const hit = T.get(coreKey(st));
    if (hit && (!best || depth + hit.dist < best.length)) {
      const rest: string[] = [];
      let cur = st, e = hit;
      while (e.dist > 0) {
        const m = CORE_MOVES[e.move];
        rest.push(m);
        cur = apply(cur, m);
        e = T.get(coreKey(cur))!;
      }
      best = [...path, ...rest];
    }
    if (depth === SEARCH_DEPTH || (best && depth + 1 >= best.length)) return;
    CORE_MOVES.forEach((m, mi) => {
      if (mi >> 1 === lastAxis) return;
      path.push(m);
      visit(apply(st, m), depth + 1, mi >> 1);
      path.pop();
    });
  };
  visit(start, 0, -1);
  return best ? [...tips, ...(best as string[])] : null;
}

export function scramble(): string[] {
  // a random walk long enough to reach any core state, then random tips
  let s = solved();
  const moves: string[] = [];
  let last = -1;
  while (moves.length < 12) {
    const mi = Math.floor(Math.random() * 8);
    if (mi >> 1 === last) continue;
    last = mi >> 1;
    moves.push(CORE_MOVES[mi]);
    s = apply(s, CORE_MOVES[mi]);
  }
  // re-derive a clean scramble from a random state: the inverse of its optimal solution
  const sol = solveOptimal(s) ?? moves;
  const out = sol.slice().reverse().map(invertMove).filter((m) => m === m.toUpperCase());
  for (const t of 'ulrb') {
    const r = Math.floor(Math.random() * 3);
    if (r) out.push(r === 1 ? t : t + "'");
  }
  return out.length ? out : ['U', 'r'];
}
