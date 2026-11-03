import { Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import { QueueService } from '../services/queue.service';
import { UiService } from '../services/ui.service';

// "Agents are building this section" reveal. Every card / heading / button in
// the host starts as a grey dashed wireframe. When the section scrolls into
// view three labelled agent cursors pull jobs from ONE shared queue (DOM order,
// so two agents never work the same element): fly to the element, show a
// selection box + progress bar, then that element snaps to its real design.
// Plays once per section. Off when settings.agentAnimOff, the nav motion switch
// is off, or the OS asks for reduced motion. Styles live in styles.css (.ab-*).
const AGENTS = [
  { name: 'Layout', color: '#4a9eda' },
  { name: 'Color', color: '#ff7ab6' },
  { name: 'Type', color: '#ffd23f' },
];
// outermost match wins: a .post-card is one job, its inner <p> is not separate
const TARGETS = '.clip-card,.post-card,.yt-frame,.hero-subs,.yt-link,.hero-btn,h1,h2,p';
const JOB_MS = [380, 620]; // random work time per element

@Directive({ selector: '[agentBuild]' })
export class AgentBuildDirective implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly svc = inject(QueueService);
  private readonly ui = inject(UiService);
  private io?: IntersectionObserver;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private layer?: HTMLElement;
  private jobs: HTMLElement[] = [];
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
        { threshold: 0.15 },
      );
      this.io.observe(this.host);
    });
  }

  private at(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  // element box in host coordinates, read fresh each time (layout may shift)
  private box(el: HTMLElement) {
    const h = this.host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height };
  }

  private play(): void {
    const h = this.host;
    const all = [...h.querySelectorAll<HTMLElement>(TARGETS)];
    const jobs = (this.jobs = all.filter(
      (el) => el.getClientRects().length && !all.some((o) => o !== el && o.contains(el)),
    ));
    jobs.forEach((el) => el.classList.add('ab-pend'));
    h.classList.remove('ab-wait'); // per-element wireframes take over
    if (!jobs.length) return this.finish();

    if (getComputedStyle(h).position === 'static') {
      h.style.position = 'relative';
      this.restorePos = true;
    }
    const layer = (this.layer = document.createElement('div'));
    layer.className = 'ab-layer';
    h.appendChild(layer);
    const hw = h.clientWidth;

    let next = 0;
    let busy = AGENTS.length;
    const work = (c: HTMLElement) => {
      const el = jobs[next++];
      if (!el) {
        // queue empty: this agent leaves; last one out ends the show
        c.classList.add('ab-leave');
        if (--busy === 0) this.at(500, () => this.finish());
        return;
      }
      const b = this.box(el);
      const ms = JOB_MS[0] + Math.random() * (JOB_MS[1] - JOB_MS[0]);
      const sel = c.querySelector<HTMLElement>('.ab-sel')!;
      const bar = c.querySelector<HTMLElement>('.ab-bar')!;
      // pointer parks near the element's top-left corner, selection box wraps the element
      const px = b.x + Math.min(b.w * 0.25, 60);
      const py = b.y + Math.min(b.h * 0.3, 40);
      c.style.transform = `translate(${px}px, ${py}px)`;
      sel.style.cssText = `opacity:0;width:${b.w}px;height:${b.h}px;transform:translate(${b.x - px}px,${b.y - py}px)`;
      bar.style.cssText = 'transition:none;width:0';
      this.at(320, () => {
        // arrived: select + work
        sel.style.opacity = '1';
        bar.style.cssText = `transition:width ${ms}ms linear;width:100%`;
        el.classList.add('ab-busy');
      });
      this.at(320 + ms, () => {
        el.classList.remove('ab-pend', 'ab-busy');
        el.classList.add('ab-built');
        sel.style.opacity = '0';
        this.at(120, () => work(c));
      });
    };

    AGENTS.forEach((a, i) => {
      const c = document.createElement('div');
      c.className = 'ab-agent';
      c.style.setProperty('--ab-c', a.color);
      c.innerHTML =
        '<div class="ab-sel"><div class="ab-bar"></div></div>' +
        '<svg viewBox="0 0 16 16" class="ab-ptr"><path d="M1 1l5 14 2-6 6-2z"/></svg>' +
        `<span class="ab-tag">${a.name}</span>`;
      c.style.transform = `translate(${(hw * (i + 1)) / 4}px, -50px)`; // enter from above
      layer.appendChild(c);
      this.at(60 + i * 140, () => work(c)); // staggered start
    });
  }

  private finish(): void {
    this.host.classList.remove('ab-wait');
    this.jobs.forEach((el) => el.classList.remove('ab-pend', 'ab-busy', 'ab-built'));
    this.jobs = [];
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
