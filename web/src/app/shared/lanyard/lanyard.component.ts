import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { UiService } from '../../services/ui.service';
import { QueueService } from '../../services/queue.service';
import { normalizeImageUrl } from '../drive-url';

// 3D lanyard badge (Three.js + Rapier rope physics), draggable.
// Heavy deps are dynamic-imported so they land in a lazy chunk.
@Component({
  selector: 'lanyard-badge',
  template: `
    <canvas #cv></canvas>
    @if (dragUi()) {
      <div #zone class="drop-zone" [class.hot]="zoneHot()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <span>{{ ui.t().viewCard }}</span>
      </div>
    }
    @if (viewer(); as v) {
      <div class="card-viewer" (click)="viewer.set(null)">
        <div
          class="cv-stage"
          (click)="$event.stopPropagation()"
          (pointerdown)="cvDown($event)"
          (pointermove)="cvMove($event)"
          (pointerup)="cvUp($event)"
          (pointercancel)="cvUp($event)"
          (wheel)="cvWheel($event)"
        >
          <div
            class="cv-card"
            [style.transform]="'rotateX(' + cvTilt() + 'deg) rotateY(' + cvAngle() + 'deg)'"
          >
            <img class="cv-face" [src]="v.front" alt="" draggable="false" />
            <img class="cv-face cv-back" [src]="v.back" alt="" draggable="false" />
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 8;
      pointer-events: none;
      display: block;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    .drop-zone {
      position: absolute;
      z-index: 6;
      right: 3%;
      top: 55%;
      transform: translateY(-50%);
      width: 230px;
      height: 300px;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      border: 2px dashed rgba(57, 255, 20, 0.6);
      border-radius: 18px;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(4px);
      color: #fff;
      font-weight: 700;
      transition: transform 0.15s, background 0.15s, border-color 0.15s;
    }
    .drop-zone svg {
      width: 44px;
      height: 44px;
      opacity: 0.85;
    }
    .drop-zone.hot {
      transform: translateY(-50%) scale(1.06);
      background: rgba(39, 174, 96, 0.4);
      border-style: solid;
      border-color: rgba(57, 255, 20, 0.95);
    }
    .card-viewer {
      position: fixed;
      inset: 0;
      z-index: 60;
      pointer-events: auto;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: zoom-out;
    }
    .cv-stage {
      perspective: 1400px;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    .cv-stage:active {
      cursor: grabbing;
    }
    .cv-card {
      position: relative;
      height: min(72vh, 660px);
      aspect-ratio: 63 / 88;
      transform-style: preserve-3d;
    }
    .cv-face {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      backface-visibility: hidden;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    }
    .cv-back {
      transform: rotateY(180deg);
    }
    @media (max-width: 899px) {
      :host { display: none; }
    }
  `,
})
export class LanyardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cv') cv!: ElementRef<HTMLCanvasElement>;

  readonly ui = inject(UiService);
  private readonly svc = inject(QueueService);
  private paused = false;
  private destroyed = false;
  private cleanup: (() => void) | null = null;
  private applyImages: ((f: string, b: string) => void | Promise<void>) | null = null;
  private applyTheme: ((dark: boolean) => void) | null = null;

  // drag the card onto the drop zone to open the full-size viewer
  @ViewChild('zone') private zoneEl?: ElementRef<HTMLElement>;
  readonly dragUi = signal(false);
  readonly zoneHot = signal(false);
  readonly viewer = signal<{ front: string; back: string } | null>(null);
  private getCardImages: (() => { front: string; back: string } | null) | null = null;

  openViewer(): void {
    const imgs = this.getCardImages?.();
    if (imgs) {
      this.cvAngle.set(0);
      this.cvTilt.set(0);
      this.viewer.set(imgs);
    }
  }

  // 360-degree spin inside the viewer: drag any direction (X = spin, Y = tilt),
  // scroll = spin
  readonly cvAngle = signal(0);
  readonly cvTilt = signal(0);
  private cvLast: { x: number; y: number } | null = null;

  cvDown(e: PointerEvent): void {
    this.cvLast = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  cvMove(e: PointerEvent): void {
    if (!this.cvLast) return;
    this.cvAngle.update((a) => a + (e.clientX - this.cvLast!.x) * 0.5);
    this.cvTilt.update((t) => t - (e.clientY - this.cvLast!.y) * 0.5);
    this.cvLast = { x: e.clientX, y: e.clientY };
  }
  cvUp(e: PointerEvent): void {
    this.cvLast = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }
  cvWheel(e: WheelEvent): void {
    e.preventDefault();
    this.cvAngle.update((a) => a + e.deltaY * 0.3);
  }

  // strap tone follows the site theme
  private readonly themeEff = effect(() => {
    const dark = this.ui.theme() === 'dark';
    this.applyTheme?.(dark);
  });

  // ponytail: pause stepping when the site-wide motion switch is off
  private readonly motionEff = effect(() => {
    this.paused = !this.ui.motion();
  });

  // redraw card faces when admin changes the front/back image URLs
  private readonly imagesEff = effect(() => {
    const s = this.svc.settings();
    this.applyImages?.(s.lanyardFront ?? '', s.lanyardBack ?? '');
  });

  async ngAfterViewInit(): Promise<void> {
    if (window.innerWidth < 900) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // wait for the page itself to finish loading before the entrance drop
    if (document.readyState !== 'complete') {
      await new Promise<void>((res) => window.addEventListener('load', () => res(), { once: true }));
      if (this.destroyed) return;
    }

    const [THREE, RAPIER] = await Promise.all([
      import('three'),
      import('@dimforge/rapier3d-compat'),
    ]);
    await RAPIER.init();
    if (this.destroyed) return;

    const canvas = this.cv.nativeElement;
    const host = canvas.parentElement as HTMLElement; // component host, inset 0 of .landing
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0, 13);
    const scene = new THREE.Scene();

    const worldH = 2 * 13 * Math.tan((30 * Math.PI) / 360); // visible height at z=0
    let worldW = worldH;

    const resize = () => {
      const r = host.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      worldW = worldH * camera.aspect;
    };
    resize();

    // ---- textures (canvas-drawn, no extra assets) ----
    const crown = await new Promise<HTMLImageElement | null>((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = 'assets/king.png';
    });
    if (this.destroyed) return;

    // plain white card, standard TCG ratio (63 x 88 mm). Custom image =
    // full-bleed cover-fit; no image = crown logo.
    const drawCardFace = (
      c: HTMLCanvasElement,
      img: HTMLImageElement | null,
      withHole = true,
    ): void => {
      c.width = 630;
      c.height = 880;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, c.width, c.height);
      const rr = (x: number, y: number, w: number, h: number, r: number) => {
        g.beginPath();
        g.roundRect(x, y, w, h, r);
      };
      rr(6, 6, 618, 868, 35);
      g.fillStyle = '#f7f8f5';
      g.fill();
      if (img) {
        g.save();
        g.clip();
        const s = Math.max(618 / img.width, 868 / img.height);
        const dw = img.width * s;
        const dh = img.height * s;
        g.drawImage(img, 6 + (618 - dw) / 2, 6 + (868 - dh) / 2, dw, dh);
        g.restore();
      } else {
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(39, 174, 96, 0.35)';
        g.stroke();
        if (crown) {
          const w = 380;
          const h = (crown.height / crown.width) * w;
          g.drawImage(crown, (630 - w) / 2, (880 - h) / 2 - 20, w, h);
        }
      }
      // punch hole (skipped in the full-size viewer)
      if (withHole) {
        g.save();
        g.globalCompositeOperation = 'destination-out';
        rr(260, 42, 110, 28, 14);
        g.fill();
        g.restore();
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(0,0,0,0.18)';
        rr(260, 42, 110, 28, 14);
        g.stroke();
      }
    };

    const bandCanvas = document.createElement('canvas');
    bandCanvas.width = 1024;
    bandCanvas.height = 64;
    // dark theme = light strap, light theme = dark strap (contrast vs page bg)
    const drawBand = (dark: boolean): void => {
      const g = bandCanvas.getContext('2d')!;
      g.fillStyle = dark ? '#e9f3e4' : '#0b2507';
      g.fillRect(0, 0, 1024, 64);
      g.fillStyle = dark ? '#0b2507' : '#39ff14';
      g.font = '800 54px "IBM Plex Sans Thai", monospace';
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      g.fillText('K E R O R I   R A I K A', 512, 36);
    };
    drawBand(this.ui.theme() === 'dark');
    const bandTex = new THREE.CanvasTexture(bandCanvas);
    bandTex.colorSpace = THREE.SRGBColorSpace;
    this.applyTheme = (dark) => {
      drawBand(dark);
      bandTex.needsUpdate = true;
    };

    const frontCanvas = document.createElement('canvas');
    const backCanvas = document.createElement('canvas');
    drawCardFace(frontCanvas, null);
    drawCardFace(backCanvas, null);
    const texFront = new THREE.CanvasTexture(frontCanvas);
    const texBack = new THREE.CanvasTexture(backCanvas);
    texFront.colorSpace = THREE.SRGBColorSpace;
    texBack.colorSpace = THREE.SRGBColorSpace;

    // admin-set front/back images (settings), live via effect below
    const loadImg = (url: string) =>
      new Promise<HTMLImageElement | null>((res) => {
        if (!url) return res(null);
        const im = new Image();
        im.crossOrigin = 'anonymous'; // required, canvas must stay untainted for WebGL
        im.onload = () => res(im);
        im.onerror = () => res(null);
        im.src = normalizeImageUrl(url); // Drive URLs need the CORS proxy for canvas use
      });
    let lastF: string | null = null;
    let lastB: string | null = null;
    // kept for the full-size viewer (redrawn there without the punch hole)
    let lastFImg: HTMLImageElement | null = null;
    let lastBImg: HTMLImageElement | null = null;
    this.applyImages = async (f, b) => {
      if (f !== lastF) {
        lastF = f;
        lastFImg = await loadImg(f);
        drawCardFace(frontCanvas, lastFImg);
        texFront.needsUpdate = true;
      }
      if (b !== lastB) {
        lastB = b;
        lastBImg = await loadImg(b);
        drawCardFace(backCanvas, lastBImg);
        texBack.needsUpdate = true;
      }
    };
    // wait for the initial card images before the entrance drop starts
    const s0 = this.svc.settings();
    await this.applyImages(s0.lanyardFront ?? '', s0.lanyardBack ?? '');
    if (this.destroyed) return;

    // ---- meshes ----
    const CARD_W = 1.145; // standard TCG ratio vs CARD_H (63 / 88)
    const CARD_H = 1.6;
    const cardGroup = new THREE.Group();
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      new THREE.MeshBasicMaterial({ map: texFront, transparent: true }),
    );
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      new THREE.MeshBasicMaterial({ map: texBack, transparent: true }),
    );
    back.rotation.y = Math.PI;
    back.position.z = -0.005;
    cardGroup.add(front, back);

    // metal carabiner clip between strap end and card slot
    const clipCanvas = document.createElement('canvas');
    clipCanvas.width = 128;
    clipCanvas.height = 256;
    {
      const g = clipCanvas.getContext('2d')!;
      // filled snap-hook silhouette (evenodd punches the holes)
      g.fillStyle = '#2e332e';
      g.beginPath();
      // strap ring
      g.arc(64, 34, 24, 0, Math.PI * 2);
      g.arc(64, 34, 11, 0, Math.PI * 2);
      // neck
      g.rect(55, 52, 18, 26);
      // hook body frame
      g.roundRect(38, 74, 52, 148, 20);
      g.roundRect(54, 92, 22, 112, 10);
      g.fill('evenodd');
      // swivel collar
      g.fillStyle = '#3d433d';
      g.beginPath();
      g.roundRect(48, 62, 32, 14, 6);
      g.fill();
      // gate notch (lighter, right side)
      g.strokeStyle = '#5b625b';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(87, 120);
      g.lineTo(87, 168);
      g.stroke();
      // edge highlight
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(64, 34, 21, Math.PI * 0.6, Math.PI * 1.5);
      g.moveTo(43, 190);
      g.arc(58, 190, 15, Math.PI, Math.PI * 0.5, true);
      g.stroke();
    }
    const clipTex = new THREE.CanvasTexture(clipCanvas);
    clipTex.colorSpace = THREE.SRGBColorSpace;
    const clip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.64),
      new THREE.MeshBasicMaterial({
        map: clipTex,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    clip.renderOrder = 2; // clip on top of the band
    clip.position.set(0, CARD_H / 2 + 0.06, 0.006);
    cardGroup.add(clip);
    scene.add(cardGroup);

    // band ribbon: triangle strip rebuilt from physics points each frame
    const SEGS = 28;
    const bandGeo = new THREE.BufferGeometry();
    const bandPos = new Float32Array((SEGS + 1) * 2 * 3);
    const bandUv = new Float32Array((SEGS + 1) * 2 * 2);
    const bandIdx: number[] = [];
    for (let i = 0; i < SEGS; i++) {
      const a = i * 2;
      bandIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    bandGeo.setAttribute('position', new THREE.BufferAttribute(bandPos, 3));
    bandGeo.setAttribute('uv', new THREE.BufferAttribute(bandUv, 2));
    bandGeo.setIndex(bandIdx);
    const band = new THREE.Mesh(
      bandGeo,
      new THREE.MeshBasicMaterial({ map: bandTex, side: THREE.DoubleSide, depthTest: false }),
    );
    band.frustumCulled = false;
    band.renderOrder = 1; // above the card at any tilt (same-plane z-fight fix)
    scene.add(band);

    // ---- physics ----
    const world = new RAPIER.World({ x: 0, y: -40, z: 0 });
    world.numSolverIterations = 12; // stiffer joints = no visible rope stretch
    const anchorX = worldW * 0.26;
    const topY = worldH / 2 + 0.4;

    const SEG_N = 7; // rope segments (more = smoother, heavier)
    const SEG_L = 0.3;
    const ROPE_MAX = SEG_N * SEG_L + CARD_H / 2 + 0.05; // anchor -> card center, taut

    // entrance: whole assembly spawns above the viewport and the anchor glides
    // down to its rest spot, dropping the card into view. Randomized per load:
    // chain tilt, card kick and spin differ every visit.
    const DROP = ROPE_MAX + 1.2;
    let anchorY = topY + DROP;
    const tilt = (Math.random() - 0.5) * 1.3; // chain angle off vertical, ±0.65 rad
    const dirX = Math.sin(tilt);
    const dirY = -Math.cos(tilt);
    const dropSpeed = 2.8 + Math.random() * 1.6;

    const anchor = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(anchorX, anchorY, 0),
    );
    const segBody = (d: number) =>
      world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(anchorX + dirX * d, anchorY + dirY * d, 0)
          .setLinearDamping(4)
          .setAngularDamping(4),
      );
    const joints = Array.from({ length: SEG_N }, (_, i) => segBody(SEG_L * (i + 0.5)));
    joints.forEach((b) => world.createCollider(RAPIER.ColliderDesc.ball(0.04).setMass(0.05), b));

    const card = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(anchorX + dirX * ROPE_MAX, anchorY + dirY * ROPE_MAX, 0)
        .setLinearDamping(0.8)
        .setAngularDamping(1.2),
    );
    card.setLinvel({ x: (Math.random() - 0.5) * 5, y: 0, z: 0 }, true);
    card.setAngvel(
      {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 6,
        z: (Math.random() - 0.5) * 3,
      },
      true,
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(CARD_W / 2, CARD_H / 2, 0.02).setMass(1),
      card,
    );

    // rope joints (reactbits-style): only limit stretching, so the strap can go
    // slack and sag like real fabric; the card hangs off a spherical joint.
    const zero = { x: 0, y: 0, z: 0 };
    const rope = (
      a: InstanceType<typeof RAPIER.RigidBody>,
      b: InstanceType<typeof RAPIER.RigidBody>,
    ) => world.createImpulseJoint(RAPIER.JointData.rope(SEG_L, zero, zero), a, b, true);
    rope(anchor, joints[0]);
    for (let i = 0; i < SEG_N - 1; i++) rope(joints[i], joints[i + 1]);
    world.createImpulseJoint(
      RAPIER.JointData.spherical(zero, { x: 0, y: CARD_H / 2 + 0.3, z: 0 }),
      joints[SEG_N - 1],
      card,
      true,
    );

    // ---- drag ----
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragging = false;
    const dragOff = new THREE.Vector3();
    const toWorld = (ev: { clientX: number; clientY: number }): { x: number; y: number } | null => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const t = -ray.ray.origin.z / ray.ray.direction.z; // plane z=0
      return {
        x: ray.ray.origin.x + ray.ray.direction.x * t,
        y: ray.ray.origin.y + ray.ray.direction.y * t,
      };
    };
    const hitCard = (ev: { clientX: number; clientY: number }): boolean => {
      const p = toWorld(ev);
      if (!p) return false;
      const t = card.translation();
      return Math.abs(p.x - t.x) < CARD_W * 0.6 && Math.abs(p.y - t.y) < CARD_H * 0.6;
    };
    let dragYaw = 0; // wheel-while-dragging spins the card to inspect both faces
    const yawQ = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const inZone = (x: number, y: number): boolean => {
      const el = this.zoneEl?.nativeElement;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0 || !hitCard(ev)) return;
      const p = toWorld(ev)!;
      const t = card.translation();
      dragOff.set(t.x - p.x, t.y - p.y, 0);
      dragging = true;
      dragYaw = 0;
      this.dragUi.set(true);
      card.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      document.body.style.cursor = 'grabbing';
      ev.preventDefault();
    };
    const onWheel = (ev: WheelEvent) => {
      if (!dragging) return;
      ev.preventDefault(); // don't scroll the page while spinning the card
      dragYaw += ev.deltaY * 0.004;
    };
    const onMove = (ev: PointerEvent) => {
      if (dragging) {
        this.zoneHot.set(inZone(ev.clientX, ev.clientY));
        const p = toWorld(ev);
        if (p) {
          joints.forEach((b) => b.wakeUp());
          card.setNextKinematicTranslation({ x: p.x + dragOff.x, y: p.y + dragOff.y, z: 0 });
        }
        return;
      }
      document.body.style.cursor = hitCard(ev) ? 'grab' : '';
    };
    const onUp = (ev: PointerEvent) => {
      if (!dragging) return;
      const dropped = inZone(ev.clientX, ev.clientY);
      dragging = false;
      this.dragUi.set(false);
      this.zoneHot.set(false);
      card.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      document.body.style.cursor = '';
      if (dropped) this.openViewer();
    };
    this.getCardImages = () => {
      try {
        // fresh canvases without the punch hole for the full-size viewer
        const fc = document.createElement('canvas');
        const bc = document.createElement('canvas');
        drawCardFace(fc, lastFImg, false);
        drawCardFace(bc, lastBImg, false);
        return { front: fc.toDataURL(), back: bc.toDataURL() };
      } catch {
        return null; // canvas tainted by a non-CORS image
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', resize);

    // ---- loop ----
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: SEG_N + 2 }, () => new THREE.Vector3()),
    );
    curve.curveType = 'chordal'; // no overshoot kinks on sharp bends
    // physics targets; curve.points are lerp-smoothed toward these (moeru-style)
    const targ = Array.from({ length: SEG_N + 2 }, () => new THREE.Vector3());
    let firstFrame = true;
    const tan = new THREE.Vector3();
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      // glide the anchor down to its rest height (entrance drop)
      if (anchorY > topY + 0.002) {
        anchorY = Math.max(topY, anchorY + (topY - anchorY) * Math.min(1, dt * dropSpeed));
        anchor.setTranslation({ x: anchorX, y: anchorY, z: 0 }, true);
        joints.forEach((b) => b.wakeUp());
        card.wakeUp();
      }
      if (dragging) {
        yawQ.setFromAxisAngle(yAxis, dragYaw);
        card.setNextKinematicRotation(yawQ);
      }
      if (!this.paused) {
        acc += dt;
        while (acc >= 1 / 60) {
          world.step();
          acc -= 1 / 60;
        }
      }
      const ct = card.translation();
      const cq = card.rotation();
      cardGroup.position.set(ct.x, ct.y, ct.z);
      cardGroup.quaternion.set(cq.x, cq.y, cq.z, cq.w);

      const pts = curve.points;
      const at = anchor.translation();
      targ[0].set(at.x, at.y, at.z);
      joints.forEach((b, i) => {
        const t = b.translation();
        targ[i + 1].set(t.x, t.y, t.z);
      });
      // band visually ends inside the clip's top ring
      const topLocal = new THREE.Vector3(0, CARD_H / 2 + 0.295, 0).applyQuaternion(
        cardGroup.quaternion,
      );
      targ[SEG_N + 1].set(ct.x + topLocal.x, ct.y + topLocal.y, ct.z + topLocal.z);
      // endpoints track exactly; middle points lerp with distance-scaled speed
      // (reactbits-style): far = catch up fast, near = smooth out jitter
      pts[0].copy(targ[0]);
      pts[SEG_N + 1].copy(targ[SEG_N + 1]);
      for (let i = 1; i <= SEG_N; i++) {
        if (firstFrame) {
          pts[i].copy(targ[i]);
          continue;
        }
        const d = Math.max(0.1, Math.min(1, pts[i].distanceTo(targ[i])));
        pts[i].lerp(targ[i], Math.min(1, dt * d * 50));
      }
      firstFrame = false;

      // anti-yaw: steer angular velocity back so the card faces front
      const av = card.angvel();
      card.setAngvel({ x: av.x, y: av.y - cq.y * 0.25, z: av.z }, true);

      for (let i = 0; i <= SEGS; i++) {
        const u = i / SEGS;
        const p = curve.getPoint(u);
        curve.getTangent(u, tan);
        const nx = -tan.y;
        const ny = tan.x;
        // taper the strap end so it folds into the clip ring instead of a flat cut
        const taper = u < 0.88 ? 1 : 1 - 0.72 * ((u - 0.88) / 0.12);
        const inv = (0.11 * taper) / (Math.hypot(nx, ny) || 1);
        const o = i * 6;
        bandPos[o] = p.x + nx * inv;
        bandPos[o + 1] = p.y + ny * inv;
        bandPos[o + 2] = p.z;
        bandPos[o + 3] = p.x - nx * inv;
        bandPos[o + 4] = p.y - ny * inv;
        bandPos[o + 5] = p.z;
        bandUv[i * 4] = u;
        bandUv[i * 4 + 1] = 1;
        bandUv[i * 4 + 2] = u;
        bandUv[i * 4 + 3] = 0;
      }
      bandGeo.attributes['position'].needsUpdate = true;
      bandGeo.attributes['uv'].needsUpdate = true;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    this.cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', resize);
      document.body.style.cursor = '';
      world.free();
      renderer.dispose();
      bandGeo.dispose();
      [texFront, texBack, bandTex, clipTex].forEach((t) => t.dispose());
    };
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cleanup?.();
  }
}
