import type { Vec3 } from './types';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a: Vec3) => scale(a, 1 / Math.hypot(...a));

/** How far round from angle `from` to angle `to`, going toward growing angle: 0 to 2π. */
export const ccw = (from: number, to: number) => (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** The average of some points, of any dimension. */
export const mean = <T extends number[]>(pts: T[]) => pts[0].map((_, k) => pts.reduce((a, p) => a + p[k], 0) / pts.length) as T;

/** The convex hull of some points in the plane, counter-clockwise. */
export function hull(pts: [number, number][]): [number, number][] {
  type V2 = [number, number];
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

/** `v` turned `angle` radians about the unit `axis` through `at` (right-hand rule). */
export function rotate(v: Vec3, axis: Vec3, angle: number, at: Vec3 = [0, 0, 0]): Vec3 {
  const p = sub(v, at), c = Math.cos(angle), s = Math.sin(angle);
  return add(at, add(add(scale(p, c), scale(cross(axis, p), s)), scale(axis, dot(axis, p) * (1 - c))));
}
