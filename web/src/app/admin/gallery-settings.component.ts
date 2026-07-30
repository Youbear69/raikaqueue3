import { Component, inject, signal } from '@angular/core';
import { QueueService } from '../services/queue.service';

@Component({
  selector: 'gallery-settings-page',
  templateUrl: './gallery-settings.component.html',
  // Reuses the master page styles (cards, rows, inputs)
  styleUrl: '../master/master.component.css',
  styles: `
    .master-container {
      max-width: none;
      margin: 0;
    }
  `,
})
export class GallerySettingsComponent {
  readonly svc = inject(QueueService);
  readonly apiUp = signal(false);

  constructor() {
    this.loadFolders();
  }

  private async loadFolders(): Promise<void> {
    try {
      await this.svc.listDriveImages(); // fills the shared cache with the root folder list
      this.apiUp.set(true);
    } catch {
      this.apiUp.set(false);
    }
  }

  folders(): { id: string; name: string }[] {
    return this.svc.cachedDriveListing()?.folders ?? [];
  }

  reset(): void {
    if (confirm('ล้างการตั้งค่าหน้ารูปแจก (ปิดหน้าแจก)?')) {
      this.svc.resetSettings(['giveFolder']);
    }
  }
}
