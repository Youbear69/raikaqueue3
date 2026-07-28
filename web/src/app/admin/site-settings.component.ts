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

@Component({
  selector: 'site-settings-page',
  templateUrl: './site-settings.component.html',
  // Reuses the master page styles (cards, rows, home preview)
  styleUrl: '../master/master.component.css',
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
}
