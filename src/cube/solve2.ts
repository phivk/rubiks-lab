// Optimal 2×2 solver.
//
// Keep the DBL corner fixed and turn only U, R and F: every state is then one of
// 7! · 3^6 = 3,674,160 positions. A breadth-first search from solved stores the
// distance of each one, after which solving is just walking downhill, so every
// solution is optimal (at most 11 moves).

import { buildPruning, permRank, permUnrank } from '../core/perm';
import { invertAlg } from './model3';
import type { CubeModel } from './model';

const MOVES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'"];
const N_PERM = 5040;
const N_ORI = 729;

const rankOri = (o: number[]) => o.slice(0, 6).reduce((a, x) => a * 3 + x, 0);
function unrankOri(r: number): number[] {
  const o: number[] = [];
  for (let i = 5; i >= 0; i--) {
    o[i] = r % 3;
    r = Math.floor(r / 3);
  }
  o[6] = (3 - (o.reduce((a, b) => a + b, 0) % 3)) % 3;
  return o;
}

export class Solver2 {
  private dist: Uint8Array | null = null;
  private permMove = new Int16Array(N_PERM * 9);
  private oriMove = new Int16Array(N_ORI * 9);
  /** corner slots with DBL last */
  private slots: number[][];
  /** sorted faces of the piece that belongs in each slot */
  private homes: string[];

  constructor(private model: CubeModel) {
    const dbl = model.corners.slots.findIndex((c) => c.pos.every((x) => x < 0));
    const corners = model.corners.slots.map((c) => c.facelets);
    this.slots = [...corners.filter((_, i) => i !== dbl), corners[dbl]];
    this.homes = this.slots.map((fs) => fs.map((f) => model.facelets[f].face).sort().join());
  }

  /** Build the move tables and distance table (~0.2 s). Called lazily. */
  private init() {
    const slotOf = new Map<number, [number, number]>();
    this.slots.forEach((fs, s) => fs.forEach((f, k) => slotOf.set(f, [s, k])));
    // For each move: dest slot ← [src slot, twist]
    const maps = MOVES.map((m) => {
      const perm = this.model.permutation(this.model.parseMove(m)!);
      return this.slots.map((fs) => slotOf.get(perm[fs[0]])!);
    });
    for (let p = 0; p < N_PERM; p++) {
      const cp = permUnrank(p, 7);
      // U, R and F never move DBL (slot 7)
      maps.forEach((map, m) => (this.permMove[p * 9 + m] = permRank(map.slice(0, 7).map(([src]) => cp[src]))));
    }
    for (let o = 0; o < N_ORI; o++) {
      const co = unrankOri(o);
      maps.forEach((map, m) => (this.oriMove[o * 9 + m] = rankOri(map.slice(0, 7).map(([src, k]) => (co[src] - k + 3) % 3))));
    }
    this.dist = buildPruning(N_PERM, N_ORI, this.permMove, this.oriMove, 9, 0);
  }

  private walk(i: number): string[] {
    if (!this.dist) this.init();
    const dist = this.dist!;
    const moves: string[] = [];
    while (dist[i] > 0) {
      const p = (i / N_ORI) | 0, o = i % N_ORI;
      for (let m = 0; m < 9; m++) {
        const j = this.permMove[p * 9 + m] * N_ORI + this.oriMove[o * 9 + m];
        if (dist[j] === dist[i] - 1) {
          moves.push(MOVES[m]);
          i = j;
          break;
        }
      }
    }
    return moves;
  }

  /** Optimal solution for a state given as face ids with the DBL corner solved (see `CubeModel.toFaces`). */
  solve(faces: number[]): string[] {
    const cp = this.slots.map((fs) => this.homes.indexOf(fs.map((f) => faces[f]).sort().join()));
    const co = this.slots.map((fs) => fs.findIndex((f) => faces[f] === 0 || faces[f] === 3));
    return this.walk(permRank(cp.slice(0, 7)) * N_ORI + rankOri(co));
  }

  /** A uniformly random state, as the (optimal) sequence of moves that reaches it. */
  randomState(minLength = 4): string[] {
    for (;;) {
      const i = Math.floor(Math.random() * N_PERM) * N_ORI + Math.floor(Math.random() * N_ORI);
      const moves = this.walk(i);
      if (moves.length >= minLength) return invertAlg(moves);
    }
  }
}
