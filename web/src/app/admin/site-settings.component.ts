import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FeatureFlag, HeroButton, QueueService, Settings } from '../services/queue.service';

// Fields the reset button clears (home-page settings only)
const HOME_FIELDS: readonly (keyof Settings)[] = [
  'siteTitle',
  'siteTitleEn',
  'tagline',
  'taglineEn',
  'schedKey',
  'schedLabel',
  'schedLabelEn',
  'heroButtons',
  'charOff',
  'charImg',
  'charImgOff',
  'charX',
  'charY',
  'charScale',
  'schedOff',
  'clipsOff',
  'statsOff',
  'postsOff',
  'lanyardOff',
  'lanyardFront',
  'lanyardBack',
];
import { DRIVE_API, DriveFolder, DriveListing } from '../shared/drive-url';

@Component({
  selector: 'site-settings-page',
  templateUrl: './site-settings.component.html',
  // Reuses the master page styles (cards, rows, home preview)
  styleUrl: '../master/master.component.css',
  styles: `
    .master-container {
      max-width: none;
      margin: 0;
      padding-right: 540px; /* keep clear of the floating preview */
    }
    @media (max-width: 1500px) {
      .master-container {
        padding-right: 20px;
      }
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
      border: 1px solid rgba(128, 128, 128, 0.4);
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
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 12px;
      padding: 8px;
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
export class SiteSettingsComponent implements AfterViewInit {
  readonly svc = inject(QueueService);

  // Preview renders the real home page at desktop width, scaled to fit
  readonly PREVIEW_W = 1920;
  readonly PREVIEW_H = 1080;
  readonly scale = signal(0.4);
  private wrap = viewChild<ElementRef<HTMLElement>>('wrap');

  reset(): void {
    if (confirm('ล้างการตั้งค่าหน้า home ทั้งหมด กลับเป็นค่าเริ่มต้น?')) {
      this.svc.resetSettings(HOME_FIELDS);
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

  private async checkApi(): Promise<void> {
    try {
      // via the service so the folder list lands in the shared cache too
      await this.svc.listDriveImages();
      this.apiUp.set(true);
    } catch {
      this.apiUp.set(false);
    }
  }


  @HostListener('window:resize')
  updateScale(): void {
    const w = this.wrap()?.nativeElement.clientWidth;
    if (w) this.scale.set(w / this.PREVIEW_W);
  }

  // Empty input clears the override (falls back to the default text)
  setText(
    field:
      | 'siteTitle'
      | 'siteTitleEn'
      | 'tagline'
      | 'taglineEn'
      | 'aboutText'
      | 'aboutTextEn'
      | 'schedKey'
      | 'schedLabel'
      | 'schedLabelEn',
    value: string,
  ): void {
    this.svc.setSiteText({ [field]: value.trim() || null } as never);
  }

  // ---- hero buttons (empty list = default join-queue button) ----
  heroBtns(): HeroButton[] {
    return this.svc.settings().heroButtons ?? [];
  }

  addHeroBtn(): void {
    this.svc.setHeroButtons([...this.heroBtns(), { th: '', en: '', url: '/register' }]);
  }

  delHeroBtn(i: number): void {
    this.svc.setHeroButtons(this.heroBtns().filter((_, idx) => idx !== i));
  }

  updateHeroBtn(i: number, field: 'th' | 'en' | 'url', value: string): void {
    const list = this.heroBtns().map((b, idx) => (idx === i ? { ...b, [field]: value.trim() } : b));
    this.svc.setHeroButtons(list);
  }

  setCharPos(field: 'charX' | 'charY' | 'charScale', value: string): void {
    const n = parseInt(value, 10);
    this.svc.setCharPos({ [field]: isNaN(n) ? null : n } as never);
  }

  // ---- XY pad: tap or drag, pointer position maps straight to the offset ----
  readonly PAD_R = 500; // px range each direction
  private padDragging = false;
  private padLastWrite = 0;

  padPos(): { x: number; y: number } {
    const c = (v: number | undefined) => Math.max(-this.PAD_R, Math.min(this.PAD_R, v || 0));
    const s = this.svc.settings();
    return {
      x: ((c(s.charX) / this.PAD_R + 1) / 2) * 100,
      y: ((c(s.charY) / this.PAD_R + 1) / 2) * 100,
    };
  }

  padStart(e: PointerEvent): void {
    this.padDragging = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    this.padApply(e, true);
  }

  padMove(e: PointerEvent): void {
    if (this.padDragging) this.padApply(e, false);
  }

  padEnd(e: PointerEvent): void {
    if (!this.padDragging) return;
    this.padDragging = false;
    // wherever the pointer is released becomes the saved position
    this.padApply(e, true);
  }

  private padApply(e: PointerEvent, force: boolean): void {
    // throttle RTDB writes while dragging
    const now = Date.now();
    if (!force && now - this.padLastWrite < 100) return;
    this.padLastWrite = now;
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const x = Math.round((fx * 2 - 1) * this.PAD_R);
    const y = Math.round((fy * 2 - 1) * this.PAD_R);
    this.svc.setCharPos({ charX: x || null, charY: y || null } as never);
  }

  // scale slider: throttled while sliding, final value on release
  onScaleSlide(value: string, force: boolean): void {
    const now = Date.now();
    if (!force && now - this.padLastWrite < 100) return;
    this.padLastWrite = now;
    const n = parseInt(value, 10);
    this.svc.setCharPos({ charScale: isNaN(n) || n === 100 ? null : n } as never);
  }

  // checkbox = "แสดง"; most flags are stored inverted (xxxOff), showHands is direct
  onFlag(field: FeatureFlag, e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.svc.setFlag({ [field]: field === 'showHands' ? checked : !checked } as never);
  }

  // ---- Drive image picker (lanyard card front/back) ----
  // Buttons stay disabled until the drive-api server answers (it may be offline;
  // the /i/ image proxy is a separate Cloudflare Worker and keeps working)
  readonly apiUp = signal(false);
  readonly picker = signal<'lanyardFront' | 'lanyardBack' | 'charImg' | null>(null);
  readonly gallery = signal<DriveListing | null>(null); // null = loading
  readonly pickFolder = signal<DriveFolder | null>(null);
  readonly uploading = signal(false);
  readonly pickerError = signal('');

  readonly pickerLabel: Record<string, string> = {
    lanyardFront: 'หน้าบัตร',
    lanyardBack: 'หลังบัตร',
    charImg: 'ตัวละคร',
  };

  async openPicker(field: 'lanyardFront' | 'lanyardBack' | 'charImg'): Promise<void> {
    this.picker.set(field);
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
      this.pickerError.set('โหลดรายการรูปไม่สำเร็จ');
    }
  }

  pickImage(url: string): void {
    const f = this.picker();
    if (f === 'charImg') this.svc.setCharImg(url);
    else if (f) this.svc.setLanyard({ [f]: url });
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
}
