// Cube colors, shared by every N×N cube.

export const COLOR_NAMES = ['White', 'Red', 'Green', 'Yellow', 'Orange', 'Blue'];

/** the kinds of cube a scan can tell apart: a typical one, and a bright stickerless one (like many of QiYi's) */
export type CubeKind = 'typical' | 'bright';

/** how each kind's stickers are drawn */
export const KIND_COLORS: Record<CubeKind, string[]> = {
  typical: ['#f4f4ef', '#e02a3c', '#14a85a', '#ffd21f', '#ff7b1c', '#2166e6'],
  bright: ['#f4f4ef', '#d8264c', '#7ed43c', '#e4ec3c', '#ff7a3c', '#3eb0e2'],
};

/** sticker colors, plus the "unset" color used while painting; changed in place by `useCubeColors` */
export const COLORS = [...KIND_COLORS.typical, '#2c313c'];

let kind: CubeKind = 'typical';
/** the kind of cube the stickers are drawn as */
export const cubeKind = () => kind;

/** Draw every N×N cube in a kind's colors, as the last scan found it. */
export function useCubeColors(k: CubeKind) {
  kind = k;
  COLORS.splice(0, 6, ...KIND_COLORS[k]);
}
