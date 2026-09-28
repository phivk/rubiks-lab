import type { Puzzle, State, Turn } from '../core/types';

const SVG = 'http://www.w3.org/2000/svg';
// Same scale as the net, so text and strokes size alike.
const UNIT = 100;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The ring map of a puzzle (see `src/cube/rings.ts`): dots slide along a layer's circle as it turns. */
export class RingView {
  private dots: SVGCircleElement[] = [];
  private rings: SVGCircleElement[] = [];
  private puzzle!: Puzzle;
  private frame = 0;
  private finish: (() => void) | null = null;

  constructor(private container: HTMLElement, private onClick: (index: number) => void) {}

  setPuzzle(puzzle: Puzzle) {
    this.stop();
    this.puzzle = puzzle;
    const map = puzzle.rings;
    if (!map) {
      this.dots = [];
      this.rings = [];
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
      el.addEventListener('click', () => this.onClick(i));
      svg.append(el);
      return el;
    });
    this.container.replaceChildren(svg);
  }

  update(state: State) {
    state.forEach((c, i) => this.dots[i]?.style.setProperty('fill', this.puzzle.colors[c]));
  }

  /**
   * Show `next` and slide each moved dot there from where its sticker was: along the
   * circle of a turning layer, or straight across for a turning face.
   */
  animateTurn(turn: Turn, next: State, duration: number) {
    const map = this.puzzle.rings;
    if (!map) return;
    this.stop();
    this.update(next);
    const pieces = new Set(turn.pieces);
    const turning = map.circles
      .map((c, i) => ({ ...c, el: this.rings[i] }))
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

    for (const c of turning) c.el.classList.add('turning');
    const place = (t: number) => {
      paths.forEach((path, i) => {
        const [x, y] = path(t);
        this.dots[i].setAttribute('cx', String(x * UNIT));
        this.dots[i].setAttribute('cy', String(y * UNIT));
      });
    };
    this.finish = () => {
      place(1);
      for (const c of turning) c.el.classList.remove('turning');
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
