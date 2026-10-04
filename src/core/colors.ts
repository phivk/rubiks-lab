// Cube colors, shared by every N×N cube, and picked from by the other puzzles.

export const COLOR_NAMES = ['White', 'Red', 'Green', 'Yellow', 'Orange', 'Blue'];

/** the kinds of cube a scan can tell apart: a typical one, and a bright stickerless one (like many of QiYi's) */
export type CubeKind = 'typical' | 'bright';

/** how each kind's stickers are drawn */
export const KIND_COLORS: Record<CubeKind, string[]> = {
  typical: ['#f4f4ef', '#e02a3c', '#14a85a', '#ffd21f', '#ff7b1c', '#2166e6'],
  bright: ['#f4f4ef', '#d8264c', '#7ed43c', '#e4ec3c', '#ff7a3c', '#3eb0e2'],
};

/** `all`, picked by color ids, or all of it without any */
export const byIds = <T>(all: T[], ids?: number[]) => (ids ? ids.map((id) => all[id]) : all);

let kind: CubeKind = 'typical';
/** the kind of cube the stickers are drawn as */
export const cubeKind = () => kind;

/** every puzzle's colors, by the cube color ids they're picked from */
const picked: { colors: string[]; ids: number[] }[] = [];

/**
 * A puzzle's sticker colors, picked from the cubes' by color id, plus its "unset" color used
 * while painting. They're changed in place by `useCubeColors`, so a puzzle keeps the array.
 */
export function pickColors(ids: number[], unset: string): string[] {
  const colors = [...ids.map((id) => KIND_COLORS[kind][id]), unset];
  picked.push({ colors, ids });
  return colors;
}

/** sticker colors for every N×N cube, plus the "unset" color */
export const COLORS = pickColors([0, 1, 2, 3, 4, 5], '#2c313c');

/** Draw every puzzle in a kind's colors, as chosen or as the last scan found it. */
export function useCubeColors(k: CubeKind) {
  kind = k;
  for (const { colors, ids } of picked) colors.splice(0, ids.length, ...ids.map((id) => KIND_COLORS[k][id]));
}
