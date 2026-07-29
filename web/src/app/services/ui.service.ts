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
