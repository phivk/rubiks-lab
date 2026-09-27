/// <reference lib="webworker" />
// The message protocol between `SolverClient` and a solver worker, and the worker side of it.
import type { State } from './model';

export type SolverRequest = { id: number; state: State; budgetMs: number };
export type SolverResponse =
  | { type: 'ready' }
  | { type: 'solution'; id: number; moves: string[]; elapsed: number }
  | { type: 'depth'; id: number; depth: number }
  | { type: 'done'; id: number; optimal: boolean; elapsed: number }
  | { type: 'error'; id: number; message: string };

export interface SolveCallbacks {
  onSolution: (moves: string[]) => void;
  onDepth: (depth: number) => void;
  /** true once the time budget is spent and a solution exists */
  shouldStop: () => boolean;
}

/**
 * Answer solve requests in a worker. `search` reports ever-shorter solutions through the
 * callbacks and returns whether the last one is proven optimal. Every solution is checked
 * with `isSolved` before it's handed out.
 */
export function serveSolver(
  search: (state: State, cb: SolveCallbacks) => boolean,
  isSolved: (state: State, moves: string[]) => boolean,
) {
  const post = (msg: SolverResponse) => (self as unknown as Worker).postMessage(msg);
  self.onmessage = (e: MessageEvent<SolverRequest>) => {
    const { id, state, budgetMs } = e.data;
    const t0 = performance.now();
    let found = false;
    try {
      const optimal = search(state, {
        onSolution: (moves) => {
          if (!isSolved(state, moves)) throw new Error('Internal error: unverified solution');
          found = true;
          post({ type: 'solution', id, moves, elapsed: performance.now() - t0 });
        },
        onDepth: (depth) => post({ type: 'depth', id, depth }),
        // keep searching past the budget until at least one solution exists
        shouldStop: () => found && performance.now() - t0 > budgetMs,
      });
      post({ type: 'done', id, optimal, elapsed: performance.now() - t0 });
    } catch (err) {
      post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
    }
  };
  post({ type: 'ready' });
}
