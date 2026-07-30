import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FeatureFlag, QueueService, Settings } from '../services/queue.service';
import { DRIVE_API, DRIVE_API_DOWN_MSG, DriveFolder, DriveListing } from '../shared/drive-url';

// Fields the reset button clears (register-page settings only)
const REG_FIELDS: readonly (keyof Settings)[] = [
  'queueLimit',
  'wrHidden',
  'showHands',
  'regCharOff',
  'regCharImg',
  'regCharImgOff',
  'regCharX',
  'regCharY',
  'regCharScale',
  'regWrX',
  'regWrY',
  'regHandLeft',
  'regHandRight',
  'regHandScale',
  'regHandLX',
  'regHandLY',
  'regHandRX',
  'regHandRY',
];

type PadKind = 'char' | 'wr' | 'handL' | 'handR';
type NumField =
  | 'regCharX'
  | 'regCharY'
  | 'regCharScale'
  | 'regWrX'
  | 'regWrY'
  | 'regHandScale'
  | 'regHandLX'
  | 'regHandLY'
  | 'regHandRX'
  | 'regHandRY';

@Component({
  selector: 'register-settings-page',
  templateUrl: './register-settings.component.html',
  // Reuses the master page styles (cards, rows, inputs)
  styleUrl: '../master/master.component.css',
  styles: `
    .master-container {
      max-width: none;
      margin: 0;
    }
    .pk-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: grid;
      place-items: center;
      z-index: 50;
    }
    .pk-box {
      background: var(--bg-color);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: var(--text-white);
      border-radius: 12px;
      padding: 16px;
      width: min(640px, 92vw);
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .pk-grid {
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 8px;
    }
    .pk-grid img {
      width: 100%;
      aspect-ratio: 63 / 88;
      object-fit: cover;
      border-radius: 8px;
      cursor: pointer;
      border: 2px solid transparent;
    }
    .pk-grid img:hover {
      border-color: #7aa66f;
    }
    .pk-err {
      color: #c0392b;
    }
    .m-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .xy-pad {
      width: 220px;
      height: 220px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 10px;
      position: relative;
      touch-action: none;
      cursor: crosshair;
      background:
        linear-gradient(to right, transparent 49.5%, rgba(128, 128, 128, 0.35) 49.5%, rgba(128, 128, 128, 0.35) 50.5%, transparent 50.5%),
        linear-gradient(to bottom, transparent 49.5%, rgba(128, 128, 128, 0.35) 49.5%, rgba(128, 128, 128, 0.35) 50.5%, transparent 50.5%);
    }
    .xy-dot {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #7aa66f;
      border: 2px solid #fff;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .float-preview {
      position: fixed;
      right: 16px;
      bottom: 16px;
      width: min(480px, 42vw);
      z-index: 40;
      background: var(--bg-color);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 8px;
    }
    :host-context(body[data-theme='light']) .pk-box,
    :host-context(body[data-theme='light']) .float-preview {
      border-color: rgba(0, 0, 0, 0.12);
    }
    .fp-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .fp-toggle {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 40;
    }
  `,
})
export class RegisterSettingsComponent implements AfterViewInit {
  readonly svc = inject(QueueService);

  // Preview renders the real register page at desktop width, scaled to fit
  readonly PREVIEW_W = 1920;
  readonly PREVIEW_H = 1080;
  readonly scale = signal(0.4);
  private wrap = viewChild<ElementRef<HTMLElement>>('wrap');

  reset(): void {
    if (confirm('ล้างการตั้งค่าหน้า register ทั้งหมด กลับเป็นค่าเริ่มต้น?')) {
      this.svc.resetSettings(REG_FIELDS);
    }
  }

  readonly previewOpen = signal(true);

  togglePreview(): void {
    this.previewOpen.set(!this.previewOpen());
    setTimeout(() => this.updateScale());
  }

  ngAfterViewInit(): void {
    this.updateScale();
    this.checkApi();
  }

  @HostListener('window:resize')
  updateScale(): void {
    const w = this.wrap()?.nativeElement.clientWidth;
    if (w) this.scale.set(w / this.PREVIEW_W);
  }

  wrChecked(game: string): boolean {
    return !(this.svc.settings().wrHidden ?? []).includes(game);
  }

  onLimit(value: string): void {
    this.svc.setQueueLimit(value === '' ? 0 : parseInt(value, 10));
  }

  // checkbox = "แสดง"/"ใช้"; flags are stored inverted (xxxOff)
  onFlag(field: FeatureFlag, e: Event): void {
    this.svc.setFlag({ [field]: !(e.target as HTMLInputElement).checked } as never);
  }

  setNum(field: NumField, value: string): void {
    const n = parseInt(value, 10);
    this.svc.setCharPos({ [field]: isNaN(n) ? null : n } as never);
  }

  // scale sliders: throttled while sliding, final value on release
  onScaleSlide(field: 'regCharScale' | 'regHandScale', value: string, force: boolean): void {
    const now = Date.now();
    if (!force && now - this.padLastWrite < 100) return;
    this.padLastWrite = now;
    const n = parseInt(value, 10);
    this.svc.setCharPos({ [field]: isNaN(n) || n === 100 ? null : n } as never);
  }

  // ---- drive-api image picker ----
  readonly apiUp = signal(false);
  readonly picker = signal<'char' | 'handL' | 'handR' | null>(null);
  readonly pickerLabel: Record<string, string> = {
    char: 'ตัวละคร',
    handL: 'มือซ้าย',
    handR: 'มือขวา',
  };
  readonly gallery = signal<DriveListing | null>(null);
  readonly pickFolder = signal<DriveFolder | null>(null);
  readonly uploading = signal(false);
  readonly pickerError = signal('');

  private async checkApi(): Promise<void> {
    try {
      const r = await fetch(`${DRIVE_API}/list`, { signal: AbortSignal.timeout(5000) });
      this.apiUp.set(r.ok);
    } catch {
      this.apiUp.set(false);
    }
  }

  async openPicker(target: 'char' | 'handL' | 'handR'): Promise<void> {
    this.picker.set(target);
    this.pickFolder.set(null);
    await this.loadGallery();
  }

  async pickerGo(f: DriveFolder | null): Promise<void> {
    this.pickFolder.set(f);
    await this.loadGallery();
  }

  private galSeq = 0;

  private async loadGallery(): Promise<void> {
    const seq = ++this.galSeq;
    this.pickerError.set('');
    // cached listing shows instantly; fresh data replaces it in the background
    this.gallery.set(this.svc.cachedDriveListing(this.pickFolder()?.id));
    try {
      const data = await this.svc.listDriveImages(this.pickFolder()?.id);
      if (seq === this.galSeq) this.gallery.set(data);
    } catch {
      if (seq !== this.galSeq) return;
      if (!this.gallery()) this.gallery.set({ folders: [], images: [] });
      this.pickerError.set(DRIVE_API_DOWN_MSG);
    }
  }

  pickImage(url: string): void {
    const t = this.picker();
    if (t === 'char') this.svc.setRegCharImg(url);
    else if (t === 'handL') this.svc.setHandImg('regHandLeft', url);
    else if (t === 'handR') this.svc.setHandImg('regHandRight', url);
    this.picker.set(null);
  }

  async onUpload(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    this.pickerError.set('');
    try {
      const img = await this.svc.uploadDriveImage(file, this.pickFolder()?.id);
      this.pickImage(img.url);
    } catch (err) {
      this.pickerError.set('อัพโหลดไม่สำเร็จ: ' + (err as Error).message);
    } finally {
      this.uploading.set(false);
    }
  }

  // ---- XY pads: tap or drag, pointer position maps straight to the offset ----
  readonly PAD_R = 500;
  private padDragging: PadKind | null = null;
  private padLastWrite = 0;

  // [x-field, y-field] per pad
  private readonly PAD_FIELDS: Record<PadKind, [NumField, NumField]> = {
    char: ['regCharX', 'regCharY'],
    wr: ['regWrX', 'regWrY'],
    handL: ['regHandLX', 'regHandLY'],
    handR: ['regHandRX', 'regHandRY'],
  };

  padPos(kind: PadKind): { x: number; y: number } {
    const c = (v: number | undefined) => Math.max(-this.PAD_R, Math.min(this.PAD_R, v || 0));
    const s = this.svc.settings() as Record<NumField, number | undefined>;
    const [fx, fy] = this.PAD_FIELDS[kind];
    return {
      x: ((c(s[fx]) / this.PAD_R + 1) / 2) * 100,
      y: ((c(s[fy]) / this.PAD_R + 1) / 2) * 100,
    };
  }

  padStart(e: PointerEvent, kind: PadKind): void {
    this.padDragging = kind;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    this.padApply(e, kind, true);
  }

  padMove(e: PointerEvent, kind: PadKind): void {
    if (this.padDragging === kind) this.padApply(e, kind, false);
  }

  padEnd(e: PointerEvent, kind: PadKind): void {
    if (this.padDragging !== kind) return;
    this.padDragging = null;
    this.padApply(e, kind, true);
  }

  private padApply(e: PointerEvent, kind: PadKind, force: boolean): void {
    const now = Date.now();
    if (!force && now - this.padLastWrite < 100) return;
    this.padLastWrite = now;
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const x = Math.round((fx * 2 - 1) * this.PAD_R);
    const y = Math.round((fy * 2 - 1) * this.PAD_R);
    const [xf, yf] = this.PAD_FIELDS[kind];
    this.svc.setCharPos({ [xf]: x || null, [yf]: y || null } as never);
  }
}
