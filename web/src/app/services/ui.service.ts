import { Injectable, computed, effect, signal } from '@angular/core';

export type Lang = 'th' | 'en';

// ponytail: only the home page is translated for now; inner pages stay Thai.
// Move to a real i18n lib when more pages need it.
const T = {
  th: {
    features: 'ฟีเจอร์',
    queueFeature: 'ลงคิวเล่นการ์ดเกม',
    admin: 'Admin',
    control: 'Control Panel',
    master: 'Master Data',
    about: 'About',
    aboutText: 'เว็บของ Kerori Raika — VTuber สายการ์ดเกมที่ไม่ค่อยจะดัง',
    login: 'เข้าสู่ระบบ',
    logout: 'ออกจากระบบ',
    signup: 'สมัครสมาชิก',
    email: 'อีเมล',
    password: 'รหัสผ่าน (6 ตัวขึ้นไป)',
    or: 'หรือ',
    noAccount: 'ยังไม่มีบัญชี? สมัครสมาชิก',
    haveAccount: 'มีบัญชีแล้ว? เข้าสู่ระบบ',
    forgot: 'ลืมรหัสผ่าน?',
    resetSent: 'ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว',
    resetFail: 'ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง',
    enterEmailFirst: 'กรอกอีเมลก่อน แล้วกดลืมรหัสผ่านอีกครั้ง',
    tagline: 'เว็บสำหรับ VTuber ที่ไม่ค่อยจะดัง',
    joinQueue: 'ลงคิวเลย',
    latestClips: 'คลิปล่าสุด',
    latestPost: 'โพสต์ล่าสุด',
    openPost: 'ดูโพสต์',
    openChannel: 'ดูช่อง YouTube',
    motionTitle: 'เปิด/ปิดการเคลื่อนไหว',
    bgTitle: 'เปิด/ปิดภาพพื้นหลัง',
    themeTitle: 'ธีมมืด/สว่าง',
    viewCard: 'ดูรายละเอียด',
  },
  en: {
    features: 'Features',
    queueFeature: 'Card game queue',
    admin: 'Admin',
    control: 'Control Panel',
    master: 'Master Data',
    about: 'About',
    aboutText: 'The website of Kerori Raika — a not-so-famous card game VTuber',
    login: 'Sign in',
    logout: 'Sign out',
    signup: 'Sign up',
    email: 'Email',
    password: 'Password (6+ characters)',
    or: 'or',
    noAccount: 'No account? Sign up',
    haveAccount: 'Have an account? Sign in',
    forgot: 'Forgot password?',
    resetSent: 'Password reset link sent to your email',
    resetFail: 'Could not send the link, try again',
    enterEmailFirst: 'Enter your email first, then tap forgot password again',
    tagline: 'A website for a not-so-famous VTuber',
    joinQueue: 'Join the queue',
    latestClips: 'Latest videos',
    latestPost: 'Latest posts',
    openPost: 'Open post',
    openChannel: 'Open YouTube channel',
    motionTitle: 'Toggle motion',
    bgTitle: 'Toggle background art',
    themeTitle: 'Dark/light theme',
    viewCard: 'View details',
  },
};

@Injectable({ providedIn: 'root' })
export class UiService {
  readonly lang = signal<Lang>((localStorage.getItem('ui_lang') as Lang) || 'th');
  readonly theme = signal<'dark' | 'light'>(
    (localStorage.getItem('ui_theme') as 'dark' | 'light') || 'dark',
  );
  readonly motion = signal(localStorage.getItem('ui_motion') !== 'off');
  readonly bgVisible = signal(localStorage.getItem('ui_bg') !== 'off');

  readonly t = computed(() => T[this.lang()]);

  // Pick the admin-set text for the current language, falling back to the other
  pick(th?: string | null, en?: string | null): string {
    return (this.lang() === 'en' ? en || th : th || en) || '';
  }

  constructor() {
    effect(() => localStorage.setItem('ui_lang', this.lang()));
    effect(() => {
      localStorage.setItem('ui_theme', this.theme());
      document.body.dataset['theme'] = this.theme();
    });
    effect(() => {
      localStorage.setItem('ui_motion', this.motion() ? 'on' : 'off');
    });
    effect(() => {
      localStorage.setItem('ui_bg', this.bgVisible() ? 'on' : 'off');
    });
  }
}
