import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteBgComponent } from '../shared/site-bg/site-bg.component';
import { SiteNavComponent } from '../shared/site-nav/site-nav.component';
import { LanyardComponent } from '../shared/lanyard/lanyard.component';
import { HeroButton, QueueService } from '../services/queue.service';
import { UiService } from '../services/ui.service';
import { DRIVE_API } from '../shared/drive-url';

@Component({
  selector: 'home-page',
  imports: [RouterLink, SiteBgComponent, SiteNavComponent, LanyardComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  readonly ui = inject(UiService);
  readonly svc = inject(QueueService);

  // Admin-set hero buttons; none set = the default join-queue button
  readonly heroButtons = computed<HeroButton[]>(() => {
    const list = this.svc.settings().heroButtons;
    return list?.length
      ? list
      : [{ th: this.ui.t().joinQueue, en: this.ui.t().joinQueue, url: '/register' }];
  });

  btnLabel(b: HeroButton): string {
    return (this.ui.lang() === 'th' ? b.th : b.en) || b.en || b.th;
  }

  // hero renders big — ask the image proxy for 2500px (covers values saved before ?s existed)
  readonly img = computed(() => {
    const s = this.svc.settings();
    const u = s.charImgOff ? '' : s.charImg;
    if (!u) return 'assets/raika_2.png';
    return u.startsWith(DRIVE_API) && !u.includes('?') ? `${u}?s=2500` : u;
  });

  // Latest clips from the channel RSS feed (free, no API key) via a CORS proxy.
  // ponytail: allorigins is a third-party free proxy; on failure the template
  // falls back to a plain playlist iframe embed.
  readonly clips = signal<{ id: string; title: string }[]>([]);
  // Live channel stats via socialcounts.org (free, CORS-enabled); hidden on failure
  readonly subs = signal<{ subs: number; views: number; videos: number } | null>(null);

  subsText(): string {
    const s = this.subs();
    if (!s) return '';
    const n = (v: number) => v.toLocaleString();
    return this.ui.lang() === 'th'
      ? `ผู้ติดตาม ${n(s.subs)} คน • ${n(s.views)} วิว • ${n(s.videos)} คลิป`
      : `${n(s.subs)} subscribers • ${n(s.views)} views • ${n(s.videos)} videos`;
  }

  // Community posts scraped from the channel /posts page (no official API)
  readonly posts = signal<{ id: string; text: string; img: string | null }[]>([]);
  // Schedule panel: post containing the admin-set keyword (default "schedule week"),
  // else the latest post with an image. Whitespace-insensitive so "#ScheduleWeek" matches.
  readonly schedule = computed(() => {
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const key = norm(this.svc.settings().schedKey || 'schedule week');
    const sched =
      this.posts().find((p) => p.img && norm(p.text).includes(key)) ??
      this.posts().find((p) => p.img);
    return sched?.img ? { id: sched.id, img: sched.img } : null;
  });
  readonly schedOpen = signal(false);
  readonly viewPost = signal<string | null>(null);

  private async loadPost(): Promise<void> {
    // YouTube sometimes serves a variant without rendered post data - retry a few times.
    // Match '":{' so we hit the real objects, not the renderer-name config list.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(
          'https://ytproxy.meowpow.online/?url=' +
            encodeURIComponent('https://www.youtube.com/@keroriRaika/posts') +
            (attempt ? `&retry=${attempt}` : ''),
        );
        const html = await res.text();
        const segments = html.split('"backstagePostRenderer":{').slice(1, 11);
        const posts: { id: string; text: string; img: string | null }[] = [];
        for (const seg of segments) {
          const chunk = seg.slice(0, 20000);
          const id = chunk.match(/"postId":"([^"]+)"/)?.[1] ?? '';
          const runsRaw = chunk.match(/"contentText":\{"runs":\[(.+?)\]\}/)?.[1] ?? '';
          const text = Array.from(runsRaw.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g))
            .map((m) => JSON.parse('"' + m[1] + '"'))
            .join('');
          let img: string | null = null;
          const imgSec = chunk.indexOf('"backstageImageRenderer":{');
          if (imgSec >= 0) {
            const urls = Array.from(
              chunk.slice(imgSec, imgSec + 6000).matchAll(/"url":"(https:\/\/yt3[^"]+)"/g),
            ).map((m) => m[1]);
            if (urls.length) img = urls[urls.length - 1].replace(/=s\d+[^"]*$/, '=s1280');
          }
          if (id && (text || img)) posts.push({ id, text, img });
        }
        if (!posts.length) continue;
        this.posts.set(posts);
        return;
      } catch {
        // try again
      }
    }
  }

  private async loadSubs(): Promise<void> {
    try {
      const res = await fetch(
        'https://api.socialcounts.org/youtube-live-subscriber-count/UCjnKbgxO0tCXzNlSsnYjdyg',
      );
      const data = await res.json();
      const c = data?.counters?.api ?? data?.counters?.estimation;
      if (typeof c?.subscriberCount === 'number') {
        this.subs.set({
          subs: c.subscriberCount,
          views: c.viewCount ?? 0,
          videos: c.videoCount ?? 0,
        });
      }
    } catch {
      // stay hidden
    }
  }

  private async loadClips(): Promise<void> {
    const feed = encodeURIComponent(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCjnKbgxO0tCXzNlSsnYjdyg',
    );
    const proxies = [
      `https://ytproxy.meowpow.online/?url=${feed}`, // own proxy (cloudflared tunnel)
      `https://api.allorigins.win/raw?url=${feed}`,
      `https://api.codetabs.com/v1/proxy?quest=${feed}`,
    ];
    for (const url of proxies) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
        const entries = Array.from(xml.getElementsByTagName('entry')).slice(0, 8);
        const clips = entries
          .map((e) => ({
            id: e.getElementsByTagName('yt:videoId')[0]?.textContent ?? '',
            title: e.getElementsByTagName('title')[0]?.textContent ?? '',
          }))
          .filter((c) => c.id);
        if (clips.length) {
          this.clips.set(clips);
          return;
        }
      } catch {
        // try next proxy
      }
    }
    // all proxies failed -> template falls back to the playlist iframe
  }

  // Cursor position normalized to -1..1 from screen center, drives layer parallax
  readonly mx = signal(0);
  readonly my = signal(0);

  constructor() {
    this.loadClips();
    this.loadSubs();
    this.loadPost();
    // Motion switch off: shadows reset to center (background keeps drifting)
    effect(() => {
      if (!this.ui.motion()) {
        this.mx.set(0);
        this.my.set(0);
      }
    });
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this.ui.motion()) return;
    this.mx.set(Math.round((e.clientX / window.innerWidth - 0.5) * 2000) / 1000);
    this.my.set(Math.round((e.clientY / window.innerHeight - 0.5) * 2000) / 1000);
  }
}
