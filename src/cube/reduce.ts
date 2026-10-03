// Big cube solver, stage 1: reduce an N×N (N ≥ 4) to a 3×3.
//
// Every orbit that isn't part of a 3×3 (wings, and every kind of center but the fixed
// ones) is solved piece by piece with 3-cycles. Centers go home. Wings go home on an even
// cube; on an odd cube they pair up with whichever midge shares their edge, since the
// 3×3 finish will carry each edge's wings along with its midge. At startup we search for commutators
// [A, B] (at most 8 moves) that cycle exactly three pieces of one such orbit and leave
// every other sticker alone, then conjugate them with setup moves to cover every
// 3-cycle. Each step greedily picks the 3-cycle that solves the most pieces. What's left
// — corners, plus the midges and fixed centers of an odd cube — is a 3×3.
//
// Parity: 3-cycles can't change the permutation parity of an orbit, so we fix it first
// where it matters. A quarter turn of the single slice through a wing orbit flips that
// orbit's parity (relative to any fixed target, as it moves no midge). Centers of one color are interchangeable, so their parity never
// matters. On an even cube the reduced edges are solved outright, so the corners must
// be even too, which a face quarter turn fixes; on an odd cube corners and midges share
// their parity by construction, and the 3×3 solver handles both.

import { parity } from '../core/perm';
import type { State, Vec3 } from '../core/types';
import { cross, dot } from '../core/vec';
import { CubeModel, type Orbit, type Slot } from './model';

interface Cycles {
  orbit: Orbit;
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

const cube3Model = new CubeModel(3);


export class Reducer {
  /** one per orbit outside the 3×3 */
  private orbits: Cycles[];
  /** facelet → index in `orbits`, or -1 */
  private orbitOf: Int16Array;

  constructor(private model: CubeModel) {
    if (model.n < 4) throw new Error(`A ${model.n}×${model.n} needs no reduction`);
    // from the 6×6 on, two mirror-image oblique center orbits share one entry in model.orbits
    if (model.n > 5) throw new Error(`Reducing a ${model.n}×${model.n} needs oblique centers split by chirality`);
    this.orbitOf = new Int16Array(model.size).fill(-1);
    this.orbits = model.orbits.filter((o) => !o.twists && o.slots.length > 6).map((orbit, k) => {
      const slotOf = new Int16Array(model.size).fill(-1);
      orbit.slots.forEach((s, i) => s.facelets.forEach((f) => {
        slotOf[f] = i;
        this.orbitOf[f] = k;
      }));
      return { orbit, slots: orbit.slots, slotOf, macros: new Map() };
    });
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

    // Base commutators [A, B] with B a single turn or a conjugate X Y X', kept if they
    // move three whole pieces of one orbit and nothing else.
    const bs: number[][] = [];
    for (let x = 0; x < gens.length; x++) {
      bs.push([x]);
      for (let y = 0; y < gens.length; y++) if (gens[x].axis !== gens[y].axis) bs.push([x, y, inv(x)]);
    }
    const bases: { orbit: Cycles; cycle: number[]; seq: number[] }[] = [];
    for (let a = 0; a < gens.length; a++) {
      for (const b of bs) {
        if (gens[a].axis === gens[b[0]].axis) continue;
        const seq = [a, ...b, inv(a), ...b.slice().reverse().map(inv)];
        const arr = run(seq);
        const moved = arr.flatMap((src, i) => (src !== i ? [i] : []));
        const k = moved.length ? this.orbitOf[moved[0]] : -1;
        if (k < 0 || moved.some((i) => this.orbitOf[i] !== k)) continue;
        const orbit = this.orbits[k];
        if (moved.length !== 3 * orbit.orbit.size) continue;
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
      const k = `${this.orbits.indexOf(orbit)}:${cycleKey(orbit.slotOf[cycle[0]], orbit.slotOf[cycle[1]], orbit.slotOf[cycle[2]])}`;
      return !seenBase.has(k) && !!seenBase.add(k);
    });

    // Conjugate with setups S: S C S' cycles S⁻¹(a) → S⁻¹(b) → S⁻¹(c).
    const isFull = (o: Cycles) => o.macros.size >= (o.slots.length * (o.slots.length - 1) * (o.slots.length - 2)) / 3;
    const full = () => this.orbits.every(isFull);
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
    if (!full()) throw new Error(`${model.n}×${model.n} macro table incomplete (${this.orbits.map((o) => o.macros.size)})`);
  }

  get macroCount() {
    return this.orbits.reduce((a, o) => a + o.macros.size, 0);
  }

  /**
   * The piece each slot of an orbit should end up with. On an odd cube a wing belongs
   * with its edge's midge: take the rotation that carries the midge home, and the wing
   * a slot needs is the one whose home is that slot's image.
   */
  private targets(faces: State, { orbit }: Cycles): string[] {
    const { model } = this;
    const midges = model.orbits.find((o) => o.size === 2 && o.twists);
    if (orbit.size !== 2 || !midges) return orbit.homes;
    const midgeAt = new Map(midges.slots.map((slot) => [String(slot.pos), slot]));
    const midgeOfFaces = new Map(midges.slots.map((slot) => [slot.facelets.map((f) => model.facelets[f].face).sort().join(), slot]));
    return orbit.slots.map((slot) => {
      const midge = midgeAt.get(String(slot.pos.map((x) => (Math.abs(x) === model.n - 1 ? x : 0))))!;
      const [p, q] = midge.facelets.map((f) => model.facelets[f]);
      const home = midgeOfFaces.get([faces[p.index], faces[q.index]].sort().join())!;
      const [hp, hq] = [faces[p.index], faces[q.index]].map((c) => model.facelets[home.facelets.find((f) => model.facelets[f].face === c)!]);
      const [np, nq, nr] = [p.normal, q.normal, cross(p.normal, q.normal)];
      const [mp, mq, mr] = [hp.normal, hq.normal, cross(hp.normal, hq.normal)];
      const rotate = (v: Vec3) => [0, 1, 2].map((k) => dot(v, np) * mp[k] + dot(v, nq) * mq[k] + dot(v, nr) * mr[k]) as Vec3;
      return slot.facelets.map((f) => model.facelets[model.faceletAt(rotate(slot.pos), rotate(model.facelets[f].normal))!].face).join();
    });
  }

  /** Solve an orbit greedily with 3-cycles. */
  private solveOrbit(faces: number[], orbit: Cycles, need: string[]) {
    const moves: string[] = [];
    const all = orbit.slots.map((_, i) => i);
    for (let iter = 0; iter < 200; iter++) {
      const have = orbit.slots.map((s) => this.model.pieceKey(faces, orbit.orbit, s));
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
   * remaining 3×3 in facelet form: the big cube's corners, midges and fixed centers, with
   * what an even cube doesn't have (edge middles and fixed centers) solved.
   */
  reduce(faces: number[]): { moves: string[]; cube3: number[] } {
    const { model } = this;
    const moves: string[] = [];
    const turn = (m: string) => {
      faces = model.apply(faces, m);
      moves.push(m);
    };
    if (model.n % 2 === 0 && parity(model.permutationOf(faces, model.corners))) turn('U');
    // nothing below moves a corner or midge, so the targets stay put
    const targets = this.orbits.map((o) => this.targets(faces, o));
    this.orbits.forEach(({ orbit }, k) => {
      const at = orbit.slots.map((slot) => targets[k].indexOf(model.pieceKey(faces, orbit, slot)));
      if (orbit.size === 2 && parity(at)) turn(model.moveName({ axis: 0, layers: [orbit.coords[2]], quarters: -1 })!);
    });
    for (const [k, orbit] of this.orbits.entries()) {
      const solved = this.solveOrbit(faces, orbit, targets[k]);
      faces = solved.faces;
      moves.push(...solved.moves);
    }

    const m = model.n - 1;
    const cube3 = cube3Model.facelets.map((f) => {
      const i = model.faceletAt(f.pos.map((x) => (x / 2) * m) as Vec3, f.normal);
      return i === undefined ? f.face : faces[i];
    });
    return { moves: model.simplify(moves), cube3 };
  }
}
