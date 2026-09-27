// Facelet model of an N×N×N cube, used for the 2×2 and the 4×4.
//
// Same conventions as the 3x3 model (src/cube/model.ts): a state is 6·N² color ids,
// faces in U R F D L B order, each face row by row in the usual net orientation.
// Coordinates are doubled so every layer sits on an integer: an N-cube spans
// -(N-1)..N-1 in steps of 2 (the 4×4 uses -3, -1, 1, 3). Move permutations are
// derived geometrically from sticker positions.
//
// Notation: R (outer layer), Rw or r (outer two layers), 2R (second layer only),
// x y z (whole cube).

import { rotateVec, type Vec3 } from '../cube/model';
import { COLOR_NAMES } from '../cube/validate';
import type { State, Validation } from '../puzzles/types';

export const UNSET = 6;
export const FACES = 'URFDLB';
const FACE_AXIS = [1, 0, 2, 1, 0, 2];
const FACE_SIGN = [1, 1, 1, -1, -1, -1];
const FACE_NORMALS: Vec3[] = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];

export interface Facelet {
  index: number;
  face: number;
  /** position of the cubie this sticker is on (doubled coordinates) */
  pos: Vec3;
  normal: Vec3;
}

/** Rotate every cubie whose coordinate on `axis` is in `layers` by `quarters` (right-hand rule). */
export interface LayerTurn {
  axis: 0 | 1 | 2;
  layers: number[];
  quarters: number;
}

/** A piece slot: its stickers in a canonical order that every move preserves. */
export interface Slot {
  pos: Vec3;
  facelets: number[];
}

const MOVE_RE = /^(2?)([URFDLBurfdlbxyz])(w?)(2'|2|'|)$/;
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class CubeModel {
  readonly facelets: Facelet[] = [];
  /** coordinates of the layers along an axis, e.g. [-3, -1, 1, 3] */
  readonly coords: number[];
  readonly corners: Slot[];
  /** edge pieces off the middle of an edge (the 4×4's 24 wings); empty for the 2×2 */
  readonly wings: Slot[];
  /** center stickers (the 4×4's 24 centers); empty for the 2×2 */
  readonly centers: Slot[];
  /** key of the corner / wing that belongs in each slot (see `cornerKey`, `wingKey`) */
  readonly cornerHomes: string[];
  readonly wingHomes: number[];
  private byKey = new Map<string, number>();
  private permCache = new Map<string, number[]>();

  constructor(readonly n: number) {
    const m = n - 1;
    this.coords = Array.from({ length: n }, (_, i) => 2 * i - m);
    for (let f = 0; f < 6; f++) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const kr = 2 * r - m, kc = 2 * c - m;
          const pos: Vec3 = [
            [kc, m, kr], [m, -kr, -kc], [kc, -kr, m], [kc, -m, -kr], [-m, -kr, kc], [-kc, -kr, -m],
          ][f] as Vec3;
          const index = this.facelets.length;
          this.facelets.push({ index, face: f, pos, normal: FACE_NORMALS[f] });
          this.byKey.set(`${pos}|${FACE_NORMALS[f]}`, index);
        }
      }
    }

    const byPos = new Map<string, Facelet[]>();
    for (const f of this.facelets) byPos.set(String(f.pos), [...(byPos.get(String(f.pos)) ?? []), f]);
    const slots = [...byPos.values()].map((fs) => ({ pos: fs[0].pos, fs }));
    // Corners: the U/D sticker first, then clockwise seen from outside (as in the 3x3 model).
    this.corners = slots.filter((s) => s.fs.length === 3).map(({ pos, fs }) => {
      const first = fs.find((f) => f.normal[1] !== 0)!;
      const rest = fs.filter((f) => f !== first);
      const next = rest.find((f) => dot(cross(first.normal, f.normal), pos) < 0)!;
      return { pos, facelets: [first.index, next.index, rest.find((f) => f !== next)!.index] };
    });
    // Wings: a single wing can't flip in place, so ordering its stickers by handedness is move-invariant.
    this.wings = slots.filter((s) => s.fs.length === 2).map(({ pos, fs }) => {
      const [a, b] = dot(cross(fs[0].normal, fs[1].normal), pos) > 0 ? fs : [fs[1], fs[0]];
      return { pos, facelets: [a.index, b.index] };
    });
    this.centers = slots.filter((s) => s.fs.length === 1).map(({ pos, fs }) => ({ pos, facelets: [fs[0].index] }));
    const solved = this.solved();
    this.cornerHomes = this.corners.map((c) => this.cornerKey(solved, c));
    this.wingHomes = this.wings.map((w) => this.wingKey(solved, w));
  }

  /** Identifies the corner in a slot, whatever its twist. */
  cornerKey(s: State, slot: Slot) {
    return slot.facelets.map((f) => s[f]).sort().join();
  }

  /** Identifies the wing in a slot. Wings can't flip, so the color order tells the two wings of a pair apart. */
  wingKey(s: State, slot: Slot) {
    return s[slot.facelets[0]] * 6 + s[slot.facelets[1]];
  }

  get size() {
    return this.facelets.length;
  }

  faceletAt(pos: Vec3, normal: Vec3) {
    return this.byKey.get(`${pos}|${normal}`);
  }

  pieceIndex(pos: Vec3) {
    const [x, y, z] = pos.map((c) => (c + this.n - 1) / 2);
    return x * this.n * this.n + y * this.n + z;
  }

  piecePos(i: number): Vec3 {
    const n = this.n;
    return [Math.floor(i / (n * n)), Math.floor(i / n) % n, i % n].map((c) => 2 * c - n + 1) as Vec3;
  }

  // ---------- moves ----------

  parseMove(token: string): LayerTurn | null {
    const m = MOVE_RE.exec(token.replace(/’/g, "'"));
    if (!m) return null;
    const [, inner, letter, w, suffix] = m;
    const amount = suffix === "'" ? -1 : suffix.startsWith('2') ? 2 : 1;
    const rot = 'xyz'.indexOf(letter);
    if (rot >= 0) {
      if (inner || w) return null;
      return { axis: rot as 0 | 1 | 2, layers: this.coords.slice(), quarters: -amount };
    }
    const lower = letter !== letter.toUpperCase();
    if (lower && w) return null;
    const wide = lower || w === 'w';
    if (inner && wide) return null;
    const depths = inner ? [2] : wide ? [1, 2] : [1];
    if (depths.some((d) => 2 * d > this.n)) return null;
    const f = FACES.indexOf(letter.toUpperCase());
    const s = FACE_SIGN[f];
    return {
      axis: FACE_AXIS[f] as 0 | 1 | 2,
      layers: depths.map((d) => s * (this.n + 1 - 2 * d)).sort((a, b) => a - b),
      quarters: -s * amount,
    };
  }

  /** Standard name of a layer turn, '' for no turn, or null if it has no name. */
  moveName(t: LayerTurn): string | null {
    const q = ((t.quarters % 4) + 4) % 4;
    if (q === 0) return '';
    let letter: string, s: number;
    if (t.layers.length === this.n) {
      letter = 'xyz'[t.axis];
      s = 1;
    } else {
      s = t.layers.every((l) => l > 0) ? 1 : t.layers.every((l) => l < 0) ? -1 : 0;
      if (!s) return null;
      const face = FACES[FACE_AXIS.findIndex((a, f) => a === t.axis && FACE_SIGN[f] === s)];
      const depths = t.layers.map((l) => (this.n + 1 - s * l) / 2).sort().join();
      if (depths === '1') letter = face;
      else if (depths === '1,2') letter = face + 'w';
      else if (depths === '2') letter = '2' + face;
      else return null;
    }
    if (q === 2) return letter + '2';
    return (q === 1 ? 1 : -1) === -s ? letter : letter + "'";
  }

  /** perm[dest] = src */
  permutation(t: LayerTurn): number[] {
    const q = ((t.quarters % 4) + 4) % 4;
    const key = `${t.axis}:${t.layers.join(',')}:${q}`;
    let perm = this.permCache.get(key);
    if (perm) return perm;
    perm = this.facelets.map((f) => f.index);
    for (const f of this.facelets) {
      if (!t.layers.includes(f.pos[t.axis])) continue;
      perm[this.faceletAt(rotateVec(f.pos, t.axis, q), rotateVec(f.normal, t.axis, q))!] = f.index;
    }
    this.permCache.set(key, perm);
    return perm;
  }

  apply(s: State, move: string): State {
    const t = this.parseMove(move);
    if (!t) throw new Error(`Invalid move: ${move}`);
    return this.permutation(t).map((src) => s[src]);
  }

  applyAll(s: State, moves: string[]): State {
    return moves.reduce((acc, m) => this.apply(acc, m), s);
  }

  parseAlg(text: string): { moves: string[]; invalid: string[] } {
    const moves: string[] = [];
    const invalid: string[] = [];
    for (const tok of text.replace(/[()[\],]/g, ' ').split(/\s+/).filter(Boolean)) {
      // allow compact input like "RUR'U'"
      const parts = tok.match(/2?[URFDLBurfdlbxyz]w?(?:2'|2|'|’)?/g);
      if (!parts || parts.join('') !== tok || parts.some((p) => !this.parseMove(p))) {
        invalid.push(tok);
        continue;
      }
      for (const p of parts) moves.push(p.replace(/’/g, "'").replace("2'", '2'));
    }
    return { moves, invalid };
  }

  /** Merge turns of the same layers, including across other turns on the same axis (R L R' → L). */
  simplify(moves: string[]): string[] {
    const out: LayerTurn[] = [];
    for (const m of moves) {
      const t = this.parseMove(m)!;
      let merged = false;
      for (let i = out.length - 1; i >= 0 && out[i].axis === t.axis; i--) {
        if (out[i].layers.join() !== t.layers.join()) continue;
        const q = (((out[i].quarters + t.quarters) % 4) + 4) % 4;
        if (q === 0) out.splice(i, 1);
        else out[i] = { ...t, quarters: q };
        merged = true;
        break;
      }
      if (!merged) out.push(t);
    }
    return out.map((t) => this.moveName(t)!);
  }

  // ---------- states ----------

  solved(): State {
    return this.facelets.map((f) => f.face);
  }

  /** Solved in any orientation: every face a single color. */
  isSolved(s: State): boolean {
    const k = this.n * this.n;
    for (let f = 0; f < 6; f++) {
      const c = s[f * k];
      if (c === UNSET) return false;
      for (let i = 1; i < k; i++) if (s[f * k + i] !== c) return false;
    }
    return true;
  }

  encode(s: State): string {
    return s.map((c) => (c === UNSET ? '?' : FACES[c])).join('');
  }

  decode(text: string): State | null {
    if (text.length !== this.size) return null;
    const out: State = [];
    for (const ch of text.toUpperCase()) {
      const i = FACES.indexOf(ch);
      if (ch === '?' || ch === '-') out.push(UNSET);
      else if (i < 0) return null;
      else out.push(i);
    }
    return out;
  }

  /**
   * Colors → faces, taking the corner at DBL as the reference. Without fixed centers
   * the cube may be held any way round; this picks the orientation the solver aims for.
   * Assumes a valid state.
   */
  toFaces(s: State): number[] {
    const m = this.n - 1;
    const dbl = this.corners.find((c) => c.pos.every((x) => x === -m))!;
    const faceOfColor: number[] = [];
    for (const i of dbl.facelets) {
      const f = this.facelets[i].face;
      faceOfColor[s[i]] = f;
      faceOfColor[(s[i] + 3) % 6] = (f + 3) % 6;
    }
    return s.map((c) => faceOfColor[c]);
  }

  validate(s: State): Validation {
    const counts = new Array(7).fill(0);
    s.forEach((c) => counts[c]++);
    if (counts[UNSET] > 0) {
      return {
        ok: false, kind: 'incomplete',
        message: `${counts[UNSET]} sticker${counts[UNSET] === 1 ? '' : 's'} left to paint`,
        stickers: s.flatMap((c, i) => (c === UNSET ? [i] : [])),
      };
    }
    const k = this.n * this.n;
    for (let c = 0; c < 6; c++) {
      if (counts[c] !== k) {
        return {
          ok: false, kind: 'invalid',
          message: `${COLOR_NAMES[c]} appears ${counts[c]}× — every color needs exactly ${k} stickers`,
          stickers: s.flatMap((x, i) => (x === c ? [i] : [])),
        };
      }
    }
    const names = (cols: number[]) => cols.map((c) => COLOR_NAMES[c]).join('–');

    // A corner exists if its colors, read in order, are a rotation of a solved corner's.
    const cornerAt = (cols: number[]) => {
      const k = this.cornerHomes.indexOf([...cols].sort().join());
      const home = k < 0 ? [] : this.corners[k].facelets.map((f) => this.facelets[f].face);
      return [0, 1, 2].some((r) => home.every((h, j) => cols[(j + r) % 3] === h)) ? k : -1;
    };
    const cornersSeen = new Map<number, number[]>();
    let twist = 0;
    for (const c of this.corners) {
      const cols = c.facelets.map((i) => s[i]);
      const piece = cornerAt(cols);
      if (piece < 0) return { ok: false, kind: 'invalid', message: `Corner ${names(cols)} can't exist on a real cube`, stickers: c.facelets };
      const other = cornersSeen.get(piece);
      if (other) return { ok: false, kind: 'invalid', message: `Two corners are both ${names(cols)}`, stickers: [...c.facelets, ...other] };
      cornersSeen.set(piece, c.facelets);
      twist += cols.findIndex((x) => x === 0 || x === 3);
    }

    const wingsSeen = new Map<number, number[]>();
    for (const w of this.wings) {
      const cols = w.facelets.map((i) => s[i]);
      const key = this.wingKey(s, w);
      if (!this.wingHomes.includes(key)) return { ok: false, kind: 'invalid', message: `Edge ${names(cols)} can't exist on a real cube`, stickers: w.facelets };
      const other = wingsSeen.get(key);
      if (other) {
        return {
          ok: false, kind: 'invalid', stickers: [...w.facelets, ...other],
          message: `Two ${names(cols)} edge pieces are the same way round — one is flipped. Each edge color pair appears once each way.`,
        };
      }
      wingsSeen.set(key, w.facelets);
    }

    if (twist % 3 !== 0) {
      return {
        ok: false, kind: 'invalid', stickers: this.corners.flatMap((c) => c.facelets),
        message: 'A corner is twisted in place — this state is unreachable. Check your corner stickers.',
      };
    }
    return { ok: true };
  }
}
