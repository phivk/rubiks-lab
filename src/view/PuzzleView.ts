import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { DragOption, Puzzle, State, Turn, Vec3 } from '../core/types';

export type Mode = 'play' | 'paint';

export interface PuzzleViewEvents {
  /** user finished a drag-turn that amounts to `move` */
  onDragTurn: (move: string) => void;
  onStickerClick: (index: number) => void;
  /** return false to prevent drag-turns (e.g. while an animation queue is running) */
  canDragTurn: () => boolean;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** A flat polygon with rounded corners, built in world space from a 3D outline. */
function roundedPolygon(outline: Vec3[], normal: Vec3, radius: number): THREE.BufferGeometry {
  const pts = outline.map((p) => new THREE.Vector3(...p));
  const n = new THREE.Vector3(...normal).normalize();
  const origin = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
  const u = pts[1].clone().sub(pts[0]).normalize();
  const v = n.clone().cross(u);
  const flat = pts.map((p) => new THREE.Vector2(p.clone().sub(origin).dot(u), p.clone().sub(origin).dot(v)));
  const shape = new THREE.Shape();
  flat.forEach((p, i) => {
    const prev = flat[(i + flat.length - 1) % flat.length];
    const next = flat[(i + 1) % flat.length];
    const r = Math.min(radius, p.distanceTo(prev) / 2.5, p.distanceTo(next) / 2.5);
    const a = p.clone().add(prev.clone().sub(p).normalize().multiplyScalar(r));
    const b = p.clone().add(next.clone().sub(p).normalize().multiplyScalar(r));
    if (i === 0) shape.moveTo(a.x, a.y);
    else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(p.x, p.y, b.x, b.y);
  });
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 6);
  const m = new THREE.Matrix4().makeBasis(u, v, n).setPosition(origin);
  return geo.applyMatrix4(m);
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
  private anim: { axis: THREE.Vector3; from: number; to: number; start: number; duration: number; ease: (t: number) => number; resolve: () => void } | null = null;
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
    this.controls.minDistance = 6.5;
    this.controls.maxDistance = 18;
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
    el.addEventListener('pointerleave', () => this.setHover(-1));

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
    this.highlighted.clear();
    this.setState(state);
    if (first) {
      this.camera.position.set(...puzzle.cameraHome);
      this.controls.target.set(...puzzle.cameraTarget);
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
    this.stickers.forEach((m, i) => m.material.color.set(this.puzzle.colors[state[i]]));
    this.refreshEmissive();
  }

  setHighlight(indices: number[]) {
    this.highlighted = new Set(indices);
    this.refreshEmissive();
  }

  private setHover(i: number) {
    if (i === this.hovered) return;
    this.hovered = i;
    this.refreshEmissive();
    this.renderer.domElement.style.cursor = i >= 0 && this.mode === 'paint' ? 'crosshair' : '';
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

  private tweenAngle(axis: THREE.Vector3, from: number, to: number, duration: number, ease = easeInOut) {
    return new Promise<void>((resolve) => {
      this.anim = { axis, from, to, start: performance.now(), duration, ease, resolve };
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
    const big = Math.abs(turn.angle) > Math.PI * 0.75;
    await this.tweenAngle(new THREE.Vector3(...turn.axis), 0, turn.angle, duration * (big ? 1.35 : 1));
    if (puzzle !== this.puzzle) return;
    this.endLayer();
    this.setState(after);
  }

  celebrateSolve() {
    this.celebrate = performance.now();
  }

  private tick = (now: number) => {
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.start) / a.duration);
      this.setLayerAngle(a.axis, a.from + (a.to - a.from) * a.ease(t));
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
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) {
      if (this.mode === 'paint' && e.pointerType === 'mouse') this.setHover(this.pick(e)?.sticker ?? -1);
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
    }
    const dir = d.screenDir!;
    d.angle = drag.dot(dir) / dir.lengthSq();
    this.setLayerAngle(new THREE.Vector3(...d.option.axis), d.angle);
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    this.drag = null;
    this.controls.enabled = true;
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
    void this.tweenAngle(axis, d.angle, target, 90 + Math.abs(target - d.angle) * 160, easeOut).then(() => {
      if (puzzle !== this.puzzle) return;
      this.endLayer();
      this.setState(state);
      const move = opt.toMove(steps);
      if (move) this.events.onDragTurn(move);
    });
  };

  private cancelDrag() {
    if (this.drag?.option) this.endLayer();
    this.drag = null;
    this.controls.enabled = true;
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.setHover(-1);
  }

  resetCamera() {
    const from = this.camera.position.clone().sub(this.controls.target);
    const fromTarget = this.controls.target.clone();
    const toTarget = new THREE.Vector3(...this.puzzle.cameraTarget);
    const to = new THREE.Vector3(...this.puzzle.cameraHome).sub(toTarget);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      const k = easeInOut(t);
      this.controls.target.lerpVectors(fromTarget, toTarget, k);
      const offset = from.clone().lerp(to, k).setLength(from.length() + (to.length() - from.length()) * k);
      this.camera.position.copy(this.controls.target).add(offset);
      if (t < 1) requestAnimationFrame(step);
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
