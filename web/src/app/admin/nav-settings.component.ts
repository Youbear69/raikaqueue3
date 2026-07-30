import { Component, inject } from '@angular/core';
import { FeatureFlag, HeroButton, QueueService, Settings } from '../services/queue.service';

type NavText =
  | 'navTitle'
  | 'navLogo'
  | 'navXUrl'
  | 'navYtUrl'
  | 'navTwitchUrl'
  | 'navDonateUrl'
  | 'navDiscordUrl'
  | 'aboutText'
  | 'aboutTextEn';

const NAV_FIELDS: readonly (keyof Settings)[] = [
  'navTitle',
  'navLogo',
  'navXUrl',
  'navYtUrl',
  'navTwitchUrl',
  'navDonateUrl',
  'navDiscordUrl',
  'navXOff',
  'navYtOff',
  'navTwitchOff',
  'navDonateOff',
  'navDiscordOff',
  'navFeaturesOff',
  'navAdminOff',
  'navFeatureItems',
  'aboutText',
  'aboutTextEn',
];

@Component({
  selector: 'nav-settings-page',
  templateUrl: './nav-settings.component.html',
  // Reuses the master page styles (cards, rows, inputs)
  styleUrl: '../master/master.component.css',
  styles: `
    .master-container {
      max-width: none;
      margin: 0;
    }
  `,
})
export class NavSettingsComponent {
  readonly svc = inject(QueueService);

  // Social rows rendered from one list
  readonly socials: { flag: FeatureFlag; url: NavText; label: string; def: string }[] = [
    { flag: 'navXOff', url: 'navXUrl', label: 'X', def: 'https://x.com/keroRaika' },
    { flag: 'navYtOff', url: 'navYtUrl', label: 'YouTube', def: 'https://www.youtube.com/@keroriRaika' },
    { flag: 'navTwitchOff', url: 'navTwitchUrl', label: 'Twitch', def: 'https://www.twitch.tv/kerori_raika' },
    { flag: 'navDonateOff', url: 'navDonateUrl', label: 'EasyDonate', def: 'https://easydonate.app/keroriraika' },
    { flag: 'navDiscordOff', url: 'navDiscordUrl', label: 'Discord', def: 'https://discord.gg/vSPdcMsGGw' },
  ];

  val(field: NavText): string {
    return (this.svc.settings()[field] as string | undefined) ?? '';
  }

  flagOn(flag: FeatureFlag): boolean {
    return !this.svc.settings()[flag];
  }

  setText(field: NavText, value: string): void {
    this.svc.setSiteText({ [field]: value.trim() || null } as never);
  }

  onFlag(flag: FeatureFlag, e: Event): void {
    this.svc.setFlag({ [flag]: !(e.target as HTMLInputElement).checked } as never);
  }

  // ---- ฟีเจอร์ dropdown items (empty list = default join-queue link) ----
  featureItems(): HeroButton[] {
    return this.svc.settings().navFeatureItems ?? [];
  }

  addItem(): void {
    this.svc.setNavFeatureItems([...this.featureItems(), { th: '', en: '', url: '/register' }]);
  }

  delItem(i: number): void {
    this.svc.setNavFeatureItems(this.featureItems().filter((_, idx) => idx !== i));
  }

  updateItem(i: number, field: 'th' | 'en' | 'url', value: string): void {
    const list = this.featureItems().map((b, idx) =>
      idx === i ? { ...b, [field]: value.trim() } : b,
    );
    this.svc.setNavFeatureItems(list);
  }

  reset(): void {
    if (confirm('ล้างการตั้งค่า site-nav ทั้งหมด กลับเป็นค่าเริ่มต้น?')) {
      this.svc.resetSettings(NAV_FIELDS);
    }
  }
}
