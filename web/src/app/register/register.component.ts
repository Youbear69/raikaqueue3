import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { SiteBgComponent } from '../shared/site-bg/site-bg.component';
import { SiteNavComponent } from '../shared/site-nav/site-nav.component';
import { QueueService } from '../services/queue.service';

@Component({
  selector: 'register-page',
  imports: [SiteBgComponent, SiteNavComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent implements OnInit {
  readonly svc = inject(QueueService);
  readonly viewPhoto = signal<string | null>(null);
  // Win-rate card view: Raika's record or the signed-in user's own record
  readonly statView = signal<'raika' | 'me'>('raika');

  displayStats(game: string): { win: number; lose: number; total: number; pct: string } {
    if (this.statView() === 'me' && this.svc.user()?.email) {
      const m = this.svc.myStatsFor(game) ?? { win: 0, lose: 0 };
      const total = m.win + m.lose;
      return {
        win: m.win,
        lose: m.lose,
        total,
        pct: total ? ((m.win / total) * 100).toFixed(1) + '%' : '-',
      };
    }
    return this.svc.statsFor(game);
  }

  readonly isFull = computed(() => {
    const { queueLimit } = this.svc.settings();
    return queueLimit > 0 && this.svc.queue().length >= queueLimit;
  });

  readonly placeholder = computed(() => {
    const { queueLimit } = this.svc.settings();
    const count = this.svc.queue().length;
    if (queueLimit > 0) {
      return count >= queueLimit
        ? `คิวเต็มแล้ว (${count}/${queueLimit})`
        : `ชื่อในเกม (จำกัด ${queueLimit} คิว - ขณะนี้ ${count}/${queueLimit})`;
    }
    return 'ชื่อในเกม';
  });

  // Register confirmation popup (logged-in users)
  readonly regModal = signal(false);
  readonly pendingName = signal('');
  readonly photoMode = signal<'google' | 'url' | 'none'>('none');
  readonly customUrl = signal('');
  readonly urlState = signal<'idle' | 'loading' | 'ok' | 'bad'>('idle');
  readonly checkedTerms = signal<Set<string>>(new Set());
  private nameInputEl: HTMLInputElement | null = null;

  ngOnInit(): void {
    // Sign in early so own queue items show their delete button after a reload
    this.svc.ensureAnonymousAuth();
  }

  async submit(e: Event, input: HTMLInputElement): Promise<void> {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const u = this.svc.user();
    // Confirmation popup for everyone: terms for all, photo options only when signed in
    this.nameInputEl = input;
    this.pendingName.set(name);
    this.photoMode.set(u?.email && u.photoURL ? 'google' : 'none');
    this.customUrl.set('');
    this.urlState.set('idle');
    this.checkedTerms.set(new Set());
    this.regModal.set(true);
  }

  onUrlInput(url: string): void {
    this.customUrl.set(url);
    if (!url.trim()) {
      this.urlState.set('idle');
      return;
    }
    this.urlState.set('loading');
    const img = new Image();
    img.onload = () => {
      if (this.customUrl() === url) this.urlState.set('ok');
    };
    img.onerror = () => {
      if (this.customUrl() === url) this.urlState.set('bad');
    };
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  }

  acceptAllTerms(): void {
    this.checkedTerms.set(new Set(this.svc.terms().map((t) => t.id)));
  }

  toggleTerm(id: string): void {
    const next = new Set(this.checkedTerms());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.checkedTerms.set(next);
  }

  previewUrl(): string | null {
    if (this.photoMode() === 'google') return this.svc.user()?.photoURL ?? null;
    if (this.photoMode() === 'url' && this.urlState() === 'ok') return this.customUrl();
    return null;
  }

  canConfirm(): boolean {
    const termsOk = this.svc.terms().every((t) => this.checkedTerms().has(t.id));
    const mode = this.photoMode();
    const photoOk =
      mode === 'none' ||
      (mode === 'google' && !!this.svc.user()?.photoURL) ||
      (mode === 'url' && this.urlState() === 'ok');
    return termsOk && photoOk;
  }

  async confirmRegister(): Promise<void> {
    if (!this.canConfirm()) return;
    const photo = this.previewUrl();
    this.regModal.set(false);
    const error = await this.svc.register(this.pendingName(), photo);
    if (error) alert(error);
    else if (this.nameInputEl) this.nameInputEl.value = '';
  }
}
