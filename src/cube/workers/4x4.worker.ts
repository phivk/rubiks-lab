/// <reference lib="webworker" />
// 4×4 solver: reduce to a 3×3 with commutators, then finish with the Kociemba solver.
import { serveSolver } from '../../core/worker';
import { initSolver, solve } from '../kociemba/solver';
import { CubeModel } from '../model';
import { applyMove, isSolved as isSolved3, solvedState } from '../model3';
import { Reducer4 } from '../reduce';

const model = new CubeModel(4);
const reducer = new Reducer4(model);
initSolver((f) => applyMove(solvedState(), 'URFDLB'[f]));

serveSolver((state, cb) => {
  const { moves: reduction, cube3 } = reducer.reduce(model.toFaces(state));
  if (isSolved3(cube3)) cb.onSolution(reduction);
  else solve(cube3, { ...cb, onSolution: (moves) => cb.onSolution(model.simplify([...reduction, ...moves])) });
  return false;
}, (state, moves) => model.isSolved(model.applyAll(state, moves)));
