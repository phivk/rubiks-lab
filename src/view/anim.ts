import type { Turn } from '../core/types';

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** How long a turn animates, given the time for a quarter: a half turn takes a little longer. */
export const turnDuration = (turn: Turn, duration: number) => duration * (Math.abs(turn.angle) > Math.PI * 0.75 ? 1.35 : 1);
