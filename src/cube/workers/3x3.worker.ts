/// <reference lib="webworker" />
import { serveSolver } from '../../core/worker';
import { initSolver, solve } from '../kociemba/solver';
import { applyMove, applyMoves, isSolved, solvedState } from '../model3';

initSolver((f) => applyMove(solvedState(), 'URFDLB'[f]));

serveSolver((state, cb) => {
  const faceOfColor: number[] = [];
  for (let f = 0; f < 6; f++) faceOfColor[state[f * 9 + 4]] = f;
  return solve(state.map((c) => faceOfColor[c]), cb) === 'optimal';
}, (state, moves) => isSolved(applyMoves(state, moves)));
