import { Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import { QueueService } from '../services/queue.service';
import { UiService } from '../services/ui.service';

// "Agents are building this section" reveal. Every card / heading / button in
// the host starts hidden. When the section scrolls into view three labelled
// agent cursors pull jobs from ONE shared queue (DOM order, so two agents never
// work the same element):
//  - Layout DRAWS the section box (agentBuild="frame") corner to corner, and
//    DRAGS its elements in from off-screen left into their slot
//  - Color / Type select the element, run a progress bar, then it fades in
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
const FLY = 320; // cursor travel time between jobs (matches .ab-agent transition)
const DRAW_MS = 750; // frame drawing time
const DRAG_MS = 650; // drag-in time
const DRAG_EASE = 'cubic-bezier(0.4, 0, 0.3, 1)';

type Box = { x: number; y: number; w: number; h: number };

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
  // agentBuild="frame": the host's own box (bg/border) is hidden too and is the first job
  private readonly frame = this.host.getAttribute('agentBuild') === 'frame';

  constructor() {
    if (!this.ui.motion() || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.host.classList.add('ab-wait');
    if (this.frame) this.host.classList.add('ab-frame', 'ab-host');
    // ponytail: 3s cap so an offline RTDB never leaves the section stuck hidden
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
  private box(el: HTMLElement): Box {
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
    h.classList.remove('ab-wait'); // per-element states take over
    if (this.frame) jobs.unshift(h);
    if (!jobs.length) return this.finish();

    if (getComputedStyle(h).position === 'static') {
      h.style.position = 'relative';
      this.restorePos = true;
    }
    const layer = (this.layer = document.createElement('div'));
    layer.className = 'ab-layer';
    h.appendChild(layer);
    const hw = h.clientWidth;

    const mk = (cls: string, color: string, html: string) => {
      const d = document.createElement('div');
      d.className = cls;
      d.style.setProperty('--ab-c', color);
      d.innerHTML = html;
      layer.appendChild(d);
      return d;
    };
    // ms > 0 = custom-timed move (drawing / dragging); 0 = normal flight easing from css
    const moveCursor = (c: HTMLElement, x: number, y: number, ms = 0, ease = 'linear') => {
      c.style.transition = ms ? `transform ${ms}ms ${ease}, opacity 0.4s` : '';
      c.style.transform = `translate(${x}px, ${y}px)`;
    };
    const place = (s: HTMLElement, b: Box, ms = 0) => {
      s.style.transition = ms ? `width ${ms}ms linear, height ${ms}ms linear, opacity 0.2s` : '';
      s.style.transform = `translate(${b.x}px, ${b.y}px)`;
      s.style.width = `${b.w}px`;
      s.style.height = `${b.h}px`;
    };
    const runBar = (s: HTMLElement, ms: number) => {
      const bar = s.firstElementChild as HTMLElement;
      bar.style.cssText = 'transition:none;width:0';
      void bar.offsetWidth; // restart from 0
      bar.style.cssText = `transition:width ${ms}ms linear;width:100%`;
    };
    const built = (el: HTMLElement) => {
      el.style.transform = el.style.transition = '';
      el.classList.remove('ab-pend', 'ab-busy', 'ab-drag');
      el.classList.add('ab-built');
    };

    let next = 0;
    let busy = AGENTS.length;
    const work = (i: number, c: HTMLElement, s: HTMLElement) => {
      const el = jobs[next++];
      if (!el) {
        // queue empty: this agent leaves; last one out ends the show
        c.classList.add('ab-leave');
        if (--busy === 0) this.at(500, () => this.finish());
        return;
      }
      const b = this.box(el);
      const done = (ms: number) => this.at(ms, () => work(i, c, s));
      s.style.opacity = '0';

      if (el === h) {
        // Layout draws the section box: press top-left, drag to bottom-right
        moveCursor(c, b.x, b.y);
        place(s, { ...b, w: 0, h: 0 });
        this.at(FLY, () => {
          s.style.opacity = '1';
          void s.offsetWidth;
          place(s, b, DRAW_MS);
          moveCursor(c, b.x + b.w, b.y + b.h, DRAW_MS);
        });
        this.at(FLY + DRAW_MS, () => {
          h.classList.remove('ab-frame');
          s.style.opacity = '0';
          done(150);
        });
        return;
      }

      // grab point on the element (kept constant while dragging)
      const ox = Math.min(b.w * 0.25, 60);
      const oy = Math.min(b.h * 0.3, 40);

      if (i === 0) {
        // Layout drags the element in from the screen's left edge (40% of it still
        // off-screen at the start, so the pickup is visible) into its slot
        const dx = -(b.x + h.getBoundingClientRect().left) - b.w * 0.4;
        moveCursor(c, b.x + dx + ox, b.y + oy);
        this.at(FLY, () => {
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, 0)`;
          el.classList.remove('ab-pend');
          el.classList.add('ab-drag');
          void el.offsetWidth;
          el.style.transition = `transform ${DRAG_MS}ms ${DRAG_EASE}`;
          el.style.transform = 'translate(0, 0)';
          moveCursor(c, b.x + ox, b.y + oy, DRAG_MS, DRAG_EASE);
        });
        this.at(FLY + DRAG_MS, () => {
          built(el);
          moveCursor(c, b.x + ox, b.y + oy);
          done(160);
        });
        return;
      }

      // Color / Type: select + progress bar, then the element fades in
      const ms = JOB_MS[0] + Math.random() * (JOB_MS[1] - JOB_MS[0]);
      moveCursor(c, b.x + ox, b.y + oy);
      place(s, b);
      this.at(FLY, () => {
        s.style.opacity = '1';
        runBar(s, ms);
        el.classList.add('ab-busy');
      });
      this.at(FLY + ms, () => {
        built(el);
        s.style.opacity = '0';
        done(120);
      });
    };

    AGENTS.forEach((a, i) => {
      const s = mk('ab-sel', a.color, '<div class="ab-bar"></div>');
      const c = mk(
        'ab-agent',
        a.color,
        '<svg viewBox="0 0 16 16" class="ab-ptr"><path d="M1 1l5 14 2-6 6-2z"/></svg>' +
          `<span class="ab-tag">${a.name}</span>`,
      );
      c.style.transform = `translate(${(hw * (i + 1)) / 4}px, -50px)`; // enter from above
      // staggered start; with a frame the others wait until Layout has drawn the box
      this.at(this.frame && i ? FLY + DRAW_MS + i * 140 : 60 + i * 140, () => work(i, c, s));
    });
  }

  private finish(): void {
    this.host.classList.remove('ab-wait', 'ab-frame', 'ab-host');
    this.jobs.forEach((el) => {
      el.classList.remove('ab-pend', 'ab-busy', 'ab-built', 'ab-drag');
      if (el !== this.host) el.style.transform = el.style.transition = '';
    });
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
