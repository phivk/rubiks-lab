import type { Puzzle, State } from '../core/types';
import { easeInOut } from './anim';

export const SVG = 'http://www.w3.org/2000/svg';
// Draw at 100× the puzzle's map units so text sizes stay well above browsers' minimum font size.
export const UNIT = 100;

/** How far the pointer moves before a drag picks a layer, in CSS pixels. */
const DRAG_START = 8;

export interface MapHandlers {
  onClick: (index: number) => void;
  /** a sticker was dragged along its layer */
  onTurn: (move: string) => void;
  canTurn: () => boolean;
  /** the mouse moved onto a sticker, or off them all (-1) */
  onHover: (index: number) => void;
  /** a sticker was pressed to drag (`pieces` once the drag picked a layer), or let go (-1) */
  onGrab: (index: number, pieces?: number[]) => void;
}

/** Whether a ring-map circle turns with a layer's pieces: all its stickers are on them. */
export const turnsWith = (puzzle: Puzzle, circle: { stickers: number[] }, pieces: Set<number>) =>
  circle.stickers.every((s) => pieces.has(puzzle.stickers[s].piece));

/** The ring-map circles a sticker sits on; given the pieces of a turning layer, only that layer's. */
export function ringsOf(puzzle: Puzzle, sticker: number, pieces?: number[]): number[] {
  const turning = pieces && new Set(pieces);
  return (puzzle.rings?.circles ?? []).flatMap((c, i) =>
    c.stickers.includes(sticker) && (!turning || turnsWith(puzzle, c, turning)) ? [i] : [],
  );
}

/** The stickers on some ring-map circles, or null for none. */
export function litStickers(puzzle: Puzzle, rings: number[]): Set<number> | null {
  return rings.length ? new Set(rings.flatMap((r) => puzzle.rings!.circles[r].stickers)) : null;
}

/**
 * What the 2D maps share: each sticker is an SVG element (`cells`) that outlines on hover,
 * dims off the rings of a pressed sticker, and turns a layer when dragged; turns animate on
 * one clock that can jump to its end.
 */
export abstract class MapView {
  protected cells: SVGElement[] = [];
  protected puzzle!: Puzzle;
  /** a pressed sticker, held until the pointer lets go; `turned` once it has turned its layer */
  private drag: { pointer: number; sticker: number; x: number; y: number; turned: boolean } | null = null;
  /** the sticker under the pointer, here or in another view */
  private hovered = -1;
  /** the sticker pressed, here or in another view, and the circles and stickers lit for it */
  private held = -1;
  private outlined = -1;
  protected litRings: number[] = [];
  protected lit: Set<number> | null = null;
  private frame = 0;
  /** puts a running animation's end in place */
  protected finish: (() => void) | null = null;

  constructor(protected container: HTMLElement, protected handlers: MapHandlers) {}

  /** Color each sticker's element as `state` has it. */
  protected fill(state: State) {
    state.forEach((c, i) => this.cells[i]?.style.setProperty('fill', this.puzzle.colors[c]));
  }

  /** Forget the last puzzle's pointer and focus state. */
  protected reset() {
    this.stop();
    this.drag = null;
    this.hovered = this.held = this.outlined = -1;
    this.litRings = [];
    this.lit = null;
  }

  protected get visible() {
    return !this.container.classList.contains('hidden');
  }

  /** Make a sticker's element clickable, hoverable and draggable. */
  protected listen(el: SVGElement, i: number) {
    el.addEventListener('click', () => this.handlers.onClick(i));
    el.addEventListener('pointerdown', (e) => this.startDrag(e, i));
    el.addEventListener('pointerenter', (e) => this.hover(e, i));
    el.addEventListener('pointerleave', (e) => this.hover(e, -1));
  }

  /** Follow drags across the whole drawing. */
  protected listenDrags(svg: SVGSVGElement) {
    svg.addEventListener('pointermove', (e) => this.moveDrag(e));
    svg.addEventListener('pointerup', () => this.endDrag());
    svg.addEventListener('pointercancel', () => this.endDrag());
  }

  /** Outline the sticker the pointer is on in another view (-1 for none). */
  showHover(i: number) {
    this.hovered = i;
    this.refreshOutline();
  }

  /** Outline a pressed sticker and dim everything off its rings (or only the one that turns `pieces`); -1 lets go. */
  showGrab(i: number, pieces?: number[]) {
    this.held = i;
    this.litRings = ringsOf(this.puzzle, i, pieces);
    this.lit = litStickers(this.puzzle, this.litRings);
    this.refreshOutline();
    this.refreshDim();
  }

  private refreshOutline() {
    const i = this.held >= 0 ? this.held : this.hovered;
    if (i === this.outlined) return;
    this.cells[this.outlined]?.classList.remove('hover');
    this.cells[i]?.classList.add('hover');
    this.outlined = i;
  }

  /** Dim what's off the lit rings, as the 3D view dims all but their layers. */
  protected refreshDim() {
    this.cells.forEach((c, i) => c.classList.toggle('dim', !!this.lit && !this.lit.has(i)));
  }

  private hover(e: PointerEvent, i: number) {
    // a touch has no hover, and a drag holds its sticker
    if (e.pointerType !== 'mouse' || this.drag) return;
    this.showHover(i);
    this.handlers.onHover(i);
  }

  /** Whether a sticker can be dragged to turn. */
  protected canDrag(_i: number) {
    return true;
  }

  /** The turn a drag of `dx`, `dy` screen pixels from a sticker means, if any. */
  protected abstract pickTurn(sticker: number, dx: number, dy: number): { move: string; pieces: number[] } | null;

  private startDrag(e: PointerEvent, i: number) {
    if (!this.handlers.canTurn() || this.drag || !this.canDrag(i)) return;
    this.drag = { pointer: e.pointerId, sticker: i, x: e.clientX, y: e.clientY, turned: false };
    const svg = (e.currentTarget as Element).closest('svg')!;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
    this.showGrab(i);
    this.handlers.onGrab(i);
  }

  /** Once the pointer has moved far enough, turn the layer it's moving along. */
  private moveDrag(e: PointerEvent) {
    const d = this.drag;
    if (!d || d.turned || e.pointerId !== d.pointer) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) < DRAG_START) return;
    // one turn per press; the sticker stays held, lighting only its turning layer, until let go
    d.turned = true;
    const turn = this.pickTurn(d.sticker, dx, dy);
    if (!turn) return;
    this.showGrab(d.sticker, turn.pieces);
    this.handlers.onGrab(d.sticker, turn.pieces);
    this.handlers.onTurn(turn.move);
  }

  private endDrag() {
    if (!this.drag) return;
    this.drag = null;
    this.container.querySelector('svg')?.classList.remove('dragging');
    this.showGrab(-1);
    this.handlers.onGrab(-1);
  }

  /** Run an animation: `place` gets the eased progress, 0 to 1, each frame. */
  protected play(duration: number, place: (t: number) => void) {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      if (t < 1) {
        place(easeInOut(t));
        this.frame = requestAnimationFrame(tick);
      } else this.stop();
    };
    place(0);
    this.frame = requestAnimationFrame(tick);
  }

  /** Jump a running animation to its end. */
  protected stop() {
    cancelAnimationFrame(this.frame);
    this.finish?.();
    this.finish = null;
  }

  flash(indices: number[]) {
    for (const i of indices) {
      const c = this.cells[i];
      if (!c) continue;
      c.classList.remove('bad');
      void c.getBoundingClientRect();
      c.classList.add('bad');
    }
    // as long as the pulse animation runs
    setTimeout(() => indices.forEach((i) => this.cells[i]?.classList.remove('bad')), 2600);
  }
}
