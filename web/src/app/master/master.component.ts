import { Component, inject, signal } from '@angular/core';
import { DEFAULT_GAMES, QueueService } from '../services/queue.service';

type Tab = 'games' | 'widget' | 'history' | 'players' | 'terms';

interface PlayerRow {
  name: string;
  game: string;
  win: number;
  lose: number;
  pct: string;
}

@Component({
  selector: 'master-page',
  templateUrl: './master.component.html',
  styleUrl: './master.component.css',
})
export class MasterComponent {
  readonly svc = inject(QueueService);
  readonly tab = signal<Tab>('games');
  readonly origin = location.origin;
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'games', label: 'รายชื่อเกม' },
    { key: 'widget', label: 'ตั้งค่า widget' },
    { key: 'history', label: 'ประวัติคิว' },
    { key: 'players', label: 'สถิติผู้เล่น' },
    { key: 'terms', label: 'ข้อตกลง' },
  ];

  addTerm(e: Event, input: HTMLInputElement): void {
    e.preventDefault();
    this.svc.addTerm(input.value);
    input.value = '';
  }

  playerRows(): PlayerRow[] {
    const rows: PlayerRow[] = [];
    for (const [uid, stats] of Object.entries(this.svc.userStats())) {
      for (const [game, wl] of Object.entries(stats.games ?? {})) {
        const win = wl.win ?? 0;
        const lose = wl.lose ?? 0;
        const total = win + lose;
        rows.push({
          name: stats.name || uid,
          game,
          win,
          lose,
          pct: total ? ((win / total) * 100).toFixed(1) + '%' : '-',
        });
      }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  opacityPercent(): number {
    return Math.round(this.svc.settings().listOpacity * 100);
  }

  addGame(e: Event, input: HTMLInputElement): void {
    e.preventDefault();
    this.svc.addGame(input.value);
    input.value = '';
  }

  seedDefaults(): void {
    DEFAULT_GAMES.forEach((g) => this.svc.addGame(g));
  }

  onOpacity(e: Event): void {
    this.svc.setListOpacity(+(e.target as HTMLInputElement).value / 100);
  }

  onLimit(value: string): void {
    this.svc.setQueueLimit(value === '' ? 0 : parseInt(value, 10));
  }

  clearHistory(): void {
    if (confirm('ล้างประวัติคิวทั้งหมด?')) this.svc.clearHistory();
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }
}
