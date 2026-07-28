import { Component, HostListener, inject, signal } from '@angular/core';
import { LwRowsComponent } from '../shared/lw-rows/lw-rows.component';
import { WidgetCapsuleComponent } from '../shared/widget-capsule/widget-capsule.component';
import { QueueItem, QueueService } from '../services/queue.service';

@Component({
  selector: 'control-page',
  imports: [WidgetCapsuleComponent, LwRowsComponent],
  templateUrl: './control.component.html',
  styleUrl: './control.component.css',
})
export class ControlComponent {
  readonly svc = inject(QueueService);
  readonly dropdownOpen = signal(false);
  readonly showResetModal = signal(false);
  readonly viewPhoto = signal<string | null>(null);
  readonly pendingResult = signal<{ item: QueueItem; result: 'win' | 'lose' } | null>(null);
  wrChecked(game: string): boolean {
    return !(this.svc.settings().wrHidden ?? []).includes(game);
  }

  confirmResult(): void {
    const p = this.pendingResult();
    if (p) this.svc.recordResult(p.item, p.result);
    this.pendingResult.set(null);
  }

  @HostListener('document:click')
  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  toggleDropdown(e: Event): void {
    e.stopPropagation();
    this.dropdownOpen.set(!this.dropdownOpen());
  }

  selectGame(name: string): void {
    this.svc.setActiveGame(name);
    this.dropdownOpen.set(false);
  }

  onLimit(value: string): void {
    this.svc.setQueueLimit(value === '' ? 0 : parseInt(value, 10));
  }

  onOpacity(e: Event): void {
    this.svc.setListOpacity(+(e.target as HTMLInputElement).value / 100);
  }

  async copyUrl(path: string, e: Event): Promise<void> {
    const btn = e.target as HTMLButtonElement;
    await navigator.clipboard.writeText(location.origin + path);
    const original = btn.textContent;
    btn.textContent = 'คัดลอกแล้ว';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  }
}
