import { Component, inject, signal } from '@angular/core';
import { QueueService } from '../services/queue.service';

@Component({
  selector: 'users-page',
  templateUrl: './users.component.html',
  // Reuses the master page styles (cards, rows, inputs)
  styleUrl: '../master/master.component.css',
  styles: `
    .master-container {
      max-width: none;
      margin: 0;
    }
  `,
})
export class UsersComponent {
  readonly svc = inject(QueueService);
  readonly userMsg = signal('');

  addAdmin(e: Event, input: HTMLInputElement): void {
    e.preventDefault();
    this.svc.addAdmin(input.value);
    input.value = '';
  }

  removeAdmin(email: string): void {
    if (email === this.svc.user()?.email?.toLowerCase()) {
      if (!confirm('นี่คือบัญชีของคุณเอง ลบแล้วจะเข้าหน้านี้ไม่ได้อีก ยืนยัน?')) return;
    }
    this.svc.removeAdmin(email);
  }

  async createUser(
    e: Event,
    em: HTMLInputElement,
    pw: HTMLInputElement,
    chk: HTMLInputElement,
  ): Promise<void> {
    e.preventDefault();
    this.userMsg.set('');
    const email = em.value.trim().toLowerCase();
    const msg = await this.svc.createUser(email, pw.value, chk.checked);
    if (msg) {
      this.userMsg.set(msg);
    } else {
      this.userMsg.set(`สร้างบัญชี ${email} แล้ว${chk.checked ? ' (เป็นแอดมิน)' : ''}`);
      em.value = '';
      pw.value = '';
    }
  }

  resetPassword(email: string): void {
    if (!confirm(`ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${email}?`)) return;
    this.svc
      .resetPassword(email)
      .then(() => this.userMsg.set(`ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ ${email} แล้ว`))
      .catch(() => this.userMsg.set('ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง'));
  }
}
