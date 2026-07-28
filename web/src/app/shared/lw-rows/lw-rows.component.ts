import { Component, computed, inject } from '@angular/core';
import { QueueService } from '../../services/queue.service';

// Shared list-widget rows: current playing + everyone still waiting (played rows hidden),
// numbered by absolute queue position — same as the old renderListWidgetRows.
@Component({
  selector: 'lw-rows',
  templateUrl: './lw-rows.component.html',
})
export class LwRowsComponent {
  private svc = inject(QueueService);

  readonly visible = computed(() =>
    this.svc
      .queue()
      .map((item, i) => ({ item, number: i + 1 }))
      .filter((v) => v.item.status !== 'played'),
  );
}
