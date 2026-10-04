// The camera scanner: a full-screen live preview with a grid to line a face up in. Each
// cell shows the color it sees; capturing walks through the puzzle's scan faces, and a tap
// on a face's thumbnail scans it again. When every face is in, the colors are settled
// together (see classify.ts) and handed back as a state.

import type { Puzzle, State } from '../core/types';
import { calibrate, calibrateBlind, medianColor, nearest, scanState, type RGB } from '../scan/classify';

export interface ScannerEvents {
  onDone: (state: State) => void;
  onError: (message: string) => void;
}

/** sampled pixels per grid cell, along each side */
const CELL_PX = 24;
/** a cell's samples come from its middle, away from the sticker's edges and the gaps between stickers */
const INSET = 0.3;
const SAMPLE_MS = 120;

export class Scanner {
  private root: HTMLDivElement;
  private video: HTMLVideoElement;
  private grid: HTMLDivElement;
  private faces: HTMLDivElement;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private stream: MediaStream | null = null;
  private timer = 0;

  private puzzle!: Puzzle;
  private n = 0;
  /** samples per scan face, once captured */
  private captured: (RGB[] | null)[] = [];
  private current = 0;
  private live: RGB[] = [];
  /** a camera facing the user (a webcam) shows its preview mirrored, like a mirror would */
  private mirrored = false;

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
    this.root.querySelector('[data-act=cancel]')!.addEventListener('click', () => this.close());
    this.root.querySelector('[data-act=capture]')!.addEventListener('click', () => this.capture());
    this.root.querySelector('[data-act=light]')!.addEventListener('click', () => {
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
    this.n = Math.round(Math.sqrt(faces[0].stickers.length));
    this.captured = faces.map(() => null);
    this.current = 0;
    this.live = [];
    this.canvas.width = this.canvas.height = this.n * CELL_PX;
    this.buildGrid();
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
    this.root.querySelector('[data-act=light]')!.classList.toggle('hidden', !this.mirrored);
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
    this.root.querySelector('[data-act=light]')!.setAttribute('aria-pressed', String(on));
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

  private buildGrid() {
    this.grid.style.setProperty('--n', String(this.n));
    this.grid.innerHTML = '<span></span>'.repeat(this.n * this.n);
    const center = this.puzzle.scan![0].center;
    if (center !== undefined) this.grid.children[center].classList.add('center');
    this.faces.innerHTML = '';
    this.puzzle.scan!.forEach((f, k) => {
      const b = document.createElement('button');
      b.className = 'scan-face';
      b.style.setProperty('--n', String(this.n));
      b.title = f.center === undefined ? `Scan face ${k + 1}` : `Scan the ${this.name(f.face)} face`;
      b.innerHTML = '<i></i>'.repeat(this.n * this.n);
      b.addEventListener('click', () => { this.current = k; this.render(); });
      this.faces.append(b);
    });
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
    const px = this.n * CELL_PX;
    this.ctx.drawImage(this.video, x, y, side, side, 0, 0, px, px);
    const a = Math.round(CELL_PX * INSET), w = CELL_PX - 2 * a;
    this.live = [];
    for (let r = 0; r < this.n; r++) {
      for (let c = 0; c < this.n; c++) {
        this.live.push(medianColor(this.ctx.getImageData(c * CELL_PX + a, r * CELL_PX + a, w, w).data));
      }
    }
    this.renderLive();
  }

  /**
   * The colors to match against: the captured faces, with `live` in place of face `except`.
   * Their fixed centers stand in for a typical cube's colors, and correct the rest; a cube
   * without them corrects all of a typical cube's by every sticker seen.
   */
  private refs(except = -1, live?: RGB[]): RGB[] {
    const faces = this.puzzle.scan!;
    const shown = faces.map((_, k) => (k === except ? live : this.captured[k] ?? undefined));
    if (faces[0].center === undefined) return calibrateBlind(shown.flatMap((s) => s ?? []));
    const seen: (RGB | undefined)[] = [];
    faces.forEach((f, k) => { if (shown[k]) seen[f.face] = shown[k][f.center!]; });
    return calibrate(seen);
  }

  private renderLive() {
    const face = this.puzzle.scan![this.current];
    let refs = this.refs(this.current, this.live), seen = face.face;
    if (face.center !== undefined) {
      const others = this.refs(this.current);
      seen = nearest(this.live[face.center], others);
      // the center in view is this face's color, so it shows the stickers what that looks
      // like here, unless it's plainly another face's
      if (seen !== face.face) refs = others;
    }
    const cells = this.grid.children as HTMLCollectionOf<HTMLElement>;
    this.live.forEach((s, i) => cells[i].style.setProperty('--c', this.puzzle.colors[nearest(s, refs)]));
    const warn = this.root.querySelector('.scan-warn')!;
    warn.textContent = seen === face.face ? ''
      : `That looks like the ${this.name(seen)} center — turn the ${this.name(face.face)} one to the camera`;
  }

  private name(color: number) {
    return this.puzzle.colorNames[color].toLowerCase();
  }

  private render() {
    const faces = this.puzzle.scan!;
    const face = faces[this.current];
    const dot = (c: number) => `<b><i style="background:${this.puzzle.colors[c]}"></i>${this.puzzle.colorNames[c]}</b>`;
    this.root.querySelector('.scan-step')!.textContent = `Face ${this.current + 1} of ${faces.length}`;
    this.root.querySelector('.scan-prompt')!.textContent = face.how.replace('{side}', this.mirrored ? 'left' : 'right');
    // without fixed centers, the faces go by position and the colors can't say which is which
    const byColor = face.center !== undefined;
    this.root.querySelector('.scan-colors')!.innerHTML = byColor ? `${dot(face.face)} facing the camera, ${dot(face.top)} on top` : '';
    // the same two colors on the grid, to check against the cube while lining it up
    this.grid.style.setProperty('--face', byColor ? this.puzzle.colors[face.face] : '');
    this.grid.style.setProperty('--top', byColor ? this.puzzle.colors[face.top] : '');
    this.root.querySelector('.scan-warn')!.textContent = '';
    const refs = this.refs();
    [...this.faces.children].forEach((b, k) => {
      b.classList.toggle('active', k === this.current);
      [...b.children].forEach((cell, i) => {
        const s = this.captured[k]?.[i];
        // before it's scanned, only a fixed center shows, to tell the faces apart
        const c = s ? nearest(s, refs) : i === faces[k].center ? faces[k].face : -1;
        (cell as HTMLElement).style.background = c < 0 ? '' : this.puzzle.colors[c];
      });
    });
    [...this.grid.children].forEach((c) => c.removeAttribute('style'));
  }

  /** Go to the face before or after this one, without capturing it. */
  private step(by: number) {
    const k = this.current + by;
    if (k < 0 || k >= this.puzzle.scan!.length) return;
    this.current = k;
    this.render();
  }

  private capture() {
    if (this.live.length !== this.n * this.n) return;
    this.captured[this.current] = this.live;
    this.live = [];
    const next = this.captured.findIndex((c, k) => !c && k > this.current);
    const anyLeft = next >= 0 ? next : this.captured.findIndex((c) => !c);
    if (anyLeft < 0) return this.finish();
    this.current = anyLeft;
    this.render();
  }

  private finish() {
    const state = scanState(this.puzzle, this.captured as RGB[][]);
    this.close();
    this.events.onDone(state);
  }
}
