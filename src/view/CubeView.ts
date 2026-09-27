import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FACELETS, State, Turn, UNSET, Vec3, faceletAt } from '../cube/model';

export const STICKER_COLORS = ['#f4f4ef', '#e02a3c', '#14a85a', '#ffd21f', '#ff7b1c', '#2166e6', '#2c313c'];

export type Mode = 'play' | 'paint';

export interface CubeViewEvents {
  /** user finished a drag-turn; quarters is the physical rotation (right-hand rule) */
  onDragTurn: (axis: 0 | 1 | 2, layer: number, quarters: number) => void;
  onStickerClick: (index: number) => void;
  /** return false to prevent drag-turns (e.g. while an animation queue is running) */
  canDragTurn: () => boolean;
}

const HOME_CAMERA: Vec3 = [6.3, 5.3, 8.6];

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function roundedSquare(size: number, radius: number) {
  const s = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-s + radius, -s);
  shape.lineTo(s - radius, -s);
  shape.quadraticCurveTo(s, -s, s, -s + radius);
  shape.lineTo(s, s - radius);
  shape.quadraticCurveTo(s, s, s - radius, s);
  shape.lineTo(-s + radius, s);
  shape.quadraticCurveTo(-s, s, -s, s - radius);
  shape.lineTo(-s, -s + radius);
  shape.quadraticCurveTo(-s, -s, -s + radius, -s);
  return new THREE.ShapeGeometry(shape, 6);
}

export class CubeView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  mode: Mode = 'play';

  private root = new THREE.Group();
  private pivot = new THREE.Group();
  private cubies: { group: THREE.Group; home: Vec3 }[] = [];
  private stickers: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private bodies: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private state: State = [];
  private highlighted = new Set<number>();
  private hovered = -1;
  private anim: { from: number; to: number; start: number; duration: number; ease: (t: number) => number; resolve: () => void } | null = null;
  private drag: {
    pointerId: number;
    startX: number;
    startY: number;
    pos: Vec3;
    normal: Vec3;
    hit: THREE.Vector3;
    axis?: 0 | 1 | 2;
    layer?: number;
    screenDir?: THREE.Vector2;
    angle: number;
    isCube: boolean;
  } | null = null;
  private layerActive = false;
  private celebrate = 0;

  constructor(private container: HTMLElement, private events: CubeViewEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(...HOME_CAMERA);
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
    this.buildCube();

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

  private buildCube() {
    const bodyGeo = new RoundedBoxGeometry(0.97, 0.97, 0.97, 4, 0.1);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.45, metalness: 0.1 });
    const stickerGeo = roundedSquare(0.84, 0.13);
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const group = new THREE.Group();
          group.position.set(x, y, z);
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.userData.home = [x, y, z];
          group.add(body);
          this.bodies.push(body);
          this.cubies.push({ group, home: [x, y, z] });
          this.root.add(group);
        }
    for (const f of FACELETS) {
      const mat = new THREE.MeshStandardMaterial({ color: STICKER_COLORS[f.face], roughness: 0.35, metalness: 0, emissive: 0x000000 });
      const mesh = new THREE.Mesh(stickerGeo, mat);
      const n = new THREE.Vector3(...f.normal);
      mesh.position.copy(n.clone().multiplyScalar(0.487));
      mesh.lookAt(n.clone().multiplyScalar(2));
      mesh.userData.facelet = f.index;
      this.cubieAt(f.pos).group.add(mesh);
      this.stickers.push(mesh);
    }
  }

  private cubieAt(p: Vec3) {
    return this.cubies[(p[0] + 1) * 9 + (p[1] + 1) * 3 + (p[2] + 1)];
  }

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the cube comfortably inside narrow (portrait) viewports
    this.camera.fov = w < h ? 32 * Math.min(1.6, h / w / 1.1) : 32;
    this.camera.updateProjectionMatrix();
  }

  setState(state: State) {
    this.state = state.slice();
    this.stickers.forEach((m, i) => m.material.color.set(STICKER_COLORS[state[i]]));
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
      const e = m.material.emissive;
      if (this.mode === 'paint' && i === this.hovered) e.setRGB(0.18, 0.18, 0.2);
      else e.setRGB(0, 0, 0);
    });
  }

  // ---------- layer animation ----------

  private beginLayer(axis: number, layers: number[]) {
    this.endLayer();
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld();
    for (const c of this.cubies) if (layers.includes(c.home[axis])) this.pivot.attach(c.group);
    this.layerActive = true;
  }

  private setLayerAngle(axis: number, angle: number) {
    this.pivot.rotation.set(axis === 0 ? angle : 0, axis === 1 ? angle : 0, axis === 2 ? angle : 0);
  }

  /** Put every cubie back at its home transform; colors carry the state. */
  private endLayer() {
    if (!this.layerActive) return;
    for (const c of this.cubies) {
      this.root.attach(c.group);
      c.group.position.set(...c.home);
      c.group.rotation.set(0, 0, 0);
    }
    this.pivot.rotation.set(0, 0, 0);
    this.layerActive = false;
  }

  private tweenAngle(axis: number, from: number, to: number, duration: number, ease = easeInOut) {
    return new Promise<void>((resolve) => {
      this.anim = { from, to, start: performance.now(), duration, ease, resolve };
      this.animAxis = axis;
    });
  }
  private animAxis = 0;

  /** Animate a turn, then show `after` (the state once the turn is applied). */
  async animateTurn(turn: Turn, after: State, duration: number) {
    this.cancelDrag();
    if (duration <= 0) {
      this.setState(after);
      return;
    }
    this.beginLayer(turn.axis, turn.layers);
    await this.tweenAngle(turn.axis, 0, (turn.quarters * Math.PI) / 2, duration * (Math.abs(turn.quarters) === 2 ? 1.35 : 1));
    this.endLayer();
    this.setState(after);
  }

  get isAnimating() {
    return this.anim !== null;
  }

  celebrateSolve() {
    this.celebrate = performance.now();
  }

  private tick = (now: number) => {
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.start) / a.duration);
      this.setLayerAngle(this.animAxis, a.from + (a.to - a.from) * a.ease(t));
      if (t >= 1) {
        this.anim = null;
        a.resolve();
      }
    }
    if (this.celebrate) {
      const t = (now - this.celebrate) / 1100;
      if (t >= 1) {
        this.celebrate = 0;
        this.root.scale.setScalar(1);
        this.root.rotation.y = 0;
      } else {
        this.root.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.06);
        this.root.rotation.y = easeInOut(t) * Math.PI * 2;
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  // ---------- pointer interaction ----------

  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects([...this.stickers, ...this.bodies], false)[0];
    if (!hit) return null;
    const obj = hit.object;
    if (obj.userData.facelet !== undefined) {
      const f = FACELETS[obj.userData.facelet as number];
      return { facelet: f.index, pos: f.pos, normal: f.normal, point: hit.point };
    }
    // Hit the black plastic: use the dominant axis of the local hit point to find the face.
    const home = obj.userData.home as Vec3;
    const local = hit.point.clone().sub(new THREE.Vector3(...home));
    const arr = [local.x, local.y, local.z];
    const ax = arr.map(Math.abs).indexOf(Math.max(...arr.map(Math.abs)));
    const normal: Vec3 = [0, 0, 0];
    normal[ax] = Math.sign(arr[ax]);
    if (home[ax] !== normal[ax]) return null; // an interior face
    return { facelet: faceletAt(home, normal) ?? -1, pos: home, normal, point: hit.point };
  }

  private toScreen(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2((p.x * rect.width) / 2, (-p.y * rect.height) / 2);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.drag) return;
    const hit = this.pick(e);
    const isCube = !!hit && this.mode === 'play' && !this.anim && !this.celebrate && this.events.canDragTurn();
    if (!hit && this.mode === 'play') return; // background → OrbitControls
    this.drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      pos: hit?.pos ?? [0, 0, 0],
      normal: hit?.normal ?? [0, 0, 0],
      hit: hit?.point ?? new THREE.Vector3(),
      angle: 0,
      isCube,
    };
    if (isCube) {
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) {
      if (this.mode === 'paint' && e.pointerType === 'mouse') {
        const hit = this.pick(e);
        this.setHover(hit ? hit.facelet : -1);
      }
      return;
    }
    if (!d.isCube) return;
    const drag = new THREE.Vector2(e.clientX - d.startX, e.clientY - d.startY);
    if (d.axis === undefined) {
      if (drag.length() < 8) return;
      // choose the rotation axis whose motion at the grabbed point best matches the drag
      const nAxis = d.normal.findIndex((x) => x !== 0);
      let bestScore = -1;
      for (const axis of [0, 1, 2] as const) {
        if (axis === nAxis) continue;
        const a = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
        const tangent = a.clone().cross(d.hit); // velocity for +1 rad about `a`
        const s0 = this.toScreen(d.hit);
        const dir = this.toScreen(d.hit.clone().add(tangent.multiplyScalar(0.05))).sub(s0).divideScalar(0.05);
        if (dir.length() < 1e-3) continue;
        const score = Math.abs(dir.clone().normalize().dot(drag.clone().normalize()));
        if (score > bestScore) {
          bestScore = score;
          d.axis = axis;
          d.screenDir = dir;
        }
      }
      if (d.axis === undefined) return;
      d.layer = d.pos[d.axis];
      this.beginLayer(d.axis, [d.layer]);
    }
    const dir = d.screenDir!;
    d.angle = drag.dot(dir) / dir.lengthSq();
    this.setLayerAngle(d.axis, d.angle);
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
        if (hit && hit.facelet >= 0) this.events.onStickerClick(hit.facelet);
      }
      return;
    }
    if (d.axis === undefined) return;
    const axis = d.axis, layer = d.layer!;
    // Snap to the nearest quarter, with a little bias so short flicks still count.
    const q = d.angle / (Math.PI / 2);
    const quarters = Math.abs(q) > 0.3 && Math.abs(q) < 0.5 ? Math.sign(q) : Math.round(q);
    const target = (quarters * Math.PI) / 2;
    const state = this.state;
    void this.tweenAngle(axis, d.angle, target, 90 + Math.abs(target - d.angle) * 160, easeOut).then(() => {
      this.endLayer();
      this.setState(state);
      if (quarters % 4 !== 0) this.events.onDragTurn(axis, layer, quarters);
    });
  };

  private cancelDrag() {
    if (this.drag?.axis !== undefined) this.endLayer();
    this.drag = null;
    this.controls.enabled = true;
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.setHover(-1);
    this.refreshEmissive();
  }

  resetCamera() {
    const from = this.camera.position.clone();
    const to = new THREE.Vector3(...HOME_CAMERA);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      this.camera.position.lerpVectors(from, to, easeInOut(t)).setLength(from.length() + (to.length() - from.length()) * easeInOut(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Pulse stickers in a highlight set (used for validation errors). */
  flashHighlight() {
    const start = performance.now();
    const step = (now: number) => {
      const t = (now - start) / 1400;
      const k = t >= 1 ? 0 : Math.abs(Math.sin(t * Math.PI * 3)) * 0.55;
      this.highlighted.forEach((i) => this.stickers[i].material.emissive.setRGB(k, k * 0.2, k * 0.25));
      if (t < 1) requestAnimationFrame(step);
      else this.refreshEmissive();
    };
    requestAnimationFrame(step);
  }

  get unsetColor() {
    return STICKER_COLORS[UNSET];
  }
}
