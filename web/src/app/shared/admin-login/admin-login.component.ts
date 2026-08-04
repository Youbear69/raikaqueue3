import { Component, inject, signal } from '@angular/core';
import { QueueService } from '../../services/queue.service';

@Component({
  selector: 'admin-login',
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.css',
})
export class AdminLoginComponent {
  readonly svc = inject(QueueService);
  readonly err = signal('');
  readonly busy = signal(false);

  async loginEmail(e: Event, em: HTMLInputElement, pw: HTMLInputElement): Promise<void> {
    e.preventDefault();
    this.err.set('');
    this.busy.set(true);
    const msg = await this.svc.loginEmail(em.value, pw.value);
    this.busy.set(false);
    if (msg) this.err.set(msg);
  }
}
