import type { Puzzle, State, Vec3 } from '../core/types';
import { add, cross, dot, scale } from '../core/vec';

type V2 = [number, number];

/** the 3D view's key light, and how much it brightens a face turned toward it */
const LIGHT: Vec3 = (() => { const l: Vec3 = [5, 8, 6]; return scale(l, 1 / Math.hypot(...l)); })();
const shade = (normal: Vec3) => 0.7 + 0.35 * Math.max(0, dot(normal, LIGHT));
const BODY = '#0d0f14';

function darken(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((x) => Math.round(x * k));
  return `rgb(${c.join(',')})`;
}

/** A closed path through `pts` with its corners rounded, as the 3D view rounds stickers. */
function rounded(pts: V2[], radius: number) {
  const d = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const toward = (p: V2, q: V2, r: number): V2 => { const l = d(p, q); return [p[0] + ((q[0] - p[0]) * r) / l, p[1] + ((q[1] - p[1]) * r) / l]; };
  const f = (p: V2) => `${p[0].toFixed(3)} ${p[1].toFixed(3)}`;
  return pts.map((p, i) => {
    const prev = pts[(i + pts.length - 1) % pts.length], next = pts[(i + 1) % pts.length];
    const r = Math.min(radius, d(p, prev) / 2.5, d(p, next) / 2.5);
    return `${i ? 'L' : 'M'}${f(toward(p, prev, r))}Q${f(p)} ${f(toward(p, next, r))}`;
  }).join('') + 'Z';
}

/** The convex hull of some points. */
function hull(pts: V2[]): V2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: V2[]) => list.reduce<V2[]>((h, q) => {
    while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], q) <= 1e-9) h.pop();
    h.push(q);
    return h;
  }, []);
  return [...half(p).slice(0, -1), ...half(p.reverse()).slice(0, -1)];
}

/**
 * A still picture of the puzzle as the 3D view draws it: the same stickers, colors, rounding
 * and light, seen from the view's home angle ('corner') or straight from above ('top').
 * Stickers on the top layer's hidden sides are folded out flat around the top, so every
 * sticker of the top layer shows. `arrows` join sticker pairs, from the first to the second;
 * a pair listed both ways is one arrow with two heads.
 */
export function snapshot(puzzle: Puzzle, state: State, view: 'corner' | 'top', arrows: [number, number][] = []) {
  const toCam = view === 'top' ? ([0, 1, 0] as Vec3) : (() => {
    const v = puzzle.cameraHome.map((x, k) => x - puzzle.cameraTarget[k]) as Vec3;
    return scale(v, 1 / Math.hypot(...v));
  })();
  const right = (() => { const r = cross(view === 'top' ? [0, 0, -1] : [0, 1, 0], toCam); return scale(r, 1 / Math.hypot(...r)); })();
  const up = cross(toCam, right);
  const project = (p: Vec3): V2 => [dot(p, right), -dot(p, up)];

  // stickers of the pieces with one on top fold out when they face away
  const topPieces = new Set(puzzle.stickers.filter((s) => s.normal[1] > 0.9).map((s) => s.piece));
  const top = Math.max(...puzzle.stickers.filter((s) => s.normal[1] > 0.9).flatMap((s) => s.outline.map((p) => p[1])));
  const fold = (p: Vec3, n: Vec3): Vec3 => {
    // turn the face down flat about its top edge, a little apart from it, and squash it to a
    // strip as if seen at a slant
    const out = dot(p, n) + (top - p[1]) * 0.42 + 0.14;
    return add([p[0] - n[0] * dot(p, n), top, p[2] - n[2] * dot(p, n)], scale(n, out));
  };

  const body: V2[] = [];
  const all: V2[] = [];
  const shapes: string[] = [];
  const centers: V2[] = [];
  for (const s of puzzle.stickers) {
    const facing = dot(s.normal, toCam) > 0.01;
    if (!facing && !topPieces.has(s.piece)) continue;
    const pts = (facing ? s.outline : s.outline.map((p) => fold(p, s.normal))).map(project);
    if (facing) body.push(...pts);
    all.push(...pts);
    centers[s.index] = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    shapes.push(`<path d="${rounded(pts, puzzle.stickerCornerRadius)}" fill="${darken(puzzle.colors[state[s.index]], shade(s.normal))}"/>`);
  }
  const outline = hull(body);
  const pad = 0.15;
  const minX = Math.min(...all.map((p) => p[0])) - pad - 0.05, maxX = Math.max(...all.map((p) => p[0])) + pad + 0.05;
  const minY = Math.min(...all.map((p) => p[1])) - pad - 0.05, maxY = Math.max(...all.map((p) => p[1])) + pad + 0.05;

  const marks: string[] = [];
  const head = (at: V2, dir: V2) => {
    const w = 0.17, l = 0.3;
    const pts: V2[] = [at, [at[0] - dir[0] * l - dir[1] * w, at[1] - dir[1] * l + dir[0] * w], [at[0] - dir[0] * l + dir[1] * w, at[1] - dir[1] * l - dir[0] * w]];
    return `<polygon points="${pts.map((p) => p.map((x) => x.toFixed(3)).join(',')).join(' ')}"/>`;
  };
  const key = (a: number, b: number) => `${a},${b}`;
  const listed = new Set(arrows.map(([a, b]) => key(a, b)));
  for (const [a, b] of arrows) {
    const both = listed.has(key(b, a));
    if (both && a > b) continue;
    const p = centers[a], q = centers[b];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const dir: V2 = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    const from: V2 = [p[0] + dir[0] * 0.2, p[1] + dir[1] * 0.2], to: V2 = [q[0] - dir[0] * 0.2, q[1] - dir[1] * 0.2];
    const back = both ? 0.2 : 0;
    marks.push(`<line x1="${(from[0] + dir[0] * back).toFixed(3)}" y1="${(from[1] + dir[1] * back).toFixed(3)}" x2="${(to[0] - dir[0] * 0.2).toFixed(3)}" y2="${(to[1] - dir[1] * 0.2).toFixed(3)}"/>`, head(to, dir));
    if (both) marks.push(head(from, [-dir[0], -dir[1]]));
  }

  return `<svg class="diagram" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${(maxX - minX).toFixed(2)} ${(maxY - minY).toFixed(2)}" role="img">` +
    `<polygon points="${outline.map((p) => p.map((x) => x.toFixed(3)).join(',')).join(' ')}" fill="${BODY}" stroke="${BODY}" stroke-width="${2 * pad}" stroke-linejoin="round"/>` +
    shapes.join('') +
    (marks.length ? `<g class="arrows">${marks.join('')}</g>` : '') +
    '</svg>';
}
