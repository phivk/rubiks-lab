/// <reference lib="webworker" />
// Big cube solver (N ≥ 4): reduce to a 3×3 with commutators, then finish with the Kociemba solver.
import { serveSolver } from '../../core/worker';
import { initSolver, solve } from '../kociemba/solver';
import { CubeModel, FACES } from '../model';
import { Reducer } from '../reduce';

const model3 = new CubeModel(3);
initSolver((f) => model3.apply(model3.solved(), FACES[f]));

// one model and reducer per size, built on first use (the reducer's macro search takes a moment)
const bySize = new Map<number, { model: CubeModel; reducer: Reducer }>();
function forState(state: number[]) {
  const n = Math.round(Math.sqrt(state.length / 6));
  let entry = bySize.get(n);
  if (!entry) {
    const model = new CubeModel(n);
    entry = { model, reducer: new Reducer(model) };
    bySize.set(n, entry);
  }
  return entry;
}

serveSolver((state, cb) => {
  const { model, reducer } = forState(state);
  const { moves: reduction, cube3 } = reducer.reduce(model.toFaces(state));
  if (model3.isSolved(cube3)) cb.onSolution(reduction);
  else solve(cube3, { ...cb, onSolution: (moves) => cb.onSolution(model.simplify([...reduction, ...moves])) });
  return false;
}, (state, moves) => {
  const { model } = forState(state);
  return model.isSolved(model.applyAll(state, moves));
});
