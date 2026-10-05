import type { Vec3 } from './types';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** How far round from angle `from` to angle `to`, going toward growing angle: 0 to 2π. */
export const ccw = (from: number, to: number) => (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** The average of some points, of any dimension. */
export const mean = <T extends number[]>(pts: T[]) => pts[0].map((_, k) => pts.reduce((a, p) => a + p[k], 0) / pts.length) as T;

/** `v` turned `angle` radians about the unit `axis` through `at` (right-hand rule). */
export function rotate(v: Vec3, axis: Vec3, angle: number, at: Vec3 = [0, 0, 0]): Vec3 {
  const p = sub(v, at), c = Math.cos(angle), s = Math.sin(angle);
  return add(at, add(add(scale(p, c), scale(cross(axis, p), s)), scale(axis, dot(axis, p) * (1 - c))));
}
