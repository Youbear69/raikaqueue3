import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HeroButton, QueueService } from '../../services/queue.service';
import { UiService } from '../../services/ui.service';
import { ADMIN_MENU } from '../../admin/admin-menu';

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
  readonly adminMenu = ADMIN_MENU;

  // Admin-set ฟีเจอร์ dropdown items; none set = the default join-queue link
  readonly featureItems = computed<HeroButton[]>(() => {
    const list = this.svc.settings().navFeatureItems;
    return list?.length
      ? list
      : [
          { th: this.ui.t().queueFeature, en: this.ui.t().queueFeature, url: '/register' },
          { th: 'รูปแจก', en: 'Free Images', url: '/gallery' },
        ];
  });

  itemLabel(b: HeroButton): string {
    return (this.ui.lang() === 'th' ? b.th : b.en) || b.en || b.th;
  }

  toggleDd(name: DdName, e: Event): void {
    e.stopPropagation();
    this.openDd.set(this.openDd() === name ? null : name);
  }

  @HostListener('document:click')
  closeDd(): void {
    this.openDd.set(null);
  }
}
