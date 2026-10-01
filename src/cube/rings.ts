// The ring map of an N×N cube: every layer is a circle, every sticker a dot.
//
// A layer turn moves a band of 4N stickers around the cube (plus the face it carries,
// if it's an outer layer). Draw each band as a circle: the N layers of one axis are
// concentric circles around one corner of a triangle. A sticker sits in exactly two
// bands, one for each axis along its face, so it goes where those two circles cross.
// Two circles cross twice, and the two stickers they share are on opposite faces: the
// U, R and F one goes on the side nearer the triangle's middle, the D, L or B one outside.
// With big enough circles, each circle meets the dots of its band in the same order they
// sit around the cube, so turning a layer slides its dots along its circle.
// Each circle is labeled with its layer's name on its far side, where there are no dots.

import type { RingMap } from '../core/types';
import { FACES, type CubeModel } from './model';

type P = [number, number];

// Where each axis's circles are centered, as angles on the triangle (SVG's y points down):
// y (U/D) at the top, x (R/L) bottom right, z (F/B) bottom left.
const CENTER_ANGLE = [30, -90, 150];
/** distance from the middle of the triangle to its corners */
const SPREAD = 1 / Math.sqrt(3);

export function ringMap(M: CubeModel): RingMap {
  const n = M.n, m = n - 1;
  const centers: P[] = CENTER_ANGLE.map((deg) => {
    const t = (deg * Math.PI) / 180;
    return [SPREAD * Math.cos(t), SPREAD * Math.sin(t)];
  });
  // layer coordinate → radius: the D/L/B-most layer is the biggest circle
  const step = n > 1 ? 0.35 / m + 0.06 : 0;
  const radius = (layer: number) => 0.85 + (step * (m - layer)) / 2;

  const points = M.facelets.map((f): P => {
    const normalAxis = f.normal.findIndex((x) => x !== 0);
    const [a, b] = [0, 1, 2].filter((x) => x !== normalAxis);
    const [x1, y1] = centers[a], [x2, y2] = centers[b];
    const r1 = radius(f.pos[a]), r2 = radius(f.pos[b]);
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
    const along = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(r1 * r1 - along * along);
    const mx = x1 + (along * dx) / d, my = y1 + (along * dy) / d;
    const p: P = [mx - (h * dy) / d, my + (h * dx) / d];
    const q: P = [mx + (h * dy) / d, my - (h * dx) / d];
    const [inner, outer] = Math.hypot(...p) < Math.hypot(...q) ? [p, q] : [q, p];
    return f.normal[normalAxis] > 0 ? inner : outer;
  });

  const circles = [0, 1, 2].flatMap((axis) =>
    M.coords.map((layer) => {
      const [cx, cy] = centers[axis], r = radius(layer);
      const turn = (quarters: number) => ({ axis: axis as 0 | 1 | 2, layers: [layer], quarters });
      const stickers = M.facelets.filter((f) => f.pos[axis] === layer && f.normal[axis] === 0).map((f) => f.index);
      // which way round a +1 quarter turn carries the dots: toward growing angle, or against it
      const perm = M.permutation(turn(1));
      const angle = (i: number) => Math.atan2(points[i][1] - cy, points[i][0] - cx);
      const moved = stickers.filter((d) => perm[d] !== d);
      const mean = moved.reduce((sum, d) => sum + ((((angle(d) - angle(perm[d])) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)), 0) / moved.length;
      // the outer layers are faces; of the inner ones, only the 3×3's M, E and S have a short name
      const name = M.moveName(turn(1))!.replace(/'$/, '');
      const face = FACES.indexOf(name);
      const out = Math.hypot(cx, cy);
      return {
        cx, cy, r, stickers,
        move: (quarters: number) => M.moveName(turn(quarters)) ?? '',
        sense: (mean < Math.PI ? 1 : -1) as 1 | -1,
        label: face >= 0 || name.length === 1 ? name : undefined,
        face: face >= 0 ? face : undefined,
        labelAt: [cx + (r * cx) / out, cy + (r * cy) / out] as P,
      };
    }),
  );

  let closest = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) closest = Math.min(closest, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
  }
  const labelSize = Math.min(step * 0.45, 0.11);
  // shift everything so the drawing starts at 0, 0
  const pad = Math.max(closest / 2, labelSize);
  const minX = Math.min(...circles.map((c) => c.cx - c.r)) - pad, minY = Math.min(...circles.map((c) => c.cy - c.r)) - pad;
  const maxX = Math.max(...circles.map((c) => c.cx + c.r)) + pad, maxY = Math.max(...circles.map((c) => c.cy + c.r)) + pad;
  return {
    circles: circles.map((c) => ({ ...c, cx: c.cx - minX, cy: c.cy - minY, labelAt: [c.labelAt[0] - minX, c.labelAt[1] - minY] })),
    points: points.map(([x, y]) => [x - minX, y - minY]),
    dot: closest * 0.42,
    labelSize,
    size: [maxX - minX, maxY - minY],
  };
}
