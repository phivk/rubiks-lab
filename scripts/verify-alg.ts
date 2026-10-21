// Checks the algorithm box's parser: the formats people paste from algorithm sites read as the
// right moves on every puzzle where they make sense, and mistakes are found where they are.
// Run with `pnpm verify`.
import { CubeModel } from '../src/cube/model';
import { parseAlg as pyraParse } from '../src/pyraminx/model';
import type { ParsedAlg } from '../src/core/alg';

function fail(msg: string): never {
  console.error('✗ ' + msg);
  process.exit(1);
}

const cubes = new Map([2, 3, 4, 5].map((n) => [n, new CubeModel(n)]));
const PUZZLES: Record<string, (text: string) => ParsedAlg> = {
  ...Object.fromEntries([...cubes].map(([n, M]) => [`${n}x${n}`, (t: string) => M.parseAlg(t)])),
  pyra: pyraParse,
};

// text, the puzzles it's for, and the moves it reads as
const ACCEPTED: [string, string[], string][] = [
  ["R U R' U'", ['2x2', '3x3', '4x4', '5x5'], "R U R' U'"],
  ["RUR'U'", ['2x2', '3x3', '4x4', '5x5'], "R U R' U'"],
  ['R, U, R’', ['2x2', '3x3', '4x4', '5x5'], "R U R'"],
  ["R′ U´ F` B‘", ['2x2', '3x3', '4x4', '5x5'], "R' U' F' B'"],
  ['Ri U Fi', ['2x2', '3x3', '4x4', '5x5'], "R' U F'"],
  ["R2' U'2 F2", ['2x2', '3x3', '4x4', '5x5'], 'R2 U2 F2'],
  ["(R U R' U')2", ['2x2', '3x3'], "R U R' U' R U R' U'"],
  ["(R U R' U')x2", ['2x2', '3x3'], "R U R' U' R U R' U'"],
  ["(R U R' U') ×3", ['3x3'], "R U R' U' R U R' U' R U R' U'"],
  ["(R U R' U')*2 y", ['3x3'], "R U R' U' R U R' U' y"],
  ["(R U) x2", ['3x3'], 'R U x2'],
  ["(R U)'", ['3x3'], "U' R'"],
  ["(R U)2'", ['3x3'], "U' R' U' R'"],
  ["(R U) 2R 3Rw'", ['5x5'], "R U 2R 3Rw'"],
  ["[R U R']", ['3x3'], "R U R'"],
  ["[R U R', U2]", ['3x3'], "R U R' U2 R U' R' U2"],
  ['[R, U]', ['3x3'], "R U R' U'"],
  ["[R, U, R']", ['3x3'], "R U R'"],
  ["[F: R U R' U']", ['3x3'], "F R U R' U' F'"],
  ["[R' : [R', F]]", ['3x3'], "R' R' F R F' R"],
  ["((R U)2 R')2", ['3x3'], "R U R U R' R U R U R'"],
  ["Rw U2 r' 2R 3Rw'", ['5x5'], "Rw U2 r' 2R 3Rw'"],
  ["r U R'", ['3x3', '4x4'], "r U R'"],
  ["M2 E S' x y z'", ['3x3', '5x5'], "M2 E S' x y z'"],
  ["R U' L r", ['pyra'], "R U' L r"],
  ["R2 U2'", ['pyra'], "R' U"],
  ["(R U)2, l'", ['pyra'], "R U R U l'"],
  ['Ri', ['pyra'], "R'"],
  ['   ', ['3x3', 'pyra'], ''],
];

// text, the puzzles it's for, the bad tokens, and what each suggests
const REJECTED: [string, string[], [string, string | undefined][]][] = [
  ['R Q U', ['3x3'], [['Q', undefined]]],
  ['R U;', ['3x3'], [['U;', 'U']]],
  ['r', ['2x2'], [['r', 'R']]],
  ['F', ['pyra'], [['F', undefined]]],
  ['M', ['2x2', '4x4'], [['M', undefined]]],
  ["R U R'' U", ['3x3'], [["R''", "R'"]]],
  ['(R U', ['3x3'], [['(', undefined]]],
  ['R U)', ['3x3'], [[')', undefined]]],
  ['[R: U', ['3x3'], [['[', undefined]]],
  ['[(R U]', ['3x3'], [['(', undefined]]],
  ['[R, Q, U]', ['3x3'], [['Q', undefined]]],
  ["(R U R' U') 2", ['3x3'], [['2', undefined]]],
  ['R Uu', ['pyra'], []],
  ['Rx U', ['pyra'], [['Rx', 'R']]],
];

let n = 0;
for (const [text, ids, want] of ACCEPTED) {
  for (const id of ids) {
    const { moves, invalid } = PUZZLES[id](text);
    if (invalid.length) fail(`${id}: "${text}" rejected at ${invalid.map((e) => e.token).join(', ')}`);
    if (moves.join(' ') !== want) fail(`${id}: "${text}" read as "${moves.join(' ')}", not "${want}"`);
    n++;
  }
}
console.log(`✓ ${n} accepted inputs read as the right moves`);

n = 0;
for (const [text, ids, want] of REJECTED) {
  for (const id of ids) {
    const { invalid } = PUZZLES[id](text);
    const got = invalid.map((e) => [e.token, e.suggestion]);
    if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${id}: "${text}" gave ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
    for (const e of invalid) if (text.slice(e.start, e.end) !== e.token) fail(`${id}: "${text}" points at the wrong place for ${e.token}`);
    n++;
  }
}
console.log(`✓ ${n} mistakes found where they are, with their suggestions`);
