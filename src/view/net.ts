import type { DragOption, Puzzle, State, Vec3 } from '../core/types';
import { ringsOf } from './rings';

const SVG = 'http://www.w3.org/2000/svg';
// Draw at 100× the puzzle's map units so text sizes stay well above browsers' minimum font size.
const UNIT = 100;

/** How far the pointer moves before a drag picks a layer, in CSS pixels. */
const DRAG_START = 8;

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
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mean = <T extends number[]>(pts: T[]) => pts[0].map((_, k) => pts.reduce((a, p) => a + p[k], 0) / pts.length) as T;

/**
 * The unfolded 2D map of a puzzle, drawn as SVG polygons. Dragging a sticker across the
 * map turns the layer it moves along by one step, as dragging it on the 3D view would.
 */
export class NetView {
  private cells: SVGPolygonElement[] = [];
  private labels: (SVGTextElement | undefined)[] = [];
  private puzzle!: Puzzle;
  /** per sticker: how its drag options move it across the map, per radian */
  private dirs: { option: DragOption; dir: [number, number] }[][] = [];
  /** a pressed sticker, held until the pointer lets go; `turned` once it has turned its layer */
  private drag: { pointer: number; sticker: number; x: number; y: number; turned: boolean } | null = null;
  /** the sticker under the pointer, here or in another view */
  private hovered = -1;
  /** the sticker pressed, here or in another view, and the stickers lit for it */
  private held = -1;
  private lit: Set<number> | null = null;

  constructor(private container: HTMLElement, private handlers: NetHandlers) {}

  setPuzzle(puzzle: Puzzle) {
    this.drag = null;
    this.hovered = -1;
    this.held = -1;
    this.lit = null;
    this.puzzle = puzzle;
    this.dirs = puzzle.stickers.map((s) => this.dragDirs(s.index));
    const [w, h] = puzzle.netSize;
    const pad = 0.15 * UNIT;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${w * UNIT + 2 * pad} ${h * UNIT + 2 * pad}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${puzzle.name} map`);
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
    svg.addEventListener('pointermove', (e) => this.moveDrag(e));
    svg.addEventListener('pointerup', () => this.endDrag());
    svg.addEventListener('pointercancel', () => this.endDrag());
    this.container.replaceChildren(svg);
    this.container.dataset.puzzle = puzzle.id;
  }

  /**
   * The map direction each of a sticker's drag options moves it in. A face lies flat on
   * the map, so the face's stickers fix how its plane maps there: the sticker's motion in
   * 3D, written in two of its neighbors' offsets, moves it by the same mix of their offsets
   * on the map.
   */
  private dragDirs(i: number) {
    const { stickers } = this.puzzle;
    const center = (j: number) => mean(stickers[j].outline);
    const spot = (j: number) => mean(stickers[j].net);
    const n = stickers[i].normal;
    const peers = stickers.filter((s) => s.index !== i && dot(s.normal, n) > 0.999).map((s) => s.index);
    const c = center(i);
    // two neighbors far apart and far from a line through the sticker, so the fit is steady
    const t1 = peers.reduce((b, j) => (dot(sub(center(j), c), sub(center(j), c)) > dot(sub(center(b), c), sub(center(b), c)) ? j : b), peers[0]);
    if (t1 === undefined) return [];
    const e1 = sub(center(t1), c);
    const area = (j: number) => Math.abs(dot(cross(e1, sub(center(j), c)), n));
    const t2 = peers.reduce((b, j) => (area(j) > area(b) ? j : b), t1);
    if (area(t2) < 1e-6) return [];
    const e2 = sub(center(t2), c);
    const m = spot(i), f1 = sub([...spot(t1), 0], [...m, 0]), f2 = sub([...spot(t2), 0], [...m, 0]);
    const g11 = dot(e1, e1), g12 = dot(e1, e2), g22 = dot(e2, e2), det = g11 * g22 - g12 * g12;
    return this.puzzle.dragOptions(i).map((option) => {
      const v = cross(option.axis, c); // velocity for +1 rad
      const p = dot(v, e1), q = dot(v, e2);
      const a = (p * g22 - q * g12) / det, b = (q * g11 - p * g12) / det;
      return { option, dir: [a * f1[0] + b * f2[0], a * f1[1] + b * f2[1]] as [number, number] };
    });
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
    state.forEach((c, i) => this.cells[i]?.style.setProperty('fill', this.puzzle.colors[c]));
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
