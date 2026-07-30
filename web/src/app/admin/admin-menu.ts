// Single source for admin page links — the nav Admin dropdown renders from this.
// Add new admin pages here so the dropdown picks them up automatically.
export interface AdminMenuItem {
  label: string;
  path: string;
}

export const ADMIN_MENU: AdminMenuItem[] = [
  { label: 'Control Panel', path: '/control' },
  { label: 'Master Data', path: '/master' },
  { label: 'ตั้งค่าเว็บ (หน้า home)', path: '/settings' },
  { label: 'ตั้งค่าหน้า register', path: '/register-settings' },
  { label: 'ตั้งค่า site-nav', path: '/nav-settings' },
  { label: 'จัดการรูป', path: '/images' },
];
