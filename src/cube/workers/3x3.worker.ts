/// <reference lib="webworker" />
import { serveSolver } from '../../core/worker';
import { initSolver, solve } from '../kociemba/solver';
import { CubeModel, FACES } from '../model';

const model = new CubeModel(3);
initSolver((f) => model.apply(model.solved(), FACES[f]));

serveSolver(
  (state, cb) => solve(model.toFaces(state), cb) === 'optimal',
  (state, moves) => model.isSolved(model.applyAll(state, moves)),
);
