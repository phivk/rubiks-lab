// Where a scan face's stickers sit in the camera's square viewfinder, from 0 to 1 across
// and down: a square face's in rows and columns, a triangular face's (a Pyraminx's) in
// rows of 1, 3, 5… triangles, pointing up or down.

import type { ScanFace } from '../core/types';
import { mean } from '../core/vec';

export interface Cell {
  /** outline, a little inside the sticker's */
  poly: [number, number][];
  /** middle, where it's sampled */
  at: [number, number];
  /** half the side of the square sampled around `at` */
  r: number;
}

/** a cell's samples come from its middle, away from the sticker's edges and the gaps between stickers */
const INSET = 0.3;
const SHRINK = 0.9;

function cell(corners: [number, number][], r: number): Cell {
  const at = mean(corners);
  const poly = corners.map(([x, y]) => [at[0] + (x - at[0]) * SHRINK, at[1] + (y - at[1]) * SHRINK] as [number, number]);
  return { poly, at, r };
}

export function scanCells(face: Pick<ScanFace, 'stickers' | 'shape'>): Cell[] {
  const n = Math.round(Math.sqrt(face.stickers.length));
  if (!face.shape) {
    const r = (1 - 2 * INSET) / (2 * n);
    return Array.from({ length: n * n }, (_, i) => {
      const x = (i % n) / n, y = Math.floor(i / n) / n, s = 1 / n;
      return cell([[x, y], [x + s, y], [x + s, y + s], [x, y + s]], r);
    });
  }
  // an equilateral triangle as wide as the viewfinder, in the middle
  const h = Math.sqrt(3) / 2, top = (1 - h) / 2;
  // the square inside a small triangle's inscribed circle, a little smaller
  const r = (0.7 * (1 / n) / (2 * Math.sqrt(3))) / Math.SQRT2;
  const rows: Cell[][] = [];
  for (let row = 0; row < n; row++) {
    const y0 = top + (row * h) / n, y1 = y0 + h / n;
    const x0 = 0.5 - row / (2 * n), x1 = 0.5 - (row + 1) / (2 * n);
    const cells: Cell[] = [];
    for (let j = 0; j <= 2 * row; j++) {
      const m = j >> 1;
      cells.push(cell(j % 2
        ? [[x0 + m / n, y0], [x0 + (m + 1) / n, y0], [x1 + (m + 1) / n, y1]]
        : [[x0 + m / n, y0], [x1 + (m + 1) / n, y1], [x1 + m / n, y1]], r));
    }
    rows.push(cells);
  }
  if (face.shape === 'up') return rows.flat();
  // upside down: the same rows, from the widest
  const flip = (p: [number, number]): [number, number] => [p[0], 1 - p[1]];
  return rows.reverse().flat().map((c) => ({ ...c, poly: c.poly.map(flip), at: flip(c.at) }));
}

/** Points scaled to fill the unit box, to match up ones seen from different sizes. */
export function toUnitBox(pts: number[][]): number[][] {
  const lo = [0, 1].map((k) => Math.min(...pts.map((p) => p[k]))), hi = [0, 1].map((k) => Math.max(...pts.map((p) => p[k])));
  return pts.map((p) => p.map((x, k) => (x - lo[k]) / (hi[k] - lo[k])));
}
