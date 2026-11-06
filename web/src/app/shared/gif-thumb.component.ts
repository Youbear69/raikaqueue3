import { AfterViewInit, Component, ElementRef, Input, signal, viewChild } from '@angular/core';

// GIF thumbnail frozen on its first frame (drawn to a canvas);
// the real animated GIF is shown only while hovered.
@Component({
  selector: 'gif-thumb',
  template: `
    <canvas #cv width="184" height="184" [style.display]="hover() ? 'none' : 'block'"></canvas>
    @if (hover()) {
      <img [src]="src" alt="" />
    }
  `,
  styles: `
    :host {
      display: block;
      width: 92px;
      height: 92px;
      cursor: pointer;
    }
    canvas,
    img {
      width: 92px;
      height: 92px;
      object-fit: cover;
      border-radius: 6px;
      display: block;
    }
  `,
  host: {
    '(mouseenter)': 'hover.set(true)',
    '(mouseleave)': 'hover.set(false)',
  },
})
export class GifThumbComponent implements AfterViewInit {
  @Input({ required: true }) src = '';
  readonly hover = signal(false);
  private cv = viewChild<ElementRef<HTMLCanvasElement>>('cv');

  ngAfterViewInit(): void {
    const canvas = this.cv()?.nativeElement;
    if (!canvas) return;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // object-fit: cover
      const s = Math.max(canvas.width / im.width, canvas.height / im.height);
      const w = im.width * s;
      const h = im.height * s;
      ctx.drawImage(im, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };
    im.src = this.src;
  }
}
