import type { DragOption, Puzzle, State, Turn, Vec3 } from '../core/types';
import { add, cross, dot, mean, rotate, scale, sub } from '../core/vec';
import { turnDuration } from './anim';
import { MapView, SVG, UNIT } from './map';

type V2 = [number, number];

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
 * offsets (`e1`, `e2`) from a third (`origin`), sits at the same mix of their offsets on
 * the map (`f1`, `f2` from `spot`).
 */
interface Fit {
  e1: Vec3;
  e2: Vec3;
  /** the inverse of the offsets' Gram matrix */
  inv: [number, number, number];
  f1: V2;
  f2: V2;
}

interface Face {
  normal: Vec3;
  stickers: number[];
  origin: Vec3;
  spot: V2;
  /** the face's outline on the map, to clip what slides off it */
  outline: V2[];
  /** missing if the face has too few stickers to place its plane */
  fit?: Fit;
}

/** A rigid motion of the map: a shift, or a turn about a point. */
type Motion = { shift: V2 } | { angle: number; center: V2 };

/**
 * The unfolded 2D map of a puzzle, drawn as SVG polygons. Dragging a sticker across the
 * map turns the layer it moves along by one step, as dragging it on the 3D view would,
 * and a turn slides each face's stickers along as if the puzzle were unfolded around it.
 */
export class NetView extends MapView {
  private labels: (SVGTextElement | undefined)[] = [];
  private ghosts!: SVGGElement;
  private state: State = [];
  private faces: Face[] = [];
  private faceOf: number[] = [];
  /** sticker centers in 3D */
  private centers: Vec3[] = [];
  /** per sticker: how its drag options move it across the map, per radian */
  private dirs: { option: DragOption; dir: V2 }[][] = [];
  /** stickers slid along by a drag in the 3D view */
  private dragging: { move: string; count: number; place: (steps: number) => void } | null = null;

  setPuzzle(puzzle: Puzzle) {
    this.reset();
    this.state = [];
    this.puzzle = puzzle;
    this.centers = puzzle.stickers.map((s) => mean(s.outline));
    this.faces = this.buildFaces();
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
      this.listen(poly, s.index);
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
    this.listenDrags(svg);
    this.container.replaceChildren(svg);
    this.container.dataset.puzzle = puzzle.id;
  }

  /** Group the stickers by face, and fit how each face's plane lies on the map. */
  private buildFaces(): Face[] {
    const { stickers } = this.puzzle;
    const groups: { normal: Vec3; stickers: number[] }[] = [];
    this.faceOf = stickers.map((s) => {
      let k = groups.findIndex((g) => dot(g.normal, s.normal) > 0.999);
      if (k < 0) k = groups.push({ normal: s.normal, stickers: [] }) - 1;
      groups[k].stickers.push(s.index);
      return k;
    });
    const spot = (j: number) => mean(stickers[j].net);
    return groups.map(({ normal, stickers: own }) => {
      const [o, ...peers] = own;
      const c = this.centers[o];
      const face: Face = { normal, stickers: own, origin: c, spot: spot(o), outline: hull(own.flatMap((j) => stickers[j].net)) };
      const far = (j: number) => dot(sub(this.centers[j], c), sub(this.centers[j], c));
      // two stickers far apart and far from a line through the first, so the fit is steady
      const t1 = peers.reduce((b, j) => (far(j) > far(b) ? j : b), peers[0]);
      if (t1 === undefined) return face;
      const e1 = sub(this.centers[t1], c);
      const area = (j: number) => Math.abs(dot(cross(e1, sub(this.centers[j], c)), normal));
      const t2 = peers.reduce((b, j) => (area(j) > area(b) ? j : b), t1);
      if (area(t2) < 1e-6) return face;
      const e2 = sub(this.centers[t2], c);
      const g11 = dot(e1, e1), g12 = dot(e1, e2), g22 = dot(e2, e2), det = g11 * g22 - g12 * g12;
      const offset = (j: number): V2 => [spot(j)[0] - face.spot[0], spot(j)[1] - face.spot[1]];
      face.fit = { e1, e2, inv: [g22 / det, -g12 / det, g11 / det], f1: offset(t1), f2: offset(t2) };
      return face;
    });
  }

  /** A vector in a face's plane, as it lies on the map. */
  private toMapVec(fit: Fit, v: Vec3): V2 {
    const p = dot(v, fit.e1), q = dot(v, fit.e2);
    const a = fit.inv[0] * p + fit.inv[1] * q, b = fit.inv[1] * p + fit.inv[2] * q;
    return [a * fit.f1[0] + b * fit.f2[0], a * fit.f1[1] + b * fit.f2[1]];
  }

  /** A point in a face's plane, as it lies on the map. */
  private toMap(f: Face, fit: Fit, p: Vec3): V2 {
    const v = this.toMapVec(fit, sub(p, f.origin));
    return [f.spot[0] + v[0], f.spot[1] + v[1]];
  }

  /** The map direction each of a sticker's drag options moves it in. */
  private dragDirs(i: number) {
    const { fit } = this.faces[this.faceOf[i]];
    if (!fit) return [];
    // velocity for +1 rad
    return this.puzzle.dragOptions(i).map((option) => ({ option, dir: this.toMapVec(fit, cross(option.axis, this.centers[i])) }));
  }

  protected refreshDim() {
    super.refreshDim();
    this.labels.forEach((l, i) => l?.classList.toggle('dim', !!this.lit && !this.lit.has(i)));
  }

  protected canDrag(i: number) {
    return this.dirs[i].length > 0;
  }

  /** The drag option whose motion across the map the drag follows most closely. */
  protected pickTurn(sticker: number, dx: number, dy: number) {
    // the screen and the map share their axes, so the drag's direction can be compared as is
    let best = { along: 0, option: undefined as DragOption | undefined };
    for (const { option, dir } of this.dirs[sticker]) {
      const along = (dir[0] * dx + dir[1] * dy) / (Math.hypot(...dir) * Math.hypot(dx, dy) || 1);
      if (Math.abs(along) > Math.abs(best.along)) best = { along, option };
    }
    const move = best.option?.toMove(Math.sign(best.along));
    return move ? { move, pieces: best.option!.pieces } : null;
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
    if (duration <= 0 || before.length !== next.length || !this.visible) return;
    const steps = Math.max(1, Math.round(Math.abs(turn.angle) / turn.step));
    const place = this.slide(turn, turn.angle / steps, steps, before);
    if (place) this.play(turnDuration(turn, duration), (t) => place(steps * t));
  }

  /**
   * Follow a drag in the 3D view: slide the stickers `steps` of the way through `move` (one
   * step of it, maybe fractional or negative), or back to their places (null).
   */
  showDrag(move: string | null, steps: number) {
    if (!move || !this.visible) {
      if (this.dragging) this.stop();
      return;
    }
    if (steps < 0) [move, steps] = [this.puzzle.invertMove(move), -steps];
    // copies for as many steps as the drag has gone round
    const count = Math.max(1, Math.ceil(steps));
    if (!this.dragging || this.dragging.move !== move || this.dragging.count < count) {
      this.stop();
      const turn = this.puzzle.parseMove(move);
      const place = turn && this.slide(turn, turn.angle, count, this.state);
      if (!place) return;
      this.dragging = { move, count, place };
    }
    this.dragging.place(steps);
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
    // where each sticker's content comes from after one step (a whole turn's perm may be several)
    const moved = layer.map((s) => rotate(this.centers[s], turn.axis, step));
    const from = new Map<number, number>();
    for (const d of layer) {
      let best = d, bestD = Infinity;
      layer.forEach((s, k) => {
        const off = sub(moved[k], this.centers[d]), dd = dot(off, off);
        if (dd < bestD) { bestD = dd; best = s; }
      });
      from.set(d, best);
    }
    const back = (d: number, j: number) => { for (let k = 0; k < j; k++) d = from.get(d)!; return d; };

    const shown: SVGElement[] = [];
    const moving: { el: SVGPolygonElement; motion: Motion; offset: number }[] = [];
    this.faces.forEach((f, k) => {
      const here = layer.filter((d) => this.faceOf[d] === k && from.get(d) !== d);
      if (!here.length || !f.fit) return;
      const source = this.faceOf[from.get(here[0])!];
      const motion = this.motion(f, f.fit, this.faces[source], turn.axis, step);
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
      for (const m of moving) m.el.setAttribute('transform', transform(m.motion, amount - m.offset));
    };
  }

  /**
   * How one `step` of a turn moves what's on face `f`, unfolded: fold the face onto the
   * `source` face its content comes from, turn that with the layer, and see where it lands.
   */
  private motion(f: Face, fit: Fit, source: Face, axis: Vec3, step: number): Motion {
    let fold = (p: Vec3) => p;
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
    const land = (p: Vec3) => this.toMap(f, fit, rotate(fold(p), axis, step));
    const y0 = land(f.origin), y1 = land(add(f.origin, fit.e1)), y2 = land(add(f.origin, fit.e2));
    // the 2D map taking (spot, spot + f1, spot + f2) to (y0, y1, y2)
    const [[p, q], [r, s]] = [fit.f1, fit.f2];
    const det = p * s - q * r;
    const u = [y1[0] - y0[0], y1[1] - y0[1]], v = [y2[0] - y0[0], y2[1] - y0[1]];
    const A = [
      [(u[0] * s - v[0] * q) / det, (v[0] * p - u[0] * r) / det],
      [(u[1] * s - v[1] * q) / det, (v[1] * p - u[1] * r) / det],
    ];
    const shift: V2 = [y0[0] - A[0][0] * f.spot[0] - A[0][1] * f.spot[1], y0[1] - A[1][0] * f.spot[0] - A[1][1] * f.spot[1]];
    const angle = Math.atan2(A[1][0], A[0][0]);
    if (Math.abs(angle) < 1e-6) return { shift };
    // the point it turns about: (I − A) c = shift
    const m00 = 1 - A[0][0], m01 = -A[0][1], m10 = -A[1][0], m11 = 1 - A[1][1], md = m00 * m11 - m01 * m10;
    return { angle, center: [(shift[0] * m11 - m01 * shift[1]) / md, (m00 * shift[1] - m10 * shift[0]) / md] };
  }

  protected stop() {
    super.stop();
    this.dragging = null;
  }
}

/** The SVG transform for `amount` steps of a motion (fractional or negative). */
function transform(m: Motion, amount: number) {
  if ('shift' in m) return `translate(${m.shift[0] * amount * UNIT} ${m.shift[1] * amount * UNIT})`;
  return `rotate(${(m.angle * amount * 180) / Math.PI} ${m.center[0] * UNIT} ${m.center[1] * UNIT})`;
}
