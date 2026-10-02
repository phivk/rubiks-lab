import type { Puzzle, State, Turn } from '../core/types';

const SVG = 'http://www.w3.org/2000/svg';
// Same scale as the net, so text and strokes size alike.
const UNIT = 100;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** How far the pointer moves before a drag picks a ring, in CSS pixels. */
const DRAG_START = 8;

export interface RingHandlers {
  onClick: (index: number) => void;
  /** a dot was dragged along one of its rings */
  onTurn: (move: string) => void;
  canTurn: () => boolean;
  /** the mouse moved onto a dot, or off them all (-1) */
  onHover: (index: number) => void;
  /** a dot was pressed to drag (`pieces` once the drag picked a layer), or let go (-1) */
  onGrab: (index: number, pieces?: number[]) => void;
}

/** The circles a sticker sits on; given the pieces of a turning layer, only that layer's. */
export function ringsOf(puzzle: Puzzle, sticker: number, pieces?: number[]): number[] {
  const turning = pieces && new Set(pieces);
  return (puzzle.rings?.circles ?? []).flatMap((c, i) =>
    c.stickers.includes(sticker) && (!turning || c.stickers.every((s) => turning.has(puzzle.stickers[s].piece))) ? [i] : [],
  );
}

/**
 * The ring map of a puzzle (see `src/cube/rings.ts`): dots slide along a layer's circle as
 * it turns. Dragging a dot along one of its two circles turns that layer a quarter turn.
 */
export class RingView {
  private dots: SVGCircleElement[] = [];
  private rings: SVGCircleElement[] = [];
  private labels: (SVGGElement | undefined)[] = [];
  private puzzle!: Puzzle;
  private frame = 0;
  private finish: (() => void) | null = null;
  /** a pressed dot, held until the pointer lets go; `turned` once it has turned its layer */
  private drag: { pointer: number; dot: number; x: number; y: number; turned: boolean } | null = null;
  /** dots pulled off their places by a drag in the 3D view */
  private dragging = false;
  /** the dot under the pointer, here or in the 3D view */
  private hovered = -1;
  /** the dot pressed, here or in the 3D view, and the circles lit for it */
  private held = -1;
  private lit: number[] = [];

  constructor(private container: HTMLElement, private handlers: RingHandlers) {}

  setPuzzle(puzzle: Puzzle) {
    this.stop();
    this.drag = null;
    this.hovered = -1;
    this.held = -1;
    this.lit = [];
    this.dragging = false;
    this.puzzle = puzzle;
    const map = puzzle.rings;
    if (!map) {
      this.dots = [];
      this.rings = [];
      this.labels = [];
      this.container.replaceChildren();
      return;
    }
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${map.size[0] * UNIT} ${map.size[1] * UNIT}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${puzzle.name} ring map`);
    this.rings = map.circles.map((c) => {
      const el = document.createElementNS(SVG, 'circle');
      el.setAttribute('cx', String(c.cx * UNIT));
      el.setAttribute('cy', String(c.cy * UNIT));
      el.setAttribute('r', String(c.r * UNIT));
      el.setAttribute('class', 'ring');
      svg.append(el);
      return el;
    });
    this.dots = map.points.map(([x, y], i) => {
      const el = document.createElementNS(SVG, 'circle');
      el.setAttribute('cx', String(x * UNIT));
      el.setAttribute('cy', String(y * UNIT));
      el.setAttribute('r', String(map.dot * UNIT));
      el.setAttribute('class', 'cell');
      el.addEventListener('click', () => this.handlers.onClick(i));
      el.addEventListener('pointerdown', (e) => this.startDrag(e, i));
      el.addEventListener('pointerenter', (e) => this.hover(e, i));
      el.addEventListener('pointerleave', (e) => this.hover(e, -1));
      svg.append(el);
      return el;
    });
    // each layer's name on its far side: faces in their color, M/E/S plain
    this.labels = map.circles.map((c) => {
      if (!c.label) return undefined;
      const [x, y] = c.labelAt;
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', c.face === undefined ? 'ring-label slice' : 'ring-label');
      // a rounded square, so a label doesn't look like one more sticker
      const s = map.labelSize * UNIT;
      const chip = document.createElementNS(SVG, 'rect');
      chip.setAttribute('x', String(x * UNIT - s));
      chip.setAttribute('y', String(y * UNIT - s));
      chip.setAttribute('width', String(2 * s));
      chip.setAttribute('height', String(2 * s));
      chip.setAttribute('rx', String(0.35 * s));
      if (c.face !== undefined) chip.style.fill = puzzle.colors[c.face];
      const text = document.createElementNS(SVG, 'text');
      text.setAttribute('x', String(x * UNIT));
      text.setAttribute('y', String(y * UNIT));
      text.setAttribute('font-size', String(map.labelSize * 1.4 * UNIT));
      text.textContent = c.label;
      g.append(chip, text);
      svg.append(g);
      return g;
    });
    svg.addEventListener('pointermove', (e) => this.moveDrag(e));
    svg.addEventListener('pointerup', () => this.endDrag());
    svg.addEventListener('pointercancel', () => this.endDrag());
    this.container.replaceChildren(svg);
  }

  /** Outline the dot of a sticker the pointer is on in the 3D view (-1 for none). */
  showHover(dot: number) {
    this.hovered = dot;
    this.refreshFocus();
  }

  /** Outline a pressed dot and light the circles it sits on (or only the one that turns `pieces`); -1 lets go. */
  showGrab(dot: number, pieces?: number[]) {
    this.held = dot;
    this.lit = dot >= 0 ? ringsOf(this.puzzle, dot, pieces) : [];
    this.refreshFocus();
  }

  private refreshFocus() {
    const outlined = this.held >= 0 ? this.held : this.hovered;
    this.dots.forEach((d, i) => d.classList.toggle('hover', i === outlined));
    // like the 3D view, everything off the held rings dims
    const on = new Set(this.lit.flatMap((r) => this.puzzle.rings!.circles[r].stickers));
    const dim = this.lit.length > 0;
    this.dots.forEach((d, i) => d.classList.toggle('dim', dim && !on.has(i)));
    this.rings.forEach((r, i) => {
      r.classList.toggle('grabbed', this.lit.includes(i));
      r.classList.toggle('dim', dim && !this.lit.includes(i));
      this.labels[i]?.classList.toggle('dim', dim && !this.lit.includes(i));
    });
  }

  private hover(e: PointerEvent, dot: number) {
    // a touch has no hover, and a drag holds its dot
    if (e.pointerType !== 'mouse' || this.drag) return;
    this.showHover(dot);
    this.handlers.onHover(dot);
  }

  private startDrag(e: PointerEvent, dot: number) {
    if (!this.handlers.canTurn() || this.drag) return;
    this.drag = { pointer: e.pointerId, dot, x: e.clientX, y: e.clientY, turned: false };
    const svg = (e.currentTarget as Element).closest('svg')!;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
    this.showGrab(dot);
    this.handlers.onGrab(dot);
  }

  /** Once the pointer has moved far enough, turn the circle it's moving along. */
  private moveDrag(e: PointerEvent) {
    const d = this.drag;
    if (!d || d.turned || e.pointerId !== d.pointer) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) < DRAG_START) return;
    const map = this.puzzle.rings!;
    const [px, py] = map.points[d.dot];
    // the screen and the map share their axes, so the drag's direction can be compared as is
    let best = { along: 0, circle: -1 };
    for (const i of ringsOf(this.puzzle, d.dot)) {
      const c = map.circles[i];
      const a = Math.atan2(py - c.cy, px - c.cx);
      // the tangent toward growing angle
      const along = (-Math.sin(a) * dx + Math.cos(a) * dy) / Math.hypot(dx, dy);
      if (Math.abs(along) > Math.abs(best.along)) best = { along, circle: i };
    }
    // one turn per press; the dot stays held, lighting only its turning ring, until let go
    d.turned = true;
    if (!best.along) return;
    const c = map.circles[best.circle];
    const move = c.move(Math.sign(best.along) * c.sense);
    const pieces = this.puzzle.parseMove(move)!.pieces;
    this.showGrab(d.dot, pieces);
    this.handlers.onGrab(d.dot, pieces);
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
    state.forEach((c, i) => this.dots[i]?.style.setProperty('fill', this.puzzle.colors[c]));
  }

  /**
   * Follow a drag in the 3D view: slide the dots `steps` of the way through `move` (one
   * step of it, maybe fractional or negative), or back to their places (null).
   */
  showDrag(move: string | null, steps: number) {
    const map = this.puzzle.rings;
    if (!map) return;
    this.stop();
    if (!move) {
      this.settle();
      return;
    }
    if (steps < 0) [move, steps] = [this.puzzle.invertMove(move), -steps];
    const turn = this.puzzle.parseMove(move);
    if (!turn) return;
    const { paths, turning } = this.paths(turn);
    this.dragging = true;
    this.rings.forEach((r, i) => r.classList.toggle('turning', turning.includes(i)));
    // where each sticker goes: the dot showing it follows its path there, a step at a time
    const destOf: number[] = [];
    turn.perm.forEach((src, dest) => (destOf[src] = dest));
    const whole = Math.floor(steps);
    this.dots.forEach((el, i) => {
      let at = i;
      for (let k = 0; k < whole; k++) at = destOf[at];
      const next = destOf[at];
      const [x, y] = next === at ? map.points[at] : paths[next](steps - whole);
      el.setAttribute('cx', String(x * UNIT));
      el.setAttribute('cy', String(y * UNIT));
    });
  }

  /** Put every dot back on its place after a drag in the 3D view. */
  private settle() {
    if (!this.dragging) return;
    this.dragging = false;
    const map = this.puzzle.rings!;
    this.dots.forEach((el, i) => {
      el.setAttribute('cx', String(map.points[i][0] * UNIT));
      el.setAttribute('cy', String(map.points[i][1] * UNIT));
    });
    for (const r of this.rings) r.classList.remove('turning');
  }

  /**
   * How each moved dot slides to its place from where its sticker was: along the circle of
   * a turning layer, or straight across for a turning face. Indexed by destination.
   */
  private paths(turn: Turn) {
    const map = this.puzzle.rings!;
    const pieces = new Set(turn.pieces);
    const turning = map.circles
      .map((c, i) => ({ ...c, i }))
      .filter((c) => c.stickers.every((s) => pieces.has(this.puzzle.stickers[s].piece)));
    const onRing = new Map<number, (typeof turning)[number]>();
    for (const c of turning) for (const s of c.stickers) onRing.set(s, c);

    const angle = (c: { cx: number; cy: number }, i: number) => Math.atan2(map.points[i][1] - c.cy, map.points[i][0] - c.cx);
    const ccw = (from: number, to: number) => (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // every dot on a ring goes the same way round: whichever way is shorter on average
    const way = new Map(turning.map((c) => {
      const moved = c.stickers.filter((d) => turn.perm[d] !== d);
      const mean = moved.reduce((sum, d) => sum + ccw(angle(c, turn.perm[d]), angle(c, d)), 0) / (moved.length || 1);
      return [c, mean > Math.PI ? -1 : 1];
    }));

    const paths: ((t: number) => [number, number])[] = [];
    turn.perm.forEach((src, dest) => {
      if (src === dest) return;
      const c = onRing.get(dest);
      if (c && onRing.get(src) === c) {
        const a0 = angle(c, src);
        let delta = ccw(a0, angle(c, dest));
        if (way.get(c)! < 0) delta -= 2 * Math.PI;
        paths[dest] = (t) => [c.cx + c.r * Math.cos(a0 + delta * t), c.cy + c.r * Math.sin(a0 + delta * t)];
      } else {
        const [x0, y0] = map.points[src], [x1, y1] = map.points[dest];
        paths[dest] = (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
      }
    });
    return { paths, turning: turning.map((c) => c.i) };
  }

  /** Show `next` and slide each moved dot there from where its sticker was. */
  animateTurn(turn: Turn, next: State, duration: number) {
    if (!this.puzzle.rings) return;
    this.stop();
    this.settle();
    this.update(next);
    const { paths, turning } = this.paths(turn);
    for (const i of turning) this.rings[i].classList.add('turning');
    const place = (t: number) => {
      paths.forEach((path, i) => {
        const [x, y] = path(t);
        this.dots[i].setAttribute('cx', String(x * UNIT));
        this.dots[i].setAttribute('cy', String(y * UNIT));
      });
    };
    this.finish = () => {
      place(1);
      for (const i of turning) this.rings[i].classList.remove('turning');
    };
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      if (t < 1) {
        place(ease(t));
        this.frame = requestAnimationFrame(tick);
      } else this.stop();
    };
    place(0);
    this.frame = requestAnimationFrame(tick);
  }

  /** Jump a running animation to its end. */
  private stop() {
    cancelAnimationFrame(this.frame);
    this.finish?.();
    this.finish = null;
  }

  flash(indices: number[]) {
    for (const i of indices) {
      const c = this.dots[i];
      if (!c) continue;
      c.classList.remove('bad');
      void c.getBoundingClientRect();
      c.classList.add('bad');
    }
    setTimeout(() => indices.forEach((i) => this.dots[i]?.classList.remove('bad')), 2600);
  }
}
