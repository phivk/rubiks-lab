import type { Puzzle, State } from './types';

/**
 * `solve` / `cancelSolve` for a puzzle whose solver is fast and optimal enough to run on
 * the main thread. The short delay lets the UI show "searching" first.
 */
export function syncSolver(
  solve: (s: State) => string[] | null,
  verify: (s: State, moves: string[]) => boolean,
): Pick<Puzzle, 'solve' | 'cancelSolve'> {
  let timer = 0;
  return {
    solve: (state, _budget, h) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const t0 = performance.now();
        const moves = solve(state);
        const elapsed = performance.now() - t0;
        if (!moves || !verify(state, moves)) return h.onError('Could not solve this state');
        h.onSolution(moves, elapsed);
        h.onDone(true, elapsed);
      }, 30);
    },
    cancelSolve: () => clearTimeout(timer),
  };
}
