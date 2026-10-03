import type { DragOption, Puzzle, State, Turn, Vec3 } from '../core/types';
import { ringsOf } from './rings';

const SVG = 'http://www.w3.org/2000/svg';
// Draw at 100× the puzzle's map units so text sizes stay well above browsers' minimum font size.
const UNIT = 100;

/** How far the pointer moves before a drag picks a layer, in CSS pixels. */
const DRAG_START = 8;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface NetHandlers {
  onClick: (index: number) => void;
  /** a sticker was dragged across its layer */
  onTurn: (move: string) => void;
  canTurn: () => boolean;
  /** the mouse moved onto a sticker, or off them all (-1) */
  onHover: (index: number) => void;
  /** a sticker was pressed to drag (`pieces` once the drag picked a layer), or let go (-1) */
  onGrab: (index: number, pieces?: number[]) => void;
}

type V3 = Vec3;
type V2 = [number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mean = <T extends number[]>(pts: T[]) => pts[0].map((_, k) => pts.reduce((a, p) => a + p[k], 0) / pts.length) as T;
/** `v` turned `angle` radians about the unit `axis` through `at` (right-hand rule). */
const rotate = (v: V3, axis: V3, angle: number, at: V3 = [0, 0, 0]): V3 => {
  const p = sub(v, at), c = Math.cos(angle), s = Math.sin(angle);
  return add(at, add(add(scale(p, c), scale(cross(axis, p), s)), scale(axis, dot(axis, p) * (1 - c))));
};

/** The convex hull of some points, counter-clockwise. */
function hull(pts: V2[]): V2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: V2[]) => list.reduce<V2[]>((h, q) => {
    while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], q) <= 1e-9) h.pop();
    h.push(q);
    return h;
  }, []);
  const lower = half(p), upper = half(p.reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * How a face lies on the map: a point in the face's plane, written in two of its stickers'
 * offsets from a third, sits at the same mix of their offsets on the map.
 */
interface Face {
  normal: V3;
  stickers: number[];
  origin: V3;
  e1: V3;
  e2: V3;
  /** the inverse of the offsets' Gram matrix */
  inv: [number, number, number];
  spot: V2;
  f1: V2;
  f2: V2;
  /** the face's outline on the map, to clip what slides off it */
  outline: V2[];
}

/** A rigid motion of the map, as a rotation `angle` about `center`, or (angle 0) a shift. */
interface Motion { angle: number; center: V2; shift: V2 }

/**
 * The unfolded 2D map of a puzzle, drawn as SVG polygons. Dragging a sticker across the
 * map turns the layer it moves along by one step, as dragging it on the 3D view would,
 * and a turn slides each face's stickers along as if the puzzle were unfolded around it.
 */
export class NetView {
  private cells: SVGPolygonElement[] = [];
  private labels: (SVGTextElement | undefined)[] = [];
  private ghosts!: SVGGElement;
  private puzzle!: Puzzle;
  private state: State = [];
  private faces: Face[] = [];
  private faceOf: number[] = [];
  /** sticker centers in 3D */
  private centers: V3[] = [];
  /** per sticker: how its drag options move it across the map, per radian */
  private dirs: { option: DragOption; dir: V2 }[][] = [];
  private frame = 0;
  private finish: (() => void) | null = null;
  /** a pressed sticker, held until the pointer lets go; `turned` once it has turned its layer */
  private drag: { pointer: number; sticker: number; x: number; y: number; turned: boolean } | null = null;
  /** the sticker under the pointer, here or in another view */
  private hovered = -1;
  /** the sticker pressed, here or in another view, and the stickers lit for it */
  private held = -1;
  private lit: Set<number> | null = null;

  constructor(private container: HTMLElement, private handlers: NetHandlers) {}

  setPuzzle(puzzle: Puzzle) {
    this.stop();
    this.drag = null;
    this.hovered = -1;
    this.held = -1;
    this.lit = null;
    this.state = [];
    this.puzzle = puzzle;
    this.centers = puzzle.stickers.map((s) => mean(s.outline));
    this.buildFaces();
    this.dirs = puzzle.stickers.map((s) => this.dragDirs(s.index));
    const [w, h] = puzzle.netSize;
    const pad = 0.15 * UNIT;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${w * UNIT + 2 * pad} ${h * UNIT + 2 * pad}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${puzzle.name} map`);
    const defs = document.createElementNS(SVG, 'defs');
    this.faces.forEach((f, k) => {
      const clip = document.createElementNS(SVG, 'clipPath');
      clip.id = `net-face-${k}`;
      const poly = document.createElementNS(SVG, 'polygon');
      poly.setAttribute('points', f.outline.map(([x, y]) => `${x * UNIT},${y * UNIT}`).join(' '));
      clip.append(poly);
      defs.append(clip);
    });
    svg.append(defs);
    this.labels = [];
    this.cells = puzzle.stickers.map((s) => {
      const poly = document.createElementNS(SVG, 'polygon');
      poly.setAttribute('points', s.net.map(([x, y]) => `${x * UNIT},${y * UNIT}`).join(' '));
      poly.setAttribute('class', 'cell');
      poly.addEventListener('click', () => this.handlers.onClick(s.index));
      poly.addEventListener('pointerdown', (e) => this.startDrag(e, s.index));
      poly.addEventListener('pointerenter', (e) => this.hover(e, s.index));
      poly.addEventListener('pointerleave', (e) => this.hover(e, -1));
      svg.append(poly);
      if (s.netLabel) {
        const [cx, cy] = mean(s.net);
        const t = document.createElementNS(SVG, 'text');
        t.setAttribute('x', String(cx * UNIT));
        t.setAttribute('y', String(cy * UNIT));
        t.setAttribute('class', 'label');
        t.textContent = s.netLabel;
        svg.append(t);
        this.labels[s.index] = t;
      }
      return poly;
    });
    // stickers sliding during a turn, above the rest
    this.ghosts = document.createElementNS(SVG, 'g');
    svg.append(this.ghosts);
    svg.addEventListener('pointermove', (e) => this.moveDrag(e));
    svg.addEventListener('pointerup', () => this.endDrag());
    svg.addEventListener('pointercancel', () => this.endDrag());
    this.container.replaceChildren(svg);
    this.container.dataset.puzzle = puzzle.id;
  }

  /** Group the stickers by face, and fit how each face's plane lies on the map. */
  private buildFaces() {
    const { stickers } = this.puzzle;
    this.faces = [];
    this.faceOf = stickers.map((s) => {
      let k = this.faces.findIndex((f) => dot(f.normal, s.normal) > 0.999);
      if (k < 0) k = this.faces.push({ normal: s.normal, stickers: [] } as unknown as Face) - 1;
      this.faces[k].stickers.push(s.index);
      return k;
    });
    for (const f of this.faces) {
      const spot = (j: number) => mean(stickers[j].net);
      const [o, ...peers] = f.stickers;
      const c = this.centers[o];
      const far = (j: number) => dot(sub(this.centers[j], c), sub(this.centers[j], c));
      // two stickers far apart and far from a line through the first, so the fit is steady
      const t1 = peers.reduce((b, j) => (far(j) > far(b) ? j : b), peers[0]);
      f.origin = c;
      f.spot = spot(o);
      f.outline = hull(f.stickers.flatMap((j) => stickers[j].net));
      if (t1 === undefined) continue;
      const e1 = sub(this.centers[t1], c);
      const area = (j: number) => Math.abs(dot(cross(e1, sub(this.centers[j], c)), f.normal));
      const t2 = peers.reduce((b, j) => (area(j) > area(b) ? j : b), t1);
      if (area(t2) < 1e-6) continue;
      const e2 = sub(this.centers[t2], c);
      const g11 = dot(e1, e1), g12 = dot(e1, e2), g22 = dot(e2, e2), det = g11 * g22 - g12 * g12;
      Object.assign(f, {
        e1, e2,
        inv: [g22 / det, -g12 / det, g11 / det],
        f1: [spot(t1)[0] - f.spot[0], spot(t1)[1] - f.spot[1]],
        f2: [spot(t2)[0] - f.spot[0], spot(t2)[1] - f.spot[1]],
      });
    }
  }

  /** A vector in a face's plane, as it lies on the map. */
  private toMapVec(f: Face, v: V3): V2 {
    const p = dot(v, f.e1), q = dot(v, f.e2);
    const a = f.inv[0] * p + f.inv[1] * q, b = f.inv[1] * p + f.inv[2] * q;
    return [a * f.f1[0] + b * f.f2[0], a * f.f1[1] + b * f.f2[1]];
  }

  /** A point in a face's plane, as it lies on the map. */
  private toMap(f: Face, p: V3): V2 {
    const v = this.toMapVec(f, sub(p, f.origin));
    return [f.spot[0] + v[0], f.spot[1] + v[1]];
  }

  /** The map direction each of a sticker's drag options moves it in. */
  private dragDirs(i: number) {
    const f = this.faces[this.faceOf[i]];
    if (!f.e1) return [];
    return this.puzzle.dragOptions(i).map((option) => ({ option, dir: this.toMapVec(f, cross(option.axis, this.centers[i])) })); // velocity for +1 rad
  }

  /** Outline the sticker the pointer is on in another view (-1 for none). */
  showHover(i: number) {
    this.hovered = i;
    this.refreshFocus();
  }

  /** Outline a pressed sticker and dim everything off its rings (or only the one that turns `pieces`); -1 lets go. */
  showGrab(i: number, pieces?: number[]) {
    this.held = i;
    const map = this.puzzle.rings;
    const rings = i >= 0 && map ? ringsOf(this.puzzle, i, pieces) : [];
    this.lit = rings.length ? new Set(rings.flatMap((r) => map!.circles[r].stickers)) : null;
    this.refreshFocus();
  }

  private refreshFocus() {
    const outlined = this.held >= 0 ? this.held : this.hovered;
    this.cells.forEach((c, i) => {
      const dim = !!this.lit && !this.lit.has(i);
      c.classList.toggle('hover', i === outlined);
      c.classList.toggle('dim', dim);
      this.labels[i]?.classList.toggle('dim', dim);
    });
  }

  private hover(e: PointerEvent, i: number) {
    // a touch has no hover, and a drag holds its sticker
    if (e.pointerType !== 'mouse' || this.drag) return;
    this.showHover(i);
    this.handlers.onHover(i);
  }

  private startDrag(e: PointerEvent, i: number) {
    if (!this.handlers.canTurn() || this.drag || !this.dirs[i]?.length) return;
    this.drag = { pointer: e.pointerId, sticker: i, x: e.clientX, y: e.clientY, turned: false };
    const svg = (e.currentTarget as Element).closest('svg')!;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
    this.showGrab(i);
    this.handlers.onGrab(i);
  }

  /** Once the pointer has moved far enough, turn the layer it's moving the sticker along. */
  private moveDrag(e: PointerEvent) {
    const d = this.drag;
    if (!d || d.turned || e.pointerId !== d.pointer) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) < DRAG_START) return;
    // the screen and the map share their axes, so the drag's direction can be compared as is
    let best = { along: 0, option: undefined as DragOption | undefined };
    for (const { option, dir } of this.dirs[d.sticker]) {
      const along = (dir[0] * dx + dir[1] * dy) / (Math.hypot(...dir) * Math.hypot(dx, dy) || 1);
      if (Math.abs(along) > Math.abs(best.along)) best = { along, option };
    }
    // one turn per press; the sticker stays held, lighting only its turning layer, until let go
    d.turned = true;
    if (!best.option) return;
    const move = best.option.toMove(Math.sign(best.along));
    if (!move) return;
    this.showGrab(d.sticker, best.option.pieces);
    this.handlers.onGrab(d.sticker, best.option.pieces);
    this.handlers.onTurn(move);
  }

  private endDrag() {
    if (!this.drag) return;
    this.drag = null;
    this.container.querySelector('svg')?.classList.remove('dragging');
    this.showGrab(-1);
    this.handlers.onGrab(-1);
  }

  update(state: State) {
    this.stop();
    this.paint(state);
  }

  private paint(state: State) {
    this.state = state;
    state.forEach((c, i) => this.cells[i]?.style.setProperty('fill', this.puzzle.colors[c]));
  }

  /** Show `next`, sliding the turning stickers there. */
  animateTurn(turn: Turn, next: State, duration: number) {
    this.stop();
    const before = this.state;
    this.paint(next);
    if (duration <= 0 || before.length !== next.length || this.container.classList.contains('hidden')) return;
    // quarter turns for cubes; a turn of a third is one step too
    const steps = Math.max(1, Math.round(Math.abs(turn.angle) / (Math.PI / 2)));
    const place = this.slide(turn, turn.angle / steps, steps, before);
    if (!place) return;
    const total = duration * (Math.abs(turn.angle) > Math.PI * 0.75 ? 1.35 : 1); // as the 3D view takes
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / total);
      if (t < 1) {
        place(steps * ease(t));
        this.frame = requestAnimationFrame(tick);
      } else this.stop();
    };
    place(0);
    this.frame = requestAnimationFrame(tick);
  }

  /**
   * Lay copies of the turning stickers over their places, showing `before`, and return how
   * to place them a number of `step`s into the turn, up to `count`. Unfolded around a face,
   * a turn moves the part of its layer on that face rigidly: a strip shifts across it (each
   * step carrying in what was on the face before it), or the face spins in place.
   */
  private slide(turn: Turn, step: number, count: number, before: State) {
    const pieces = new Set(turn.pieces);
    const layer = this.puzzle.stickers.filter((s) => pieces.has(s.piece)).map((s) => s.index);
    // where each sticker's content comes from after one step
    const moved = layer.map((s) => rotate(this.centers[s], turn.axis, step));
    const from = new Map<number, number>();
    for (const d of layer) {
      let best = d, bestD = Infinity;
      layer.forEach((s, k) => {
        const dd = dot(sub(moved[k], this.centers[d]), sub(moved[k], this.centers[d]));
        if (dd < bestD) { bestD = dd; best = s; }
      });
      from.set(d, best);
    }
    const back = (d: number, j: number) => { for (let k = 0; k < j; k++) d = from.get(d)!; return d; };

    const shown: SVGPolygonElement[] = [];
    const moving: { el: SVGPolygonElement; motion: Motion; offset: number }[] = [];
    this.faces.forEach((f, k) => {
      const here = layer.filter((d) => this.faceOf[d] === k && from.get(d) !== d);
      if (!here.length || !f.e1) return;
      const source = this.faceOf[from.get(here[0])!];
      const motion = this.motion(f, this.faces[source], turn.axis, step);
      const spins = source === k;
      const g = document.createElementNS(SVG, 'g');
      // a strip slides off the face's edge; a spinning face turns whole
      if (!spins) g.setAttribute('clip-path', `url(#net-face-${k})`);
      this.ghosts.append(g);
      for (const d of here) {
        shown.push(this.cells[d]);
        // the stickers that pass this place: what's here now (j = 0) to what's `count` steps back;
        // a spinning face only turns what's on it
        for (let j = 0; j <= (spins ? 0 : count); j++) {
          const el = document.createElementNS(SVG, 'polygon');
          el.setAttribute('points', this.cells[d].getAttribute('points')!);
          el.setAttribute('class', 'ghost');
          el.style.fill = this.puzzle.colors[before[back(d, j)]];
          g.append(el);
          moving.push({ el, motion, offset: j });
        }
      }
    });
    if (!moving.length) return null;
    for (const c of shown) c.classList.add('slot');
    this.finish = () => {
      this.ghosts.replaceChildren();
      for (const c of shown) c.classList.remove('slot');
    };
    return (amount: number) => {
      for (const m of moving) m.el.setAttribute('transform', this.transform(m.motion, amount - m.offset));
    };
  }

  /**
   * How one `step` of a turn moves what's on face `f`, unfolded: fold the face onto the
   * `source` face its content comes from, turn that with the layer, and see where it lands.
   */
  private motion(f: Face, source: Face, axis: V3, step: number): Motion {
    let fold = (p: V3) => p;
    if (source !== f) {
      // the hinge where the two faces' planes meet
      const k = dot(f.normal, source.normal);
      const dF = dot(f.normal, f.origin), dS = dot(source.normal, source.origin);
      const a = (dF - k * dS) / (1 - k * k), b = (dS - k * dF) / (1 - k * k);
      const at = add(scale(f.normal, a), scale(source.normal, b));
      const hinge = cross(source.normal, f.normal);
      const unit = scale(hinge, 1 / Math.hypot(...hinge));
      const angle = Math.acos(Math.max(-1, Math.min(1, k)));
      fold = (p) => rotate(p, unit, -angle, at);
    }
    const land = (p: V3) => this.toMap(f, rotate(fold(p), axis, step));
    const y0 = land(f.origin), y1 = land(add(f.origin, f.e1)), y2 = land(add(f.origin, f.e2));
    // the 2D map taking (spot, spot + f1, spot + f2) to (y0, y1, y2)
    const [[p, q], [r, s]] = [f.f1, f.f2];
    const det = p * s - q * r;
    const u = [y1[0] - y0[0], y1[1] - y0[1]], v = [y2[0] - y0[0], y2[1] - y0[1]];
    const A = [
      [(u[0] * s - v[0] * q) / det, (v[0] * p - u[0] * r) / det],
      [(u[1] * s - v[1] * q) / det, (v[1] * p - u[1] * r) / det],
    ];
    const shift: V2 = [y0[0] - A[0][0] * f.spot[0] - A[0][1] * f.spot[1], y0[1] - A[1][0] * f.spot[0] - A[1][1] * f.spot[1]];
    const angle = Math.atan2(A[1][0], A[0][0]);
    if (Math.abs(angle) < 1e-6) return { angle: 0, center: [0, 0], shift };
    // the point it turns about: (I − A) c = shift
    const m00 = 1 - A[0][0], m01 = -A[0][1], m10 = -A[1][0], m11 = 1 - A[1][1], md = m00 * m11 - m01 * m10;
    return { angle, center: [(shift[0] * m11 - m01 * shift[1]) / md, (m00 * shift[1] - m10 * shift[0]) / md], shift };
  }

  /** The SVG transform for `amount` steps of a motion (fractional or negative). */
  private transform(m: Motion, amount: number) {
    if (!m.angle) return `translate(${m.shift[0] * amount * UNIT} ${m.shift[1] * amount * UNIT})`;
    return `rotate(${(m.angle * amount * 180) / Math.PI} ${m.center[0] * UNIT} ${m.center[1] * UNIT})`;
  }

  /** Jump a running animation to its end. */
  private stop() {
    cancelAnimationFrame(this.frame);
    this.finish?.();
    this.finish = null;
  }

  flash(indices: number[]) {
    for (const i of indices) {
      const c = this.cells[i];
      if (!c) continue;
      c.classList.remove('bad');
      void c.getBoundingClientRect();
      c.classList.add('bad');
    }
    setTimeout(() => indices.forEach((i) => this.cells[i]?.classList.remove('bad')), 2600);
  }
}
