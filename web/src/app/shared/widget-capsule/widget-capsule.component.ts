import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { QueueService } from '../../services/queue.service';

function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow restarts the CSS animation
  el.classList.add(cls);
}

@Component({
  selector: 'widget-capsule',
  templateUrl: './widget-capsule.component.html',
})
export class WidgetCapsuleComponent {
  readonly svc = inject(QueueService);

  private capsule = viewChild<ElementRef<HTMLElement>>('capsule');
  private playingEl = viewChild<ElementRef<HTMLElement>>('playingEl');
  private queueEl = viewChild<ElementRef<HTMLElement>>('queueEl');

  readonly playingName = computed(() => this.svc.playing()?.name ?? '-');
  readonly nextNames = computed(() => {
    const names = this.svc.waiting().map((i) => i.name);
    return names.length ? names.join(' - ') : '-';
  });
  readonly fontSize = computed(() => {
    const name = this.playingName();
    if (name === '-' || name.length <= 8) return '2.3rem';
    return name.length > 15 ? '1.3rem' : '1.7rem';
  });

  constructor() {
    let prevPlaying: string | null = null;
    let prevQueue: string | null = null;
    effect(() => {
      const p = this.playingName();
      const q = this.nextNames();
      const cap = this.capsule()?.nativeElement;
      if (cap && prevPlaying !== null && (p !== prevPlaying || q !== prevQueue)) {
        retrigger(cap, 'animate-capsule-update');
        if (p !== prevPlaying && this.playingEl()) {
          retrigger(this.playingEl()!.nativeElement, 'animate-text-slide');
        }
        if (q !== prevQueue && this.queueEl()) {
          retrigger(this.queueEl()!.nativeElement, 'animate-text-slide');
        }
      }
      prevPlaying = p;
      prevQueue = q;
    });
  }
}
