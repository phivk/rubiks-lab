// The pieces Learn builds its pages from, for any method: the stage stepper, a move sequence
// with its triggers marked, a case's drill controls, and the banner for a cube turned off plan.
// Each returns HTML; main.ts puts it on screen and handles the clicks (data-act, data-ctl).

import type { Method, Stage } from '../core/types';

type Triggers = Method['triggers'];

/**
 * For each move, the trigger run it belongs to (counted from 1), or 0: the method's triggers
 * found in `moves`, left to right, without overlaps.
 */
export function triggerRuns(moves: string[], triggers: Triggers) {
  const runs = moves.map(() => 0);
  let run = 0;
  for (let i = 0; i < moves.length;) {
    const t = triggers?.find((tr) => tr.moves.every((m, k) => moves[i + k] === m));
    if (!t) { i++; continue; }
    run++;
    for (let k = 0; k < t.moves.length; k++) runs[i + k] = run;
    i += t.moves.length;
  }
  return runs;
}

/** a move chip's classes for its trigger run: each run on its own, so two in a row stay apart */
export const trigClass = (run: number) => (run ? ` trig ${run % 2 ? 'odd' : 'even'}` : '');

/** Moves as text, with each trigger run marked. */
export function movesHtml(moves: string[], triggers: Triggers, breakAfter?: number) {
  const runs = triggerRuns(moves, triggers);
  return moves.map((m, i) => {
    const open = runs[i] && runs[i] !== runs[i - 1] ? '<span class="trig">' : '';
    const close = runs[i] && runs[i] !== runs[i + 1] ? '</span>' : '';
    return (i === breakAfter ? '<br>' : i ? ' ' : '') + open + `<span class="mv" data-mv="${i}">${m}</span>` + close;
  }).join('');
}

/** HTML with the moves inside each <code> marked where they hold a trigger. */
export const markCode = (html: string, triggers: Triggers) =>
  html.replace(/<code>([^<]*)<\/code>/g, (_, text: string) => `<code>${movesHtml(text.split(' ').filter(Boolean), triggers)}</code>`);

/** The method's stages, one after another, with the one on screen (`active`) marked. */
export function stepperHtml(stages: Stage[], active: number) {
  return stages.map((st, i) =>
    `<button role="tab" data-step="${i}" class="${i === active ? 'active' : ''}" aria-selected="${i === active}"><span class="num">${i + 1}</span>${st.name}</button>`).join('');
}

/**
 * The cube was turned off the plan: says what no longer fits, and offers to undo the stray
 * turns (`undo`, its label, when they can be) or start over (`again`).
 */
export function offPlanHtml(what: string, undo: string | null, again: { act: string; label: string }) {
  const label = undo ? again.label : again.label[0].toUpperCase() + again.label.slice(1);
  return `<div class="lesson-stale">You turned the cube, so ${what}. ` +
    (undo ? `<button class="link" data-act="undo">${undo}</button> or ` : '') +
    `<button class="link" data-act="${again.act}">${label}</button></div>`;
}

/** A case's drill controls: what it says (filled in by drillStatus), a step back, and play. */
export const drillControlsHtml = () =>
  '<span class="case-ctl"><span class="case-status"></span>' +
  '<button class="case-back" data-ctl="back" aria-label="Previous move"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>' +
  '<button class="case-play" data-ctl="play" aria-label="Play the moves"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg><svg class="i-replay" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button></span>';

/** What the open case's drill controls say: turned off plan, or how to step through it. */
export function drillStatus(d: { stale: boolean; undo: string | null; playing: boolean; atStart: boolean; tapLearned: boolean }) {
  if (d.stale) return `<b>Cube turned</b>${d.undo ? `<button class="case-undo" data-ctl="undo">${d.undo}</button>` : ''}tap to set up`;
  if (d.playing) return '';
  // until you've stepped through a case once, the first open says how
  if (d.atStart && !d.tapLearned) return '<b>Tap the card</b>for each move';
  return '';
}
