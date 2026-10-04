// The algorithm-driven last-layer steps shared by CFOP and ZZ: orient the top (OLL, or OCLL
// when the edges are already oriented), then permute it (PLL). Each finds its case by trying
// every algorithm after each turn of the top, and keeps the shortest that works.

import type { GuideStep, State } from '../core/types';
import type { OllAlg } from './algs';
import { PLL } from './algs';
import { alg, list, SIDE_NAME, TOP_CORNERS, TOP_EDGES, U_TURNS, type Kit } from './lessonKit';

const TOP = [...TOP_EDGES, ...TOP_CORNERS];

export const oriented = (K: Kit, s: State) => TOP.every((slot) => s[K.at(slot, 'U')] === K.center(s, 'U'));
/** the top layer: center, edges and corners */
export const focusTop = (K: Kit) => () => [K.at('U', 'U'), ...TOP.flatMap((slot) => K.stickersOf(slot))];

/** What the top looks like, in the words cubers use to recognise OLL cases. */
function topShape(K: Kit, s: State) {
  const yellow = K.center(s, 'U');
  const up = TOP_EDGES.filter((e) => s[K.at(e, 'U')] === yellow);
  const corners = TOP_CORNERS.filter((c) => s[K.at(c, 'U')] === yellow).length;
  const edges = up.length === 0 ? 'no edge shows yellow on top (a dot)'
    : up.length === 4 ? 'all four edges show yellow (a cross)'
    : K.at(up[0], 'U') + K.at(up[1], 'U') === 2 * K.at('U', 'U') ? 'two opposite edges show yellow (a line)'
    : 'two neighbouring edges show yellow (an L)';
  return `${edges}, and ${corners === 0 ? 'no corner does' : corners === 4 ? 'so do all four corners' : `${corners} corner${corners === 1 ? '' : 's'} ${corners === 1 ? 'does' : 'do'}`}`;
}

/** Orient the top with one algorithm from `set`; `about` introduces the step (what the acronym stands for). */
export function ollStep(K: Kit, s: State, stage: number, set: OllAlg[], prefix: string, about: string): { s: State; step?: GuideStep } {
  if (oriented(K, s)) return { s };
  let best: { u: string; o: OllAlg; t: State; n: number } | null = null;
  for (const o of set) {
    const moves = alg(o.alg);
    for (const u of U_TURNS) {
      const t = K.apply(s, [u, ...moves]);
      const n = moves.length + (u ? 1 : 0);
      if (oriented(K, t) && (!best || n < best.n)) best = { u, o, t, n };
    }
  }
  if (!best) throw new Error(`lesson: no ${prefix} case fits`);
  const { u, o, t } = best;
  const moves = alg(o.alg);
  return {
    s: t,
    step: {
      stage,
      title: `${prefix} ${o.n}: ${o.name}`,
      html: about + `<p>Look at the top: ${topShape(K, s)}. That’s <b>${prefix} ${o.n}</b>, “${o.name}”, from the ${o.group.toLowerCase()} group.</p>` +
        `<p>${u ? 'Turn the top to the angle the algorithm starts from, then do' : 'It’s already at the right angle. Do'} ${K.code(moves)}. Afterwards the whole top is yellow.</p>`,
      phrases: [...K.topPhrase(u), { label: `${prefix} ${o.n}`, moves }],
      focus: focusTop(K),
    },
  };
}

/** Sides of the top whose two corners show the same color there: "headlights". */
function headlights(K: Kit, s: State) {
  return [...'FRBL'].filter((f) => {
    const cs = TOP_CORNERS.filter((c) => c.includes(f));
    return s[K.at(cs[0], f)] === s[K.at(cs[1], f)];
  });
}

/** Permute the top with one PLL and finish the cube; `solved` says when it's done. */
export function pllStep(K: Kit, s: State, stage: number, solved: (t: State) => boolean): { s: State; step?: GuideStep } {
  const auf = U_TURNS.find((u) => solved(K.apply(s, [u])));
  if (auf !== undefined) {
    if (!auf) return { s };
    return {
      s: K.apply(s, [auf]),
      step: {
        stage,
        title: 'Line up the top',
        html: '<p>The top is already solved relative to itself — no PLL (Permute the Last Layer) algorithm needed. Turn it to line up with the rest.</p>',
        phrases: K.topPhrase(auf),
        focus: focusTop(K),
      },
    };
  }
  const about = '<p><b>PLL</b> stands for <b>P</b>ermute the <b>L</b>ast <b>L</b>ayer: with the top all yellow, move its pieces to their spots. Each case is a letter-named “perm” (short for permutation).</p>';
  let best: { u: string; v: string; p: (typeof PLL)[number]; t: State; n: number } | null = null;
  for (const p of PLL) {
    const moves = alg(p.alg);
    for (const u of U_TURNS) {
      const t0 = K.apply(s, [u, ...moves]);
      for (const v of U_TURNS) {
        const t = K.apply(t0, [v]);
        const n = moves.length + (u ? 1 : 0) + (v ? 1 : 0);
        if (solved(t) && (!best || n < best.n)) best = { u, v, p, t, n };
      }
    }
  }
  if (!best) throw new Error('lesson: no PLL case fits');
  const { u, v, p, t } = best;
  const moves = alg(p.alg);
  const lights = headlights(K, s);
  const hint = lights.length === 4 ? 'Every side shows headlights (both corners on a side match), so the corners are already solved relative to each other.'
    : lights.length === 0 ? 'No side shows headlights (two matching corner colors), so two opposite corners need to swap.'
    : `The ${list(lights.map((f) => SIDE_NAME[f]))} side${lights.length > 1 ? 's show' : ' shows'} headlights — both corners there match — so two neighbouring corners need to swap.`;
  return {
    s: t,
    step: {
      stage,
      title: `${p.name} perm`,
      html: about + `<p>Every piece on top shows yellow; now they have to move to their spots. ${hint}</p>` +
        `<p>Here ${p.kind}: that’s the <b>${p.name} perm</b>. ${u ? 'Turn the top to its starting angle, do' : 'Do'} ${K.code(moves)}` +
        (v ? ', then turn the top to line it up.' : '.') + '</p>',
      phrases: [...K.topPhrase(u), { label: `${p.name} perm`, moves }, ...K.topPhrase(v, 'Line up the top')],
      focus: focusTop(K),
    },
  };
}
