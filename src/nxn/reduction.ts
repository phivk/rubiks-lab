// 4×4 solver, stage 1: reduce the 4×4 to a 3×3.
//
// Centers and edge wings are solved piece by piece with 3-cycles. At startup we search
// for commutators [A, B] (at most 8 moves) that cycle exactly three centers or three
// wings and leave every other sticker alone, then conjugate them with setup moves to
// cover every 3-cycle. Each step greedily picks the 3-cycle that solves the most pieces.
//
// Parity: 3-cycles can't change the permutation parity of wings or corners, so we fix
// those first. An inner slice quarter turn flips the wing parity, and a face quarter
// turn flips the corner parity. With both even, the reduced cube solves like a 3×3.

import { FACELETS } from '../cube/model';
import { parity } from '../cube/validate';
import type { Vec3 } from '../puzzles/types';
import type { CubeModel, Slot } from './model';

interface Orbit {
  slots: Slot[];
  /** facelet → slot, or -1 */
  slotOf: Int16Array;
  /** normalized 3-cycle key → moves */
  macros: Map<number, string[]>;
}

/** Key of the cycle a → b → c, the same for all three rotations of it. */
const cycleKey = (a: number, b: number, c: number) => {
  if (b < a && b < c) [a, b, c] = [b, c, a];
  else if (c < a && c < b) [a, b, c] = [c, a, b];
  return (a * 64 + b) * 64 + c;
};

export class Reducer4 {
  private centers: Orbit;
  private wings: Orbit;

  constructor(private model: CubeModel) {
    const orbit = (slots: Slot[]): Orbit => {
      const slotOf = new Int16Array(model.size).fill(-1);
      slots.forEach((s, i) => s.facelets.forEach((f) => (slotOf[f] = i)));
      return { slots, slotOf, macros: new Map() };
    };
    this.centers = orbit(model.centers);
    this.wings = orbit(model.wings);
    this.buildMacros();
  }

  private buildMacros() {
    const { model } = this;
    // every single-layer turn
    const gens: { name: string; axis: number; perm: number[]; inverse: number }[] = [];
    for (const axis of [0, 1, 2] as const) {
      for (const layer of model.coords) {
        const first = gens.length;
        for (const quarters of [1, 2, 3]) {
          const t = { axis, layers: [layer], quarters };
          gens.push({ name: model.moveName(t)!, axis, perm: model.permutation(t), inverse: first + 3 - quarters });
        }
      }
    }
    const inv = (g: number) => gens[g].inverse;
    const identity = model.facelets.map((f) => f.index);
    const run = (seq: number[]) => {
      let arr = identity;
      for (const g of seq) {
        const p = gens[g].perm;
        arr = p.map((src) => arr[src]);
      }
      return arr;
    };

    // Base commutators [A, B] with B a single turn or a conjugate X Y X'.
    const bs: number[][] = [];
    for (let x = 0; x < gens.length; x++) {
      bs.push([x]);
      for (let y = 0; y < gens.length; y++) if (gens[x].axis !== gens[y].axis) bs.push([x, y, inv(x)]);
    }
    const bases: { orbit: Orbit; cycle: number[]; seq: number[] }[] = [];
    for (let a = 0; a < gens.length; a++) {
      for (const b of bs) {
        if (gens[a].axis === gens[b[0]].axis) continue;
        const seq = [a, ...b, inv(a), ...b.slice().reverse().map(inv)];
        const arr = run(seq);
        const moved = arr.flatMap((src, i) => (src !== i ? [i] : []));
        const orbit = moved.length === 3 ? this.centers : moved.length === 6 ? this.wings : null;
        if (!orbit || moved.some((i) => orbit.slotOf[i] < 0)) continue;
        // follow one representative sticker per slot: sticker at `from` ends up where arr[to] === from
        const reps = moved.filter((i) => orbit.slots[orbit.slotOf[i]].facelets[0] === i);
        if (reps.length !== 3) continue;
        const next = (from: number) => arr.indexOf(from);
        const cycle = [reps[0], next(reps[0]), next(next(reps[0]))];
        if (!reps.includes(cycle[1]) || !reps.includes(cycle[2]) || next(cycle[2]) !== cycle[0]) continue;
        bases.push({ orbit, cycle, seq });
      }
    }
    // keep the shortest base per 3-cycle of slots
    bases.sort((x, y) => x.seq.length - y.seq.length);
    const seenBase = new Set<string>();
    const uniqueBases = bases.filter(({ orbit, cycle }) => {
      const k = `${orbit === this.centers}:${cycleKey(orbit.slotOf[cycle[0]], orbit.slotOf[cycle[1]], orbit.slotOf[cycle[2]])}`;
      return !seenBase.has(k) && !!seenBase.add(k);
    });

    // Conjugate with setups S: S C S' cycles S⁻¹(a) → S⁻¹(b) → S⁻¹(c).
    const isFull = (o: Orbit) => o.macros.size >= (o.slots.length * (o.slots.length - 1) * (o.slots.length - 2)) / 3;
    const full = () => isFull(this.centers) && isFull(this.wings);
    let layer: number[][] = [[]];
    for (let depth = 0; ; depth++) {
      for (const setup of layer) {
        if (full()) break;
        const back = run(setup);
        for (const { orbit, cycle, seq } of uniqueBases) {
          if (isFull(orbit)) continue;
          const key = cycleKey(orbit.slotOf[back[cycle[0]]], orbit.slotOf[back[cycle[1]]], orbit.slotOf[back[cycle[2]]]);
          if (orbit.macros.has(key)) continue;
          const moves = [...setup, ...seq, ...setup.slice().reverse().map(inv)].map((g) => gens[g].name);
          orbit.macros.set(key, model.simplify(moves));
        }
      }
      if (full() || depth === 3) break;
      layer = layer.flatMap((s) =>
        gens.map((_, g) => g).filter((g) => !s.length || gens[s[s.length - 1]].axis !== gens[g].axis).map((g) => [...s, g]),
      );
    }
    if (!full()) throw new Error(`4×4 macro table incomplete (${this.centers.macros.size}, ${this.wings.macros.size})`);
  }

  get macroCount() {
    return this.centers.macros.size + this.wings.macros.size;
  }

  /** Solve an orbit greedily with 3-cycles. `key` names the piece in a slot; `need` is the key each slot wants. */
  private solveOrbit(faces: number[], orbit: Orbit, key: (s: number[], slot: Slot) => number, need: number[]) {
    const moves: string[] = [];
    const all = orbit.slots.map((_, i) => i);
    for (let iter = 0; iter < 200; iter++) {
      const have = orbit.slots.map((s) => key(faces, s));
      const wrong = all.filter((i) => have[i] !== need[i]);
      if (!wrong.length) return { faces, moves };
      let best: { gain: number; alg: string[] } | null = null;
      for (const a of wrong) {
        for (const b of wrong) {
          // move a's piece to b (solving b); b's piece goes to c, c's piece to a
          if (b === a || need[b] !== have[a]) continue;
          for (const c of all) {
            if (c === a || c === b) continue;
            const alg = orbit.macros.get(cycleKey(a, b, c));
            if (!alg) continue;
            // b is solved; c and a may be, and c may have been solved already
            const gain = 1 + +(have[b] === need[c]) + +(have[c] === need[a]) - +(have[c] === need[c]);
            if (!best || gain > best.gain || (gain === best.gain && alg.length < best.alg.length)) best = { gain, alg };
          }
        }
      }
      if (!best || best.gain <= 0) throw new Error('Reduction got stuck');
      faces = this.model.applyAll(faces, best.alg);
      moves.push(...best.alg);
    }
    throw new Error('Reduction did not finish');
  }

  /**
   * Reduce a state (face ids, see `CubeModel.toFaces`) to a 3×3. Returns the moves and the
   * remaining 3×3 in facelet form, whose centers and edges are solved.
   */
  reduce(faces: number[]): { moves: string[]; cube3: number[] } {
    const { model } = this;
    const moves: string[] = [];
    const turn = (m: string) => {
      faces = model.apply(faces, m);
      moves.push(m);
    };
    if (parity(model.corners.map((c) => model.cornerHomes.indexOf(model.cornerKey(faces, c))))) turn('U');
    if (parity(model.wings.map((w) => model.wingHomes.indexOf(model.wingKey(faces, w))))) turn('2R');

    const centers = this.solveOrbit(faces, this.centers, (s, slot) => s[slot.facelets[0]], model.centers.map((c) => model.facelets[c.facelets[0]].face));
    const wings = this.solveOrbit(centers.faces, this.wings, (s, slot) => model.wingKey(s, slot), model.wingHomes);
    faces = wings.faces;
    moves.push(...centers.moves, ...wings.moves);

    const m = model.n - 1;
    const cube3 = FACELETS.map((f) => {
      if (f.pos.some((x) => x === 0)) return f.face;
      return faces[model.faceletAt(f.pos.map((x) => x * m) as Vec3, f.normal)!];
    });
    return { moves: model.simplify(moves), cube3 };
  }
}
