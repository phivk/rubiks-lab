// Step 0 of a guided solve: the moves that set a real puzzle up the way the screen's is, so
// someone learning with one in hand can follow along on it from the first step.
import type { Puzzle, State } from './types';

/** Hold the puzzle solved the way `from` is, then make `moves`, and it's the screen's puzzle. */
export interface Setup {
  from: State;
  moves: string[];
}

export const same = (a: State, b: State) => a.length === b.length && a.every((x, i) => x === b[i]);
export const apply = (P: Puzzle, s: State, moves: string[]) => moves.reduce((t, m) => P.parseMove(m)!.perm.map((src) => t[src]), s);
const invert = (P: Puzzle, moves: string[]) => moves.slice().reverse().map(P.invertMove);
const simplify = (P: Puzzle, moves: string[]) => P.simplify?.(moves) ?? moves;

/**
 * The ways to set up `at`, a scramble partly solved by a guided solve, shortest first: the
 * scramble and the guided solve's moves so far, from solved; or the rest of the solve, `rest`,
 * undone from where it ends; or, when there is one, the undoing of `solution`, which solves `at`.
 */
export function setups(P: Puzzle, at: State, scramble: string[], before: string[], rest: string[], solution?: string[] | null): Setup[] {
  const ways: Setup[] = [{ from: P.solved(), moves: simplify(P, [...scramble, ...before]) }];
  ways.push({ from: apply(P, at, rest), moves: simplify(P, invert(P, rest)) });
  if (solution) ways.push({ from: apply(P, at, solution), moves: simplify(P, invert(P, solution)) });
  // each one lands on `at` from a solved puzzle, however it's held
  return ways.filter((w) => P.isSolved(w.from) && same(apply(P, w.from, w.moves), at)).sort((a, b) => a.moves.length - b.moves.length);
}

/** How to hold a solved puzzle before setting it up: "white on top and green in front", or as on the screen. */
export function holdHtml(P: Puzzle, from: State) {
  return P.holdHtml?.(from) ?? 'as it is on the screen';
}
