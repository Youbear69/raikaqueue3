import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { LwRowsComponent } from '../shared/lw-rows/lw-rows.component';
import { QueueService } from '../services/queue.service';

@Component({
  selector: 'widget-list-page',
  imports: [LwRowsComponent],
  templateUrl: './widget-list.component.html',
})
export class WidgetListComponent implements OnInit, OnDestroy {
  readonly svc = inject(QueueService);
  private box = viewChild<ElementRef<HTMLElement>>('box');

  constructor() {
    // Pulse animation when visible content changes (same as the old widget-list.js)
    let prev: string | null = null;
    effect(() => {
      const key =
        this.svc.settings().activeGame +
        JSON.stringify(this.svc.queue().filter((i) => i.status !== 'played'));
      const el = this.box()?.nativeElement;
      if (el && prev !== null && prev !== key) {
        el.classList.remove('animate-capsule-update');
        void el.offsetWidth;
        el.classList.add('animate-capsule-update');
      }
      prev = key;
    });

    // Position via URL params: /widget-list?x=1300&y=80&w=450 — lets the browser
    // source stay full-canvas in OBS so blur-follow masks track the widget.
    effect(() => {
      const el = this.box()?.nativeElement;
      if (!el) return;
      const params = new URLSearchParams(window.location.search);
      if (params.has('x') || params.has('y')) {
        document.body.style.justifyContent = 'flex-start';
        document.body.style.alignItems = 'flex-start';
        el.style.position = 'absolute';
        el.style.left = (parseInt(params.get('x') ?? '', 10) || 0) + 'px';
        el.style.top = (parseInt(params.get('y') ?? '', 10) || 0) + 'px';
      }
      if (params.has('w')) {
        el.style.maxWidth = (parseInt(params.get('w') ?? '', 10) || 580) + 'px';
      }
    });
  }

  ngOnInit(): void {
    document.body.classList.add('widget-only-body');
  }

  ngOnDestroy(): void {
    document.body.classList.remove('widget-only-body');
    document.body.style.justifyContent = '';
    document.body.style.alignItems = '';
  }
}
