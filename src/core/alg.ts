// Reading an algorithm as people write it: spaces or not, commas, grouping brackets, repeats
// like (R U R' U')2, commutators [R, U] and conjugates [R: U], and the prime written ’ ′ ´ or i.
// Each puzzle says which words are its moves; this does the rest, and says where a mistake is.

/** A word that isn't a move: where it is in the text, and what was likely meant, if anything obvious. */
export interface AlgError {
  token: string;
  start: number;
  end: number;
  suggestion?: string;
}

export interface ParsedAlg {
  moves: string[];
  invalid: AlgError[];
}

/**
 * The moves in one word, already free of brackets and separators ("RUR'" → R U R'), or null
 * if it isn't moves. Primes come in as `'`.
 */
export type ReadWord = (word: string) => string[] | null;

const PRIMES = /[’‘′´`]/g;
const PRIME = /['’‘′´`]/;
const SEPARATORS = /[\s,]/;
const SPECIAL = /[\s,()[\]:]/;

/**
 * Parse `text` into moves with `read`, `invert` turning a move back. Every word that isn't a
 * move, and any bracket left open or closed twice, is reported with its place in `text`.
 */
export function parseAlg(text: string, read: ReadWord, invert: (move: string) => string): ParsedAlg {
  const invalid: AlgError[] = [];
  let i = 0;
  /** the closing brackets the groups open around here wait for, outermost first */
  const waiting: string[] = [];
  const bad = (start: number, end: number, suggestion?: string) => invalid.push({ token: text.slice(start, end), start, end, suggestion });

  /** past spaces and commas, except a comma that ends the first half of a commutator */
  const skip = (close: string | null) => {
    while (i < text.length && SEPARATORS.test(text[i]) && !(text[i] === ',' && close?.includes(','))) i++;
  };

  /** A run of moves up to a closing bracket (or, inside [ ], a comma or colon) or the end. */
  function sequence(close: string | null): string[] {
    const out: string[] = [];
    for (;;) {
      skip(close);
      const ch = text[i];
      if (ch === undefined) {
        return out;
      }
      if (ch === ')' || ch === ']' || ch === ':' || ch === ',') {
        // a group around this one closes: this one was left open, which its caller reports
        if (close?.includes(ch) || waiting.includes(ch)) return out;
        // a bracket closed that was never opened: say so, and read on
        bad(i, i + 1);
        i++;
        continue;
      }
      if (ch === '(' || ch === '[') {
        const start = i++;
        const closer = ch === '(' ? ')' : ']';
        waiting.push(closer);
        const group = ch === '(' ? sequence(')') : bracket();
        waiting.pop();
        if (text[i] !== closer) {
          bad(start, start + 1);
          out.push(...group);
          continue;
        }
        i++;
        out.push(...repeat(group));
        continue;
      }
      const start = i;
      while (i < text.length && !SPECIAL.test(text[i])) i++;
      const word = text.slice(start, i);
      const moves = readWord(word, read);
      if (moves) out.push(...moves);
      else bad(start, i, suggest(word, read));
    }
  }

  /** After `[`: a group, a commutator [A, B] = A B A' B', or a conjugate [A: B] = A B A'. */
  function bracket(): string[] {
    const a = sequence('],:');
    const sep = text[i];
    if (sep !== ',' && sep !== ':') return a;
    // a comma might just separate the moves of a group: [R, U, R'] is R U R'
    const mark = i, errors = invalid.length;
    i++;
    const b = sequence('],:');
    if (text[i] === ']') return sep === ':' ? [...a, ...b, ...a.slice().reverse().map(invert)] : [...a, ...b, ...a.slice().reverse().map(invert), ...b.slice().reverse().map(invert)];
    if (sep === ':') {
      // [A: B, C] and the like: read the rest as B
      const rest = sequence(']');
      return [...a, ...b, ...rest, ...a.slice().reverse().map(invert)];
    }
    // more commas: a plain list
    i = mark;
    invalid.length = errors;
    return [...a, ...listed()];
  }

  /** a bracket whose commas only separate moves */
  function listed(): string[] {
    const out: string[] = [];
    while (text[i] === ',' || text[i] === ':') {
      if (text[i] === ':') bad(i, i + 1);
      i++;
      out.push(...sequence('],:'));
    }
    return out;
  }

  /** A closed group, inverted by a prime after it and repeated by a count: (…)', (…)2, (…)x2, (…)×2, (…)2'. */
  function repeat(group: string[]): string[] {
    let g = group;
    const prime = () => {
      if (!PRIME.test(text[i] ?? '')) return;
      i++;
      g = g.slice().reverse().map(invert);
    };
    prime();
    // right after the bracket, or after a × or *: "(R U) 2R" and "(R U) x2" are moves after the group
    const m = /^(?:x?(\d+)|\s*[×*]\s*(\d+))/.exec(text.slice(i));
    const n = Number(m?.[1] ?? m?.[2]);
    if (m && n >= 1 && n <= 99) {
      i += m[0].length;
      prime();
      g = Array.from({ length: n }, () => g).flat();
    }
    return g;
  }

  const moves = sequence(null);
  return { moves, invalid };
}

/** One word as moves: its primes made plain, a trailing i (Ri) read as a prime. */
function readWord(word: string, read: ReadWord) {
  return read(word.replace(PRIMES, "'").replace(/i(?=$|[^a-z])/g, "'").replace(/'2/g, "2'"));
}

/** What a word that isn't a move was most likely meant to be: another case, or a stray character dropped. */
function suggest(word: string, read: ReadWord): string | undefined {
  const tries = [
    word.toUpperCase(),
    word[0]?.toUpperCase() + word.slice(1),
    word[0]?.toLowerCase() + word.slice(1),
    ...Array.from(word, (_, k) => word.slice(0, k) + word.slice(k + 1)),
    word.replace(/["‘’′´`]+/g, "'"),
  ];
  for (const t of tries) {
    if (!t || t === word) continue;
    const moves = readWord(t, read);
    if (moves?.length) return moves.join(' ');
  }
  return undefined;
}
