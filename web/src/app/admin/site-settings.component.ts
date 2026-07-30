import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { QueueService } from '../services/queue.service';
import { DRIVE_API, DriveImage } from '../shared/drive-url';

@Component({
  selector: 'site-settings-page',
  templateUrl: './site-settings.component.html',
  // Reuses the master page styles (cards, rows, home preview)
  styleUrl: '../master/master.component.css',
  styles: `
    .pk-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: grid;
      place-items: center;
      z-index: 50;
    }
    .pk-box {
      background: var(--bg, #fff);
      color: inherit;
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
  `,
})
export class SiteSettingsComponent implements AfterViewInit {
  readonly svc = inject(QueueService);

  // Preview renders the real home page at desktop width, scaled to fit
  readonly PREVIEW_W = 1920;
  readonly PREVIEW_H = 1080;
  readonly scale = signal(0.4);
  private wrap = viewChild<ElementRef<HTMLElement>>('wrap');

  ngAfterViewInit(): void {
    this.updateScale();
    this.checkApi();
  }

  private async checkApi(): Promise<void> {
    try {
      const r = await fetch(`${DRIVE_API}/list`, { signal: AbortSignal.timeout(5000) });
      this.apiUp.set(r.ok);
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
  setText(field: 'siteTitle' | 'tagline' | 'aboutText', value: string): void {
    this.svc.setSiteText({ [field]: value.trim() || null } as never);
  }

  onLanyardToggle(e: Event): void {
    this.svc.setLanyard({ lanyardOff: !(e.target as HTMLInputElement).checked });
  }

  // ---- Drive image picker (lanyard card front/back) ----
  // Buttons stay disabled until the drive-api server answers (it may be offline;
  // the /i/ image proxy is a separate Cloudflare Worker and keeps working)
  readonly apiUp = signal(false);
  readonly picker = signal<'lanyardFront' | 'lanyardBack' | null>(null);
  readonly gallery = signal<DriveImage[] | null>(null); // null = loading
  readonly uploading = signal(false);
  readonly pickerError = signal('');

  async openPicker(field: 'lanyardFront' | 'lanyardBack'): Promise<void> {
    this.picker.set(field);
    this.pickerError.set('');
    this.gallery.set(null);
    try {
      this.gallery.set(await this.svc.listDriveImages());
    } catch {
      this.gallery.set([]);
      this.pickerError.set('โหลดรายการรูปไม่สำเร็จ');
    }
  }

  pickImage(url: string): void {
    const f = this.picker();
    if (f) this.svc.setLanyard({ [f]: url });
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
      const img = await this.svc.uploadDriveImage(file);
      this.pickImage(img.url);
    } catch (err) {
      this.pickerError.set('อัพโหลดไม่สำเร็จ: ' + (err as Error).message);
    } finally {
      this.uploading.set(false);
    }
  }
}
