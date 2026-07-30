import { Component, computed, inject, signal } from '@angular/core';
import { QueueService } from '../services/queue.service';
import { DriveImage } from '../shared/drive-url';

@Component({
  selector: 'images-page',
  templateUrl: './images.component.html',
  // Reuses the master page styles (cards, rows, buttons)
  styleUrl: '../master/master.component.css',
  styles: `
    .im-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px;
    }
    .im-card {
      border: 1px solid rgba(128, 128, 128, 0.25);
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .im-card img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      cursor: pointer;
    }
    .im-name {
      font-size: 12px;
      padding: 4px 8px 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: text;
    }
    .im-rename {
      font-size: 12px;
      margin: 4px 8px 0;
      padding: 2px 4px;
    }
    .im-actions {
      display: flex;
      gap: 6px;
      padding: 6px 8px 8px;
    }
    .im-actions .m-btn {
      flex: 1;
      font-size: 12px;
      padding: 4px 6px;
    }
    .im-del {
      color: #c0392b;
    }
    .im-err {
      color: #c0392b;
      margin: 8px 0;
    }
    .m-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .im-view {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: grid;
      place-items: center;
      z-index: 50;
    }
    .im-view img {
      max-width: 90vw;
      max-height: 85vh;
      border-radius: 10px;
    }
  `,
})
export class ImagesComponent {
  readonly svc = inject(QueueService);

  readonly images = signal<DriveImage[] | null>(null); // null = loading
  readonly apiUp = signal(true);
  readonly uploading = signal(false);
  readonly err = signal('');
  readonly copiedId = signal('');
  readonly armedId = signal(''); // delete needs a second click to confirm
  readonly viewUrl = signal<string | null>(null);
  readonly query = signal('');
  readonly renamingId = signal('');
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const imgs = this.images();
    if (!imgs) return null;
    return q ? imgs.filter((i) => i.name.toLowerCase().includes(q)) : imgs;
  });

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.images.set(null);
    this.err.set('');
    try {
      this.images.set(await this.svc.listDriveImages());
      this.apiUp.set(true);
    } catch {
      this.images.set([]);
      this.apiUp.set(false);
      this.err.set('เชื่อมต่อเซิร์ฟเวอร์รูปไม่ได้');
    }
  }

  async onUpload(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    this.err.set('');
    try {
      await this.svc.uploadDriveImage(file);
      await this.refresh();
    } catch (err) {
      this.err.set('อัพโหลดไม่สำเร็จ: ' + (err as Error).message);
    } finally {
      this.uploading.set(false);
    }
  }

  async copy(img: DriveImage): Promise<void> {
    await navigator.clipboard.writeText(img.url);
    this.copiedId.set(img.id);
    setTimeout(() => {
      if (this.copiedId() === img.id) this.copiedId.set('');
    }, 1500);
  }

  async rename(img: DriveImage, name: string): Promise<void> {
    this.renamingId.set('');
    name = name.trim();
    if (!name || name === img.name) return;
    this.err.set('');
    try {
      await this.svc.renameDriveImage(img.id, name);
      this.images.update((l) => l?.map((i) => (i.id === img.id ? { ...i, name } : i)) ?? l);
    } catch {
      // drive.file scope can only rename images uploaded through the web
      this.err.set('เปลี่ยนชื่อไม่สำเร็จ — รูปที่อัพเองใน Drive ต้องแก้ในแอป Google Drive');
    }
  }

  async remove(img: DriveImage): Promise<void> {
    if (this.armedId() !== img.id) {
      this.armedId.set(img.id);
      setTimeout(() => {
        if (this.armedId() === img.id) this.armedId.set('');
      }, 3000);
      return;
    }
    this.armedId.set('');
    this.err.set('');
    try {
      await this.svc.deleteDriveImage(img.id);
      this.images.update((l) => l?.filter((i) => i.id !== img.id) ?? l);
    } catch {
      // drive.file scope can only delete images uploaded through the web
      this.err.set('ลบไม่สำเร็จ — รูปที่อัพเองใน Drive ต้องลบในแอป Google Drive');
    }
  }
}
