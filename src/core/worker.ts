/// <reference lib="webworker" />
// Solvers that run in a web worker: the message protocol, the worker side (`serveSolver`)
// and the page side (`SolverClient`).
import type { SolveHandlers, State } from './types';

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

/** Owns the solver worker. A running search can't be interrupted, so cancelling respawns the worker. */
export class SolverClient {
  private worker!: Worker;
  private nextId = 1;
  private current: { id: number; handlers: SolveHandlers } | null = null;
  ready!: Promise<void>;

  constructor(private createWorker: () => Worker) {
    this.spawn();
  }

  private spawn() {
    this.worker = this.createWorker();
    this.ready = new Promise((resolve) => {
      this.worker.addEventListener('message', (e: MessageEvent<SolverResponse>) => {
        if (e.data.type === 'ready') resolve();
      });
    });
    this.worker.onmessage = (e: MessageEvent<SolverResponse>) => this.handle(e.data);
  }

  private handle(msg: SolverResponse) {
    if (msg.type === 'ready' || !this.current || msg.id !== this.current.id) return;
    const h = this.current.handlers;
    if (msg.type === 'solution') h.onSolution(msg.moves, msg.elapsed);
    else if (msg.type === 'depth') h.onDepth?.(msg.depth);
    else if (msg.type === 'done') { this.current = null; h.onDone(msg.optimal, msg.elapsed); }
    else { this.current = null; h.onError(msg.message); }
  }

  get busy() {
    return this.current !== null;
  }

  async solve(state: State, budgetMs: number, handlers: SolveHandlers) {
    this.cancel();
    const id = this.nextId++;
    this.current = { id, handlers };
    await this.ready;
    const req: SolverRequest = { id, state, budgetMs };
    this.worker.postMessage(req);
  }

  cancel() {
    if (!this.current) return;
    this.current = null;
    this.worker.terminate();
    this.spawn();
  }
}
