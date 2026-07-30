import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { SiteBgComponent } from '../shared/site-bg/site-bg.component';
import { SiteNavComponent } from '../shared/site-nav/site-nav.component';
import { QueueService } from '../services/queue.service';
import { UiService } from '../services/ui.service';
import { DriveImage, DriveListing } from '../shared/drive-url';
import { downloadImages } from '../shared/download-images';

// Public giveaway gallery with File-Explorer interactions:
// click / ctrl+click / shift+range / ctrl+A / esc, marquee drag,
// double-click = full view, right-click = copy URL / download
@Component({
  selector: 'gallery-page',
  imports: [SiteBgComponent, SiteNavComponent],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.css',
})
export class GalleryComponent {
  readonly svc = inject(QueueService);
  readonly ui = inject(UiService);

  readonly listing = signal<DriveListing | null>(null);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly view = signal<string | null>(null);
  readonly copiedId = signal('');
  readonly downloading = signal(false);

  private loadedFor = '';

  constructor() {
    effect(() => {
      const f = this.svc.settings().giveFolder;
      if (f && f !== this.loadedFor) {
        this.loadedFor = f;
        this.load(f);
      }
    });
  }

  private async load(folder: string): Promise<void> {
    this.listing.set(this.svc.cachedDriveListing(folder));
    try {
      this.listing.set(await this.svc.listDriveImages(folder));
    } catch {
      if (!this.listing()) this.listing.set({ folders: [], images: [] });
    }
  }

  images(): DriveImage[] {
    return this.listing()?.images ?? [];
  }

  // ---- Explorer-style selection ----
  private anchorIndex: number | null = null;

  onTileClick(e: MouseEvent, img: DriveImage, index: number): void {
    if (e.shiftKey && this.anchorIndex !== null) {
      const list = this.images();
      const [a, b] = [Math.min(this.anchorIndex, index), Math.max(this.anchorIndex, index)];
      this.selected.set(new Set(list.slice(a, b + 1).map((i) => i.id)));
    } else if (e.ctrlKey || e.metaKey) {
      this.toggle(img.id);
      this.anchorIndex = index;
    } else {
      this.selected.set(new Set([img.id]));
      this.anchorIndex = index;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
    if (e.key === 'Escape') {
      this.ctx.set(null);
      this.clearSelect();
    } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
      e.preventDefault();
      this.selectAll();
    }
  }

  toggle(id: string): void {
    const s = new Set(this.selected());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.selected.set(s);
  }

  selectAll(): void {
    this.selected.set(new Set(this.images().map((i) => i.id)));
    this.anchorIndex = null;
  }

  clearSelect(): void {
    this.selected.set(new Set());
  }

  // ---- marquee (rubber-band) selection ----
  readonly marquee = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  private marStart: { x: number; y: number; base: Set<string> } | null = null;
  private suppressGridClick = false;

  gridDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.gal-tile')) return;
    const host = e.currentTarget as HTMLElement;
    host.setPointerCapture(e.pointerId);
    const r = host.getBoundingClientRect();
    const base = e.ctrlKey || e.metaKey ? new Set(this.selected()) : new Set<string>();
    this.marStart = { x: e.clientX - r.left, y: e.clientY - r.top, base };
    this.marquee.set({ x: this.marStart.x, y: this.marStart.y, w: 0, h: 0 });
  }

  gridMove(e: PointerEvent): void {
    if (!this.marStart) return;
    const host = e.currentTarget as HTMLElement;
    const r = host.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const x = Math.min(cx, this.marStart.x);
    const y = Math.min(cy, this.marStart.y);
    const w = Math.abs(cx - this.marStart.x);
    const h = Math.abs(cy - this.marStart.y);
    this.marquee.set({ x, y, w, h });
    const sel = { l: r.left + x, t: r.top + y, r: r.left + x + w, b: r.top + y + h };
    const next = new Set(this.marStart.base);
    host.querySelectorAll<HTMLElement>('.gal-tile[data-id]').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.left < sel.r && b.right > sel.l && b.top < sel.b && b.bottom > sel.t) {
        next.add(el.dataset['id']!);
      }
    });
    this.selected.set(next);
  }

  gridUp(): void {
    if (!this.marStart) return;
    const m = this.marquee();
    if (m && m.w + m.h > 6) this.suppressGridClick = true;
    this.marStart = null;
    this.marquee.set(null);
  }

  gridClick(e: MouseEvent): void {
    if (this.suppressGridClick) {
      this.suppressGridClick = false;
      return;
    }
    if (e.target === e.currentTarget) this.clearSelect();
  }

  // ---- right-click context menu ----
  readonly ctx = signal<{ x: number; y: number; img: DriveImage } | null>(null);

  openCtx(e: MouseEvent, img: DriveImage): void {
    e.preventDefault();
    e.stopPropagation();
    this.ctx.set({ x: e.clientX, y: e.clientY, img });
  }

  @HostListener('document:click')
  closeCtx(): void {
    this.ctx.set(null);
  }

  private ctxImgs(): DriveImage[] {
    const c = this.ctx();
    if (!c) return [];
    return this.selected().has(c.img.id)
      ? this.images().filter((i) => this.selected().has(i.id))
      : [c.img];
  }

  ctxCount(): number {
    return this.ctxImgs().length;
  }

  async ctxCopy(): Promise<void> {
    const c = this.ctx();
    this.ctx.set(null);
    if (c) await this.copy(c.img);
  }

  ctxView(): void {
    const c = this.ctx();
    this.ctx.set(null);
    if (c) this.view.set(c.img.url);
  }

  async ctxDownload(): Promise<void> {
    const imgs = this.ctxImgs();
    this.ctx.set(null);
    if (!imgs.length) return;
    this.downloading.set(true);
    await downloadImages(imgs, 'raika-images.zip');
    this.downloading.set(false);
  }

  // ---- shared actions ----
  async copy(img: DriveImage): Promise<void> {
    await navigator.clipboard.writeText(img.url);
    this.copiedId.set(img.id);
    setTimeout(() => {
      if (this.copiedId() === img.id) this.copiedId.set('');
    }, 1500);
  }

  async downloadOne(img: DriveImage): Promise<void> {
    this.downloading.set(true);
    await downloadImages([img]);
    this.downloading.set(false);
  }

  async downloadSelected(): Promise<void> {
    const imgs = this.images().filter((i) => this.selected().has(i.id));
    if (!imgs.length) return;
    this.downloading.set(true);
    await downloadImages(imgs, 'raika-images.zip');
    this.downloading.set(false);
  }
}
