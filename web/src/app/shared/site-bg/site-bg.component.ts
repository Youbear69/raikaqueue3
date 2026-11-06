import { Component, inject } from '@angular/core';
import { UiService } from '../../services/ui.service';

interface PatternTile {
  x: number;
  y: number;
  delay: number;
  img: string;
}

// Shared animated background: grid overlay + conveyor of watermark tiles that
// spawn off-screen top-left, drift diagonally, and loop invisibly off-screen.
// ponytail: tile positions computed once at load, no window-resize handling
@Component({
  selector: 'site-bg',
  templateUrl: './site-bg.component.html',
  styleUrl: './site-bg.component.css',
})
export class SiteBgComponent {
  readonly ui = inject(UiService);
  readonly driftSeconds = 85; // keep in sync with tile-drift duration in CSS
  readonly travel = Math.max(window.innerWidth, window.innerHeight) + 480;
  readonly bgTiles: PatternTile[] = (() => {
    const TILE = 240;
    const lanes: { x: number; y: number }[] = [];
    for (let x = -TILE; x < window.innerWidth; x += TILE) lanes.push({ x, y: -TILE });
    for (let y = 0; y < window.innerHeight; y += TILE) lanes.push({ x: -TILE, y });
    const perLane = Math.ceil((Math.max(window.innerWidth, window.innerHeight) + 480) / TILE);
    const tiles: PatternTile[] = [];
    for (const lane of lanes) {
      for (let i = 0; i < perLane; i++) {
        tiles.push({
          x: lane.x,
          y: lane.y,
          delay: -((i * this.driftSeconds) / perLane),
          img: Math.random() < 0.5 ? 'bug.png' : 'king.png',
        });
      }
    }
    return tiles;
  })();
}
