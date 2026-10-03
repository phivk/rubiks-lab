import type { Puzzle, State, Turn } from '../core/types';
import { ccw } from '../cube/rings';
import { turnDuration } from './anim';
import { MapView, SVG, UNIT, ringsOf } from './map';

/**
 * The ring map of a puzzle (see `src/cube/rings.ts`): dots slide along a layer's circle as
 * it turns. Dragging a dot along one of its two circles turns that layer a quarter turn.
 */
export class RingView extends MapView {
  private rings: SVGCircleElement[] = [];
  private labels: (SVGGElement | undefined)[] = [];
  /** dots pulled off their places by a drag in the 3D view, and how they move */
  private drawn: { move: string; paths: Path[]; destOf: number[]; moving: number[]; turning: number[] } | null = null;

  setPuzzle(puzzle: Puzzle) {
    this.reset();
    this.drawn = null;
    this.puzzle = puzzle;
    const map = puzzle.rings;
    if (!map) {
      this.cells = [];
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
    this.cells = map.points.map(([x, y], i) => {
      const el = document.createElementNS(SVG, 'circle');
      el.setAttribute('cx', String(x * UNIT));
      el.setAttribute('cy', String(y * UNIT));
      el.setAttribute('r', String(map.dot * UNIT));
      el.setAttribute('class', 'cell');
      this.listen(el, i);
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
    this.listenDrags(svg);
    this.container.replaceChildren(svg);
  }

  protected refreshDim() {
    super.refreshDim();
    const dim = this.litRings.length > 0;
    this.rings.forEach((r, i) => {
      const on = this.litRings.includes(i);
      r.classList.toggle('grabbed', on);
      r.classList.toggle('dim', dim && !on);
      this.labels[i]?.classList.toggle('dim', dim && !on);
    });
  }

  /** The circle a dot is dragged along, whichever of its two the drag follows most closely. */
  protected pickTurn(dot: number, dx: number, dy: number) {
    const map = this.puzzle.rings!;
    const [px, py] = map.points[dot];
    // the screen and the map share their axes, so the drag's direction can be compared as is
    let best = { along: 0, circle: -1 };
    for (const i of ringsOf(this.puzzle, dot)) {
      const c = map.circles[i];
      const a = Math.atan2(py - c.cy, px - c.cx);
      // the tangent toward growing angle
      const along = (-Math.sin(a) * dx + Math.cos(a) * dy) / Math.hypot(dx, dy);
      if (Math.abs(along) > Math.abs(best.along)) best = { along, circle: i };
    }
    if (!best.along) return null;
    const c = map.circles[best.circle];
    const move = c.move(Math.sign(best.along) * c.sense);
    return { move, pieces: this.puzzle.parseMove(move)!.pieces };
  }

  update(state: State) {
    state.forEach((c, i) => this.cells[i]?.style.setProperty('fill', this.puzzle.colors[c]));
  }

  private place(i: number, [x, y]: [number, number]) {
    this.cells[i].setAttribute('cx', String(x * UNIT));
    this.cells[i].setAttribute('cy', String(y * UNIT));
  }

  /**
   * Follow a drag in the 3D view: slide the dots `steps` of the way through `move` (one
   * step of it, maybe fractional or negative), or back to their places (null).
   */
  showDrag(move: string | null, steps: number) {
    const map = this.puzzle.rings;
    if (!map) return;
    if (!move || !this.visible) {
      this.settle();
      return;
    }
    if (steps < 0) [move, steps] = [this.puzzle.invertMove(move), -steps];
    if (this.drawn?.move !== move) {
      this.stop();
      this.settle();
      const turn = this.puzzle.parseMove(move);
      if (!turn) return;
      const { paths, turning } = this.paths(turn);
      // where each sticker goes: the dot showing it follows its path there, a step at a time
      const destOf: number[] = [];
      turn.perm.forEach((src, dest) => (destOf[src] = dest));
      const moving = destOf.flatMap((d, i) => (d === i ? [] : [i]));
      for (const i of turning) this.rings[i].classList.add('turning');
      this.drawn = { move, paths, destOf, moving, turning };
    }
    const { paths, destOf, moving } = this.drawn;
    const whole = Math.floor(steps);
    for (const i of moving) {
      let at = i;
      for (let k = 0; k < whole; k++) at = destOf[at];
      this.place(i, paths[destOf[at]](steps - whole));
    }
  }

  /** Put the dots a drag in the 3D view moved back on their places. */
  private settle() {
    if (!this.drawn) return;
    const map = this.puzzle.rings!;
    for (const i of this.drawn.moving) this.place(i, map.points[i]);
    for (const i of this.drawn.turning) this.rings[i].classList.remove('turning');
    this.drawn = null;
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
    // every dot on a ring goes the same way round: whichever way is shorter on average
    const way = new Map(turning.map((c) => {
      const moved = c.stickers.filter((d) => turn.perm[d] !== d);
      const mean = moved.reduce((sum, d) => sum + ccw(angle(c, turn.perm[d]), angle(c, d)), 0) / (moved.length || 1);
      return [c, mean > Math.PI ? -1 : 1];
    }));

    const paths: Path[] = [];
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
    if (!this.visible) return;
    const { paths, turning } = this.paths(turn);
    for (const i of turning) this.rings[i].classList.add('turning');
    const place = (t: number) => paths.forEach((path, i) => this.place(i, path(t)));
    this.finish = () => {
      place(1);
      for (const i of turning) this.rings[i].classList.remove('turning');
    };
    this.play(turnDuration(turn, duration), place);
  }
}

type Path = (t: number) => [number, number];
