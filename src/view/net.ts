import type { Puzzle, State } from '../core/types';

const SVG = 'http://www.w3.org/2000/svg';
// Draw at 100× the puzzle's map units so text sizes stay well above browsers' minimum font size.
const UNIT = 100;

/** The unfolded 2D map of a puzzle, drawn as SVG polygons. */
export class NetView {
  private cells: SVGPolygonElement[] = [];
  private puzzle!: Puzzle;

  constructor(private container: HTMLElement, private onClick: (index: number) => void) {}

  setPuzzle(puzzle: Puzzle) {
    this.puzzle = puzzle;
    const [w, h] = puzzle.netSize;
    const pad = 0.15 * UNIT;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${w * UNIT + 2 * pad} ${h * UNIT + 2 * pad}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${puzzle.name} map`);
    this.cells = puzzle.stickers.map((s) => {
      const poly = document.createElementNS(SVG, 'polygon');
      poly.setAttribute('points', s.net.map(([x, y]) => `${x * UNIT},${y * UNIT}`).join(' '));
      poly.setAttribute('class', 'cell');
      poly.addEventListener('click', () => this.onClick(s.index));
      svg.append(poly);
      if (s.netLabel) {
        const cx = s.net.reduce((a, p) => a + p[0], 0) / s.net.length;
        const cy = s.net.reduce((a, p) => a + p[1], 0) / s.net.length;
        const t = document.createElementNS(SVG, 'text');
        t.setAttribute('x', String(cx * UNIT));
        t.setAttribute('y', String(cy * UNIT));
        t.setAttribute('class', 'label');
        t.textContent = s.netLabel;
        svg.append(t);
      }
      return poly;
    });
    this.container.replaceChildren(svg);
    this.container.dataset.puzzle = puzzle.id;
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
