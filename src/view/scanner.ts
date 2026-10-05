// The camera scanner: a full-screen live preview with a grid to line a face up in. Each
// cell shows the color it sees; capturing walks through the puzzle's scan faces, and a tap
// on a face's thumbnail scans it again. When every face is in, the colors are settled
// together (see classify.ts) and handed back as a state.

import { KIND_COLORS, byIds, cubeKind, type CubeKind } from '../core/colors';
import type { Puzzle, State } from '../core/types';
import { scanCells, type Cell } from '../scan/cells';
import { calibrateFaces, medianColor, nearest, scanState, type Calibration, type RGB } from '../scan/classify';

export interface ScannerEvents {
  /** `kind` is the kind of cube the colors say it is, to draw it in */
  onDone: (state: State, kind: CubeKind) => void;
  onError: (message: string) => void;
}

/** sampled pixels across the viewfinder */
const FRAME_PX = 120;
const SAMPLE_MS = 120;

/** a face's cells as SVG shapes in a 100×100 box: a square one with rounded corners */
const shapes = (cells: Cell[], round: number) => cells.map(({ poly }) => {
  const xs = poly.map((p) => p[0] * 100), ys = poly.map((p) => p[1] * 100);
  return poly.length === 4
    ? `<rect x="${xs[0]}" y="${ys[0]}" width="${xs[1] - xs[0]}" height="${ys[2] - ys[1]}" rx="${round}"/>`
    : `<polygon points="${xs.map((x, k) => `${x},${ys[k]}`).join(' ')}"/>`;
}).join('');

export class Scanner {
  private root: HTMLDivElement;
  private video: HTMLVideoElement;
  private grid: HTMLDivElement;
  private faces: HTMLDivElement;
  private warn: HTMLDivElement;
  private light: HTMLButtonElement;
  private dots: NodeListOf<SVGCircleElement> | null = null;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private stream: MediaStream | null = null;
  private timer = 0;

  private puzzle!: Puzzle;
  /** each scan face's cells in the viewfinder */
  private cells: Cell[][] = [];
  /** samples per scan face, once captured */
  private captured: (RGB[] | null)[] = [];
  private current = 0;
  private live: RGB[] = [];
  /** a camera facing the user (a webcam) shows its preview mirrored, like a mirror would */
  private mirrored = false;
  /** the kind of cube the colors seen so far say it is, which the preview is drawn in */
  private kind: CubeKind = 'typical';
  /** sticker colors as that kind of cube draws them */
  private colors: string[] = [];
  /** the colors to match against from the captured faces but the current one */
  private others: Calibration | null = null;

  constructor(private events: ScannerEvents) {
    this.root = document.createElement('div');
    this.root.className = 'scanner hidden';
    this.root.innerHTML = `
      <video playsinline muted autoplay></video>
      <div class="scan-top">
        <div class="scan-step"></div>
        <div class="scan-prompt"></div>
        <div class="scan-colors"></div>
        <div class="scan-warn"></div>
      </div>
      <div class="scan-grid"></div>
      <div class="scan-bottom">
        <div class="scan-faces"></div>
        <div class="scan-keys"><kbd>←</kbd><kbd>→</kbd> previous / next face</div>
        <div class="row">
          <button class="btn grow" data-act="cancel">Cancel<kbd>Esc</kbd></button>
          <button class="btn icon hidden" data-act="light" title="Light up the cube with the screen" aria-label="Screen light"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
          <button class="btn grow scan-capture" data-act="capture"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>Capture<kbd>Space</kbd></button>
        </div>
      </div>`;
    document.body.append(this.root);
    this.video = this.root.querySelector('video')!;
    this.grid = this.root.querySelector('.scan-grid')!;
    this.faces = this.root.querySelector('.scan-faces')!;
    this.warn = this.root.querySelector('.scan-warn')!;
    this.light = this.root.querySelector('[data-act=light]')!;
    this.root.querySelector('[data-act=cancel]')!.addEventListener('click', () => this.close());
    this.root.querySelector('[data-act=capture]')!.addEventListener('click', () => this.capture());
    this.light.addEventListener('click', () => {
      this.setLight(!this.root.classList.contains('light'));
      try { localStorage.setItem('scanLight', this.root.classList.contains('light') ? '1' : '0'); } catch { /* storage unavailable */ }
    });
    // on the window, so the keys still work after a click on the video takes focus away
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') this.close();
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.capture(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); this.step(e.key === 'ArrowLeft' ? -1 : 1); }
    });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  async open(puzzle: Puzzle) {
    const faces = puzzle.scan;
    if (!faces) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.events.onError('This browser can’t use the camera here — it needs a secure (https) page');
      return;
    }
    this.puzzle = puzzle;
    this.cells = faces.map((f) => scanCells(f));
    this.captured = faces.map(() => null);
    this.current = 0;
    this.live = [];
    this.setKind(cubeKind());
    this.canvas.width = this.canvas.height = FRAME_PX;
    this.buildFaces();
    this.root.classList.remove('hidden');
    this.render();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e) {
      this.close();
      const name = (e as Error).name;
      this.events.onError(name === 'NotAllowedError' ? 'Camera access was blocked — allow it in your browser to scan'
        : name === 'NotFoundError' ? 'No camera found' : 'Couldn’t start the camera');
      return;
    }
    // closed while waiting for permission
    if (!this.isOpen) return this.stop();
    this.video.srcObject = this.stream;
    // phones report their back camera as 'environment'; webcams often report nothing
    this.mirrored = this.stream.getVideoTracks()[0]?.getSettings().facingMode !== 'environment';
    this.root.classList.toggle('mirrored', this.mirrored);
    // a camera on the screen's side can use the screen as a lamp; a phone's back camera can't
    this.light.classList.toggle('hidden', !this.mirrored);
    let light = true;
    try { light = localStorage.getItem('scanLight') !== '0'; } catch { /* storage unavailable */ }
    this.setLight(this.mirrored && light);
    this.render();
    this.timer = window.setInterval(() => this.sample(), SAMPLE_MS);
    (this.root.querySelector('[data-act=capture]') as HTMLButtonElement).focus();
  }

  /** Turn everything around the grid white, so the screen lights the cube in a dim room. */
  private setLight(on: boolean) {
    this.root.classList.toggle('light', on);
    this.light.setAttribute('aria-pressed', String(on));
  }

  close() {
    this.stop();
    this.root.classList.add('hidden');
  }

  private stop() {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  /** The thumbnails, one per scan face. */
  private buildFaces() {
    this.faces.innerHTML = '';
    this.puzzle.scan!.forEach((f, k) => {
      const b = document.createElement('button');
      b.className = 'scan-face';
      b.title = f.center === undefined ? `Scan face ${k + 1}` : `Scan the ${this.name(f.face)} face`;
      b.innerHTML = `<svg viewBox="0 0 100 100">${shapes(this.cells[k], 6)}</svg>`;
      b.addEventListener('click', () => { this.current = k; this.render(); });
      this.faces.append(b);
    });
  }

  /** The viewfinder's cells for the current face, each with a dot for the color it sees. */
  private buildGrid() {
    const face = this.puzzle.scan![this.current], cells = this.cells[this.current];
    const n = Math.round(Math.sqrt(cells.length));
    this.grid.style.setProperty('--n', String(n));
    this.grid.innerHTML = `<svg viewBox="0 0 100 100"><g class="cells">${shapes(cells, 8 / n)}</g>${
      cells.map((c) => `<circle cx="${c.at[0] * 100}" cy="${c.at[1] * 100}" r="${c.r * 85}"/>`).join('')}</svg>`;
    if (face.center !== undefined) this.grid.querySelector('.cells')!.children[face.center].classList.add('center');
    this.dots = this.grid.querySelectorAll('circle');
  }

  /** The grid's square in video pixels: the video fills the screen (object-fit: cover), centered. */
  private gridInVideo() {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const box = this.video.getBoundingClientRect(), g = this.grid.getBoundingClientRect();
    const k = Math.max(box.width / vw, box.height / vh);
    const x = vw / 2 + (this.mirrored ? -1 : 1) * (g.left + g.width / 2 - (box.left + box.width / 2)) / k;
    const y = vh / 2 + (g.top + g.height / 2 - (box.top + box.height / 2)) / k;
    const side = g.width / k;
    return { x: x - side / 2, y: y - side / 2, side };
  }

  private sample() {
    if (this.video.readyState < 2 || !this.video.videoWidth) return;
    const { x, y, side } = this.gridInVideo();
    this.ctx.drawImage(this.video, x, y, side, side, 0, 0, FRAME_PX, FRAME_PX);
    const { data } = this.ctx.getImageData(0, 0, FRAME_PX, FRAME_PX);
    this.live = this.cells[this.current].map(({ at, r }) => {
      const w = Math.round(2 * r * FRAME_PX);
      return medianColor(data, FRAME_PX, Math.round(at[0] * FRAME_PX) - (w >> 1), Math.round(at[1] * FRAME_PX) - (w >> 1), w);
    });
    this.renderLive();
  }

  /** The colors to match against: the captured faces, with `live` in place of face `except`. */
  private refs(except = -1, live?: RGB[]): Calibration {
    return calibrateFaces(this.puzzle, this.captured.map((c, k) => (k === except ? live : c ?? undefined)));
  }

  private renderLive() {
    const face = this.puzzle.scan![this.current];
    let fit = this.refs(this.current, this.live), seen = face.face;
    if (face.center !== undefined) {
      const others = this.others!;
      seen = nearest(this.live[face.center], others.refs);
      // the center in view is this face's color, so it shows the stickers what that looks
      // like here, unless it's plainly another face's
      if (seen !== face.face) fit = others;
    }
    if (fit.kind !== this.kind) {
      this.setKind(fit.kind);
      this.render();
    }
    this.live.forEach((s, i) => this.dots![i].style.setProperty('--c', this.colors[nearest(s, fit.refs)]));
    this.warn.textContent = seen === face.face ? ''
      : `That looks like the ${this.name(seen)} center — turn the ${this.name(face.face)} one to the camera`;
  }

  private setKind(kind: CubeKind) {
    this.kind = kind;
    this.colors = byIds(KIND_COLORS[kind], this.puzzle.cubeColorIds);
  }

  private name(color: number) {
    return this.puzzle.colorNames[color].toLowerCase();
  }

  private render() {
    const faces = this.puzzle.scan!;
    const face = faces[this.current];
    const dot = (c: number) => `<b><i style="background:${this.colors[c]}"></i>${this.puzzle.colorNames[c]}</b>`;
    this.root.querySelector('.scan-step')!.textContent = `Face ${this.current + 1} of ${faces.length}`;
    this.root.querySelector('.scan-prompt')!.textContent = face.how.replace('{side}', this.mirrored ? 'left' : 'right');
    // without fixed centers, the faces go by position and the colors can't say which is which
    const byColor = face.center !== undefined;
    this.root.querySelector('.scan-colors')!.innerHTML = byColor ? `${dot(face.face)} facing the camera, ${dot(face.top!)} on top` : '';
    // the same two colors on the grid, to check against the cube while lining it up
    this.grid.style.setProperty('--face', byColor ? this.colors[face.face] : '');
    this.grid.style.setProperty('--top', byColor ? this.colors[face.top!] : '');
    this.warn.textContent = '';
    this.others = this.refs(this.current);
    const { refs } = this.refs();
    [...this.faces.children].forEach((b, k) => {
      b.classList.toggle('active', k === this.current);
      [...b.querySelector('svg')!.children].forEach((cell, i) => {
        const s = this.captured[k]?.[i];
        // before it's scanned, only a fixed center shows, to tell the faces apart
        const c = s ? nearest(s, refs) : i === faces[k].center ? faces[k].face : -1;
        (cell as SVGElement).style.fill = c < 0 ? '' : this.colors[c];
      });
    });
    this.buildGrid();
  }

  /** Go to the face before or after this one, without capturing it. */
  private step(by: number) {
    const k = this.current + by;
    if (k < 0 || k >= this.puzzle.scan!.length) return;
    this.current = k;
    this.render();
  }

  private capture() {
    if (this.live.length !== this.cells[this.current].length) return;
    this.captured[this.current] = this.live;
    this.live = [];
    const next = this.captured.findIndex((c, k) => !c && k > this.current);
    const anyLeft = next >= 0 ? next : this.captured.findIndex((c) => !c);
    if (anyLeft < 0) return this.finish();
    this.current = anyLeft;
    this.render();
  }

  private finish() {
    const { state, kind } = scanState(this.puzzle, this.captured as RGB[][]);
    this.close();
    this.events.onDone(state, kind);
  }
}
