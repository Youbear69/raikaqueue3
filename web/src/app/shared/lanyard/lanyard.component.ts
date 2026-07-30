import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { UiService } from '../../services/ui.service';
import { LanyardSticker, QueueService } from '../../services/queue.service';
import { DRIVE_API, DriveFolder, DriveListing, normalizeImageUrl } from '../drive-url';

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
            (dragover)="dragOverViewer($event)"
            (drop)="dropOnViewer($event)"
          >
            <img class="cv-face" [src]="v.front" alt="" draggable="false" />
            <img class="cv-face cv-back" [src]="v.back" alt="" draggable="false" />
            <canvas #scrF class="cv-face cv-scratch" width="630" height="880"></canvas>
            <canvas #scrB class="cv-face cv-back cv-scratch" width="630" height="880"></canvas>
            @if (cvLift(); as L) {
              <div class="cv-lift" [class.stamp]="L.stamp" [style.left.%]="L.x" [style.top.%]="L.y"
                [style.width.%]="L.w">
                <img [src]="L.src"
                  [style.transform]="'rotate(' + L.rot + 'deg)' + (L.back ? ' scaleX(-1)' : '')"
                  alt="" draggable="false" />
              </div>
            }
            @if (cvTear(); as T) {
              <div class="cv-tear tear-a" [style.left.%]="T.x" [style.top.%]="T.y"
                [style.width.%]="T.w" [style.--tx.px]="T.tx" [style.--ty.px]="T.ty">
                <img [src]="T.a"
                  [style.transform]="'rotate(' + T.rot + 'deg)' + (T.back ? ' scaleX(-1)' : '')"
                  alt="" draggable="false" />
              </div>
              <div class="cv-tear tear-b" [style.left.%]="T.x" [style.top.%]="T.y"
                [style.width.%]="T.w">
                <img [src]="T.b"
                  [style.transform]="'rotate(' + T.rot + 'deg)' + (T.back ? ' scaleX(-1)' : '')"
                  alt="" draggable="false" />
              </div>
            }
          </div>
        </div>
        <div class="cv-coin" [class.drag]="coinPos()" [style.left.px]="coinPos()?.x"
          [style.top.px]="coinPos()?.y" title="เหรียญขูด — ถูบนสติ๊กเกอร์เพื่อขูดออก ดูรูปข้างใต้"
          (click)="$event.stopPropagation()" (pointerdown)="coinDown($event)"
          (pointermove)="coinMove($event)" (pointerup)="coinUp($event)"
          (pointercancel)="coinUp($event)">
          <svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="30" fill="#e7b93c" />
            <circle cx="32" cy="32" r="30" fill="none" stroke="#b8860b" stroke-width="3"
              stroke-dasharray="3 3" />
            <circle cx="32" cy="32" r="22" fill="#f3cf5e" stroke="#c9971a" stroke-width="2" />
            <path d="M20 40c8 6 16 6 24 0" stroke="#fff6d8" stroke-width="3" fill="none"
              stroke-linecap="round" opacity="0.8" />
            <text x="32" y="39" text-anchor="middle" font-size="20" font-weight="800"
              fill="#8a6508"></text>
          </svg>
        </div>
        @if (svc.isAdmin()) {
          <div class="cv-palette" (click)="$event.stopPropagation()">
            <div class="stk-head">
              ลากรูปไปแปะบนการ์ด ({{ (svc.settings().lanyardStickers ?? []).length }}/6) —
              จับแล้วกระชากแรงๆ = ฉีกทิ้ง, scroll ตอนจับ = ปรับขนาด
            </div>
            <label class="stk-drag">
              <input type="checkbox" [checked]="stkDrag()"
                (change)="stkDrag.set($any($event.target).checked)" />
              เปิดลากรูป/ย้ายสติ๊กเกอร์ (กันย้ายโดยไม่ตั้งใจ)
            </label>
            @if (stkMsg()) {
              <div class="stk-msg">{{ stkMsg() }}</div>
            }
            @if (palette(); as p) {
              <div class="stk-folders">
                @if (pFolder(); as f) {
                  <button type="button" (click)="goPalette(null)">&lsaquo; กลับ</button>
                  <strong>{{ f.name }}</strong>
                } @else {
                  @for (f of p.folders; track f.id) {
                    <button type="button" (click)="goPalette(f)">{{ f.name }}</button>
                  }
                }
              </div>
              <div class="stk-grid">
                @for (img of p.images; track img.id) {
                  <img [src]="img.url" [alt]="img.name" [title]="img.name"
                    [draggable]="stkDrag()" [class.stk-off]="!stkDrag()"
                    crossorigin="anonymous" (dragstart)="onPaletteDrag(img.url, $event)"
                    (dragend)="onPaletteDragEnd()" />
                } @empty {
                  <div class="stk-empty">ไม่มีรูป</div>
                }
              </div>
            } @else {
              <div class="stk-empty">กำลังโหลด...</div>
            }
          </div>
        }
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
    .cv-palette {
      position: absolute;
      right: 26px;
      top: 50%;
      transform: translateY(-50%);
      width: 232px;
      max-height: 76vh;
      overflow-y: auto;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      background: rgba(5, 12, 4, 0.55);
      backdrop-filter: blur(10px);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: #fff;
      cursor: default;
    }
    .stk-msg {
      font-size: 12px;
      color: #ff8a80;
    }
    .stk-head {
      font-size: 12.5px;
      opacity: 0.85;
    }
    .stk-drag {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      cursor: pointer;
      user-select: none;
    }
    .stk-grid img.stk-off {
      opacity: 0.45;
      cursor: default;
    }
    .stk-folders {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .stk-folders button {
      padding: 4px 10px;
      border-radius: 7px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 12px;
    }
    .stk-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
      gap: 6px;
    }
    .stk-grid img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: contain;
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.06);
      cursor: grab;
    }
    .stk-empty {
      font-size: 12px;
      opacity: 0.7;
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
    .cv-lift {
      position: absolute;
      pointer-events: none;
      z-index: 3;
      transform: translate(-50%, -50%) scale(1.14);
      transition: transform 0.12s;
    }
    .cv-lift img {
      width: 100%;
      display: block;
      filter: drop-shadow(0 14px 20px rgba(0, 0, 0, 0.5));
    }
    .cv-lift.stamp {
      animation: cv-stamp 0.3s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
    }
    @keyframes cv-stamp {
      from {
        transform: translate(-50%, -50%) scale(1.7);
        opacity: 0.85;
      }
      to {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
      }
    }
    .cv-scratch {
      pointer-events: none;
      background: transparent;
      box-shadow: none;
    }
    .cv-coin {
      position: absolute;
      left: 26px;
      bottom: 26px;
      width: 64px;
      height: 64px;
      cursor: grab;
      touch-action: none;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.45));
      transition: transform 0.15s;
    }
    .cv-coin:hover {
      transform: scale(1.08);
    }
    .cv-coin.drag {
      position: fixed;
      left: 0;
      top: 0;
      bottom: auto;
      transform: translate(-50%, -55%) rotate(-14deg) scale(1.05);
      cursor: grabbing;
      z-index: 70;
      transition: none;
    }
    .cv-coin svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .cv-tear {
      position: absolute;
      pointer-events: none;
      z-index: 4;
      transform: translate(-50%, -50%);
    }
    .cv-tear img {
      width: 100%;
      display: block;
      filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.45));
    }
    .tear-a {
      animation: cv-tear-fly 0.55s ease-out forwards;
    }
    @keyframes cv-tear-fly {
      to {
        transform: translate(calc(-50% + var(--tx, 120px)), calc(-50% + var(--ty, -60px)))
          rotate(-26deg);
        opacity: 0;
      }
    }
    .tear-b {
      animation: cv-tear-fall 0.65s ease-in 0.1s forwards;
    }
    @keyframes cv-tear-fall {
      to {
        transform: translate(-50%, calc(-50% + 150px)) rotate(16deg);
        opacity: 0;
      }
    }
    @media (max-width: 899px) {
      :host { display: none; }
    }
  `,
})
export class LanyardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cv') cv!: ElementRef<HTMLCanvasElement>;

  readonly ui = inject(UiService);
  readonly svc = inject(QueueService);
  private readonly host = inject(ElementRef);
  private paused = false;
  private destroyed = false;
  private cleanup: (() => void) | null = null;
  private applyImages: ((f: string, b: string) => void | Promise<void>) | null = null;
  private applyStickers: ((defs: LanyardSticker[]) => void) | null = null;
  private applyTheme: ((dark: boolean) => void) | null = null;

  // drag the card onto the drop zone to open the full-size viewer
  @ViewChild('zone') private zoneEl?: ElementRef<HTMLElement>;
  readonly dragUi = signal(false);
  readonly zoneHot = signal(false);
  readonly viewer = signal<{ front: string; back: string } | null>(null);
  private getCardImages: (() => { front: string; back: string } | null) | null = null;
  // viewer-side sticker editing (admin): hit test, sticker-layer renderer, sticker info
  private stickerHit: ((px: number, py: number, side: 'front' | 'back') => number | null) | null =
    null;
  private layerRedraw: ((skip?: number) => void) | null = null;
  private stickerInfo:
    | ((idx: number) => {
      src: string;
      im: HTMLImageElement;
      size: number;
      rot: number;
    } | null)
    | null = null;

  // lifted/stamping sticker overlay in the viewer (phase-2 attach/peel feel)
  readonly cvLift = signal<{
    idx: number;
    src: string;
    x: number;
    y: number;
    w: number;
    rot: number;
    stamp?: boolean;
    back?: boolean;
  } | null>(null);

  // ---- sticker palette (admin, inside the card viewer): drag an image onto the card ----
  readonly palette = signal<DriveListing | null>(null);
  readonly pFolder = signal<DriveFolder | null>(null);
  readonly stkMsg = signal('');
  // drag/move guard: unchecked = stickers untouchable (no accidental moves)
  readonly stkDrag = signal(false);
  dragStickerUrl: string | null = null;

  // Local draft of the sticker list: bridges only the moment between our write
  // and its local echo, so back-to-back edits never base on a stale snapshot.
  private stickersDraft: LanyardSticker[] | null = null;

  // ANY settings emission (our echo or an edit from the settings page) is the
  // truth — drop the draft so it can never mask external changes
  private readonly draftClearEff = effect(() => {
    this.svc.settings().lanyardStickers;
    this.stickersDraft = null;
  });

  private curStickers(): LanyardSticker[] {
    return this.stickersDraft ?? (this.svc.settings().lanyardStickers ?? []);
  }

  private writeStickers(list: LanyardSticker[]): void {
    // mirror the service's normalization so the ack-compare above matches
    this.stickersDraft = list
      .slice(0, 6)
      .map((s) => ({ ...s, img: normalizeImageUrl(s.img.trim()) }));
    this.svc.setLanyardStickers(list);
  }

  // 1x1 transparent gif — suppresses the tiny native drag ghost
  private readonly dragGhost = (() => {
    const i = new Image();
    i.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    return i;
  })();

  onPaletteDrag(url: string, e: DragEvent): void {
    this.dragStickerUrl = url;
    // snap flat to the NEAREST face — viewing the back keeps you on the back
    const a = ((this.cvAngle() % 360) + 360) % 360;
    this.cvAngle.set(a > 90 && a < 270 ? 180 : 0);
    this.cvTilt.set(0);
    e.dataTransfer?.setDragImage(this.dragGhost, 0, 0);
  }

  onPaletteDragEnd(): void {
    // drag cancelled (no drop): clear the preview overlay
    this.dragStickerUrl = null;
    const L = this.cvLift();
    if (L && L.idx === -1 && !L.stamp) this.cvLift.set(null);
  }

  // while dragging from the palette, a real-size preview follows the pointer
  dragOverViewer(e: DragEvent): void {
    if (!this.dragStickerUrl) return;
    e.preventDefault();
    const facing = this.cvFacing() ?? 'front';
    this.cvStickerFacing = facing;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(2, Math.min(98, ((e.clientY - r.top) / r.height) * 100));
    this.cvLift.set({
      idx: -1,
      src: this.dragStickerUrl,
      x: this.overlayX(x),
      y,
      w: 25,
      rot: 0,
      back: facing === 'back',
    });
  }

  dropOnViewer(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const url = this.dragStickerUrl;
    this.dragStickerUrl = null;
    if (!url) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 100);
    const y = Math.round(((e.clientY - r.top) / r.height) * 100);
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    const list = [...this.curStickers()];
    if (list.length >= 6) {
      this.stkMsg.set('เต็ม 6 ใบแล้ว — ลบบางใบในตั้งค่าเว็บก่อน');
      return;
    }
    this.stkMsg.set('');
    const facing = this.cvFacing() ?? 'front';
    this.cvStickerFacing = facing;
    const nx = Math.max(2, Math.min(98, x));
    const ny = Math.max(2, Math.min(98, y));
    list.push({ img: url, x: nx, y: ny, size: 25, rot: 0, sheen: '', side: facing });
    // stamp-down animation while the rebuilt snapshot is on its way
    this.cvLift.set({
      idx: list.length - 1,
      src: url,
      x: this.overlayX(nx),
      y: ny,
      w: 25,
      rot: 0,
      stamp: true,
      back: facing === 'back',
    });
    this.writeStickers(list);
  }

  async loadPalette(): Promise<void> {
    this.palette.set(this.svc.cachedDriveListing(this.pFolder()?.id));
    try {
      this.palette.set(await this.svc.listDriveImages(this.pFolder()?.id));
    } catch {
      if (!this.palette()) this.palette.set({ folders: [], images: [] });
    }
  }

  goPalette(f: DriveFolder | null): void {
    this.pFolder.set(f);
    this.loadPalette();
  }

  openViewer(): void {
    const imgs = this.getCardImages?.();
    if (imgs) {
      this.cvAngle.set(0);
      this.cvTilt.set(0);
      this.stkMsg.set('');
      this.viewer.set(imgs);
      if (this.svc.isAdmin()) this.loadPalette();
    }
  }

  // 360-degree spin inside the viewer: drag any direction (X = spin, Y = tilt),
  // scroll = spin. Admin: grabbing a sticker (while the card faces front) moves it.
  readonly cvAngle = signal(0);
  readonly cvTilt = signal(0);
  private cvLast: { x: number; y: number } | null = null;
  private cvStickerIdx: number | null = null;
  private cvStickerPos: { x: number; y: number } | null = null;
  private cvStickerSize: number | null = null;

  private cvCardRect(e: PointerEvent): DOMRect | null {
    const el = (e.currentTarget as HTMLElement).querySelector('.cv-card');
    return el ? el.getBoundingClientRect() : null;
  }

  // which face the viewer card is showing (null = too oblique to edit)
  private cvFacing(): 'front' | 'back' | null {
    const norm = (v: number) => ((v % 360) + 360) % 360;
    const t = norm(this.cvTilt());
    if (t > 25 && t < 335) return null;
    const a = norm(this.cvAngle());
    if (a < 25 || a > 335) return 'front';
    if (a > 155 && a < 205) return 'back';
    return null;
  }

  private cvStickerFacing: 'front' | 'back' = 'front';
  private cvPrevSample: { x: number; y: number; t: number } | null = null;

  // ---- scratch coin: rub STICKERS off like prepaid-card coating, revealing the
  // card art underneath. Session-only; editing stickers repaints the layer. ----
  readonly coinPos = signal<{ x: number; y: number } | null>(null); // null = docked in the corner
  private coinDragging = false;
  private coinPrev: { x: number; y: number; side: 'front' | 'back' } | null = null;
  // offscreen sticker layers (stickers live here, above the plain card faces)
  private scratchF: HTMLCanvasElement | null = null;
  private scratchB: HTMLCanvasElement | null = null;
  private scrF = viewChild<ElementRef<HTMLCanvasElement>>('scrF');
  private scrB = viewChild<ElementRef<HTMLCanvasElement>>('scrB');

  // re-blit the sticker layers whenever the viewer canvases (re)appear
  private readonly scrBlitEff = effect(() => {
    const f = this.scrF()?.nativeElement;
    const b = this.scrB()?.nativeElement;
    if (f && this.scratchF) f.getContext('2d')!.drawImage(this.scratchF, 0, 0);
    if (b && this.scratchB) b.getContext('2d')!.drawImage(this.scratchB, 0, 0);
  });

  private scratchCanvasOf(side: 'front' | 'back'): HTMLCanvasElement {
    const make = () => {
      const c = document.createElement('canvas');
      c.width = 630;
      c.height = 880;
      const g = c.getContext('2d')!;
      g.beginPath();
      g.roundRect(6, 6, 618, 868, 35);
      g.clip(); // clip stays for the canvas lifetime — stickers never leave the card
      return c;
    };
    if (side === 'front') return (this.scratchF ??= make());
    return (this.scratchB ??= make());
  }

  private blitLayer(side: 'front' | 'back'): void {
    const off = side === 'front' ? this.scratchF : this.scratchB;
    const vis = side === 'front' ? this.scrF()?.nativeElement : this.scrB()?.nativeElement;
    if (off && vis) {
      const vg = vis.getContext('2d')!;
      vg.clearRect(0, 0, 630, 880);
      vg.drawImage(off, 0, 0);
    }
  }

  // erase sticker pixels along the rub — assigned in init (needs sticker state);
  // affects the per-sticker canvases, so the 3D card and viewer both show it
  private scratchApply:
    | ((side: 'front' | 'back', x0: number, y0: number, x1: number, y1: number) => void)
    | null = null;
  private scratchPersist: (() => void) | null = null; // save scratch log to localStorage

  coinDown(e: PointerEvent): void {
    e.stopPropagation();
    this.coinDragging = true;
    this.coinPrev = null;
    this.coinPos.set({ x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  coinMove(e: PointerEvent): void {
    if (!this.coinDragging) return;
    this.coinPos.set({ x: e.clientX, y: e.clientY });
    const facing = this.cvFacing();
    if (!facing) {
      this.coinPrev = null;
      return;
    }
    const cardEl = this.host.nativeElement.querySelector('.cv-card') as HTMLElement | null;
    if (!cardEl) return;
    const r = cardEl.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) {
      this.coinPrev = null;
      return;
    }
    const cx = fx * 630;
    const cy = fy * 880;
    if (this.coinPrev && this.coinPrev.side === facing) {
      this.scratchApply?.(facing, this.coinPrev.x, this.coinPrev.y, cx, cy);
    }
    this.coinPrev = { x: cx, y: cy, side: facing };
  }

  coinUp(e: PointerEvent): void {
    if (!this.coinDragging) return;
    this.coinDragging = false;
    this.coinPrev = null;
    this.coinPos.set(null); // glides back to its corner
    this.scratchPersist?.(); // scratches survive a page reload
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  // torn-apart pieces overlay (phase-3 tear = delete)
  readonly cvTear = signal<{
    x: number;
    y: number;
    w: number;
    rot: number;
    a: string;
    b: string;
    tx: number;
    ty: number;
    back?: boolean;
  } | null>(null);

  // split the sticker image into two pieces along a random jagged line,
  // with a white torn-paper edge
  private makeTearPieces(im: HTMLImageElement): { a: string; b: string } | null {
    try {
      const W = im.width;
      const H = im.height;
      const jag: { x: number; y: number }[] = [];
      const steps = 9;
      for (let i = 0; i <= steps; i++) {
        jag.push({ x: W * (0.5 + (Math.random() - 0.5) * 0.24), y: (H * i) / steps });
      }
      const piece = (left: boolean): string => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d')!;
        g.beginPath();
        g.moveTo(jag[0].x, 0);
        for (const p of jag) g.lineTo(p.x, p.y);
        g.lineTo(left ? 0 : W, H);
        g.lineTo(left ? 0 : W, 0);
        g.closePath();
        g.save();
        g.clip();
        g.drawImage(im, 0, 0, W, H);
        g.restore();
        // white torn edge along the rip, kept inside the piece's own alpha
        g.globalCompositeOperation = 'source-atop';
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.lineWidth = Math.max(3, W * 0.025);
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(jag[0].x, 0);
        for (const p of jag) g.lineTo(p.x, p.y);
        g.stroke();
        return c.toDataURL();
      };
      return { a: piece(true), b: piece(false) };
    } catch {
      return null; // tainted canvas — tear visual skipped, delete still happens
    }
  }

  // hard yank while holding a sticker rips it off the card (and deletes it)
  private tearSticker(idx: number, x: number, y: number, dx: number, dy: number): void {
    const info = this.stickerInfo?.(idx);
    const L = this.cvLift();
    this.cvStickerIdx = null;
    this.cvStickerPos = null;
    this.cvStickerSize = null;
    this.cvPrevSample = null;
    this.cvLift.set(null);
    if (info) {
      const pieces = this.makeTearPieces(info.im);
      if (pieces) {
        const len = Math.hypot(dx, dy) || 1;
        this.cvTear.set({
          x: this.overlayX(x),
          y,
          w: L?.w ?? info.size,
          rot: info.rot,
          a: pieces.a,
          b: pieces.b,
          tx: (dx / len) * 150,
          ty: (dy / len) * 150,
          back: this.cvStickerFacing === 'back',
        });
        setTimeout(() => this.cvTear.set(null), 800);
      }
    }
    this.writeStickers(this.curStickers().filter((_, i) => i !== idx));
  }

  // overlay left% — the flipped card mirrors child positions, so back = 100-x
  private overlayX(faceX: number): number {
    return this.cvStickerFacing === 'back' ? 100 - faceX : faceX;
  }

  cvDown(e: PointerEvent): void {
    const facing = this.cvFacing();
    if (this.svc.isAdmin() && this.stkDrag() && facing) {
      const r = this.cvCardRect(e);
      if (r) {
        // screen % maps 1:1 onto the shown face's bake space (both faces)
        const px = ((e.clientX - r.left) / r.width) * 100;
        const py = ((e.clientY - r.top) / r.height) * 100;
        const idx = this.stickerHit?.(px, py, facing) ?? null;
        const info = idx !== null ? this.stickerInfo?.(idx) : null;
        if (idx !== null && info) {
          this.cvStickerIdx = idx;
          this.cvStickerFacing = facing;
          this.cvStickerPos = { x: px, y: py };
          this.cvStickerSize = info.size;
          this.cvPrevSample = null;
          // peel: repaint the sticker layer WITHOUT this sticker once, then a
          // floating overlay follows the pointer (lifted look, no per-move repaints)
          this.layerRedraw?.(idx);
          this.cvLift.set({
            idx,
            src: info.src,
            x: this.overlayX(px),
            y: py,
            w: info.size,
            rot: info.rot,
            back: facing === 'back',
          });
          (e.target as Element).setPointerCapture(e.pointerId);
          return;
        }
      }
    }
    this.cvLast = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  cvMove(e: PointerEvent): void {
    if (this.cvStickerIdx !== null) {
      const r = this.cvCardRect(e);
      if (!r) return;
      const x = Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.max(2, Math.min(98, ((e.clientY - r.top) / r.height) * 100));
      // yank detection: fast pull (face-% per ms) rips the sticker off
      const now = performance.now();
      const prev = this.cvPrevSample;
      this.cvPrevSample = { x, y, t: now };
      if (prev) {
        const dt = now - prev.t;
        if (dt > 4) {
          const dx = x - prev.x;
          const dy = y - prev.y;
          if (Math.hypot(dx, dy) / dt > 1.3) {
            this.tearSticker(this.cvStickerIdx, x, y, dx, dy);
            return;
          }
        }
      }
      this.cvStickerPos = { x, y };
      const L = this.cvLift();
      if (L) this.cvLift.set({ ...L, x: this.overlayX(x), y });
      return;
    }
    if (!this.cvLast) return;
    this.cvAngle.update((a) => a + (e.clientX - this.cvLast!.x) * 0.5);
    this.cvTilt.update((t) => t - (e.clientY - this.cvLast!.y) * 0.5);
    this.cvLast = { x: e.clientX, y: e.clientY };
  }
  cvUp(e: PointerEvent): void {
    if (this.cvStickerIdx !== null) {
      const idx = this.cvStickerIdx;
      const p = this.cvStickerPos;
      const size = this.cvStickerSize;
      this.cvStickerIdx = null;
      this.cvStickerPos = null;
      this.cvStickerSize = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      // press back down; the overlay clears when the rebuilt snapshot arrives
      const L = this.cvLift();
      if (L) this.cvLift.set({ ...L, stamp: true });
      if (p) {
        // last-touched sticker moves to the end of the list = top layer
        const list = [...this.curStickers()];
        const moved = {
          ...list[idx],
          x: Math.round(p.x),
          y: Math.round(p.y),
          size: Math.round(size ?? list[idx]?.size ?? 25),
        };
        list.splice(idx, 1);
        list.push(moved);
        this.writeStickers(list);
      }
      return;
    }
    this.cvLast = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }
  cvWheel(e: WheelEvent): void {
    e.preventDefault();
    // holding a sticker: wheel resizes it (up = bigger); otherwise spin the card
    if (this.cvStickerIdx !== null && this.cvStickerSize !== null) {
      // no upper cap; step scales with size so big stickers still resize fast
      const step = e.deltaY * 0.04 * Math.max(1, this.cvStickerSize / 40);
      this.cvStickerSize = Math.max(2, this.cvStickerSize - step);
      const L = this.cvLift();
      if (L) this.cvLift.set({ ...L, w: this.cvStickerSize });
      return;
    }
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

  // rebuild sticker meshes when admin edits them (live).
  // NOTE: settings MUST be read before the optional call — `fn?.(args)` skips
  // evaluating args when fn is null, which would leave this effect untracked forever.
  private readonly stickersEff = effect(() => {
    const defs = this.svc.settings().lanyardStickers ?? [];
    this.applyStickers?.(defs);
  });

  async ngAfterViewInit(): Promise<void> {
    if (window.innerWidth < 900) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // wait for the page itself to finish loading before the entrance drop
    if (document.readyState !== 'complete') {
      await new Promise<void>((res) => window.addEventListener('load', () => res(), { once: true }));
      if (this.destroyed) return;
    }
    // and for the real settings snapshot (card images + stickers read during init)
    await this.svc.settingsReady;
    if (this.destroyed) return;

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
    renderer.localClippingEnabled = true; // stickers are clipped to the card rectangle

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
        let u = normalizeImageUrl(url); // Drive URLs need the CORS proxy for canvas use
        // separate cache key: the same URL loaded earlier by a plain <img> is cached
        // WITHOUT CORS headers and would poison this crossOrigin load
        if (u.startsWith(DRIVE_API)) u += (u.includes('?') ? '&' : '?') + 'cors=1';
        im.src = u;
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

    // ---- stickers on the card front (live-editable) ----
    const stickerGroup = new THREE.Group();
    cardGroup.add(stickerGroup);
    // 4 world-space planes hugging the card edges (refreshed every frame)
    const stickerClips = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
    const clipN = new THREE.Vector3();
    const clipP = new THREE.Vector3();
    // foil sheen: diagonal stripes in the chosen color, masked to the sticker's
    // own alpha, drawn additively above the sticker and pulsed with the card sway
    const makeSheenCanvas = (im: HTMLImageElement, color: string): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = im.width;
      c.height = im.height;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, c.width, c.height);
      for (let i = 0; i <= 10; i++) grad.addColorStop(i / 10, i % 2 ? color : 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(im, 0, 0, c.width, c.height);
      return c;
    };
    let stickerMats: InstanceType<typeof THREE.MeshBasicMaterial>[] = [];
    let sheenAnims: { mat: InstanceType<typeof THREE.MeshBasicMaterial>; phase: number }[] = [];
    // loaded defs+images kept for the full-size viewer composite; cnv is the
    // scratchable per-sticker canvas shared by the 3D texture AND the viewer layer
    let stickerLoaded: {
      d: LanyardSticker;
      im: HTMLImageElement;
      idx: number;
      cnv?: HTMLCanvasElement;
      sheen?: HTMLCanvasElement;
      tex?: InstanceType<typeof THREE.CanvasTexture>;
      stex?: InstanceType<typeof THREE.CanvasTexture>;
    }[] = [];
    let stickerJson = '';
    let stickerBuild = 0;
    let firstStickerBuild = true;
    // scratch persistence: strokes replayed from localStorage on load; tied to
    // the exact sticker layout (layout change = saved scratches invalid)
    const SCRATCH_KEY = 'raika-scratch';
    let scratchLog: {
      s: 'front' | 'back';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      st: { o: number; w: number; a: number }[];
    }[] = [];
    let scratchRestore = true;
    let eraseSeg: (
      side: 'front' | 'back',
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      strokes: { o: number; w: number; a: number }[],
    ) => boolean = () => false; // assigned after init builds the sticker closures
    const buildStickers = async (defs: LanyardSticker[]): Promise<void> => {
      const json = JSON.stringify(defs);
      if (json === stickerJson) return;
      stickerJson = json;
      const token = ++stickerBuild;
      const loaded: typeof stickerLoaded = [];
      for (const [idx, d] of defs.slice(0, 6).entries()) {
        const im = await loadImg(d.img);
        if (im) loaded.push({ d, im, idx });
      }
      if (token !== stickerBuild || this.destroyed) return; // superseded meanwhile
      stickerGroup.children.slice().forEach((m) => {
        stickerGroup.remove(m);
        (m as InstanceType<typeof THREE.Mesh>).geometry.dispose();
      });
      stickerMats.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      stickerMats = [];
      sheenAnims = [];
      const prevIdxs = new Set(stickerLoaded.map((s) => s.idx));
      const popNew = !firstStickerBuild; // no pop on the initial page-load build
      firstStickerBuild = false;
      stickerLoaded = loaded;
      for (const entry of loaded) {
        const { d, im, idx } = entry;
        // scratchable canvas: coin erases pixels here; texture + viewer both read it
        const cnv = document.createElement('canvas');
        cnv.width = im.width;
        cnv.height = im.height;
        cnv.getContext('2d')!.drawImage(im, 0, 0);
        entry.cnv = cnv;
        const tex = new THREE.CanvasTexture(cnv);
        tex.colorSpace = THREE.SRGBColorSpace;
        entry.tex = tex;
        const w = ((d.size || 25) / 100) * CARD_W;
        const h = w * (im.height / im.width);
        const backSide = (d.side ?? 'front') === 'back';
        const px = backSide
          ? (0.5 - (d.x ?? 50) / 100) * CARD_W
          : ((d.x ?? 50) / 100 - 0.5) * CARD_W;
        const py = (0.5 - (d.y ?? 50) / 100) * CARD_H;
        const rz = ((d.rot ?? 0) * Math.PI) / 180;
        // no depth writes + explicit render order per index: same-plane stickers
        // would otherwise depth-clip each other into black cutouts
        const z0 = backSide ? -(0.0055 + idx * 0.0008) : 0.004 + idx * 0.0008;
        const zDir = backSide ? -1 : 1;
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          clippingPlanes: stickerClips,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.position.set(px, py, z0);
        if (backSide) mesh.rotation.set(0, Math.PI, -rz);
        else mesh.rotation.z = rz;
        mesh.renderOrder = 0.5 + idx * 0.01;
        mesh.userData['idx'] = idx; // index into settings.lanyardStickers
        mesh.userData['z0'] = z0;
        mesh.userData['zdir'] = zDir;
        if (popNew && !prevIdxs.has(idx)) mesh.userData['born'] = performance.now();
        stickerGroup.add(mesh);
        stickerMats.push(mat);
        if (d.sheen) {
          entry.sheen = makeSheenCanvas(im, d.sheen);
          const stex = new THREE.CanvasTexture(entry.sheen);
          stex.colorSpace = THREE.SRGBColorSpace;
          entry.stex = stex;
          const smat = new THREE.MeshBasicMaterial({
            map: stex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0,
            clippingPlanes: stickerClips,
          });
          const smesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), smat);
          smesh.position.set(px, py, z0 + zDir * 0.0004);
          if (backSide) smesh.rotation.set(0, Math.PI, -rz);
          else smesh.rotation.z = rz;
          smesh.renderOrder = 0.5 + idx * 0.01 + 0.005;
          smesh.userData['z0'] = z0 + zDir * 0.0004;
          smesh.userData['zdir'] = zDir;
          if (popNew && !prevIdxs.has(idx)) smesh.userData['born'] = performance.now();
          stickerGroup.add(smesh);
          stickerMats.push(smat);
          sheenAnims.push({ mat: smat, phase: idx * 1.7 });
        }
      }
      // repaint the viewer sticker layer (scratch marks reset — layout changed)
      // and retire the lifted/stamping overlay (its sticker is painted in now)
      this.layerRedraw?.();
      if (this.viewer()) this.cvLift.set(null);
      // first build: replay saved scratches if the layout matches;
      // later builds: layout changed, saved scratches point at stale coords
      if (scratchRestore) {
        scratchRestore = false;
        try {
          const saved = JSON.parse(localStorage.getItem(SCRATCH_KEY) ?? 'null') as {
            k: string;
            v: typeof scratchLog;
          } | null;
          if (saved?.k === json && Array.isArray(saved.v)) {
            scratchLog = saved.v;
            for (const seg of scratchLog) eraseSeg(seg.s, seg.x0, seg.y0, seg.x1, seg.y1, seg.st);
            this.layerRedraw?.();
          }
        } catch {
          /* corrupt storage — start fresh */
        }
      } else if (scratchLog.length) {
        scratchLog = [];
        localStorage.removeItem(SCRATCH_KEY);
      }
    };
    this.applyStickers = (defs) => void buildStickers(defs);
    void buildStickers(this.svc.settings().lanyardStickers ?? []);

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
    const buildViewerImages = (): { front: string; back: string } | null => {
      try {
        // fresh canvases without the punch hole for the full-size viewer;
        // stickers live on separate scratch-off layer canvases (layerRedraw)
        const fc = document.createElement('canvas');
        const bc = document.createElement('canvas');
        drawCardFace(fc, lastFImg, false);
        drawCardFace(bc, lastBImg, false);
        return { front: fc.toDataURL(), back: bc.toDataURL() };
      } catch {
        return null; // canvas tainted by a non-CORS image
      }
    };
    this.getCardImages = () => buildViewerImages();
    // paint the stickers (minus a lifted one) onto the scratch-off layer canvases;
    // the coin erases from these, revealing the card face underneath
    this.layerRedraw = (skip?: number) => {
      for (const side of ['front', 'back'] as const) {
        const off = this.scratchCanvasOf(side);
        const g = off.getContext('2d')!;
        g.save();
        g.clearRect(0, 0, 630, 880);
        for (const { d, im, idx, cnv, sheen } of stickerLoaded) {
          if (idx === skip) continue; // lifted sticker rendered as an overlay instead
          if ((d.side ?? 'front') !== side) continue;
          const w = ((d.size || 25) / 100) * 630;
          const h = w * (im.height / im.width);
          g.save();
          g.translate(((d.x ?? 50) / 100) * 630, ((d.y ?? 50) / 100) * 880);
          g.rotate((-(d.rot ?? 0) * Math.PI) / 180);
          g.drawImage(cnv ?? im, -w / 2, -h / 2, w, h);
          if (sheen) {
            g.globalAlpha = 0.35;
            g.drawImage(sheen, -w / 2, -h / 2, w, h);
          }
          g.restore();
        }
        g.restore();
        this.blitLayer(side);
      }
    };
    this.layerRedraw();
    // erase one segment from every scratchable sticker canvas the stroke
    // crosses (in sticker-local space) and refresh the 3D textures
    eraseSeg = (side, x0, y0, x1, y1, strokes) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      let touched = false;
      for (const en of stickerLoaded) {
        if ((en.d.side ?? 'front') !== side || !en.cnv) continue;
        const cnv = en.cnv;
        const cw = ((en.d.size || 25) / 100) * 630; // sticker width in bake px
        const scale = cnv.width / cw;
        const cx = ((en.d.x ?? 50) / 100) * 630;
        const cy = ((en.d.y ?? 50) / 100) * 880;
        // bake draws with rotate(-rot); inverse = rotate(+rot) on the delta
        const a = ((en.d.rot ?? 0) * Math.PI) / 180;
        const co = Math.cos(a);
        const si = Math.sin(a);
        const map = (px: number, py: number) => {
          const ddx = px - cx;
          const ddy = py - cy;
          return {
            x: cnv.width / 2 + (ddx * co - ddy * si) * scale,
            y: cnv.height / 2 + (ddx * si + ddy * co) * scale,
          };
        };
        const p0 = map(x0, y0);
        const p1 = map(x1, y1);
        const m = 40 * scale; // stroke never reaches this sticker? skip
        if (
          Math.max(p0.x, p1.x) < -m ||
          Math.min(p0.x, p1.x) > cnv.width + m ||
          Math.max(p0.y, p1.y) < -m ||
          Math.min(p0.y, p1.y) > cnv.height + m
        ) {
          continue;
        }
        for (const tgt of [cnv, en.sheen ?? null]) {
          if (!tgt) continue;
          const g = tgt.getContext('2d')!;
          g.save();
          g.globalCompositeOperation = 'destination-out';
          g.lineCap = 'round';
          for (const st of strokes) {
            const q0 = map(x0 + nx * st.o, y0 + ny * st.o);
            const q1 = map(x1 + nx * st.o, y1 + ny * st.o);
            g.globalAlpha = st.a;
            g.lineWidth = st.w * scale;
            g.beginPath();
            g.moveTo(q0.x, q0.y);
            g.lineTo(q1.x, q1.y);
            g.stroke();
          }
          g.restore();
        }
        if (en.tex) en.tex.needsUpdate = true;
        if (en.stex) en.stex.needsUpdate = true;
        touched = true;
      }
      return touched;
    };
    // coin rub: one wide core rub + thin streaks = prepaid-card scratch look;
    // hits get logged so they survive a page reload (persisted on coin drop)
    this.scratchApply = (side, x0, y0, x1, y1) => {
      const strokes = [{ o: 0, w: 20, a: 0.9 }];
      for (let i = 0; i < 3; i++) {
        strokes.push({ o: (Math.random() - 0.5) * 26, w: 2 + Math.random() * 4, a: 1 });
      }
      if (eraseSeg(side, x0, y0, x1, y1, strokes)) {
        this.layerRedraw?.(); // viewer layer mirrors the erased canvases
        scratchLog.push({
          s: side,
          x0: Math.round(x0),
          y0: Math.round(y0),
          x1: Math.round(x1),
          y1: Math.round(y1),
          st: strokes.map((st) => ({
            o: Math.round(st.o * 10) / 10,
            w: Math.round(st.w * 10) / 10,
            a: st.a,
          })),
        });
        // ponytail: hard cap, oldest strokes drop; full-canvas masks if this ever matters
        if (scratchLog.length > 6000) scratchLog.splice(0, scratchLog.length - 6000);
      }
    };
    this.scratchPersist = () => {
      try {
        localStorage.setItem(SCRATCH_KEY, JSON.stringify({ k: stickerJson, v: scratchLog }));
      } catch {
        /* storage full or blocked — scratches stay session-only */
      }
    };
    this.stickerInfo = (idx) => {
      const en = stickerLoaded.find((s) => s.idx === idx);
      return en ? { src: en.im.src, im: en.im, size: en.d.size || 25, rot: en.d.rot ?? 0 } : null;
    };
    // hit test in face-percent space (viewer sticker grab), per card side
    this.stickerHit = (px, py, side) => {
      let best: number | null = null;
      let bestD = Infinity;
      for (const { d, im, idx } of stickerLoaded) {
        if ((d.side ?? 'front') !== side) continue;
        const wPct = d.size || 25; // % of card width
        const hPct = ((((d.size || 25) / 100) * 630 * (im.height / im.width)) / 880) * 100;
        const dx = px - (d.x ?? 50);
        const dy = py - (d.y ?? 50);
        if (Math.abs(dx) < wPct / 2 + 2 && Math.abs(dy) < hPct / 2 + 2) {
          const dist = dx * dx + dy * dy;
          if (dist < bestD) {
            bestD = dist;
            best = idx;
          }
        }
      }
      return best;
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

      // keep the sticker clipping planes hugging the card edges
      clipN.set(1, 0, 0).applyQuaternion(cardGroup.quaternion);
      stickerClips[0].setFromNormalAndCoplanarPoint(
        clipN,
        clipP.copy(cardGroup.position).addScaledVector(clipN, -CARD_W / 2),
      );
      clipN.negate();
      stickerClips[1].setFromNormalAndCoplanarPoint(
        clipN,
        clipP.copy(cardGroup.position).addScaledVector(clipN, -CARD_W / 2),
      );
      clipN.set(0, 1, 0).applyQuaternion(cardGroup.quaternion);
      stickerClips[2].setFromNormalAndCoplanarPoint(
        clipN,
        clipP.copy(cardGroup.position).addScaledVector(clipN, -CARD_H / 2),
      );
      clipN.negate();
      stickerClips[3].setFromNormalAndCoplanarPoint(
        clipN,
        clipP.copy(cardGroup.position).addScaledVector(clipN, -CARD_H / 2),
      );

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

      // foil shimmer: slow pulse + reacts to the card's yaw sway
      for (const s of sheenAnims) {
        s.mat.opacity = 0.12 + 0.55 * Math.abs(Math.sin(now / 900 + s.phase + cq.y * 5));
      }
      // stamp-down pop for freshly attached stickers
      for (const ch of stickerGroup.children) {
        const born = ch.userData['born'] as number | undefined;
        if (born === undefined) continue;
        const t = Math.min(1, (now - born) / 450);
        const ease = 1 - Math.pow(1 - t, 3);
        ch.scale.setScalar(1.7 - 0.7 * ease);
        ch.position.z =
          (ch.userData['z0'] as number) + ((ch.userData['zdir'] as number) ?? 1) * 0.25 * (1 - ease);
        if (t >= 1) {
          ch.scale.setScalar(1);
          ch.position.z = ch.userData['z0'] as number;
          delete ch.userData['born'];
        }
      }

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
      stickerGroup.children.forEach((m) =>
        (m as InstanceType<typeof THREE.Mesh>).geometry.dispose(),
      );
      stickerMats.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      [texFront, texBack, bandTex, clipTex].forEach((t) => t.dispose());
    };
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cleanup?.();
  }
}
