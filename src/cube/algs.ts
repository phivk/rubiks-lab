// Last-layer algorithm sets for the 3×3 lessons. Each works from the standard angle, with
// the first two layers solved; a lesson finds the case by trying each algorithm after each
// turn of the top, so no recognition tables are needed.
//
// OLL numbers, names, groups and algorithms follow the community-standard list (as in the
// speedsolving.com wiki); PLL algorithms are the top-voted ones on SpeedCubeDB.
// scripts/verify-methods.ts checks that each OLL keeps the first two layers and orients the
// top, that each PLL keeps all orientation and solves its case, and that together they cover
// every case.

export interface OllAlg {
  n: number;
  name: string;
  group: string;
  alg: string;
}

export interface PllAlg {
  name: string;
  /** what moves: corners only, edges only, or both with an adjacent or diagonal corner swap */
  kind: string;
  alg: string;
}

const OLL_TABLE: [number, string, string, string][] = [
  [1, "Runway", "No Edges Flipped Correctly", "R U2 R2 F R F' U2 R' F R F'"],
  [2, "Zamboni", "No Edges Flipped Correctly", "F R U R' U' F' f R U R' U' f'"],
  [3, "Anti-Kite", "No Edges Flipped Correctly", "f R U R' U' f' U' F R U R' U' F'"],
  [4, "Kite", "No Edges Flipped Correctly", "f R U R' U' f' U F R U R' U' F'"],
  [5, "Anti-Squeegee", "Squares", "r' U2 R U R' U r"],
  [6, "Squeegee", "Squares", "r U2 R' U' R U' r'"],
  [7, "Lightning", "Lightning Bolts", "r U R' U R U2 r'"],
  [8, "Reverse Lightning", "Lightning Bolts", "r' U' R U' R' U2 r"],
  [9, "Kicking", "Fish-Shapes", "R U R' U' R' F R2 U R' U' F'"],
  [10, "Anti-Kicking", "Fish-Shapes", "R U R' U R' F R F' R U2 R'"],
  [11, "Downstairs", "Lightning Bolts", "r U R' U R' F R F' R U2 r'"],
  [12, "Upstairs", "Lightning Bolts", "M' R' U' R U' R' U2 R U' R r'"],
  [13, "Gun", "Knight Move Shapes", "F U R U' R2 F' R U R U' R'"],
  [14, "Anti-Gun", "Knight Move Shapes", "R' F R U R' F' R F U' F'"],
  [15, "Squeaky Wheel", "Knight Move Shapes", "l' U' l L' U' L U l' U l"],
  [16, "Anti-Squeaky Wheel", "Knight Move Shapes", "r U r' R U R' U' r U' r'"],
  [17, "Slash", "No Edges Flipped Correctly", "R U R' U R' F R F' U2 R' F R F'"],
  [18, "Crown", "No Edges Flipped Correctly", "r U R' U R U2 r2 U' R U' R' U2 r"],
  [19, "Bunny", "No Edges Flipped Correctly", "r' R U R U R' U' M' R' F R F'"],
  [20, "Checkers", "No Edges Flipped Correctly", "r U R' U' M2 U R U' R' U' M'"],
  [21, "Double Sune", "All Edges Oriented Correctly", "R U2 R' U' R U R' U' R U' R'"],
  [22, "Bruno", "All Edges Oriented Correctly", "R U2 R2 U' R2 U' R2 U2 R"],
  [23, "Headlights", "All Edges Oriented Correctly", "R2 D R' U2 R D' R' U2 R'"],
  [24, "Chameleon", "All Edges Oriented Correctly", "r U R' U' r' F R F'"],
  [25, "Bowtie", "All Edges Oriented Correctly", "F' r U R' U' r' F R"],
  [26, "Anti-Sune", "All Edges Oriented Correctly", "R U2 R' U' R U' R'"],
  [27, "Sune", "All Edges Oriented Correctly", "R U R' U R U2 R'"],
  [28, "Stealth", "Corners Correct, Edges Flipped", "r U R' U' M U R U' R'"],
  [29, "Spotted Chameleon", "Awkward Shapes", "R U R' U' R U' R' F' U' F R U R'"],
  [30, "Anti-Spotted Chameleon", "Awkward Shapes", "F R' F R2 U' R' U' R U R' F2"],
  [31, "Couch", "P-Shapes", "R' U' F U R U' R' F' R"],
  [32, "Anti-Couch", "P-Shapes", "L U F' U' L' U L F L'"],
  [33, "Key", "T-Shapes", "R U R' U' R' F R F'"],
  [34, "City", "C-Shapes", "R U R2 U' R' F R U R U' F'"],
  [35, "Fish Salad", "Fish-Shapes", "R U2 R2 F R F' R U2 R'"],
  [36, "Wario", "W-Shapes", "L' U' L U' L' U L U L F' L' F"],
  [37, "Mounted Fish", "Fish-Shapes", "F R' F' R U R U' R'"],
  [38, "Mario", "W-Shapes", "R U R' U R U' R' U' R' F R F'"],
  [39, "Big Lightning", "Lightning Bolts", "L F' L' U' L U F U' L'"],
  [40, "Anti-Big-Lightning", "Lightning Bolts", "R' F R U R' U' F' U R"],
  [41, "Awkward Fish", "Awkward Shapes", "R U R' U R U2 R' F R U R' U' F'"],
  [42, "Anti-Awkward Fish", "Awkward Shapes", "R' U' R U' R' U2 R F R U R' U' F'"],
  [43, "Anti-P", "P-Shapes", "F' U' L' U L F"],
  [44, "P", "P-Shapes", "F U R U' R' F'"],
  [45, "T", "T-Shapes", "F R U R' U' F'"],
  [46, "Seein' Headlights", "C-Shapes", "R' U' R' F R F' U R"],
  [47, "Right Front Squeezy", "L-Shapes", "F' L' U' L U L' U' L U F"],
  [48, "Right Back Squeezy", "L-Shapes", "F R U R' U' R U R' U' F'"],
  [49, "Left Front Squeezy", "L-Shapes", "r U' r2 U r2 U r2 U' r"],
  [50, "Left Back Squeezy", "L-Shapes", "r' U r2 U' r2 U' r2 U r'"],
  [51, "Bottlecap", "I-Shapes", "f R U R' U' R U R' U' f'"],
  [52, "Rice Cooker", "I-Shapes", "R U R' U R U' B U' B' R'"],
  [53, "Frying Pan", "L-Shapes", "l' U2 L U L' U' L U L' U l"],
  [54, "Anti-Frying Pan", "L-Shapes", "r U2 R' U' R U R' U' R U' r'"],
  [55, "Highway", "I-Shapes", "R U2 R2 U' R U' R' U2 F R F'"],
  [56, "Streetlights", "I-Shapes", "r U r' U R U' R' U R U' R' r U' r'"],
  [57, "Mummy", "Corners Correct, Edges Flipped", "R U R' U' M' U R U' r'"],];

export const OLL: OllAlg[] = OLL_TABLE.map(([n, name, group, alg]) => ({ n, name, group, alg }));

/** the seven OLLs with every edge already oriented: OCLL, the corner half of two-look OLL */
export const OCLL = OLL.filter((o) => o.n >= 21 && o.n <= 27);

const EDGES_ONLY = 'only edges move';
const ADJACENT = 'two neighbouring corners swap';
const DIAGONAL = 'two opposite corners swap';
const CORNERS_ONLY = 'only corners move';

export const PLL: PllAlg[] = [
  { name: 'Ua', kind: EDGES_ONLY, alg: "M2 U M U2 M' U M2" },
  { name: 'Ub', kind: EDGES_ONLY, alg: "M2 U' M U2 M' U' M2" },
  { name: 'H', kind: EDGES_ONLY, alg: "M2 U M2 U2 M2 U M2" },
  { name: 'Z', kind: EDGES_ONLY, alg: "M' U' M2 U' M2 U' M' U2 M2" },
  { name: 'Aa', kind: CORNERS_ONLY, alg: "x R' U R' D2 R U' R' D2 R2 x'" },
  { name: 'Ab', kind: CORNERS_ONLY, alg: "x R2 D2 R U R' D2 R U' R x'" },
  { name: 'E', kind: CORNERS_ONLY, alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x" },
  { name: 'T', kind: ADJACENT, alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { name: 'F', kind: ADJACENT, alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R" },
  { name: 'Ja', kind: ADJACENT, alg: "x R2 F R F' R U2 r' U r U2 x'" },
  { name: 'Jb', kind: ADJACENT, alg: "R U R' F' R U R' U' R' F R2 U' R'" },
  { name: 'Ra', kind: ADJACENT, alg: "R U' R' U' R U R D R' U' R D' R' U2 R'" },
  { name: 'Rb', kind: ADJACENT, alg: "R2 F R U R U' R' F' R U2 R' U2 R" },
  { name: 'Ga', kind: ADJACENT, alg: "R2 U R' U R' U' R U' R2 D U' R' U R D'" },
  { name: 'Gb', kind: ADJACENT, alg: "R' U' R U D' R2 U R' U R U' R U' R2 D" },
  { name: 'Gc', kind: ADJACENT, alg: "R2 U' R U' R U R' U R2 D' U R U' R' D" },
  { name: 'Gd', kind: ADJACENT, alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
  { name: 'Y', kind: DIAGONAL, alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { name: 'V', kind: DIAGONAL, alg: "R U' R U R' D R D' R U' D R2 U R2 D' R2" },
  { name: 'Na', kind: DIAGONAL, alg: "F' R U R' U' R' F R2 F U' R' U' R U F' R'" },
  { name: 'Nb', kind: DIAGONAL, alg: "r' D' F r U' r' F' D r2 U r' U' r' F r F'" },
];
