import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { DragOption, Puzzle, State, Turn, Vec3 } from '../core/types';
import { easeInOut, easeOut, turnDuration } from './anim';
import { litStickers, ringsOf } from './map';

export type Mode = 'play' | 'paint';

export interface PuzzleViewEvents {
  /** user finished a drag-turn that amounts to `move` */
  onDragTurn: (move: string) => void;
  onStickerClick: (index: number) => void;
  /** return false to prevent drag-turns (e.g. while an animation queue is running) */
  canDragTurn: () => boolean;
  /** the mouse moved onto a sticker, or off the puzzle (-1) */
  onHover: (index: number) => void;
  /** a sticker was pressed to turn its layer (`pieces` once the drag picked one), or let go (-1) */
  onGrab: (index: number, pieces?: number[]) => void;
  /** a drag has turned the layer `steps` of the way through `move` (one step), or ended (null) */
  onDrag: (move: string | null, steps: number) => void;
}

/** How bright the stickers outside the held rings stay. */
const DIM = 0.4;
const FOCUS_DIM = 0.3;

/** A 3D outline laid flat around its middle, and the matrix that puts it back. */
function flatten(outline: Vec3[], normal: Vec3) {
  const pts = outline.map((p) => new THREE.Vector3(...p));
  const n = new THREE.Vector3(...normal).normalize();
  const origin = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
  const u = pts[1].clone().sub(pts[0]).normalize();
  const v = n.clone().cross(u);
  const flat = pts.map((p) => new THREE.Vector2(p.clone().sub(origin).dot(u), p.clone().sub(origin).dot(v)));
  return { flat, matrix: new THREE.Matrix4().makeBasis(u, v, n).setPosition(origin) };
}

function roundCorners(path: THREE.Path, flat: THREE.Vector2[], radius: number) {
  flat.forEach((p, i) => {
    const prev = flat[(i + flat.length - 1) % flat.length];
    const next = flat[(i + 1) % flat.length];
    const r = Math.min(radius, p.distanceTo(prev) / 2.5, p.distanceTo(next) / 2.5);
    const a = p.clone().add(prev.clone().sub(p).normalize().multiplyScalar(r));
    const b = p.clone().add(next.clone().sub(p).normalize().multiplyScalar(r));
    if (i === 0) path.moveTo(a.x, a.y);
    else path.lineTo(a.x, a.y);
    path.quadraticCurveTo(p.x, p.y, b.x, b.y);
  });
  path.closePath();
}

/** A flat polygon with rounded corners, built in world space from a 3D outline. */
function roundedPolygon(outline: Vec3[], normal: Vec3, radius: number): THREE.BufferGeometry {
  const { flat, matrix } = flatten(outline, normal);
  const shape = new THREE.Shape();
  roundCorners(shape, flat, radius);
  return new THREE.ShapeGeometry(shape, 6).applyMatrix4(matrix);
}

/** A band along a sticker's edge, half on it and half off, lifted just above it. */
function edgeBand(outline: Vec3[], normal: Vec3, radius: number): THREE.BufferGeometry {
  const { flat, matrix } = flatten(outline, normal);
  const scaled = (k: number) => flat.map((p) => p.clone().multiplyScalar(k));
  const shape = new THREE.Shape();
  roundCorners(shape, scaled(1.08), radius * 1.08);
  const hole = new THREE.Path();
  roundCorners(hole, scaled(0.86), radius * 0.86);
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape, 6).translate(0, 0, 0.004).applyMatrix4(matrix);
}

export class PuzzleView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  mode: Mode = 'play';
  puzzle!: Puzzle;

  private root = new THREE.Group();
  private pivot = new THREE.Group();
  private pieces: THREE.Group[] = [];
  private stickers: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private bodies: THREE.Mesh[] = [];
  private bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.45, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  private raycaster = new THREE.Raycaster();
  private state: State = [];
  private highlighted = new Set<number>();
  private hovered = -1;
  /** the latest mouse move to look under, once this frame */
  private hoverAt: PointerEvent | null = null;
  /** the sticker under the pointer in the ring view */
  private linkedHover = -1;
  /** the sticker pressed here or in the ring view, and the stickers of its rings */
  private held = -1;
  private lit: Set<number> | null = null;
  /** stickers a lesson points at; the rest are dimmed */
  private focus: Set<number> | null = null;
  private outline = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  );
  private outlined = -1;
  private bands = new Map<number, THREE.BufferGeometry>();
  private anim: {
    axis: THREE.Vector3;
    from: number;
    to: number;
    start: number;
    duration: number;
    ease: (t: number) => number;
    onAngle?: (angle: number) => void;
    resolve: () => void;
  } | null = null;
  private drag: {
    pointerId: number;
    startX: number;
    startY: number;
    sticker: number;
    hit: THREE.Vector3;
    option?: DragOption;
    screenDir?: THREE.Vector2;
    angle: number;
    isTurn: boolean;
  } | null = null;
  private layerActive = false;
  private celebrate = 0;
  private swapAnim = 0;

  constructor(private container: HTMLElement, private events: PuzzleViewEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.7;

    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(5, 8, 6);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));
    this.scene.add(this.root);
    this.root.add(this.pivot);

    const el = this.renderer.domElement;
    // capture on the container so we decide before OrbitControls sees the event
    container.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    // a long press would otherwise open the context menu (Android, desktop right-click)
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerleave', () => {
      this.hoverAt = null;
      this.setHover(-1);
    });
    this.outline.visible = false;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  /** Swap the puzzle on stage (with a small scale-in). */
  setPuzzle(puzzle: Puzzle, state: State) {
    const first = !this.puzzle;
    this.cancelDrag();
    this.anim?.resolve();
    this.anim = null;
    this.endLayer();
    // the outline is shared: keep it out of the pieces about to be disposed
    this.outline.removeFromParent();
    this.outline.visible = false;
    this.outlined = -1;
    this.bands.forEach((g) => g.dispose());
    this.bands.clear();
    for (const g of this.pieces) {
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (o.material !== this.bodyMat) (o.material as THREE.Material).dispose();
        }
      });
      this.root.remove(g);
    }
    this.puzzle = puzzle;
    this.pieces = [];
    this.stickers = [];
    this.bodies = [];
    for (let i = 0; i < puzzle.pieceCount; i++) {
      const g = new THREE.Group();
      const geo = puzzle.buildPiece(i);
      if (geo) {
        const body = new THREE.Mesh(geo, this.bodyMat);
        body.userData.piece = i;
        g.add(body);
        this.bodies.push(body);
      }
      this.pieces.push(g);
      this.root.add(g);
    }
    for (const s of puzzle.stickers) {
      const mat = new THREE.MeshStandardMaterial({ color: puzzle.colors[s.color], roughness: 0.35, metalness: 0, emissive: 0x000000 });
      const mesh = new THREE.Mesh(roundedPolygon(s.outline, s.normal, puzzle.stickerCornerRadius), mat);
      mesh.userData.sticker = s.index;
      this.pieces[s.piece].add(mesh);
      this.stickers.push(mesh);
    }
    this.hovered = -1;
    this.linkedHover = -1;
    this.held = -1;
    this.lit = null;
    this.focus = null;
    this.highlighted.clear();
    this.setState(state);
    if (first) {
      this.camera.position.set(...puzzle.cameraHome);
      this.controls.target.set(...puzzle.cameraTarget);
      [this.controls.minDistance, this.controls.maxDistance] = this.zoomRange();
    }
    else {
      this.resetCamera();
      this.swapAnim = performance.now();
    }
  }

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the puzzle comfortably inside narrow (portrait) viewports
    this.camera.fov = w < h ? 32 * Math.min(1.6, h / w / 1.1) : 32;
    this.camera.updateProjectionMatrix();
  }

  setState(state: State) {
    this.state = state.slice();
    this.refreshColors();
    this.refreshEmissive();
  }

  private refreshColors() {
    this.stickers.forEach((m, i) => {
      m.material.color.set(this.puzzle.colors[this.state[i]]);
      // a pressed sticker's rings win over a lesson's focus
      const dim = this.lit ? !this.lit.has(i) && DIM : !!this.focus && !this.focus.has(i) && FOCUS_DIM;
      if (dim) m.material.color.multiplyScalar(dim);
    });
  }

  /** Outline a sticker the pointer is on in the ring view (-1 for none). */
  showHover(i: number) {
    this.linkedHover = i;
    this.refreshOutline();
  }

  /**
   * Outline a pressed sticker and dim everything off the rings it sits in (or only the
   * ring that turns `pieces`), as the ring view does; -1 lets go.
   */
  showGrab(i: number, pieces?: number[]) {
    this.held = i;
    this.lit = litStickers(this.puzzle, ringsOf(this.puzzle, i, pieces));
    this.refreshColors();
    this.refreshOutline();
  }

  private grab(i: number, pieces?: number[]) {
    this.showGrab(i, pieces);
    this.events.onGrab(i, pieces);
  }

  private refreshOutline() {
    const i = this.held >= 0 ? this.held : this.hovered >= 0 ? this.hovered : this.linkedHover;
    if (i === this.outlined) return;
    this.outlined = i;
    const s = this.puzzle.stickers[i];
    this.outline.visible = !!s;
    if (!s) return;
    let band = this.bands.get(i);
    if (!band) {
      band = edgeBand(s.outline, s.normal, this.puzzle.stickerCornerRadius);
      this.bands.set(i, band);
    }
    this.outline.geometry = band;
    this.pieces[s.piece].add(this.outline);
  }

  /** Dim every sticker but these, or none for null. */
  setFocus(indices: number[] | null) {
    this.focus = indices && new Set(indices);
    this.refreshColors();
  }

  setHighlight(indices: number[]) {
    this.highlighted = new Set(indices);
    this.refreshEmissive();
  }

  private setHover(i: number) {
    if (i === this.hovered) return;
    this.hovered = i;
    this.refreshEmissive();
    this.refreshOutline();
    this.events.onHover(i);
    this.refreshCursor();
  }

  /** As on the ring map: grab a sticker to turn, grabbing while held. */
  private refreshCursor() {
    this.renderer.domElement.style.cursor = this.drag?.isTurn ? 'grabbing' : this.hovered < 0 ? '' : this.mode === 'paint' ? 'crosshair' : 'grab';
  }

  private refreshEmissive() {
    this.stickers.forEach((m, i) => {
      if (this.mode === 'paint' && i === this.hovered) m.material.emissive.setRGB(0.18, 0.18, 0.2);
      else m.material.emissive.setRGB(0, 0, 0);
    });
  }

  // ---------- layer animation ----------

  private beginLayer(pieces: number[]) {
    this.endLayer();
    this.pivot.quaternion.identity();
    this.pivot.updateMatrixWorld();
    for (const p of pieces) this.pivot.attach(this.pieces[p]);
    this.layerActive = true;
  }

  private setLayerAngle(axis: THREE.Vector3, angle: number) {
    this.pivot.quaternion.setFromAxisAngle(axis, angle);
  }

  /** Put every piece back at its home transform; colors carry the state. */
  private endLayer() {
    if (!this.layerActive) return;
    for (const g of this.pieces) {
      this.root.attach(g);
      g.position.set(0, 0, 0);
      g.quaternion.identity();
    }
    this.pivot.quaternion.identity();
    this.layerActive = false;
  }

  private tweenAngle(axis: THREE.Vector3, from: number, to: number, duration: number, ease = easeInOut, onAngle?: (angle: number) => void) {
    return new Promise<void>((resolve) => {
      this.anim = { axis, from, to, start: performance.now(), duration, ease, onAngle, resolve };
    });
  }

  /** Animate a turn, then show `after` (the state once the turn is applied). */
  async animateTurn(turn: Turn, after: State, duration: number) {
    this.cancelDrag();
    if (duration <= 0) {
      this.setState(after);
      return;
    }
    const puzzle = this.puzzle;
    this.beginLayer(turn.pieces);
    await this.tweenAngle(new THREE.Vector3(...turn.axis), 0, turn.angle, turnDuration(turn, duration));
    if (puzzle !== this.puzzle) return;
    this.endLayer();
    this.setState(after);
  }

  celebrateSolve() {
    this.celebrate = performance.now();
  }

  private tick = (now: number) => {
    // one raycast a frame for hover, however fast the mouse reports
    if (this.hoverAt && !this.drag) this.setHover(this.pick(this.hoverAt)?.sticker ?? -1);
    this.hoverAt = null;
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.start) / a.duration);
      const angle = a.from + (a.to - a.from) * a.ease(t);
      this.setLayerAngle(a.axis, angle);
      a.onAngle?.(angle);
      if (t >= 1) {
        this.anim = null;
        a.resolve();
      }
    }
    let scale = 1, spin = 0;
    if (this.celebrate) {
      const t = (now - this.celebrate) / 1100;
      if (t >= 1) this.celebrate = 0;
      else {
        scale = 1 + Math.sin(t * Math.PI) * 0.06;
        spin = easeInOut(t) * Math.PI * 2;
      }
    }
    if (this.swapAnim) {
      const t = (now - this.swapAnim) / 500;
      if (t >= 1) this.swapAnim = 0;
      else {
        scale *= 0.7 + 0.3 * easeOut(t);
        spin += (1 - easeOut(t)) * -0.9;
      }
    }
    this.root.scale.setScalar(scale);
    this.root.rotation.y = spin;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  // ---------- pointer interaction ----------

  private pick(e: PointerEvent): { sticker: number; point: THREE.Vector3 } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects([...this.stickers, ...this.bodies], false)[0];
    if (!hit) return null;
    if (hit.object.userData.sticker !== undefined) return { sticker: hit.object.userData.sticker as number, point: hit.point };
    // Hit the black plastic between stickers: use the nearest sticker on that piece facing the camera.
    const piece = hit.object.userData.piece as number;
    let best = -1, bestD = Infinity;
    for (const s of this.puzzle.stickers) {
      if (s.piece !== piece) continue;
      if (new THREE.Vector3(...s.normal).dot(this.raycaster.ray.direction) > 0) continue;
      const c = s.outline.reduce((a, p) => a.add(new THREE.Vector3(...p)), new THREE.Vector3()).divideScalar(s.outline.length);
      const d = c.distanceToSquared(hit.point);
      if (d < bestD) { bestD = d; best = s.index; }
    }
    return best >= 0 ? { sticker: best, point: hit.point } : null;
  }

  private toScreen(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2((p.x * rect.width) / 2, (-p.y * rect.height) / 2);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.drag) return;
    const hit = this.pick(e);
    if (!hit && this.mode === 'play') return; // background → OrbitControls
    const isTurn = !!hit && this.mode === 'play' && !this.anim && !this.celebrate && !this.swapAnim && this.events.canDragTurn();
    this.drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      sticker: hit?.sticker ?? -1,
      hit: hit?.point ?? new THREE.Vector3(),
      angle: 0,
      isTurn,
    };
    if (isTurn) {
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.grab(hit.sticker);
      this.refreshCursor();
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) {
      // not while orbiting, so the stickers sweeping past don't light up
      if (e.pointerType !== 'mouse') return;
      this.hoverAt = e.buttons ? null : e;
      if (e.buttons) this.setHover(-1);
      return;
    }
    if (!d.isTurn) return;
    const drag = new THREE.Vector2(e.clientX - d.startX, e.clientY - d.startY);
    if (!d.option) {
      if (drag.length() < 8) return;
      // choose the turn whose motion at the grabbed point best matches the drag
      let bestScore = -1;
      for (const opt of this.puzzle.dragOptions(d.sticker)) {
        const axis = new THREE.Vector3(...opt.axis);
        const tangent = axis.clone().cross(d.hit); // velocity for +1 rad
        const s0 = this.toScreen(d.hit);
        const dir = this.toScreen(d.hit.clone().addScaledVector(tangent, 0.05)).sub(s0).divideScalar(0.05);
        if (dir.length() < 1e-3) continue;
        const score = Math.abs(dir.clone().normalize().dot(drag.clone().normalize()));
        if (score > bestScore) {
          bestScore = score;
          d.option = opt;
          d.screenDir = dir;
        }
      }
      if (!d.option) return;
      this.beginLayer(d.option.pieces);
      this.grab(d.sticker, d.option.pieces);
    }
    const dir = d.screenDir!;
    d.angle = drag.dot(dir) / dir.lengthSq();
    this.setLayerAngle(new THREE.Vector3(...d.option.axis), d.angle);
    this.events.onDrag(d.option.toMove(1), d.angle / d.option.step);
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    this.drag = null;
    this.controls.enabled = true;
    if (d.isTurn) this.grab(-1);
    this.refreshCursor();
    const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (this.mode === 'paint') {
      if (moved < 6) {
        const hit = this.pick(e);
        if (hit) this.events.onStickerClick(hit.sticker);
      }
      return;
    }
    const opt = d.option;
    if (!opt) return;
    // Snap to the nearest step, with a little bias so short flicks still count.
    const q = d.angle / opt.step;
    const steps = Math.abs(q) > 0.3 && Math.abs(q) < 0.5 ? Math.sign(q) : Math.round(q);
    const target = steps * opt.step;
    const state = this.state;
    const puzzle = this.puzzle;
    const axis = new THREE.Vector3(...opt.axis);
    const one = opt.toMove(1);
    const follow = (angle: number) => this.events.onDrag(one, angle / opt.step);
    void this.tweenAngle(axis, d.angle, target, 90 + Math.abs(target - d.angle) * 160, easeOut, follow).then(() => {
      if (puzzle !== this.puzzle) return;
      this.endLayer();
      this.setState(state);
      const move = opt.toMove(steps);
      if (move) this.events.onDragTurn(move);
      this.events.onDrag(null, 0);
    });
  };

  private cancelDrag() {
    if (this.drag?.option) {
      this.endLayer();
      this.events.onDrag(null, 0);
    }
    if (this.drag?.isTurn) this.grab(-1);
    this.drag = null;
    this.controls.enabled = true;
    this.refreshCursor();
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.setHover(-1);
  }

  /** How close and far the camera may go: a range around the puzzle's home distance (6.5–18 for the 3×3). */
  private zoomRange(): [number, number] {
    const home = new THREE.Vector3(...this.puzzle.cameraHome).distanceTo(new THREE.Vector3(...this.puzzle.cameraTarget));
    return [home * 0.55, home * 1.5];
  }

  resetCamera() {
    const from = this.camera.position.clone().sub(this.controls.target);
    const fromTarget = this.controls.target.clone();
    const toTarget = new THREE.Vector3(...this.puzzle.cameraTarget);
    const to = new THREE.Vector3(...this.puzzle.cameraHome).sub(toTarget);
    const [min, max] = this.zoomRange();
    // let the camera travel from where it is (another puzzle's range) until it arrives
    this.controls.minDistance = Math.min(min, from.length());
    this.controls.maxDistance = Math.max(max, from.length());
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      const k = easeInOut(t);
      this.controls.target.lerpVectors(fromTarget, toTarget, k);
      const offset = from.clone().lerp(to, k).setLength(from.length() + (to.length() - from.length()) * k);
      this.camera.position.copy(this.controls.target).add(offset);
      if (t < 1) requestAnimationFrame(step);
      else [this.controls.minDistance, this.controls.maxDistance] = [min, max];
    };
    requestAnimationFrame(step);
  }

  /** Pulse stickers in the highlight set (used for validation errors). */
  flashHighlight() {
    const start = performance.now();
    const step = (now: number) => {
      const t = (now - start) / 1400;
      const k = t >= 1 ? 0 : Math.abs(Math.sin(t * Math.PI * 3)) * 0.55;
      this.highlighted.forEach((i) => this.stickers[i]?.material.emissive.setRGB(k, k * 0.2, k * 0.25));
      if (t < 1) requestAnimationFrame(step);
      else this.refreshEmissive();
    };
    requestAnimationFrame(step);
  }
}
