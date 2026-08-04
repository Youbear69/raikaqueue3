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

  readonly authOpen = signal(false);
  readonly authMode = signal<'login' | 'signup'>('login');
  readonly authErr = signal('');
  readonly authMsg = signal('');
  readonly authBusy = signal(false);
  // confirm-password value lives in a signal because its input sits inside an
  // @if block, out of scope for the form's (submit) handler
  readonly authPw2 = signal('');

  openAuth(): void {
    this.authErr.set('');
    this.authMsg.set('');
    this.authPw2.set('');
    this.authMode.set('login');
    this.authOpen.set(true);
  }

  switchAuthMode(): void {
    this.authErr.set('');
    this.authMsg.set('');
    this.authPw2.set('');
    this.authMode.set(this.authMode() === 'signup' ? 'login' : 'signup');
  }

  async authGoogle(): Promise<void> {
    try {
      await this.svc.loginGoogle();
      this.authOpen.set(false);
    } catch {
      // popup closed / cancelled — keep the modal open
    }
  }

  async authSubmit(e: Event, em: HTMLInputElement, pw: HTMLInputElement): Promise<void> {
    e.preventDefault();
    this.authErr.set('');
    this.authMsg.set('');
    if (this.authMode() === 'signup' && pw.value !== this.authPw2()) {
      this.authErr.set(this.ui.t().pwMismatch);
      return;
    }
    this.authBusy.set(true);
    const msg =
      this.authMode() === 'signup'
        ? await this.svc.signupEmail(em.value, pw.value)
        : await this.svc.loginEmail(em.value, pw.value);
    this.authBusy.set(false);
    if (msg) this.authErr.set(msg);
    else this.authOpen.set(false);
  }

  async authForgot(em: HTMLInputElement): Promise<void> {
    const email = em.value.trim();
    if (!email) {
      this.authErr.set(this.ui.t().enterEmailFirst);
      return;
    }
    this.authErr.set('');
    try {
      await this.svc.resetPassword(email);
      this.authMsg.set(this.ui.t().resetSent);
    } catch {
      this.authErr.set(this.ui.t().resetFail);
    }
  }
}
