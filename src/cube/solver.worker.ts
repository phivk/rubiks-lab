/// <reference lib="webworker" />
import { applyMove, applyMoves, isSolved, solvedState, State } from './model';
import { initSolver, solve } from './solver';

export type SolverRequest = { id: number; state: State; budgetMs: number };
export type SolverResponse =
  | { type: 'ready' }
  | { type: 'solution'; id: number; moves: string[]; elapsed: number }
  | { type: 'depth'; id: number; depth: number }
  | { type: 'done'; id: number; optimal: boolean; elapsed: number }
  | { type: 'error'; id: number; message: string };

const post = (msg: SolverResponse) => (self as unknown as Worker).postMessage(msg);

initSolver((f) => applyMove(solvedState(), 'URFDLB'[f]));
post({ type: 'ready' });

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  const { id, state, budgetMs } = e.data;
  const t0 = performance.now();
  const faceOfColor: number[] = [];
  for (let f = 0; f < 6; f++) faceOfColor[state[f * 9 + 4]] = f;
  const faces = state.map((c) => faceOfColor[c]);
  let found = false;
  try {
    const result = solve(faces, {
      onSolution: (moves) => {
        // never hand out a solution we haven't verified
        if (!isSolved(applyMoves(state, moves))) throw new Error('Internal error: unverified solution');
        found = true;
        post({ type: 'solution', id, moves, elapsed: performance.now() - t0 });
      },
      onDepth: (depth) => post({ type: 'depth', id, depth }),
      // keep searching past the budget until at least one solution exists
      shouldStop: () => found && performance.now() - t0 > budgetMs,
    });
    post({ type: 'done', id, optimal: result === 'optimal', elapsed: performance.now() - t0 });
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
