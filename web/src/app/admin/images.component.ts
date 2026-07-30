import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { QueueService } from '../services/queue.service';
import { DRIVE_API_DOWN_MSG, DriveFolder, DriveImage, DriveListing } from '../shared/drive-url';
import { GifThumbComponent } from '../shared/gif-thumb.component';
import { downloadImages } from '../shared/download-images';

@Component({
  selector: 'images-page',
  imports: [GifThumbComponent],
  templateUrl: './images.component.html',
  // Reuses the master page styles (cards, rows, buttons)
  styleUrl: '../master/master.component.css',
  styles: `
    .ex-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ex-crumb {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(128, 128, 128, 0.35);
      border-radius: 8px;
      padding: 9px 14px;
      min-width: 0;
    }
    .crumb-link {
      cursor: pointer;
    }
    .crumb-link:hover {
      text-decoration: underline;
    }
    .crumb-sep {
      opacity: 0.6;
    }
    .ex-search {
      flex: none;
      max-width: 220px;
      min-width: 140px;
    }
    .ex-hint {
      opacity: 0.55;
      font-size: 12px;
    }
    .ex-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
      gap: 4px;
      position: relative;
      min-height: 180px;
      touch-action: pan-y;
    }
    .marquee {
      position: absolute;
      z-index: 5;
      border: 1px solid #4a9eda;
      background: rgba(74, 158, 218, 0.25);
      pointer-events: none;
    }
    .ex-tile {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px 6px 8px;
      border-radius: 8px;
      border: 1px solid transparent;
      user-select: none;
    }
    .ex-tile:hover {
      background: var(--input-bg);
    }
    .ex-tile .thumb {
      width: 92px;
      height: 92px;
      object-fit: cover;
      border-radius: 6px;
      cursor: pointer;
    }
    .ex-tile[draggable='true'] {
      cursor: grab;
    }
    .f-wrap {
      position: relative;
      width: 92px;
      height: 92px;
      cursor: pointer;
    }
    .f-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .f-prev {
      position: absolute;
      left: 14%;
      top: 13%;
      width: 72%;
      height: 52%;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.6);
    }
    .ex-name {
      font-size: 12px;
      margin-top: 6px;
      max-width: 110px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
      cursor: text;
    }
    .ex-rename {
      font-size: 12px;
      margin-top: 6px;
      padding: 2px 4px;
      width: 110px;
      min-width: 0;
    }
    .ex-tile.sel {
      border-color: #7aa66f;
      background: rgba(122, 166, 111, 0.12);
    }
    .sel-bar {
      border: 1px solid rgba(122, 166, 111, 0.5);
      border-radius: 8px;
      padding: 8px 12px;
    }
    .ex-actions {
      position: absolute;
      top: 4px;
      right: 4px;
      display: none;
      gap: 4px;
    }
    .ex-tile:hover .ex-actions {
      display: flex;
    }
    .ex-abtn {
      font-size: 11px;
      padding: 3px 7px;
      border-radius: 6px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      background: var(--bg-color);
      color: var(--text-white);
      cursor: pointer;
    }
    .im-del {
      color: #e74c3c;
    }
    .im-err {
      color: #c0392b;
      margin: 8px 0;
    }
    .ex-tile.ghost {
      opacity: 0.55;
      pointer-events: none;
    }
    .ghost .ph {
      width: 92px;
      height: 92px;
      border-radius: 6px;
      background: var(--input-bg);
    }
    .ghost-spin {
      position: absolute;
      top: 40px;
      left: 50%;
      width: 26px;
      height: 26px;
      margin-left: -13px;
      border: 3px solid rgba(128, 128, 128, 0.35);
      border-top-color: #7aa66f;
      border-radius: 50%;
      animation: ghost-rot 0.8s linear infinite;
    }
    @keyframes ghost-rot {
      to {
        transform: rotate(360deg);
      }
    }
    .ctx {
      position: fixed;
      z-index: 60;
      background: var(--bg-color);
      border: 1px solid rgba(128, 128, 128, 0.4);
      border-radius: 8px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      min-width: 190px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
    }
    .ctx button {
      text-align: left;
      padding: 7px 12px;
      background: none;
      border: none;
      color: var(--text-white);
      cursor: pointer;
      border-radius: 6px;
      font-size: 13.5px;
    }
    .ctx button:hover {
      background: var(--input-bg);
    }
    .ctx-group {
      border: 1px solid rgba(122, 166, 111, 0.55);
      border-radius: 6px;
      margin: 4px 4px;
      padding: 2px;
      display: flex;
      flex-direction: column;
      background: rgba(122, 166, 111, 0.08);
    }
    .ctx-group button {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ctx-ficon {
      width: 15px;
      height: 15px;
      flex: none;
    }
    .ctx-sub {
      padding: 6px 12px 2px;
      font-size: 11.5px;
      opacity: 0.75;
      font-weight: 600;
    }
    .ex-log {
      border-top: 1px solid rgba(128, 128, 128, 0.3);
      padding-top: 10px;
      font-size: 12.5px;
    }
    .ex-log-row {
      opacity: 0.85;
      padding: 1px 0;
    }
    .ex-log-row.bad {
      color: #e74c3c;
      opacity: 1;
    }
    .ex-help {
      border-top: 1px solid rgba(128, 128, 128, 0.3);
      padding-top: 10px;
      font-size: 13px;
      opacity: 0.75;
    }
    .ex-help summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ex-help summary::before {
      content: '\\25b8';
      transition: transform 0.15s;
    }
    .ex-help[open] summary::before {
      transform: rotate(90deg);
    }
    .ex-help summary h3 {
      display: inline;
      margin: 0;
    }
    .ex-help ul {
      margin: 6px 0 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .drop-hot {
      border-color: #7aa66f !important;
      background: rgba(122, 166, 111, 0.18);
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

  readonly listing = signal<DriveListing | null>(null); // null = loading
  readonly curFolder = signal<DriveFolder | null>(null); // null = root
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
    const l = this.listing();
    if (!l) return [];
    return q ? l.images.filter((i) => i.name.toLowerCase().includes(q)) : l.images;
  });
  readonly filteredFolders = computed(() => {
    const q = this.query().trim().toLowerCase();
    const l = this.listing();
    if (!l) return [];
    return q ? l.folders.filter((f) => f.name.toLowerCase().includes(q)) : l.folders;
  });

  constructor() {
    this.refresh();
  }

  isGif(img: DriveImage): boolean {
    return img.name.toLowerCase().endsWith('.gif');
  }

  // ---- multi-select, File-Explorer semantics ----
  // click = select one, ctrl+click = toggle, shift+click = range, dblclick = open,
  // ctrl+a = select all shown, esc = clear
  readonly selected = signal<ReadonlySet<string>>(new Set());
  private anchorIndex: number | null = null;

  onTileClick(e: MouseEvent, img: DriveImage, index: number): void {
    if (e.shiftKey && this.anchorIndex !== null) {
      const list = this.filtered();
      const [a, b] = [Math.min(this.anchorIndex, index), Math.max(this.anchorIndex, index)];
      this.selected.set(new Set(list.slice(a, b + 1).map((i) => i.id)));
    } else if (e.ctrlKey || e.metaKey) {
      this.toggleSelect(img.id);
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
    }
    // e.code (physical key) so ctrl+a works on the Thai keyboard layout too
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
      e.preventDefault();
      this.selected.set(new Set(this.filtered().map((i) => i.id)));
      this.anchorIndex = null;
    }
  }

  // ---- rubber-band (marquee) selection: drag on empty grid space ----
  readonly marquee = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  private marStart: { x: number; y: number; base: Set<string> } | null = null;
  private suppressGridClick = false;

  gridDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.ex-tile')) return; // tiles drag/select themselves
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
    host.querySelectorAll<HTMLElement>('.ex-tile[data-id]').forEach((el) => {
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
    // a real drag should not be followed by the click-to-clear behavior
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

  toggleSelect(id: string): void {
    const s = new Set(this.selected());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.selected.set(s);
  }

  clearSelect(): void {
    this.selected.set(new Set());
  }

  // ---- pending ops: ghost tiles shown at the destination while the server works ----
  readonly pending = signal<{ key: string; img?: DriveImage; name: string; target: string | null }[]>(
    [],
  );
  readonly pendingHere = computed(() => {
    const cur = this.curFolder()?.id ?? null;
    // hide a ghost as soon as the real item is present in the listing (no duplicates)
    const have = new Set((this.listing()?.images ?? []).map((i) => i.id));
    return this.pending().filter((p) => p.target === cur && !(p.img && have.has(p.img.id)));
  });

  private removePending(key: string): void {
    this.pending.update((p) => p.filter((x) => x.key !== key));
  }

  // ---- action log (shown under the grid) ----
  readonly log = signal<{ t: string; msg: string; ok: boolean }[]>([]);

  private addLog(msg: string, ok = true): void {
    const t = new Date().toLocaleTimeString('th-TH', { hour12: false });
    this.log.update((l) => [{ t, msg, ok }, ...l].slice(0, 12));
  }

  // guards against a slow response for a folder we already navigated away from
  private reqSeq = 0;

  // silent re-fetch: syncs listing + cache without flashing a loading state
  private async sync(): Promise<void> {
    const seq = ++this.reqSeq;
    try {
      const data = await this.svc.listDriveImages(this.curFolder()?.id);
      if (seq === this.reqSeq) {
        this.listing.set(data);
        this.apiUp.set(true);
      }
    } catch {
      // optimistic state stays; next refresh() will surface connection errors
    }
  }

  // realtime feel: drop items from the grid immediately, server catches up after
  private removeLocal(ids: string[]): void {
    const s = new Set(ids);
    this.listing.update((l) => (l ? { ...l, images: l.images.filter((i) => !s.has(i.id)) } : l));
    this.clearSelect();
  }

  // Move targets: sibling folders (from the cached root listing) + root when inside a folder
  moveTargets(): { id: string; name: string }[] {
    const cur = this.curFolder();
    const rootFolders =
      (cur ? this.svc.cachedDriveListing()?.folders : this.listing()?.folders) ?? [];
    const t = rootFolders.filter((f) => f.id !== cur?.id).map((f) => ({ id: f.id, name: f.name }));
    if (cur) t.unshift({ id: 'root', name: 'รูปทั้งหมด (นอกโฟลเดอร์)' });
    return t;
  }

  // target: folder id or null (= root)
  private async doMove(ids: string[], target: string | null): Promise<void> {
    const tname = target
      ? (this.moveTargets().find((x) => x.id === target)?.name ?? 'โฟลเดอร์')
      : 'รูปทั้งหมด (นอกโฟลเดอร์)';
    this.err.set('');
    // ghost tiles at the destination while the server processes each move
    const moving = (this.listing()?.images ?? []).filter((i) => ids.includes(i.id));
    this.pending.update((p) => [
      ...p,
      ...moving.map((im) => ({ key: im.id, img: im, name: im.name, target })),
    ]);
    this.removeLocal(ids);
    let failed = 0;
    for (const i of ids) {
      try {
        await this.svc.moveDriveImage(i, target);
      } catch {
        failed++;
      }
    }
    if (failed) {
      this.addLog(`ย้ายไม่สำเร็จ ${failed} รูป`, false);
      await this.refresh();
    } else {
      this.addLog(`ย้าย ${ids.length} รูปไป "${tname}"`);
      // fetch the fresh listing first, THEN drop the ghosts — no flicker gap
      await this.sync();
    }
    for (const i of ids) this.removePending(i);
  }

  async bulkMove(target: string): Promise<void> {
    if (!target || !this.selected().size) return;
    await this.doMove(Array.from(this.selected()), target === 'root' ? null : target);
  }

  private async doDelete(ids: string[]): Promise<void> {
    this.err.set('');
    this.removeLocal(ids);
    let failed = 0;
    for (const id of ids) {
      try {
        await this.svc.deleteDriveImage(id);
      } catch {
        failed++;
      }
    }
    if (failed) {
      this.addLog(`ลบไม่สำเร็จ ${failed} รูป`, false);
      await this.refresh();
    } else {
      this.addLog(`ลบ ${ids.length} รูป`);
      this.sync();
    }
  }

  async bulkDelete(): Promise<void> {
    const ids = Array.from(this.selected());
    if (!ids.length || !confirm(`ลบ ${ids.length} รูปที่เลือก?`)) return;
    await this.doDelete(ids);
  }

  async refresh(): Promise<void> {
    const seq = ++this.reqSeq;
    this.clearSelect();
    // show the cached listing instantly; "กำลังโหลด" only on the first visit
    this.listing.set(this.svc.cachedDriveListing(this.curFolder()?.id));
    this.err.set('');
    try {
      const data = await this.svc.listDriveImages(this.curFolder()?.id);
      if (seq !== this.reqSeq) return; // navigated elsewhere while loading
      this.listing.set(data);
      this.apiUp.set(true);
    } catch {
      if (seq !== this.reqSeq) return;
      if (!this.listing()) this.listing.set({ folders: [], images: [] });
      this.apiUp.set(false);
      this.err.set(DRIVE_API_DOWN_MSG);
    }
  }

  openFolder(f: DriveFolder | null): void {
    this.curFolder.set(f);
    this.query.set('');
    this.refresh();
  }

  async newFolder(): Promise<void> {
    const name = prompt('ชื่อโฟลเดอร์ใหม่')?.trim();
    if (!name) return;
    this.err.set('');
    try {
      await this.svc.createDriveFolder(name);
      this.addLog(`สร้างโฟลเดอร์ "${name}"`);
      await this.sync();
    } catch (err) {
      this.addLog('สร้างโฟลเดอร์ไม่สำเร็จ: ' + (err as Error).message, false);
    }
  }

  private async doRemoveFolder(f: DriveFolder): Promise<void> {
    this.err.set('');
    // realtime: folder disappears immediately
    this.listing.update((l) => (l ? { ...l, folders: l.folders.filter((x) => x.id !== f.id) } : l));
    try {
      await this.svc.deleteDriveImage(f.id); // same endpoint, folders go to trash with contents
      this.addLog(`ลบโฟลเดอร์ "${f.name}"`);
      this.sync();
    } catch {
      this.addLog(`ลบโฟลเดอร์ "${f.name}" ไม่สำเร็จ`, false);
      await this.refresh();
    }
  }

  async removeFolder(f: DriveFolder): Promise<void> {
    if (this.armedId() !== f.id) {
      this.armedId.set(f.id);
      setTimeout(() => {
        if (this.armedId() === f.id) this.armedId.set('');
      }, 3000);
      return;
    }
    this.armedId.set('');
    await this.doRemoveFolder(f);
  }

  // ---- right-click context menu ----
  readonly ctx = signal<{
    x: number;
    y: number;
    id: string;
    name: string;
    url?: string;
    isFolder: boolean;
  } | null>(null);

  openCtx(e: MouseEvent, item: DriveImage | DriveFolder, isFolder: boolean): void {
    e.preventDefault();
    e.stopPropagation();
    // no selection change on right-click — the menu targets the clicked item
    // (or the whole selection when the item is already part of it)
    this.ctx.set({
      x: e.clientX,
      y: e.clientY,
      id: item.id,
      name: item.name,
      url: (item as DriveImage).url,
      isFolder,
    });
  }

  @HostListener('document:click')
  closeCtx(): void {
    this.ctx.set(null);
  }

  private ctxIds(): string[] {
    const c = this.ctx();
    if (!c) return [];
    return !c.isFolder && this.selected().has(c.id) ? Array.from(this.selected()) : [c.id];
  }

  ctxCount(): number {
    return this.ctxIds().length;
  }

  // ---- download: single file as-is, multiple bundled into one zip ----
  private async downloadIds(ids: string[]): Promise<void> {
    const imgs = (this.listing()?.images ?? []).filter((i) => ids.includes(i.id));
    if (!imgs.length) return;
    await downloadImages(imgs, 'raika-images.zip', (name, ok) =>
      this.addLog(ok ? `ดาวน์โหลด "${name}"` : `ดาวน์โหลด "${name}" ไม่สำเร็จ`, ok),
    );
  }

  async downloadSelected(): Promise<void> {
    await this.downloadIds(Array.from(this.selected()));
  }

  async ctxDownload(): Promise<void> {
    const ids = this.ctxIds();
    this.ctx.set(null);
    await this.downloadIds(ids);
  }

  async ctxCopy(): Promise<void> {
    const c = this.ctx();
    this.ctx.set(null);
    if (!c?.url) return;
    await navigator.clipboard.writeText(c.url);
    this.addLog(`คัดลอก URL "${c.name}"`);
  }

  ctxRename(): void {
    const c = this.ctx();
    this.ctx.set(null);
    if (c) this.renamingId.set(c.id);
  }

  async ctxMove(target: string): Promise<void> {
    const c = this.ctx();
    const ids = this.ctxIds();
    this.ctx.set(null);
    if (!c || c.isFolder || !ids.length) return;
    await this.doMove(ids, target === 'root' ? null : target);
  }

  async ctxDelete(): Promise<void> {
    const c = this.ctx();
    const ids = this.ctxIds();
    this.ctx.set(null);
    if (!c) return;
    if (c.isFolder) {
      if (confirm(`ลบโฟลเดอร์ "${c.name}" ทั้งโฟลเดอร์?`))
        await this.doRemoveFolder({ id: c.id, name: c.name });
    } else if (confirm(`ลบ ${ids.length} รูป?`)) {
      await this.doDelete(ids);
    }
  }

  async onUpload(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (files?.length) await this.uploadFiles(files, this.curFolder()?.id);
    input.value = '';
  }

  private async uploadFiles(files: FileList, folder?: string): Promise<void> {
    this.uploading.set(true);
    this.err.set('');
    const keys: string[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const key = f.name + Date.now();
      keys.push(key);
      this.pending.update((p) => [...p, { key, name: f.name, target: folder ?? null }]);
      try {
        await this.svc.uploadDriveImage(f, folder);
        this.addLog(`อัพโหลด "${f.name}" สำเร็จ`);
      } catch (err) {
        this.addLog(`อัพโหลด "${f.name}" ไม่สำเร็จ: ` + (err as Error).message, false);
      }
    }
    this.uploading.set(false);
    // fresh listing first, then drop the ghosts — no flicker gap
    await this.sync();
    for (const k of keys) this.removePending(k);
  }

  // ---- File-Explorer-style drag & drop ----
  // Drag an image card onto a folder chip (or the back button) to move it;
  // drop OS files onto the page / a folder chip to upload there.
  private dragId: string | null = null;
  readonly dropTarget = signal(''); // folder id | 'root' | 'page'

  onDragStart(e: DragEvent, img: DriveImage): void {
    this.dragId = img.id;
    e.dataTransfer?.setData('text/plain', img.id);
  }

  onDragEnd(): void {
    this.dragId = null;
    this.dropTarget.set('');
  }

  allowDrop(e: DragEvent, target: string): void {
    e.preventDefault();
    e.stopPropagation();
    if (this.dropTarget() !== target) this.dropTarget.set(target);
  }

  dragLeave(target: string): void {
    if (this.dropTarget() === target) this.dropTarget.set('');
  }

  // target: folder id, or null = root; 'page' drops resolve to the open folder
  async onDrop(e: DragEvent, target: string | null): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    this.dropTarget.set('');
    const files = e.dataTransfer?.files;
    if (files?.length) {
      await this.uploadFiles(files, target ?? undefined);
      return;
    }
    const id = this.dragId ?? e.dataTransfer?.getData('text/plain');
    this.dragId = null;
    if (!id) return;
    const current = this.curFolder()?.id ?? null;
    if (target === current) return; // dropped where it already is
    // dragging a selected image moves the whole selection
    const ids = this.selected().has(id) ? Array.from(this.selected()) : [id];
    await this.doMove(ids, target);
  }

  async copy(img: DriveImage): Promise<void> {
    await navigator.clipboard.writeText(img.url);
    this.copiedId.set(img.id);
    setTimeout(() => {
      if (this.copiedId() === img.id) this.copiedId.set('');
    }, 1500);
  }

  // works for both images and folders
  async rename(item: { id: string; name: string }, name: string): Promise<void> {
    this.renamingId.set('');
    name = name.trim();
    if (!name || name === item.name) return;
    this.err.set('');
    // realtime: rename shows immediately
    this.listing.update((l) =>
      l
        ? {
            folders: l.folders.map((x) => (x.id === item.id ? { ...x, name } : x)),
            images: l.images.map((x) => (x.id === item.id ? { ...x, name } : x)),
          }
        : l,
    );
    try {
      await this.svc.renameDriveImage(item.id, name);
      this.addLog(`เปลี่ยนชื่อ "${item.name}" เป็น "${name}"`);
      this.sync();
    } catch {
      this.addLog(`เปลี่ยนชื่อ "${item.name}" ไม่สำเร็จ`, false);
      await this.refresh();
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
    this.removeLocal([img.id]);
    try {
      await this.svc.deleteDriveImage(img.id);
      this.addLog(`ลบ "${img.name}"`);
      this.sync();
    } catch {
      this.addLog(`ลบ "${img.name}" ไม่สำเร็จ`, false);
      await this.refresh();
    }
  }
}
