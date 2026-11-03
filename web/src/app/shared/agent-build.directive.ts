import { Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import { QueueService } from '../services/queue.service';
import { UiService } from '../services/ui.service';

// "Agents are building this section" reveal: the host starts as a grey dashed
// wireframe; when scrolled into view three labelled agent cursors fly in and
// take turns (Layout -> Color -> Type) restoring the real design. Plays once per
// section. Off when settings.agentAnimOff, the nav motion switch is off, or the
// OS asks for reduced motion. Styles live in styles.css (.ab-*).
const AGENTS = [
  { name: 'Layout', color: '#4a9eda', stage: 'ab-layout' },
  { name: 'Color', color: '#ff7ab6', stage: 'ab-color' },
  { name: 'Type', color: '#ffd23f', stage: 'ab-type' },
];
const STEP = 600; // ms per agent turn
const TARGETS = 'h1,h2,p,a,button,img,.clip-card,.post-card,iframe';

@Directive({ selector: '[agentBuild]' })
export class AgentBuildDirective implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly svc = inject(QueueService);
  private readonly ui = inject(UiService);
  private io?: IntersectionObserver;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private layer?: HTMLElement;
  private restorePos = false;

  constructor() {
    if (!this.ui.motion() || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.host.classList.add('ab-wait');
    // ponytail: 3s cap so an offline RTDB never leaves the section stuck as a wireframe
    Promise.race([this.svc.settingsReady, new Promise((r) => setTimeout(r, 3000))]).then(() => {
      if (this.svc.settings().agentAnimOff || !this.host.isConnected) return this.finish();
      this.io = new IntersectionObserver(
        (es) => {
          if (!es[0].isIntersecting) return;
          this.io?.disconnect();
          this.play();
        },
        { threshold: 0.2 },
      );
      this.io.observe(this.host);
    });
  }

  private play(): void {
    const h = this.host;
    if (getComputedStyle(h).position === 'static') {
      h.style.position = 'relative';
      this.restorePos = true;
    }
    const layer = (this.layer = document.createElement('div'));
    layer.className = 'ab-layer';
    h.appendChild(layer);

    const hr = h.getBoundingClientRect();
    const boxes = [...h.querySelectorAll<HTMLElement>(TARGETS)]
      .filter((el) => !layer.contains(el))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 20 && r.height > 12 && r.bottom > hr.top && r.top < hr.bottom)
      .map((r) => ({ x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height }));
    if (!boxes.length) boxes.push({ x: 0, y: 0, w: hr.width, h: hr.height });

    const cursors = AGENTS.map((a, i) => {
      const c = document.createElement('div');
      c.className = 'ab-agent';
      c.style.setProperty('--ab-c', a.color);
      c.innerHTML =
        '<div class="ab-sel"></div><svg viewBox="0 0 16 16" class="ab-ptr"><path d="M1 1l5 14 2-6 6-2z"/></svg>' +
        `<span class="ab-tag">${a.name}</span>`;
      // start just outside the section, spread across its width
      c.style.transform = `translate(${(hr.width * (i + 1)) / 4}px, -40px)`;
      layer.appendChild(c);
      return c;
    });

    const at = (ms: number, fn: () => void) => this.timers.push(setTimeout(fn, ms));
    const moveTo = (c: HTMLElement, b: (typeof boxes)[number], select: boolean) => {
      c.style.transform = `translate(${b.x + b.w * 0.6}px, ${b.y + b.h * 0.55}px)`;
      const sel = c.firstElementChild as HTMLElement;
      sel.style.cssText = select
        ? `opacity:1;width:${b.w}px;height:${b.h}px;transform:translate(${-b.w * 0.6}px,${-b.h * 0.55}px)`
        : 'opacity:0';
    };
    const pick = (n: number) => boxes[n % boxes.length];

    // everyone drifts in to a waiting spot
    at(30, () => cursors.forEach((c, i) => moveTo(c, pick(i * 2), false)));
    AGENTS.forEach((a, i) => {
      const t0 = 350 + i * STEP;
      at(t0, () => {
        h.classList.add(a.stage);
        moveTo(cursors[i], pick(i), true);
      });
      at(t0 + STEP / 2, () => moveTo(cursors[i], pick(i + 3), true));
      at(t0 + STEP, () => moveTo(cursors[i], pick(i * 2 + 1), false));
    });
    const tEnd = 350 + AGENTS.length * STEP;
    at(tEnd, () => {
      const done = document.createElement('div');
      done.className = 'ab-done';
      done.innerHTML =
        '<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>build complete';
      layer.appendChild(done);
      cursors.forEach((c, i) => (c.style.transform = `translate(${(hr.width * (i + 1)) / 4}px, ${hr.height + 40}px)`));
      layer.classList.add('ab-out');
    });
    at(tEnd + 900, () => this.finish());
  }

  private finish(): void {
    this.host.classList.remove('ab-wait', ...AGENTS.map((a) => a.stage));
    this.layer?.remove();
    this.layer = undefined;
    if (this.restorePos) this.host.style.position = '';
    this.restorePos = false;
  }

  ngOnDestroy(): void {
    this.io?.disconnect();
    this.timers.forEach(clearTimeout);
    this.finish();
  }
}
