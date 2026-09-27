// Facelet model of an N×N×N cube.
//
// A state is 6·N² color ids, faces in U R F D L B order (Kociemba order), each face row
// by row in the usual net orientation. Color ids 0..5 are the colors of the solved faces
// in that same order; UNSET marks a sticker the user hasn't painted yet.
// Coordinates are doubled so every layer sits on an integer: an N-cube spans
// -(N-1)..N-1 in steps of 2 (the 3×3 uses -2, 0, 2; the 4×4 -3, -1, 1, 3). Move
// permutations are derived geometrically from sticker positions.
//
// Notation, for any face letter (here R):
//   R        the outer layer             nR    the n-th layer alone (2R, 3R)
//   Rw or r  the outer two layers        nRw   the outer n layers (3Rw)
//   M E S    the middle layer of an odd cube, turning like L, D and F
//   x y z    the whole cube, turning like R, U and F
//
// Pieces fall into orbits: the slots a piece can travel between. Slots in one orbit
// share their sorted absolute coordinates, e.g. on the 5×5: (4,4,4) corners, (4,4,0)
// midges, (4,4,2) wings, (4,2,2) x-centers, (4,2,0) t-centers, (4,0,0) fixed centers.
// From the 6×6 on, oblique centers like (5,3,1) form two mirror-image orbits that share
// those coordinates; telling them apart needs a chirality check, which isn't built yet,
// so they're treated as one orbit.

import { COLOR_NAMES } from '../core/colors';
import { parity } from '../core/perm';
import type { State, Validation, Vec3 } from '../core/types';

export const UNSET = 6;
export const FACES = 'URFDLB';
const FACE_AXIS = [1, 0, 2, 1, 0, 2];
const FACE_SIGN = [1, 1, 1, -1, -1, -1];
const FACE_NORMALS: Vec3[] = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
/** M, E and S turn like L, D and F */
const SLICE_SIGN = [-1, -1, 1];

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

/** A piece slot: its stickers in a canonical order. */
export interface Slot {
  pos: Vec3;
  facelets: number[];
}

export interface Orbit {
  /** the slots' sorted absolute coordinates, largest first, e.g. [4, 4, 2] */
  coords: number[];
  /** stickers per piece: 3 for corners, 2 for edges, 1 for centers */
  size: number;
  /**
   * Whether a piece can sit in its slot rotated: corners twist and midges flip. Wings
   * can't, so their sticker order is the same in every slot; centers have one sticker.
   */
  twists: boolean;
  slots: Slot[];
  /** key of the piece that belongs in each slot (see `pieceKey`) */
  homes: string[];
}

const MOVE_RE = /^([1-9]\d*)?([URFDLBMESurfdlbxyz])(w?)(2'|2|'|)$/;
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Rotate an integer vector by quarter turns (+ = counter-clockwise, right-hand rule) about an axis. */
export function rotateVec(v: Vec3, axis: number, quarterTurns: number): Vec3 {
  let [x, y, z] = v;
  const q = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < q; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

export function invertMove(move: string): string {
  if (move.endsWith('2')) return move;
  if (move.endsWith("'")) return move.slice(0, -1);
  return move + "'";
}

export function invertAlg(moves: string[]): string[] {
  return moves.slice().reverse().map(invertMove);
}

/** How far `cols` is rotated from `home` (cols[(j + r) % k] === home[j]), or -1 if it isn't a rotation of it. */
function rotation(cols: number[], home: number[]) {
  return home.findIndex((_, r) => home.every((h, j) => cols[(j + r) % home.length] === h));
}

export class CubeModel {
  readonly facelets: Facelet[] = [];
  /** coordinates of the layers along an axis, e.g. [-3, -1, 1, 3] */
  readonly coords: number[];
  /** every orbit: corners first, then edges (midges before wings), then centers */
  readonly orbits: Orbit[];
  readonly corners: Orbit;
  /** the middle sticker of each face (odd N only), in face order */
  readonly fixedCenters: number[];
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
    const k = n * n;
    this.fixedCenters = n % 2 ? [0, 1, 2, 3, 4, 5].map((f) => f * k + (k - 1) / 2) : [];

    const byPos = new Map<string, Facelet[]>();
    for (const f of this.facelets) byPos.set(String(f.pos), [...(byPos.get(String(f.pos)) ?? []), f]);
    const orbits = new Map<string, Omit<Orbit, 'homes'>>();
    for (const fs of byPos.values()) {
      const pos = fs[0].pos;
      const coords = pos.map(Math.abs).sort((a, b) => b - a);
      let facelets: number[];
      let twists = fs.length > 1;
      if (fs.length === 3) {
        // corners: the U/D sticker first, then clockwise seen from outside (as in the 3x3 model)
        const first = fs.find((f) => f.normal[1] !== 0)!;
        const rest = fs.filter((f) => f !== first);
        const next = rest.find((f) => dot(cross(first.normal, f.normal), pos) < 0)!;
        facelets = [first.index, next.index, rest.find((f) => f !== next)!.index];
      } else if (fs.length === 2 && coords[2] === 0) {
        // midges: the U/D sticker first, else the F/B one (as in the 3x3 model)
        const first = fs.find((f) => f.normal[1] !== 0) ?? fs.find((f) => f.normal[2] !== 0)!;
        facelets = [first.index, fs.find((f) => f !== first)!.index];
      } else if (fs.length === 2) {
        // wings can't flip in place, so ordering their stickers by handedness is move-invariant
        const [a, b] = dot(cross(fs[0].normal, fs[1].normal), pos) > 0 ? fs : [fs[1], fs[0]];
        facelets = [a.index, b.index];
        twists = false;
      } else facelets = [fs[0].index];
      const key = String(coords);
      if (!orbits.has(key)) orbits.set(key, { coords, size: fs.length, twists, slots: [] });
      orbits.get(key)!.slots.push({ pos, facelets });
    }
    const solved = this.solved();
    this.orbits = [...orbits.values()]
      .sort((a, b) => b.size - a.size || +b.twists - +a.twists || b.coords.join().localeCompare(a.coords.join()))
      .map((o) => ({ ...o, homes: o.slots.map((slot) => this.pieceKey(solved, o, slot)) }));
    this.corners = this.orbits[0];
  }

  /** Identifies the piece in a slot: its colors, in order unless the piece can twist in place. */
  pieceKey(s: State, orbit: Omit<Orbit, 'homes'>, slot: Slot) {
    const cols = slot.facelets.map((f) => s[f]);
    return (orbit.twists ? cols.sort() : cols).join();
  }

  /** For an orbit whose pieces are all different: which home slot's piece sits in each slot (-1 if none). */
  permutationOf(s: State, orbit: Orbit) {
    return orbit.slots.map((slot) => orbit.homes.indexOf(this.pieceKey(s, orbit, slot)));
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
    const [, num, letter, w, suffix] = m;
    const n = this.n;
    const amount = suffix === "'" ? -1 : suffix.startsWith('2') ? 2 : 1;
    const rot = 'xyz'.indexOf(letter);
    if (rot >= 0) return num || w ? null : { axis: rot as 0 | 1 | 2, layers: this.coords.slice(), quarters: -amount };
    const slice = 'MES'.indexOf(letter);
    if (slice >= 0) return num || w || n % 2 === 0 ? null : { axis: slice as 0 | 1 | 2, layers: [0], quarters: -SLICE_SIGN[slice] * amount };

    const f = FACES.indexOf(letter.toUpperCase());
    const lower = letter !== FACES[f];
    let depths: number[];
    if (lower || w) {
      if (lower && (num || w)) return null;
      const d = num ? +num : 2;
      // the outer d layers; all N of them would be a rotation
      if (d < 2 || d >= n) return null;
      depths = Array.from({ length: d }, (_, i) => i + 1);
    } else {
      const d = num ? +num : 1;
      // one layer, counted from the nearer face
      if (2 * d > n + 1) return null;
      depths = [d];
    }
    const s = FACE_SIGN[f];
    return {
      axis: FACE_AXIS[f] as 0 | 1 | 2,
      layers: depths.map((d) => s * (n + 1 - 2 * d)).sort((a, b) => a - b),
      quarters: -s * amount,
    };
  }

  /** Standard name of a layer turn, '' for no turn, or null if it has no name. Every single layer has one. */
  moveName(t: LayerTurn): string | null {
    const q = mod(t.quarters, 4);
    if (q === 0) return '';
    const n = this.n;
    const layers = [...t.layers].sort((a, b) => a - b);
    if (layers.some((l, i) => i > 0 && l !== layers[i - 1] + 2)) return null;
    const lo = layers[0], hi = layers[layers.length - 1];
    let letter: string, s: number;
    if (layers.length === n) {
      letter = 'xyz'[t.axis];
      s = 1;
    } else if (layers.length === 1 && lo === 0) {
      letter = 'MES'[t.axis];
      s = SLICE_SIGN[t.axis];
    } else {
      // a single layer belongs to the nearer face; a block of layers to the face it includes
      s = layers.length === 1 ? Math.sign(lo) : hi === n - 1 ? 1 : lo === 1 - n ? -1 : 0;
      if (!s) return null;
      const face = FACES[FACE_AXIS.findIndex((a, f) => a === t.axis && FACE_SIGN[f] === s)];
      if (layers.length > 1) letter = (layers.length === 2 ? '' : layers.length) + face + 'w';
      else {
        const depth = (n + 1 - s * lo) / 2;
        letter = (depth === 1 ? '' : depth) + face;
      }
    }
    if (q === 2) return letter + '2';
    return (q === 1 ? 1 : -1) === -s ? letter : letter + "'";
  }

  /** perm[dest] = src */
  permutation(t: LayerTurn): number[] {
    const q = mod(t.quarters, 4);
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
      const parts = tok.match(/(?:[1-9]\d*)?[URFDLBMESurfdlbxyz]w?(?:2'|2|'|’)?/g);
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
        const q = mod(out[i].quarters + t.quarters, 4);
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
   * Colors → faces: the orientation the solvers aim for. An odd cube takes it from its
   * fixed centers. An even cube has none and may be held any way round, so it takes
   * the corner at DBL as the reference. Assumes a valid state.
   */
  toFaces(s: State): number[] {
    const faceOfColor: number[] = [];
    if (this.n % 2) this.fixedCenters.forEach((i, f) => (faceOfColor[s[i]] = f));
    else {
      const dbl = this.corners.slots.find((c) => c.pos.every((x) => x < 0))!;
      for (const i of dbl.facelets) {
        const f = this.facelets[i].face;
        faceOfColor[s[i]] = f;
        faceOfColor[(s[i] + 3) % 6] = (f + 3) % 6;
      }
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
    const invalid = (message: string, stickers: number[]): Validation => ({ ok: false, kind: 'invalid', message, stickers });

    // An odd cube's fixed centers say which face is which, so check them and read every
    // other piece relative to them.
    let faces = s;
    if (this.n % 2) {
      const centers = this.fixedCenters.map((i) => s[i]);
      if (new Set(centers).size !== 6) return invalid('Each center must be a different color', this.fixedCenters);
      for (let f = 0; f < 3; f++) {
        if (centers[f + 3] !== (centers[f] + 3) % 6) return invalid('Centers are not arranged like a real cube', this.fixedCenters);
      }
      faces = this.toFaces(s);
    }

    // Corners and edges: every piece must exist and appear once.
    const perms = new Map<Orbit, number[]>();
    const turns = new Map<Orbit, number>();
    for (const o of this.orbits) {
      if (o.size === 1) continue;
      const label = o.size === 3 ? 'corner' : 'edge';
      const perm: number[] = [];
      let turned = 0;
      for (const slot of o.slots) {
        const cols = slot.facelets.map((i) => s[i]);
        const piece = o.homes.indexOf(this.pieceKey(faces, o, slot));
        const r = piece < 0 ? -1 : rotation(slot.facelets.map((i) => faces[i]), o.slots[piece].facelets.map((i) => this.facelets[i].face));
        if (r < 0) return invalid(`${label === 'corner' ? 'Corner' : 'Edge'} ${names(cols)} can't exist on a real cube`, slot.facelets);
        const other = perm.indexOf(piece);
        if (other >= 0) {
          const stickers = [...slot.facelets, ...o.slots[other].facelets];
          if (o.twists) return invalid(`Two ${label}s are both ${names(cols)}`, stickers);
          return invalid(`Two ${names(cols)} edge pieces are the same way round — one is flipped. Each edge color pair appears once each way.`, stickers);
        }
        perm.push(piece);
        turned += r;
      }
      perms.set(o, perm);
      turns.set(o, turned);
    }

    // Centers of one kind can't trade places with centers of another.
    for (const o of this.orbits) {
      if (o.size !== 1 || o.slots.length === 6) continue;
      const need = o.slots.length / 6;
      for (let c = 0; c < 6; c++) {
        const here = o.slots.flatMap((slot) => (s[slot.facelets[0]] === c ? slot.facelets : []));
        if (here.length !== need) {
          const kind = o.coords[1] === o.coords[2] ? 'x-center' : o.coords[2] === 0 ? 't-center' : 'oblique center';
          return invalid(`${COLOR_NAMES[c]} is on ${here.length} of the ${o.slots.length} ${kind} pieces — each color needs exactly ${need}`, here);
        }
      }
    }

    const midges = this.orbits.find((o) => o.size === 2 && o.twists);
    if (turns.get(this.corners)! % 3 !== 0) {
      return invalid('A corner is twisted in place — this state is unreachable. Check your corner stickers.', this.corners.slots.flatMap((c) => c.facelets));
    }
    if (midges && turns.get(midges)! % 2 !== 0) {
      return invalid('An edge is flipped in place — this state is unreachable. Check your edge stickers.', midges.slots.flatMap((c) => c.facelets));
    }
    // With fixed centers, a quarter turn swaps both corners and midges, so their parities match.
    if (midges && parity(perms.get(this.corners)!) !== parity(perms.get(midges)!)) {
      return invalid(
        'Two pieces are swapped (parity) — this state is unreachable. Check for a swapped pair.',
        [...this.corners.slots, ...midges.slots].flatMap((c) => c.facelets),
      );
    }
    return { ok: true };
  }
}
