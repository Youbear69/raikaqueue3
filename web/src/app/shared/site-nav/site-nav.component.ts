import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QueueService } from '../../services/queue.service';
import { UiService } from '../../services/ui.service';

type DdName = 'features' | 'admin' | 'about' | 'lang';

@Component({
  selector: 'site-nav',
  imports: [RouterLink],
  templateUrl: './site-nav.component.html',
  styleUrl: './site-nav.component.css',
})
export class SiteNavComponent {
  readonly svc = inject(QueueService);
  readonly ui = inject(UiService);

  readonly openDd = signal<DdName | null>(null);

  toggleDd(name: DdName, e: Event): void {
    e.stopPropagation();
    this.openDd.set(this.openDd() === name ? null : name);
  }

  @HostListener('document:click')
  closeDd(): void {
    this.openDd.set(null);
  }
}
