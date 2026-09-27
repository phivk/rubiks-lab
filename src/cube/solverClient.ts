import type { SolverRequest, SolverResponse } from './serveSolver';
import type { State } from './model';

export interface SolveHandlers {
  onSolution: (moves: string[], elapsed: number) => void;
  onDepth?: (depth: number) => void;
  onDone: (optimal: boolean, elapsed: number) => void;
  onError: (message: string) => void;
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
