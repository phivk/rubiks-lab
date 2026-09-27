// Permutation helpers shared by the solvers: parity, ranking, and breadth-first distance tables.

export function parity(perm: number[]): number {
  let p = 0;
  const seen = new Array(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) { seen[j] = true; len++; }
    p += len - 1;
  }
  return p % 2;
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

export function permRank(p: number[]): number {
  let r = 0;
  const n = p.length;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    r += smaller * FACT[n - 1 - i];
  }
  return r;
}
export function permUnrank(r: number, n: number): number[] {
  const avail = Array.from({ length: n }, (_, i) => i);
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    const k = Math.floor(r / f);
    r %= f;
    p.push(avail.splice(k, 1)[0]);
  }
  return p;
}

/**
 * Distance from `start` of every state in a product of two coordinates (n1 · n2 states),
 * by breadth-first search. `move1` / `move2` are move tables: coordinate · nMoves + move → coordinate.
 */
export function buildPruning(n1: number, n2: number, move1: ArrayLike<number>, move2: ArrayLike<number>, nMoves: number, start: number): Uint8Array {
  const size = n1 * n2;
  const table = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  let head = 0, tail = 0;
  table[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const idx = queue[head++];
    const a = (idx / n2) | 0, b = idx % n2;
    const d = table[idx] + 1;
    for (let m = 0; m < nMoves; m++) {
      const j = move1[a * nMoves + m] * n2 + move2[b * nMoves + m];
      if (table[j] === 255) { table[j] = d; queue[tail++] = j; }
    }
  }
  return table;
}
