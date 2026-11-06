import { Component, OnDestroy, ViewEncapsulation, afterNextRender, inject } from '@angular/core';
import { QueueService } from '../../services/queue.service';
import { UiService } from '../../services/ui.service';

// Page-load "swarm rebuild": the home page starts blank, a swarm of Figma-style
// multiplayer cursors orbits the favicon, then fans out and rebuilds every box,
// image and text block of the real page (crosshair drags with W x H badges, gray
// placeholders, typed text, ruler guides, alt-drag duplicates for repeated cards),
// then flocks around the mouse. Own implementation of the look of the
// swarm-cursors extension (that repo has no license, no code taken from it).
//
// The real DOM is never cloned: items are hidden with sw-* classes at snapshot
// time and revealed in place. All overlay UI lives in one fixed layer.
// Plays on every load of the home page (Esc / close skips it). Off when settings.agentAnimOff, the nav motion
// switch is off, or the OS asks for reduced motion.

type Box = { x: number; y: number; w: number; h: number };
type Part = { n: Text; full: string; segs: string[] };
type Mode = 'arrow' | 'cross' | 'ibeam' | 'dup' | 'ew' | 'ns';
type Kind = 'rect' | 'media' | 'text';
type Phase = 'intro' | 'build' | 'done' | 'exit';

interface Tween { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; bend: number; drag: boolean; res: () => void }
interface Agent {
  id: number; name: string; color: string; el: HTMLElement;
  x: number; y: number; vx: number; vy: number; rot: number; press: number; down: boolean; mode: Mode;
  maxV: number; force: number; spin: number; curl: number; orbit: number;
  phys: boolean; tw?: Tween; busy: boolean; home: boolean; worked: boolean; leaving: boolean;
  idleAt: number; nextWander: number;
}
interface Item { el: HTMLElement; kind: Kind; parent?: Item; fixed: boolean; task?: Task; guide?: Guide; tx: number; ty: number; sc: number }
interface Task { y: number; gate: number; fixed: boolean; deps: Task[]; state: 0 | 1 | 2; guide?: boolean; run: (a: Agent) => Promise<void> }
interface Group { master: HTMLElement; done: HTMLElement[]; masterTasks: Task[] }
interface Guide { axis: 'v' | 'h'; pos: number; cur: number; members: Item[]; task?: Task; el?: HTMLElement; alpha: number; flash: number; placedAt: number; lastDone: number; dragging: boolean }
interface Vis { measure(): void; paint(): void; remove(): void; box?: Box | null; blue?: boolean }

const PALETTE = ['#F24E1E', '#A259FF', '#1ABCFE', '#0ACF83', '#FF7262', '#FFC700', '#9747FF', '#E8467C', '#14AE5C', '#0D99FF', '#FF8A00', '#00B5CE'];
const NAMES = ['Ada', 'Linus', 'Grace', 'Alan', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Hedy', 'Tim', 'Radia', 'Vint', 'Frances', 'John', 'Katherine', 'Edsger', 'Donald', 'Sophie'];
const BLUE = '#0D99FF';
const RED = '#F24822';
const ROOTS = 'site-nav, home-page .upper';
const SKIP = 'lanyard-badge, .photo-lightbox, script, style, noscript, template, .sw-root';
const MEDIA = 'img, svg, canvas, video, iframe';
const STEPS = [24, 32, 40, 48, 56, 64, 72, 88, 104];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const alpha = (c: string) => (c === 'transparent' ? 0 : c.startsWith('rgba') ? parseFloat(c.split(',')[3]) : 1);
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); // Thai marks stay on their base char

// cursor art, 24-unit grid drawn at 28px. Hotspot = element origin.
const ARROW = 'M5.5 3.9 20.4 10.2Q21.6 10.8 20.4 11.4L13.7 13.7 11.4 20.4Q10.8 21.6 10.2 20.4Z';
const SVG = (cls: string, hx: number, hy: number, body: string) =>
  `<svg class="${cls}" viewBox="0 0 24 24" style="left:${-hx * 28 / 24}px;top:${-hy * 28 / 24}px">${body}</svg>`;
const DUO = (d: string) => `<path d="${d}" class="sw-o"/><path d="${d}" class="sw-i"/>`;
const CURSOR_HTML =
  SVG('m-arrow', 5, 3.5, `<path d="${ARROW}" class="sw-a"/>`) +
  SVG('m-cross', 12, 12, DUO('M12 3.5v17M3.5 12h17')) +
  SVG('m-ibeam', 12, 12, DUO('M8.5 4.5c2 0 3.5.6 3.5 2v11c0 1.4-1.5 2-3.5 2M15.5 4.5c-2 0-3.5.6-3.5 2M12 17.5c0 1.4 1.5 2 3.5 2')) +
  SVG('m-dup', 5, 3.5, `<path d="${ARROW}" class="sw-b" transform="translate(3.4 3)"/><path d="${ARROW}" class="sw-a"/>`) +
  SVG('m-ew', 12, 12, DUO('M3.5 12h17M7 8.5 3.5 12 7 15.5M17 8.5l3.5 3.5-3.5 3.5')) +
  SVG('m-ns', 12, 12, DUO('M12 3.5v17M8.5 7 12 3.5 15.5 7M8.5 17l3.5 3.5 3.5-3.5'));
const IMG_ICON =
  '<svg viewBox="0 0 24 24" class="sw-ico"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5.5 3.5 3.5 2.5-2.5L21 18"/></svg>';

@Component({
  selector: 'swarm-build',
  template: '',
  styleUrl: './swarm-build.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class SwarmBuildComponent implements OnDestroy {
  private readonly svc = inject(QueueService);
  private readonly ui = inject(UiService);

  private live = false;
  private phase: Phase = 'intro';
  private root?: HTMLElement;
  private visLayer!: HTMLElement;
  private curLayer!: HTMLElement;
  private guideLayer!: HTMLElement;
  private fav?: HTMLElement;
  private hud!: HTMLElement;
  private rt!: HTMLCanvasElement;
  private rl!: HTMLCanvasElement;
  private rc!: HTMLElement;

  private agents: Agent[] = [];
  private tasks: Task[] = [];
  private items: Item[] = [];
  private guides: Guide[] = [];
  private known: Element[] = [];
  private typing: Part[] = [];
  private vis = new Set<Vis>();
  private frameFns = new Set<() => void>();
  private waits: { at: number; res: () => void }[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private offs: (() => void)[] = [];

  private clock = 0; // script seconds
  private realT = 0; // real seconds since start
  private last = 0;
  private raf = 0;
  private tempoMul = 1;
  private nextId = 0;
  private frontier = 0;
  private scrollVel = 0;
  private lastScrollY = 0;
  private mouse: { x: number; y: number; t: number } | null = null;
  private mouseV = { x: 0, y: 0 };
  private ready = false;
  private introMin = 1.5;
  private lastSpawn = 0;
  private doneAt = 0;
  private startedAt = 0;
  private builtIn = 0;
  private rulerV = 0;
  private guidesBusy = 0;
  private guideEnd = -9;
  private tour = false;
  private tourV = 0;
  private tourAcc = 0;
  private hudAt = 0;
  private workedCount = 0;
  private maxAgents = 48;

  constructor() {
    if (!this.ui.motion() || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('sw-boot');
    afterNextRender(() => this.boot());
  }

  private async boot(): Promise<void> {
    // ponytail: 3s cap so an offline RTDB never leaves the page blank
    await Promise.race([this.svc.settingsReady, new Promise((r) => setTimeout(r, 3000))]);
    if (this.svc.settings().agentAnimOff) return void document.documentElement.classList.remove('sw-boot');
    this.start();
  }

  // ---------------------------------------------------------------- lifecycle

  private start(): void {
    this.live = true;
    this.phase = 'intro';
    this.ready = false;
    this.clock = this.realT = 0;
    this.startedAt = performance.now();
    this.frontier = scrollY + innerHeight;
    this.lastScrollY = scrollY;
    this.maxAgents = innerWidth < 700 ? 24 : 48;
    document.documentElement.classList.add('sw-boot');
    this.buildOverlay();
    const n = innerWidth < 700 ? 12 : 18;
    for (let i = 0; i < n; i++) this.spawn(i < 8, i % 2 ? 'r' : 'l', true);
    this.listen();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.settle().then(() => {
      if (!this.live) return;
      this.snapshot();
      // sw-run hides unmarked (late) elements, so it must come after the walk
      document.documentElement.classList.add('sw-run');
      document.documentElement.classList.remove('sw-boot');
      this.ready = true;
    });
  }

  // wait until Angular / data loads stop changing the page (max 2.5s), then fonts (max 1.2s)
  private settle(): Promise<void> {
    return new Promise((resolve) => {
      const roots = [...document.querySelectorAll(ROOTS)];
      let quiet: ReturnType<typeof setTimeout>;
      const mo = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(done, 400); });
      const cap = setTimeout(() => done(), 2500);
      let fired = false;
      const done = () => {
        if (fired) return;
        fired = true;
        mo.disconnect();
        clearTimeout(cap);
        clearTimeout(quiet);
        Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]).then(() => resolve());
      };
      roots.forEach((r) => mo.observe(r, { childList: true, subtree: true, characterData: true }));
      quiet = setTimeout(done, 400);
    });
  }

  private listen(): void {
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void) => {
      addEventListener(t, f as EventListener, { passive: true });
      this.offs.push(() => removeEventListener(t, f as EventListener));
    };
    on('mousemove', (e) => {
      const now = performance.now();
      if (this.mouse) {
        const dt = Math.max(1, now - this.mouse.t) / 1000;
        this.mouseV.x += ((e.clientX - this.mouse.x) / dt - this.mouseV.x) * 0.3;
        this.mouseV.y += ((e.clientY - this.mouse.y) / dt - this.mouseV.y) * 0.3;
      }
      this.mouse = { x: e.clientX, y: e.clientY, t: now };
    });
    on('wheel', () => { this.introMin = 0; });
    on('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  // Esc / close: fade the overlay fast, page is restored underneath
  private close(): void {
    if (!this.live || !this.root) return;
    this.root.style.transition = 'opacity .25s';
    this.root.style.opacity = '0';
    this.revealAll();
    this.later(260, () => this.teardown());
  }

  private goLive(): void {
    if (this.phase === 'exit') return;
    this.phase = 'exit';
    this.agents.forEach((a) => {
      a.phys = false;
      a.leaving = true;
      const left = a.x - scrollX < innerWidth / 2;
      this.move(a, left ? scrollX - 60 : scrollX + innerWidth + 60, a.y, 0.8);
    });
    this.hud.classList.add('sw-out');
    this.later(450, () => {
      if (!this.root) return;
      this.root.style.transition = 'opacity .6s';
      this.root.style.opacity = '0';
    });
    this.later(1150, () => this.teardown());
  }

  private replay(): void {
    this.revealAll();
    this.teardown();
    scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    this.start();
  }

  private revealAll(): void {
    this.typing.forEach((p) => (p.n.data = p.full));
    this.typing = [];
    this.items.forEach((it) => {
      it.el.classList.remove('sw-nobox', 'sw-hide', 'sw-notext', 'sw-fadein');
      const s = it.el.style;
      s.transform = s.transition = s.minHeight = s.minWidth = s.clipPath = s.opacity = s.transformOrigin = s.zIndex = s.position = '';
    });
  }

  private teardown(): void {
    if (!this.live) return;
    this.live = false;
    cancelAnimationFrame(this.raf);
    this.revealAll();
    this.timers.forEach(clearTimeout);
    this.offs.forEach((f) => f());
    this.known.forEach((e) => e.classList.remove('sw-k'));
    document.querySelectorAll('.sw-caret').forEach((e) => e.remove());
    this.root?.remove();
    this.root = undefined;
    document.documentElement.classList.remove('sw-boot', 'sw-run');
    this.agents = []; this.tasks = []; this.items = []; this.guides = []; this.known = [];
    this.vis.clear(); this.frameFns.clear(); this.waits = []; this.timers = []; this.offs = [];
    this.tour = false; this.tempoMul = 1; this.guidesBusy = 0; this.rulerV = 0; this.workedCount = 0; this.introMin = 1.5;
  }

  ngOnDestroy(): void {
    this.teardown();
    document.documentElement.classList.remove('sw-boot', 'sw-run');
  }

  private later(ms: number, f: () => void): void {
    this.timers.push(setTimeout(f, ms));
  }

  // ---------------------------------------------------------------- overlay DOM

  private div(cls: string, parent: HTMLElement, html = ''): HTMLElement {
    const d = document.createElement('div');
    d.className = cls;
    if (html) d.innerHTML = html;
    parent.appendChild(d);
    return d;
  }

  private buildOverlay(): void {
    const root = (this.root = this.div('sw-root', document.body));
    const light = document.body.dataset['theme'] === 'light';
    root.style.setProperty('--sw-ph', light ? '#D9D9D9' : '#3B3D42');
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href;
    if (icon) {
      this.fav = this.div('sw-fav', root);
      this.fav.innerHTML = `<img src="${icon}" alt="">`;
      requestAnimationFrame(() => this.fav?.classList.add('sw-in'));
    }
    this.guideLayer = this.div('sw-guides', root);
    this.visLayer = this.div('sw-vis', root);
    this.curLayer = this.div('sw-curs', root);
    this.rt = document.createElement('canvas');
    this.rt.className = 'sw-rt';
    this.rl = document.createElement('canvas');
    this.rl.className = 'sw-rl';
    root.append(this.rt, this.rl);
    this.rc = this.div('sw-rcorner', root);
    this.hud = this.div(
      'sw-hud',
      root,
      '<div class="sw-av"></div><div class="sw-st">Scanning page…</div><div class="sw-pb"><i></i></div>' +
        '<button data-a="tour">Tour</button><button data-a="speed">1×</button>' +
        '<button data-a="live" class="sw-pri">Go live</button><button data-a="replay">Replay</button>' +
        '<button data-a="x" class="sw-x" aria-label="Close">✕</button>',
    );
    this.hud.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      const act = b?.dataset['a'];
      if (act === 'tour') { this.tour = !this.tour; this.introMin = 0; }
      else if (act === 'speed') this.tempoMul = (this.tempoMul % 3) + 1;
      else if (act === 'live') this.goLive();
      else if (act === 'replay') this.replay();
      else if (act === 'x') this.close();
      this.hudAt = 0;
    });
    requestAnimationFrame(() => this.hud.classList.add('sw-in'));
  }

  // ---------------------------------------------------------------- agents

  private spawn(home: boolean, side: 'l' | 'r', intro = false): Agent {
    const id = this.nextId++;
    const color = PALETTE[id % PALETTE.length];
    const el = this.div('sw-c', this.curLayer, CURSOR_HTML);
    el.style.setProperty('--c', color);
    el.dataset['m'] = 'arrow';
    const fast = Math.random() < 0.25;
    const out = intro ? rand(40, 240) : 40;
    const x = side === 'l' ? scrollX - out : scrollX + innerWidth + out;
    const a: Agent = {
      id, name: NAMES[id % NAMES.length], color, el,
      x, y: scrollY + innerHeight * (intro ? rand(0.05, 0.95) : rand(0.2, 0.8)),
      vx: 0, vy: 0, rot: 0, press: 0, down: false, mode: 'arrow',
      maxV: fast ? rand(1000, 1500) : rand(300, 750),
      force: fast ? rand(3500, 6000) : rand(700, 1800),
      spin: fast ? rand(2.2, 3.4) : rand(0.8, 1.8),
      curl: rand(-1, 1), orbit: rand(70, 170),
      phys: intro, busy: false, home, worked: false, leaving: false,
      idleAt: this.realT, nextWander: 0,
    };
    this.agents.push(a);
    return a;
  }

  private setMode(a: Agent, m: Mode): void {
    a.mode = m;
    a.el.dataset['m'] = m;
  }

  private sleep(s: number): Promise<void> {
    return new Promise((res) => this.waits.push({ at: this.clock + s, res }));
  }

  // script-time animation, fn gets progress 0..1
  private anim(s: number, fn: (p: number) => void): Promise<void> {
    const t0 = this.clock;
    const f = () => fn(clamp((this.clock - t0) / s, 0, 1));
    this.frameFns.add(f);
    return this.sleep(s).then(() => { this.frameFns.delete(f); fn(1); });
  }

  private onFrame(fn: () => void): () => void {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }

  private move(a: Agent, x: number, y: number, speed = 1, drag = false): Promise<void> {
    const d = Math.hypot(x - a.x, y - a.y);
    const dur = clamp(0.12 + Math.sqrt(d) * 0.021, 0.14, 0.9) / speed;
    const bend = drag ? 0 : (Math.random() < 0.5 ? -1 : 1) * rand(0.04, 0.14) * Math.min(d, 600);
    a.phys = false;
    a.tw?.res();
    return new Promise((res) => (a.tw = { x0: a.x, y0: a.y, x1: x, y1: y, t0: this.clock, dur, bend, drag, res }));
  }

  private async click(a: Agent): Promise<void> {
    a.press = 1;
    await this.sleep(0.07);
  }

  // ---------------------------------------------------------------- geometry

  private docBox(el: Element): Box {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }

  // screen rect of the element's text (or of the caret while it is empty)
  private textRect(el: Element): Box {
    const rg = document.createRange();
    rg.selectNodeContents(el);
    let r = rg.getBoundingClientRect();
    if (!r.width && !r.height) r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  private applyT(it: Item): void {
    const s = it.el.style;
    if (it.tx || it.ty || it.sc !== 1) {
      const al = getComputedStyle(it.el).textAlign;
      s.transformOrigin = al === 'center' ? 'center top' : al === 'right' || al === 'end' ? 'right top' : 'left top';
      s.transform = `translate(${it.tx}px, ${it.ty}px) scale(${it.sc})`;
    } else s.transform = s.transformOrigin = '';
  }

  // ---------------------------------------------------------------- overlay visuals

  private sel(box: () => Box | null, o: { handles?: boolean; badge?: boolean; color?: string; blue?: boolean } = {}): Vis {
    const d = this.div('sw-sel', this.visLayer);
    d.style.setProperty('--k', o.color ?? BLUE);
    if (o.handles) for (const c of ['tl', 'tr', 'bl', 'br']) this.div(`sw-h ${c}`, d);
    const badge = o.badge ? this.div('sw-badge', d) : null;
    const v: Vis = {
      blue: o.blue ?? (o.color === undefined || o.color === BLUE),
      measure: () => (v.box = box()),
      paint: () => {
        const b = v.box;
        if (!b) return void (d.style.display = 'none');
        d.style.display = '';
        d.style.transform = `translate(${b.x}px, ${b.y}px)`;
        d.style.width = `${b.w}px`;
        d.style.height = `${b.h}px`;
        if (badge) badge.textContent = `${Math.round(b.w)} × ${Math.round(b.h)}`;
      },
      remove: () => { d.remove(); this.vis.delete(v); },
    };
    this.vis.add(v);
    return v;
  }

  private ph(box: () => Box | null, media: boolean): Vis & { fade(icon: boolean): void } {
    const d = this.div('sw-ph', this.visLayer, media ? IMG_ICON : '');
    const v = {
      box: null as Box | null,
      measure: () => (v.box = box()),
      paint: () => {
        const b = v.box;
        if (!b) return void (d.style.display = 'none');
        d.style.display = '';
        d.style.transform = `translate(${b.x}px, ${b.y}px)`;
        d.style.width = `${b.w}px`;
        d.style.height = `${b.h}px`;
      },
      remove: () => { d.remove(); this.vis.delete(v); },
      fade: (icon: boolean) => d.classList.add(icon ? 'sw-noicon' : 'sw-gone'),
    };
    this.vis.add(v);
    return v;
  }

  // red measurement line + px badge between the facing edges of two boxes
  private gap(a: Element, b: Element): Vis {
    const line = this.div('sw-gap', this.visLayer);
    const badge = this.div('sw-badge sw-red', this.visLayer);
    let g: { x: number; y: number; w: number; h: number; n: number; hz: boolean } | null = null;
    const v: Vis = {
      measure: () => {
        const p = a.getBoundingClientRect();
        const q = b.getBoundingClientRect();
        const [l, r] = p.left <= q.left ? [p, q] : [q, p];
        const [t, u] = p.top <= q.top ? [p, q] : [q, p];
        const oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
        const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left);
        if (r.left > l.right && oy > 0) {
          const y = Math.max(p.top, q.top) + oy / 2;
          g = { x: l.right, y, w: r.left - l.right, h: 1, n: r.left - l.right, hz: true };
        } else if (u.top > t.bottom && ox > 0) {
          const x = Math.max(p.left, q.left) + ox / 2;
          g = { x, y: t.bottom, w: 1, h: u.top - t.bottom, n: u.top - t.bottom, hz: false };
        } else g = null;
      },
      paint: () => {
        line.style.display = badge.style.display = g ? '' : 'none';
        if (!g) return;
        line.style.transform = `translate(${g.x}px, ${g.y}px)`;
        line.style.width = `${g.w}px`;
        line.style.height = `${g.h}px`;
        badge.textContent = `${Math.round(g.n)}`;
        badge.style.transform = g.hz
          ? `translate(${g.x + g.w / 2}px, ${g.y + 8}px) translateX(-50%)`
          : `translate(${g.x + 18}px, ${g.y + g.h / 2}px) translateY(-50%)`;
      },
      remove: () => { line.remove(); badge.remove(); this.vis.delete(v); },
    };
    this.vis.add(v);
    return v;
  }

  // ---------------------------------------------------------------- snapshot

  private snapshot(): void {
    const roots = [...document.querySelectorAll<HTMLElement>(ROOTS)];
    const pageBg = getComputedStyle(document.body).backgroundColor;
    const isMedia = (e: Element) => e.matches(MEDIA);

    // repeated siblings: same tag + class, similar size. First = master, rest = copies
    const copyOf = new Map<Element, Group>();
    const masterOf = new Map<Element, Group>();
    const inCopy = (e: Element) => [...copyOf.keys()].some((c) => c.contains(e));
    for (const root of roots) {
      for (const p of [root, ...root.querySelectorAll('*')]) {
        if (p.matches(SKIP) || isMedia(p) || inCopy(p)) continue;
        const by = new Map<string, HTMLElement[]>();
        for (const c of p.children) {
          if (!(c instanceof HTMLElement) || c.matches(SKIP)) continue;
          const r = c.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          const k = `${c.tagName}|${c.className}`;
          by.set(k, [...(by.get(k) ?? []), c]);
        }
        for (const list of by.values()) {
          if (list.length < 2) continue;
          const m = list[0];
          if (!m.children.length && (m.textContent ?? '').trim().length > 40) continue;
          const mr = m.getBoundingClientRect();
          const ratio = (a: number, b: number) => Math.max(a, b) / Math.max(1, Math.min(a, b));
          const ok = list.slice(1).filter((c) => {
            const r = c.getBoundingClientRect();
            return ratio(r.height, mr.height) < 1.8 && ratio(r.width, mr.width) < 1.6;
          });
          if (!ok.length) continue;
          const g: Group = { master: m, done: [m], masterTasks: [] };
          masterOf.set(m, g);
          ok.forEach((c) => copyOf.set(c, g));
        }
      }
    }

    const isBox = (cs: CSSStyleDeclaration) => {
      const bf = cs.backdropFilter || cs.getPropertyValue('-webkit-backdrop-filter');
      const borders = ['Top', 'Right', 'Bottom', 'Left'].every(
        (s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 && alpha(cs.getPropertyValue(`border-${s.toLowerCase()}-color`)) > 0,
      );
      return (alpha(cs.backgroundColor) > 0 && cs.backgroundColor !== pageBg) || cs.backgroundImage !== 'none' ||
        cs.boxShadow !== 'none' || (!!bf && bf !== 'none') || borders;
    };
    const isText = (el: Element) => {
      let has = false;
      for (const n of el.childNodes) {
        if (n.nodeType === 3) { if ((n as Text).data.trim()) has = true; continue; }
        if (n.nodeType !== 1) continue;
        const c = n as Element;
        if (isMedia(c) || c.matches('br')) continue;
        if (!getComputedStyle(c).display.startsWith('inline')) return false;
        if ((c.textContent ?? '').trim()) has = true;
      }
      return has;
    };
    const mark = (e: Element) => {
      e.classList.add('sw-k');
      this.known.push(e);
    };
    const markAll = (e: Element) => [e, ...e.querySelectorAll('*')].forEach(mark);

    const add = (el: HTMLElement, kind: Kind, parent: Item | undefined, fixed: boolean, bucket: Item[] | null, grp: Group | null): Item => {
      const it: Item = { el, kind, parent, fixed, tx: 0, ty: 0, sc: 1 };
      el.classList.add(kind === 'rect' ? 'sw-nobox' : kind === 'media' ? 'sw-hide' : 'sw-notext');
      this.items.push(it);
      if (bucket) { bucket.push(it); return it; }
      const b = this.docBox(el);
      const t: Task = {
        y: b.y, gate: b.y, fixed, deps: parent?.task ? [parent.task] : [], state: 0,
        run: (a) => (kind === 'text' ? this.runText(it, a) : this.runBox(it, a)),
      };
      it.task = t;
      this.tasks.push(t);
      grp?.masterTasks.push(t);
      return it;
    };

    const walk = (el: HTMLElement, parent: Item | undefined, fixed: boolean, bucket: Item[] | null, grp: Group | null, isRoot = false) => {
      if (el.matches(SKIP)) return markAll(el); // left alone, but not "late content" either
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (!isRoot && parseFloat(cs.opacity) <= 0.03)) return markAll(el);
      mark(el);
      const fx = fixed || cs.position === 'fixed' || cs.position === 'sticky';
      const r = el.getBoundingClientRect();
      const visible = r.width >= 1 && r.height >= 1;

      const cg = copyOf.get(el);
      if (cg && !bucket) {
        // a copy: its items are revealed together when an agent alt-drags it in
        const list: Item[] = [];
        walk(el, parent, fx, list, null);
        const b = this.docBox(el);
        const t: Task = {
          y: b.y, gate: b.y, fixed: fx, state: 0,
          deps: [...(parent?.task ? [parent.task] : [])],
          run: (a) => this.runDup(el, cg, list, a),
        };
        // masters are walked first (DOM order), their tasks exist by now
        t.deps.push(...cg.masterTasks);
        this.tasks.push(t);
        return;
      }
      const g = masterOf.get(el) ?? grp;

      if (isMedia(el)) {
        markAll(el);
        if (visible) add(el, 'media', parent, fx, bucket, g);
        return;
      }
      let box = parent;
      if (visible && isBox(cs)) box = add(el, 'rect', parent, fx, bucket, g);
      if (visible && isText(el)) {
        add(el, 'text', box, fx, bucket, g);
        for (const c of el.children) if (isMedia(c)) walk(c as HTMLElement, box, fx, bucket, g);
          else markAll(c);
        return;
      }
      for (const c of el.children) walk(c as HTMLElement, box, fx, bucket, g);
    };
    roots.forEach((r) => walk(r, undefined, false, null, null, true));
    this.findGuides();

    // a parent unlocks as soon as anything that waits on it would
    for (let changed = true; changed; ) {
      changed = false;
      for (const t of this.tasks)
        for (const d of t.deps)
          if (t.gate < d.gate) { d.gate = t.gate; changed = true; }
    }
  }

  // 3+ texts sharing a left edge = vertical guide, 3+ sharing a top = horizontal guide
  private findGuides(): void {
    const texts = this.items.filter((it) => it.kind === 'text').map((it) => {
      const r = this.textRect(it.el);
      return { it, x: r.x + scrollX, y: r.y + scrollY, w: r.w, fs: parseFloat(getComputedStyle(it.el).fontSize) };
    }).filter((t) => t.fs >= 13 && t.w > 30);
    const groupBy = (key: (t: (typeof texts)[0]) => number) => {
      const m = new Map<number, typeof texts>();
      texts.forEach((t) => {
        const k = Math.round(key(t));
        const hit = [...m.keys()].find((q) => Math.abs(q - k) <= 1.5);
        m.set(hit ?? k, [...(m.get(hit ?? k) ?? []), t]);
      });
      return m;
    };
    const make = (axis: 'v' | 'h', pos: number, list: typeof texts) => {
      if (this.guides.length >= 8) return;
      const own = list.filter((t) => t.it.task && !t.it.guide);
      if (list.length < 3 || !own.length) return;
      const top = Math.min(...list.map((t) => t.y));
      const snap = axis === 'v'
        ? own.filter((t) => t.y - top < 450).sort((a, b) => b.fs - a.fs).slice(0, 2)
        : own.slice(0, 1);
      if (!snap.length) return;
      const g: Guide = { axis, pos, cur: pos, members: snap.map((t) => t.it), alpha: 0, flash: 0, placedAt: 0, lastDone: 0, dragging: false };
      snap.forEach((t) => (t.it.guide = g));
      const t: Task = { y: top - 30, gate: top - 30, fixed: false, deps: [], state: 0, guide: true, run: (a) => this.runGuide(g, a) };
      g.task = t;
      this.tasks.push(t);
      this.guides.push(g);
    };
    groupBy((t) => t.x).forEach((list, k) => {
      const ys = list.map((t) => t.y);
      if (Math.max(...ys) - Math.min(...ys) < 900) make('v', k, list);
    });
    groupBy((t) => t.y).forEach((list, k) => make('h', k, list));
  }

  // ---------------------------------------------------------------- tasks

  private async runBox(it: Item, a: Agent): Promise<void> {
    const el = it.el;
    const r0 = this.docBox(el);
    const big = r0.w * r0.h > 0.4 * innerWidth * innerHeight;
    let fx = 0;
    let fy = 0;
    const live = (): Box => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width * fx, h: r.height * fy };
    };
    const clip = () => big && (el.style.clipPath = `inset(0 ${(1 - fx) * 100}% ${(1 - fy) * 100}% 0)`);
    this.setMode(a, 'cross');
    await this.move(a, r0.x, r0.y);
    a.press = 1;
    a.down = true;
    await this.sleep(0.07);
    const ph = big ? null : this.ph(live, it.kind === 'media');
    if (big) {
      clip();
      it.kind === 'media' ? el.classList.remove('sw-hide') : el.classList.remove('sw-nobox');
    }
    const s = this.sel(live, { handles: true, badge: true });
    const off = this.onFrame(() => {
      const r = el.getBoundingClientRect();
      fx = clamp((a.x - scrollX - r.left) / Math.max(1, r.width), 0, 1);
      fy = clamp((a.y - scrollY - r.top) / Math.max(1, r.height), 0, 1);
      clip();
    });
    const ex = Math.min(r0.x + r0.w, scrollX + innerWidth - 30);
    const ey = Math.min(r0.y + r0.h, scrollY + innerHeight - 40);
    await this.move(a, ex, ey, 0.75, true);
    off();
    if (fx < 1 || fy < 1) {
      const [x0, y0] = [fx, fy];
      await this.anim(0.5, (p) => { fx = x0 + (1 - x0) * easeOut(p); fy = y0 + (1 - y0) * easeOut(p); clip(); });
    }
    fx = fy = 1;
    el.style.clipPath = '';
    a.down = false;
    this.setMode(a, 'arrow');
    await this.sleep(rand(0.18, 0.3));

    if (it.kind === 'media') {
      if (!big) {
        const st = el.style;
        st.transition = 'none';
        st.clipPath = 'inset(0 0 100% 0)';
        st.opacity = '0';
        el.classList.remove('sw-hide');
        void el.getBoundingClientRect();
        st.transition = 'clip-path .6s cubic-bezier(.2,.75,.2,1), opacity .35s';
        st.clipPath = 'inset(0 0 0 0)';
        st.opacity = '1';
        ph?.fade(true);
        this.later(300, () => ph?.fade(false));
        this.later(700, () => (st.transition = st.clipPath = st.opacity = ''));
      }
      await this.sleep(0.5);
    } else {
      if (!big) {
        el.classList.add('sw-fadein');
        el.classList.remove('sw-nobox');
        ph?.fade(false);
        this.later(400, () => el.classList.remove('sw-fadein'));
      }
      await this.sleep(0.35);
    }
    s.remove();
    this.later(500, () => ph?.remove());
  }

  private async runText(it: Item, a: Agent): Promise<void> {
    const el = it.el;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const tb0 = this.textRect(el);
    const g = it.guide;
    if (g) {
      if (g.axis === 'v') { it.tx = rand(28, 64); it.ty = rand(-8, 8); }
      else it.ty = (Math.random() < 0.5 ? -1 : 1) * rand(18, 34);
    }
    const bigHead = fs >= 28 && tb0.h < 400;
    if (bigHead) it.sc = 18 / fs;
    this.applyT(it);

    // text box: drag a ghost frame one line tall (short single lines are just clicked)
    const tb = this.textRect(el);
    const lineH = (parseFloat(cs.lineHeight) || fs * 1.3) * it.sc;
    this.setMode(a, 'cross');
    await this.move(a, tb.x + scrollX, tb.y + scrollY);
    if (tb.w < 140 && tb.h < lineH * 1.5) await this.click(a);
    else {
      a.press = 1;
      a.down = true;
      const sx = a.x;
      const sy = a.y;
      const ghost = this.sel(() => ({ x: sx - scrollX, y: sy - scrollY, w: a.x - sx, h: a.y - sy }), { handles: true, badge: true });
      await this.move(a, sx + tb.w, sy + lineH, 0.9, true);
      a.down = false;
      ghost.remove();
    }

    // type it in
    const parts: Part[] = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null)
      if (n.data.trim() && !n.parentElement?.closest('svg'))
        parts.push({ n, full: n.data, segs: [...graphemes.segment(n.data)].map((s) => s.segment) });
    this.setMode(a, 'ibeam');
    void this.move(a, a.x + rand(-30, 10), a.y + rand(10, 30));
    // keep the slot while the text is short (computed size follows box-sizing)
    el.style.minHeight = cs.height;
    el.style.minWidth = cs.width;
    parts.forEach((p) => (p.n.data = ''));
    this.typing.push(...parts);
    el.classList.remove('sw-notext');
    const caret = document.createElement('span');
    caret.className = 'sw-caret sw-k';
    const outline = this.sel(() => this.textRect(el));
    const total = parts.reduce((s, p) => s + p.segs.length, 0);
    const k = clamp(70 / Math.max(1, total), 0.06, 1);
    for (const p of parts) {
      p.n.after(caret);
      for (const sg of p.segs) {
        if (!this.live) return;
        p.n.data += sg;
        let ms = rand(12, 40);
        if (sg === ' ') ms += rand(0, 30);
        if (sg === '\n') ms += 100;
        if (Math.random() < 0.025) ms += rand(80, 200);
        await this.sleep((ms * k) / 1000);
      }
    }
    this.typing = this.typing.filter((p) => !parts.includes(p));
    await this.sleep(0.12);
    caret.remove();
    el.style.minHeight = el.style.minWidth = '';
    outline.remove();
    this.setMode(a, 'arrow');
    const s = this.sel(() => this.textRect(el), { handles: true, badge: true });

    // headings grow from 18px up through the usual type scale
    if (bigHead) {
      for (const st of STEPS.filter((v) => v > 18 && v < fs)) {
        it.sc = st / fs;
        this.applyT(it);
        await this.sleep(0.06);
      }
      it.sc = 1;
      this.applyT(it);
      await this.sleep(0.15);
    }

    if (g && (it.tx || it.ty)) {
      const t0 = this.clock;
      while (g.task?.state !== 2 && this.clock - t0 < 1.6) await this.sleep(0.05);
      if (g.task?.state === 2) await this.snapDrag(it, g, a);
    }
    if (it.tx || it.ty) {
      const [x0, y0] = [it.tx, it.ty];
      await this.anim(0.3, (p) => { it.tx = x0 * (1 - easeInOut(p)); it.ty = y0 * (1 - easeInOut(p)); this.applyT(it); });
      await this.sleep(0.15);
    }
    it.tx = it.ty = 0;
    this.applyT(it);
    if (g) g.lastDone = this.realT;
    await this.sleep(0.2);
    s.remove();
  }

  // grab the text and drag it onto its guide, it locks within 9px and the guide flashes
  private async snapDrag(it: Item, g: Guide, a: Agent): Promise<void> {
    const r = this.textRect(it.el);
    const gx = r.x + scrollX + Math.min(r.w * 0.4, 60);
    const gy = r.y + scrollY + r.h / 2;
    this.setMode(a, 'arrow');
    await this.move(a, gx, gy);
    a.press = 1;
    a.down = true;
    await this.sleep(0.07);
    const [ox, oy] = [it.tx, it.ty];
    let snapped = false;
    const off = this.onFrame(() => {
      it.tx = ox + (a.x - gx);
      it.ty = oy + (a.y - gy);
      const near = g.axis === 'v' ? Math.abs(it.tx) < 9 : Math.abs(it.ty) < 9;
      if (near) {
        if (g.axis === 'v') it.tx = 0; else it.ty = 0;
        if (!snapped) { snapped = true; g.flash = 1; }
      }
      this.applyT(it);
    });
    const over = rand(3, 6);
    await this.move(a, gx - ox - (g.axis === 'v' ? over : 0), gy - oy - (g.axis === 'h' ? Math.sign(oy) * over : 0), 0.6, true);
    await this.sleep(0.1);
    await this.move(a, gx - ox, gy - oy, 2, true);
    off();
    a.down = false;
    it.tx = it.ty = 0;
    this.applyT(it);
    await this.sleep(0.25);
  }

  private async runGuide(g: Guide, a: Agent): Promise<void> {
    this.guidesBusy++;
    const v = g.axis === 'v';
    const sx = scrollX + (v ? 10 : innerWidth * 0.3);
    const sy = scrollY + (v ? innerHeight * rand(0.3, 0.6) : 10);
    this.setMode(a, 'arrow');
    await this.move(a, sx, sy);
    while (this.rulerV < 0.95 && this.live) await this.sleep(0.05);
    await this.click(a);
    a.down = true;
    this.setMode(a, v ? 'ew' : 'ns');
    g.el = this.div(`sw-guide ${v ? 'sw-gv' : 'sw-gh'}`, this.guideLayer);
    g.alpha = 1;
    g.dragging = true;
    g.placedAt = this.realT;
    const off = this.onFrame(() => (g.cur = v ? a.x : a.y));
    await this.move(a, v ? g.pos : sx + 30, v ? sy + 40 : g.pos, 0.55, true);
    off();
    g.cur = g.pos;
    g.dragging = false;
    a.down = false;
    this.setMode(a, 'arrow');
    await this.sleep(0.25);
    this.guidesBusy--;
    this.guideEnd = this.realT;
  }

  private async runDup(copy: HTMLElement, grp: Group, list: Item[], a: Agent): Promise<void> {
    const db = this.docBox(copy);
    const src = grp.done
      .map((e) => ({ e, b: this.docBox(e) }))
      .sort((p, q) => Math.hypot(p.b.x - db.x, p.b.y - db.y) - Math.hypot(q.b.x - db.x, q.b.y - db.y))[0];
    const sb = src.b;
    const live = (e: Element) => () => {
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const gx = sb.x + Math.min(sb.w * 0.45, 70);
    const gy = sb.y + Math.min(sb.h * 0.45, 70);
    this.setMode(a, 'arrow');
    await this.move(a, gx, gy);
    await this.click(a);
    const s1 = this.sel(live(src.e), { handles: true, badge: true });
    await this.sleep(rand(0.15, 0.3));
    this.setMode(a, 'dup');
    await this.sleep(0.12);
    a.press = 1;
    a.down = true;

    // the copy appears on top of the source, then is alt-dragged into its slot
    list.forEach((it) => it.el.classList.remove('sw-nobox', 'sw-hide', 'sw-notext'));
    const st = copy.style;
    if (getComputedStyle(copy).position === 'static') st.position = 'relative';
    st.zIndex = '5';
    st.transition = 'none';
    const [ox, oy] = [sb.x - db.x, sb.y - db.y];
    st.transform = `translate(${ox}px, ${oy}px)`;
    s1.remove();
    const rs = this.sel(live(src.e), { color: RED });
    const rcp = this.sel(live(copy), { color: RED });
    const gp = this.gap(src.e, copy);
    const off = this.onFrame(() => (st.transform = `translate(${ox + a.x - gx}px, ${oy + a.y - gy}px)`));
    await this.move(a, gx - ox, gy - oy, 0.6, true);
    off();
    a.down = false;
    this.setMode(a, 'arrow');
    st.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)';
    st.transform = 'translate(0px, 0px)';
    rs.remove();
    rcp.remove();
    gp.remove();
    const s2 = this.sel(live(copy), { handles: true, badge: true });
    this.later(350, () => (st.transform = st.transition = st.zIndex = st.position = ''));
    await this.sleep(0.35);
    s2.remove();
    grp.done.push(copy);
  }

  // ---------------------------------------------------------------- frame loop

  private tick = (now: number): void => {
    if (!this.live) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.realT += dt;

    // scroll: velocity reacts fast, decays slowly; the build frontier only grows
    const inst = Math.abs(scrollY - this.lastScrollY) / Math.max(dt, 0.001);
    this.lastScrollY = scrollY;
    this.scrollVel = inst > this.scrollVel ? this.scrollVel + (inst - this.scrollVel) * 0.3 : this.scrollVel * Math.exp(-1.2 * dt);
    if (inst > 0 && this.phase === 'intro') this.introMin = 0;
    this.frontier = Math.max(this.frontier, scrollY + innerHeight);

    const waiting = this.tasks.filter((t) => t.state === 0);
    const avail = waiting.filter((t) => (t.fixed || t.gate <= this.frontier) && t.deps.every((d) => d.state === 2));
    const tempo = clamp(2.1 + this.scrollVel / 900 + (avail.length / Math.max(1, this.agents.length)) * 0.5, 2.1, 4.5) * this.tempoMul;
    this.clock += dt * tempo;

    // resolve sleeps and tweens
    const due = this.waits.filter((w) => w.at <= this.clock);
    if (due.length) {
      this.waits = this.waits.filter((w) => w.at > this.clock);
      due.forEach((w) => w.res());
    }
    for (const a of this.agents) {
      const tw = a.tw;
      if (!tw) continue;
      const p = clamp((this.clock - tw.t0) / tw.dur, 0, 1);
      const e = tw.drag ? easeInOut(p) : easeOut(p);
      const dx = tw.x1 - tw.x0;
      const dy = tw.y1 - tw.y0;
      const d = Math.hypot(dx, dy) || 1;
      const b = Math.sin(Math.PI * e) * tw.bend;
      a.x = tw.x0 + dx * e - (dy / d) * b;
      a.y = tw.y0 + dy * e + (dx / d) * b;
      if (p >= 1) { a.tw = undefined; tw.res(); }
    }
    this.frameFns.forEach((f) => f());

    this.phases(avail, waiting.length, dt);
    this.physics(dt);
    this.render(dt);
    this.raf = requestAnimationFrame(this.tick);
  };

  private phases(avail: Task[], waiting: number, dt: number): void {
    if (this.phase === 'intro') {
      if (this.ready && this.realT >= this.introMin) {
        this.phase = 'build';
        this.builtIn = performance.now();
        this.fav?.classList.add('sw-out');
        this.agents.forEach((a) => { a.phys = false; a.idleAt = this.realT; a.nextWander = 0; });
      }
      return;
    }
    if (this.phase === 'build') {
      const idle = this.agents.filter((a) => !a.busy && !a.leaving && !a.phys);
      for (const a of idle) {
        if (!avail.length) break;
        const top = scrollY - 40;
        const bot = scrollY + innerHeight;
        let best = 0;
        let bestS = Infinity;
        avail.forEach((t, i) => {
          const y = t.fixed ? scrollY + t.y : t.y;
          const bucket = y >= top && y <= bot ? 0 : y < top ? 1 : 2;
          const s = bucket * 1e6 + 0.6 * y + 0.4 * Math.abs(y - a.y) - (t.guide ? 1e7 : 0);
          if (s < bestS) { bestS = s; best = i; }
        });
        const t = avail.splice(best, 1)[0];
        t.state = 1;
        a.busy = true;
        if (!a.worked) { a.worked = true; this.workedCount++; }
        t.run(a).then(() => {
          t.state = 2;
          a.busy = false;
          a.idleAt = this.realT;
          a.nextWander = this.realT + rand(0.1, 0.5);
          this.setMode(a, 'arrow');
        });
      }
      // more agents when there is a backlog or the reader scrolls fast
      const idleN = this.agents.filter((a) => !a.busy && !a.leaving).length;
      const target = clamp(8 + Math.floor(this.scrollVel / 40) + Math.floor(avail.length / 2), 8, this.maxAgents);
      const active = this.agents.filter((a) => !a.leaving).length;
      if (active < target && avail.length > idleN && this.realT - this.lastSpawn > 0.035) {
        this.lastSpawn = this.realT;
        this.spawn(false, Math.random() < 0.5 ? 'l' : 'r');
      }
      // idle: wander inside the viewport, extras leave after 2.5s
      for (const a of this.agents) {
        if (a.busy || a.leaving || a.phys || a.tw) continue;
        if (!a.home && this.realT - a.idleAt > 2.5 && active > 8) {
          a.leaving = true;
          const left = a.x - scrollX < innerWidth / 2;
          this.move(a, left ? scrollX - 60 : scrollX + innerWidth + 60, a.y, 0.8).then(() => {
            a.el.remove();
            this.agents = this.agents.filter((b) => b !== a);
          });
          continue;
        }
        if (this.realT >= a.nextWander) {
          a.nextWander = Infinity;
          this.move(a, scrollX + innerWidth * rand(0.17, 0.83), scrollY + innerHeight * rand(0.2, 0.8), 0.35).then(() => {
            a.nextWander = this.realT + rand(0.4, 1.4);
          });
        }
      }
      // tour: auto-scroll at the pace the crew keeps up with
      if (this.tour) {
        const backlog = avail.length + this.tasks.filter((t) => t.state === 1).length;
        const crew = this.agents.length;
        const want = backlog <= Math.max(4, crew * 0.6) ? 230 : backlog <= crew * 1.5 ? 80 : 0;
        this.tourV += (want - this.tourV) * Math.min(1, dt * 2.5);
        this.tourAcc += this.tourV * dt;
        if (this.tourAcc >= 1) {
          const step = Math.floor(this.tourAcc);
          this.tourAcc -= step;
          scrollBy(0, step);
        }
        if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) this.tour = false;
      }
      if (!waiting && !this.tasks.some((t) => t.state === 1)) {
        this.phase = 'done';
        this.doneAt = this.realT;
        this.builtIn = (performance.now() - this.builtIn) / 1000;
        this.agents.filter((a) => !a.leaving).forEach((a) => (a.phys = true));
        this.hudAt = 0;
      }
      return;
    }
    if (this.phase === 'done') {
      if (this.agents.length < 36 && this.realT - this.lastSpawn > 0.04) {
        this.lastSpawn = this.realT;
        const a = this.spawn(false, Math.random() < 0.5 ? 'l' : 'r');
        a.x += a.x < scrollX ? 10 : -10;
        a.phys = true;
      }
      if (this.realT - this.doneAt > 6) this.goLive(); // visitors don't have to click anything
    }
  }

  // orbit (intro, around the favicon) and flocking (finale, around the mouse)
  private physics(dt: number): void {
    const flock = this.agents.filter((a) => a.phys);
    if (!flock.length) return;
    const T = this.realT;
    const intro = this.phase === 'intro';
    const scale = intro ? 0.7 : 1;
    const m = this.mouse && performance.now() - this.mouse.t < 4000 ? this.mouse : null;
    const cx = scrollX + (intro || !m ? innerWidth / 2 + (intro ? 0 : innerWidth * 0.25 * Math.sin(0.3 * T)) : m.x);
    const cy = scrollY + (intro || !m ? innerHeight / 2 + (intro ? 0 : innerHeight * 0.2 * Math.sin(0.43 * T)) : m.y);
    const base = 135 * scale * (1 + 0.18 * Math.sin(0.55 * T));
    const swirl = 300 * Math.tanh(3 * Math.cos(0.11 * T));
    for (const a of flock) {
      const dx = a.x - cx;
      const dy = a.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const th = Math.atan2(dy, dx);
      const ring = base * (1 + 0.3 * Math.sin(3 * th + 0.7 * T)) + (a.orbit - 120) * 0.55 * scale;
      const tang = swirl * (0.7 + 0.2 * a.spin);
      const radial = clamp(4 * (ring - d), -2600, 1400);
      let wx = ux * radial - uy * tang;
      let wy = uy * radial + ux * tang;
      if (d > ring) {
        const c = Math.min(400, ((d - ring) / 600) * 400) * a.curl;
        wx += -uy * c;
        wy += ux * c;
      }
      let ax = 0;
      let ay = 0;
      let wsum = 0;
      for (const b of flock) {
        if (b === a) continue;
        const nd = Math.hypot(b.x - a.x, b.y - a.y);
        if (nd < 90) { const w = 1 - nd / 90; ax += b.vx * w; ay += b.vy * w; wsum += w; }
      }
      if (wsum) { wx = wx * 0.7 + (ax / wsum) * 0.3; wy = wy * 0.7 + (ay / wsum) * 0.3; }
      const excess = Math.max(0, d - 180 * scale);
      const maxV = a.maxV * (1.3 + Math.min(3.2, excess / 90));
      const maxF = a.force * (1.4 + Math.min(5, excess / 50));
      let sx = (wx - a.vx) * 6;
      let sy = (wy - a.vy) * 6;
      const sf = Math.hypot(sx, sy);
      if (sf > maxF) { sx *= maxF / sf; sy *= maxF / sf; }
      a.vx += sx * dt;
      a.vy += sy * dt;
      const sp = Math.hypot(a.vx, a.vy);
      if (sp > maxV) { a.vx *= maxV / sp; a.vy *= maxV / sp; }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      // hard 48px bubble around the pointer: scatter
      if (m) {
        const mx = m.x + scrollX;
        const my = m.y + scrollY;
        const qx = a.x - mx;
        const qy = a.y - my;
        const qd = Math.hypot(qx, qy);
        if (qd < 48 && qd > 0) {
          const nx = qx / qd;
          const ny = qy / qd;
          a.x = mx + nx * 48;
          a.y = my + ny * 48;
          const rv = (a.vx - this.mouseV.x) * nx + (a.vy - this.mouseV.y) * ny;
          if (rv < 0) { a.vx -= nx * rv * 1.6; a.vy -= ny * rv * 1.6; }
          a.vx += nx * 260;
          a.vy += ny * 260;
        }
      }
    }
  }

  private render(dt: number): void {
    // overlay visuals: read every rect first, then write
    this.vis.forEach((v) => v.measure());
    this.vis.forEach((v) => v.paint());

    for (const a of this.agents) {
      if (a.phys && Math.hypot(a.vx, a.vy) > 30) {
        const want = Math.atan2(a.vy, a.vx) + (128 * Math.PI) / 180;
        let diff = want - a.rot;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.rot += diff * Math.min(1, dt * 8);
      } else if (!a.phys) a.rot *= Math.max(0, 1 - dt * 8);
      if (!a.down) a.press = Math.max(0, a.press - dt * 6);
      const sc = a.down ? 0.88 : 1 - 0.12 * a.press;
      a.el.style.transform = `translate(${a.x - scrollX}px, ${a.y - scrollY}px) rotate(${a.rot}rad) scale(${sc})`;
    }

    // guides: follow scroll, glow on snap, fade once their texts are done
    for (const g of this.guides) {
      if (!g.el) continue;
      g.flash = Math.max(0, g.flash - dt * 1.5);
      const membersDone = g.members.every((it) => it.task?.state === 2);
      const busy = g.members.some((it) => it.task?.state === 1);
      if ((membersDone && this.realT - g.lastDone > 1.2) || (!busy && this.realT - g.placedAt > 7)) g.alpha = Math.max(0, g.alpha - dt * 1.2);
      const p = g.axis === 'v' ? g.cur - scrollX : g.cur - scrollY;
      g.el.style.transform = g.axis === 'v' ? `translateX(${p}px)` : `translateY(${p}px)`;
      g.el.style.opacity = `${g.alpha}`;
      g.el.style.boxShadow = g.flash ? `0 0 ${2 + 3 * g.flash}px ${RED}` : '';
      if (!g.alpha) { g.el.remove(); g.el = undefined; }
    }

    // rulers slide in while guides are being placed, out 0.7s after the last one
    const want = this.guidesBusy > 0 || this.realT - this.guideEnd < 0.7 ? 1 : 0;
    this.rulerV += (want - this.rulerV) * (1 - Math.exp(-10 * dt));
    if (this.rulerV > 0.002) this.drawRulers();
    this.rt.style.transform = `translateY(${-(1 - this.rulerV) * 100}%)`;
    this.rl.style.transform = `translateX(${-(1 - this.rulerV) * 100}%)`;
    this.rc.style.opacity = `${this.rulerV}`;

    if (performance.now() - this.hudAt > 200) this.renderHud();
  }

  private drawRulers(): void {
    const dpr = devicePixelRatio || 1;
    const W = innerWidth;
    const H = innerHeight;
    const prep = (c: HTMLCanvasElement, w: number, h: number) => {
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = '#2c2c2c';
      x.fillRect(0, 0, w, h);
      x.font = '500 9px Inter, system-ui, sans-serif';
      return x;
    };
    const blue = [...this.vis].filter((v) => v.blue && v.box).map((v) => v.box!);
    // top
    const t = prep(this.rt, W, 20);
    t.fillStyle = 'rgba(13,153,255,.22)';
    blue.forEach((b) => t.fillRect(b.x, 0, b.w, 20));
    t.fillStyle = '#5E5E5E';
    for (let wx = Math.floor(scrollX / 50) * 50; wx - scrollX < W; wx += 50) {
      const x = Math.round(wx - scrollX) + 0.5;
      const major = wx % 100 === 0;
      t.fillRect(x, major ? 13 : 16, 1, major ? 7 : 4);
      if (major) { t.fillStyle = '#8c8c8c'; t.fillText(`${wx}`, x + 3, 11); t.fillStyle = '#5E5E5E'; }
    }
    t.fillStyle = BLUE;
    blue.slice(-1).forEach((b) => t.fillText(`${Math.round(b.x + scrollX)}`, b.x + 3, 11));
    t.fillStyle = '#3a3a3a';
    t.fillRect(0, 19, W, 1);
    // left
    const l = prep(this.rl, 20, H);
    l.fillStyle = 'rgba(13,153,255,.22)';
    blue.forEach((b) => l.fillRect(0, b.y, 20, b.h));
    for (let wy = Math.floor(scrollY / 50) * 50; wy - scrollY < H; wy += 50) {
      const y = Math.round(wy - scrollY) + 0.5;
      const major = wy % 100 === 0;
      l.fillStyle = '#5E5E5E';
      l.fillRect(major ? 13 : 16, y, major ? 7 : 4, 1);
      if (major) {
        l.save();
        l.translate(11, y - 3);
        l.rotate(-Math.PI / 2);
        l.fillStyle = '#8c8c8c';
        l.fillText(`${wy}`, 0, 0);
        l.restore();
      }
    }
    l.fillStyle = '#3a3a3a';
    l.fillRect(19, 0, 1, H);
    // red tick + value for a guide being dragged
    for (const g of this.guides) {
      if (!g.dragging) continue;
      const c = g.axis === 'v' ? t : l;
      const p = Math.round(g.axis === 'v' ? g.cur - scrollX : g.cur - scrollY) + 0.5;
      c.fillStyle = RED;
      if (g.axis === 'v') { c.fillRect(p, 0, 1, 20); c.fillText(`${Math.round(g.cur)}`, p + 3, 11); }
      else {
        c.fillRect(0, p, 20, 1);
        c.save(); c.translate(11, p - 3); c.rotate(-Math.PI / 2); c.fillText(`${Math.round(g.cur)}`, 0, 0); c.restore();
      }
    }
  }

  private renderHud(): void {
    this.hudAt = performance.now();
    const h = this.hud;
    const st = h.querySelector<HTMLElement>('.sw-st')!;
    const av = h.querySelector<HTMLElement>('.sw-av')!;
    const bar = h.querySelector<HTMLElement>('.sw-pb i')!;
    const work = this.tasks.filter((t) => !t.guide);
    const done = work.filter((t) => t.state === 2).length;
    const fmt = (n: number) => n.toLocaleString('en-US');
    const b = (s: string | number) => `<b>${s}</b>`;
    const sep = '<i class="sw-sep"></i>';
    h.classList.toggle('sw-complete', this.phase === 'done' || this.phase === 'exit');
    h.querySelector<HTMLElement>('[data-a="tour"]')!.textContent = this.tour ? 'Touring' : 'Tour';
    h.querySelector<HTMLElement>('[data-a="tour"]')!.classList.toggle('sw-on', this.tour);
    h.querySelector<HTMLElement>('[data-a="speed"]')!.textContent = `${this.tempoMul}×`;
    if (this.phase === 'intro') {
      st.innerHTML = this.ready ? `${b(this.agents.length)} agents ready ${sep} ${fmt(work.length)} layers` : 'Scanning page…';
      bar.style.width = '0';
    } else if (this.phase === 'build') {
      const blocked = !this.tour && work.some((t) => t.state === 0) && !this.tasks.some((t) => t.state === 1);
      st.innerHTML = `${b(this.workedCount)} agents ${sep} ${b(done)} / ${fmt(work.length)} layers` +
        (blocked ? `<span class="sw-hint">${sep} scroll to keep building</span>` : '');
      bar.style.width = `${(done / Math.max(1, work.length)) * 100}%`;
    } else {
      st.innerHTML = `Rebuilt by ${b(this.workedCount)} agents in ${b(this.builtIn.toFixed(1) + 's')}`;
      bar.style.width = '100%';
    }
    const busy = this.phase === 'build' ? this.agents.filter((a) => a.busy).slice(0, 5) : [];
    av.innerHTML = busy.map((a) => `<span style="background:${a.color}" title="${a.name}">${a.name[0]}</span>`).join('');
  }
}
