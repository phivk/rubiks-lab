// Sanity checks for the Pyraminx model and solver. Run with `npm run verify`.
import { apply, applyAll, stickers } from '../src/pyraminx/model';
import { pyraminx as P } from '../src/pyraminx/puzzle';
import { solveOptimal } from '../src/pyraminx/solver';

const fail = (msg: string) => { console.error('✗ ' + msg); process.exit(1); };
const same = (a: number[], b: number[]) => a.every((x, i) => x === b[i]);

// piece structure: 4 tips × 3, 4 centers × 3, 6 edges × 2 stickers
const sizes = new Map<number, number>();
stickers.forEach((s) => sizes.set(s.piece, (sizes.get(s.piece) ?? 0) + 1));
for (let p = 0; p < 14; p++) if (sizes.get(p) !== (p < 8 ? 3 : 2)) fail(`piece ${p} has ${sizes.get(p)} stickers`);
console.log('✓ 36 stickers on 14 pieces');

for (const m of ['U', 'L', 'R', 'B', 'u', 'l', 'r', 'b']) {
  const perm = P.parseMove(m)!.perm;
  if (new Set(perm).size !== 36) fail(`${m} is not a permutation`);
  const s0 = P.solved();
  if (same(apply(s0, m), s0)) fail(`${m} does nothing`);
  if (!same(applyAll(s0, [m, m, m]), s0)) fail(`${m}×3 is not identity`);
  if (!same(applyAll(s0, [m, P.invertMove(m)]), s0)) fail(`${m} ${P.invertMove(m)} is not identity`);
}
console.log('✓ every move is a 3-cycle with a working inverse');

if (!P.validate(P.solved()).ok) fail('solved state is invalid');
let t = Date.now();
solveOptimal(P.solved());
console.log(`✓ table built in ${Date.now() - t} ms`);

const known: [string, number][] = [["U", 1], ["U R", 2], ["R' L R L'", 4], ["U u", 2], ["r b' l", 3]];
for (const [alg, len] of known) {
  const s = applyAll(P.solved(), P.parseAlg(alg).moves);
  const sol = solveOptimal(s)!;
  if (sol.length !== len || !P.isSolved(applyAll(s, sol))) fail(`${alg}: got ${sol.join(' ')}`);
}
console.log('✓ known short cases are solved optimally');

let worst = 0;
t = Date.now();
for (let i = 0; i < 200; i++) {
  const scr = P.scramble();
  const s = applyAll(P.solved(), scr);
  const v = P.validate(s);
  if (!v.ok) fail(`scramble invalid: ${v.message}`);
  const sol = solveOptimal(s)!;
  if (!P.isSolved(applyAll(s, sol))) fail(`wrong solution for ${scr.join(' ')}`);
  worst = Math.max(worst, sol.filter((m) => m === m.toUpperCase()).length);
}
console.log(`✓ 200 scrambles solved and verified (${((Date.now() - t) / 200).toFixed(1)} ms avg, longest ${worst} non-tip moves)`);

// an edge flipped in place is unreachable
const s = P.solved();
const edge = stickers.filter((x) => x.piece === 8).map((x) => x.index);
[s[edge[0]], s[edge[1]]] = [s[edge[1]], s[edge[0]]];
const v = P.validate(s);
if (v.ok) fail('flipped edge accepted');
console.log(`✓ flipped edge rejected: "${v.message}"`);
