import { Injectable, computed, signal } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { get, getDatabase, onValue, push, ref, remove, set, update } from 'firebase/database';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { firebaseConfig } from '../firebase-config';
import { DRIVE_API, DriveImage, DriveListing, normalizeImageUrl } from '../shared/drive-url';

export type QueueStatus = 'waiting' | 'playing' | 'played';
export interface QueueItem {
  id: string;
  name: string;
  time: string;
  uid: string;
  status: QueueStatus;
  photo?: string; // Google profile picture, only when the user opted in
  hasAccount?: boolean; // registered while signed in with Google
}
export interface WinLose {
  win: number;
  lose: number;
}
export interface UserStats {
  name?: string; // last name used in the queue
  games?: Record<string, WinLose>;
}
export interface Game {
  id: string;
  name: string;
}
export interface HistoryItem {
  id: string;
  name: string;
  game: string;
  playedAt: number;
}
export interface Settings {
  activeGame: string;
  queueLimit: number;
  listOpacity: number;
  wrHidden?: string[]; // games whose win-rate cards are hidden (control + register)
  showHands?: boolean; // hands-holding-card overlay on register (when one card shown)
  siteTitle?: string; // home hero title override (th)
  siteTitleEn?: string; // home hero title override (en)
  tagline?: string; // home tagline override (th)
  taglineEn?: string; // home tagline override (en)
  aboutText?: string; // nav About dropdown override (th)
  aboutTextEn?: string; // nav About dropdown override (en)
  lanyardOff?: boolean; // hide the 3D lanyard badge on home
  lanyardFront?: string; // card front image URL (ID-1 ratio, cover-fit)
  lanyardBack?: string; // card back image URL
  charOff?: boolean; // hide the hero character (parallax stack) on home
  charImg?: string; // hero character image URL override (default assets/raika_2.png)
  charImgOff?: boolean; // ignore charImg and use the default asset (URL kept for later)
  charX?: number; // hero character offset px (+ = right)
  charY?: number; // hero character offset px (+ = down)
  charScale?: number; // hero character size percent (default 100)
  schedOff?: boolean; // hide the schedule-week panel on home
  schedKey?: string; // keyword that picks the schedule post (default "schedule week")
  schedLabel?: string; // schedule panel tab text override (th, default "Schedule Week")
  schedLabelEn?: string; // schedule panel tab text override (en)
  heroButtons?: HeroButton[]; // home hero buttons (empty/unset = default join-queue button)
  clipsOff?: boolean; // hide the latest-clips section on home
  statsOff?: boolean; // hide the channel subscriber pill on home
  postsOff?: boolean; // hide the community-posts section on home
  regCharOff?: boolean; // hide the character on the register page
  regCharImg?: string; // register character image override (default assets/raika_1.png)
  regCharImgOff?: boolean; // ignore regCharImg (URL kept for later)
  regCharX?: number; // register character offset px (+ = right)
  regCharY?: number; // register character offset px (+ = down)
  regCharScale?: number; // register character size percent (default 100)
  regWrX?: number; // register win-rate panel offset px (+ = right)
  regWrY?: number; // register win-rate panel offset px (+ = down)
  regHandLeft?: string; // left hand image URL override (default crop of assets/hands.png)
  regHandRight?: string; // right hand image URL override
  regHandScale?: number; // both hands size percent (default 100)
  regHandLX?: number; // left hand offset px (+ = right)
  regHandLY?: number; // left hand offset px (+ = down)
  regHandRX?: number; // right hand offset px (+ = right)
  regHandRY?: number; // right hand offset px (+ = down)
  navTitle?: string; // nav brand text override (default "Kerori Raika")
  navLogo?: string; // nav logo image URL override (default assets/raika_1.png)
  navXUrl?: string; // social link URL overrides (default = current links)
  navYtUrl?: string;
  navTwitchUrl?: string;
  navDonateUrl?: string;
  navDiscordUrl?: string;
  navFeaturesOff?: boolean; // hide the ฟีเจอร์ dropdown
  navAdminOff?: boolean; // hide the Admin dropdown (even for admins)
  navFeatureItems?: HeroButton[]; // ฟีเจอร์ dropdown items (empty/unset = default join-queue link)
  navXOff?: boolean; // hide individual social icons
  navYtOff?: boolean;
  navTwitchOff?: boolean;
  navDonateOff?: boolean;
  navDiscordOff?: boolean;
}

export interface HeroButton {
  th: string; // label (Thai)
  en: string; // label (English)
  url: string; // "/path" = internal route, otherwise external link
}

// Feature on/off flags editable from the admin site-settings page
export type FeatureFlag =
  | 'lanyardOff'
  | 'charOff'
  | 'charImgOff'
  | 'schedOff'
  | 'clipsOff'
  | 'statsOff'
  | 'postsOff'
  | 'regCharOff'
  | 'regCharImgOff'
  | 'navFeaturesOff'
  | 'navAdminOff'
  | 'navXOff'
  | 'navYtOff'
  | 'navTwitchOff'
  | 'navDonateOff'
  | 'navDiscordOff'
  | 'showHands';

const DEFAULT_SETTINGS: Settings = {
  activeGame: 'Cardfight Vanguard DD2',
  queueLimit: 0,
  listOpacity: 0.55,
};
export const DEFAULT_GAMES = ['Cardfight Vanguard DD2', 'Yu-Gi-Oh! Master Duel'];

// Firebase RTDB keys cannot contain '.', standard workaround is '.' -> ','
function encodeEmail(email: string): string {
  return email.toLowerCase().replace(/\./g, ',');
}

// Game names as RTDB keys: strip forbidden characters . # $ [ ] /
export function gameKey(name: string): string {
  return name.replace(/[.#$\[\]\/]/g, ',');
}

function bangkokTime(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const bkk = new Date(utc + 3600000 * 7);
  return `${String(bkk.getHours()).padStart(2, '0')}:${String(bkk.getMinutes()).padStart(2, '0')}`;
}

@Injectable({ providedIn: 'root' })
export class QueueService {
  private app = initializeApp(firebaseConfig);
  private db = getDatabase(this.app);
  private auth = getAuth(this.app);

  readonly queue = signal<QueueItem[]>([]);
  readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly games = signal<Game[]>([]);
  readonly history = signal<HistoryItem[]>([]);
  readonly adminEmails = signal<string[]>([]);
  readonly terms = signal<{ id: string; text: string }[]>([]);
  readonly user = signal<User | null>(null);
  readonly isAdmin = signal(false);
  // Raika's overall record per game, and per-user records vs Raika
  readonly winrate = signal<Record<string, WinLose>>({});
  readonly userStats = signal<Record<string, UserStats>>({});

  readonly playing = computed(() => this.queue().find((i) => i.status === 'playing') ?? null);
  readonly waiting = computed(() => this.queue().filter((i) => i.status === 'waiting'));
  // Dropdown options; falls back to the two original games until master data exists
  readonly gameNames = computed(() =>
    this.games().length ? this.games().map((g) => g.name) : DEFAULT_GAMES,
  );
  // Games whose win-rate cards are visible (shared setting, affects register too)
  readonly visibleWrGames = computed(() => {
    const hidden = this.settings().wrHidden ?? [];
    return this.gameNames().filter((g) => !hidden.includes(g));
  });
  // Queue rows with the original color rules: played = gray, playing = neon green,
  // 4th waiting onward = yellow warn
  readonly rows = computed(() => {
    let pendingCount = 0;
    return this.queue().map((item) => {
      let colorClass = 'color-normal';
      if (item.status === 'played') colorClass = 'color-played';
      else if (item.status === 'playing') colorClass = 'color-playing';
      else if (++pendingCount >= 4) colorClass = 'color-warn';
      return { item, colorClass };
    });
  });

  private adminUnsub: (() => void) | null = null;

  constructor() {
    onValue(ref(this.db, 'queue'), (snap) => {
      const items: QueueItem[] = [];
      snap.forEach((c) => {
        items.push({ id: c.key!, ...c.val() });
      });
      this.queue.set(items);
    });
    onValue(ref(this.db, 'settings'), (snap) =>
      this.settings.set({ ...DEFAULT_SETTINGS, ...snap.val() }),
    );
    onValue(ref(this.db, 'games'), (snap) => {
      const items: Game[] = [];
      snap.forEach((c) => {
        items.push({ id: c.key!, name: c.val().name });
      });
      this.games.set(items);
    });
    onValue(ref(this.db, 'history'), (snap) => {
      const items: HistoryItem[] = [];
      snap.forEach((c) => {
        items.push({ id: c.key!, ...c.val() });
      });
      this.history.set(items.reverse()); // newest first
    });
    onValue(ref(this.db, 'terms'), (snap) => {
      const items: { id: string; text: string }[] = [];
      snap.forEach((c) => {
        items.push({ id: c.key!, text: String(c.val()) });
      });
      this.terms.set(items);
    });
    onValue(ref(this.db, 'winrate'), (snap) => this.winrate.set(snap.val() ?? {}));
    onValue(ref(this.db, 'userStats'), (snap) => this.userStats.set(snap.val() ?? {}));
    onValue(ref(this.db, 'adminEmails'), (snap) => {
      const list: string[] = [];
      snap.forEach((c) => {
        list.push(String(c.val()));
      });
      this.adminEmails.set(list);
    });
    onAuthStateChanged(this.auth, (user) => {
      this.user.set(user);
      this.adminUnsub?.();
      this.adminUnsub = null;
      if (user?.email) {
        this.adminUnsub = onValue(ref(this.db, `adminEmails/${encodeEmail(user.email)}`), (snap) =>
          this.isAdmin.set(snap.exists()),
        );
      } else {
        this.isAdmin.set(false);
      }
    });
  }

  async ensureAnonymousAuth(): Promise<void> {
    // wait for the persisted session to restore first — checking currentUser too early
    // would sign in anonymously OVER an existing Google session (shared storage,
    // e.g. the admin preview iframe logging the whole site out)
    await this.auth.authStateReady();
    if (!this.auth.currentUser) await signInAnonymously(this.auth);
  }

  // Returns an error message, or null on success
  async register(name: string, photoUrl: string | null = null): Promise<string | null> {
    name = name.trim();
    if (!name) return null;
    const { queueLimit } = this.settings();
    // ponytail: limit enforced client-side only (RTDB rules cannot count children);
    // add a Cloud Function if viewers ever abuse it
    if (queueLimit > 0 && this.queue().length >= queueLimit) {
      return 'คิวเต็มแล้ว ไม่สามารถลงทะเบียนเพิ่มได้';
    }
    await this.ensureAnonymousAuth();
    const user = this.auth.currentUser!;
    const item: Record<string, unknown> = {
      name,
      time: bangkokTime(),
      uid: user.uid,
      status: 'waiting',
    };
    if (user.email) item['hasAccount'] = true;
    if (photoUrl) item['photo'] = photoUrl;
    await push(ref(this.db, 'queue'), item);
    return null;
  }

  statsFor(game: string): { win: number; lose: number; total: number; pct: string } {
    const s = this.winrate()[gameKey(game)] ?? { win: 0, lose: 0 };
    const win = s.win ?? 0;
    const lose = s.lose ?? 0;
    const total = win + lose;
    return { win, lose, total, pct: total ? ((win / total) * 100).toFixed(1) + '%' : '-' };
  }

  // Logged-in user's own record vs Raika, null when signed out / no data
  myStatsFor(game: string): WinLose | null {
    const u = this.user();
    if (!u?.email) return null;
    const s = this.userStats()[u.uid]?.games?.[gameKey(game)];
    return s ? { win: s.win ?? 0, lose: s.lose ?? 0 } : null;
  }

  // Any user's record for a game (for showing WR next to queue names)
  statsForUser(
    uid: string,
    game: string,
  ): { win: number; lose: number; total: number; pct: string } | null {
    const s = this.userStats()[uid]?.games?.[gameKey(game)];
    if (!s) return null;
    const win = s.win ?? 0;
    const lose = s.lose ?? 0;
    const total = win + lose;
    if (!total) return null;
    return { win, lose, total, pct: ((win / total) * 100).toFixed(1) + '%' };
  }

  // Admin adjusts Raika's global record only (manual correction)
  adjustWinrate(game: string, field: 'win' | 'lose', delta: 1 | -1): void {
    const key = gameKey(game);
    const cur = this.winrate()[key] ?? { win: 0, lose: 0 };
    update(ref(this.db), {
      [`winrate/${key}/${field}`]: Math.max(0, (cur[field] ?? 0) + delta),
    });
  }

  // Admin records a match result for a specific queue player.
  // result = the PLAYER's result vs Raika: player win -> Raika lose (and vice versa).
  // Saved to the player's personal record when they registered signed-in, and if the
  // player is currently playing the queue advances (same as pressing >).
  recordResult(item: QueueItem, result: 'win' | 'lose'): void {
    const game = this.settings().activeGame;
    const key = gameKey(game);
    const raikaField = result === 'win' ? 'lose' : 'win';
    const cur = this.winrate()[key] ?? { win: 0, lose: 0 };
    const updates: Record<string, unknown> = {
      [`winrate/${key}/${raikaField}`]: (cur[raikaField] ?? 0) + 1,
    };
    if (item.hasAccount) {
      const uCur = this.userStats()[item.uid]?.games?.[key]?.[result] ?? 0;
      updates[`userStats/${item.uid}/games/${key}/${result}`] = uCur + 1;
      updates[`userStats/${item.uid}/name`] = item.name;
    }
    if (item.status === 'playing') {
      updates[`queue/${item.id}/status`] = 'played';
      const histKey = push(ref(this.db, 'history')).key;
      updates[`history/${histKey}`] = { name: item.name, game, playedAt: Date.now() };
      const first = this.waiting()[0];
      if (first) updates[`queue/${first.id}/status`] = 'playing';
    }
    update(ref(this.db), updates);
  }

  deleteItem(id: string): void {
    remove(ref(this.db, `queue/${id}`));
  }

  // Same behavior as the old server's admin_next: current player finishes
  // (logged to history), first waiting player becomes active; at queue end nobody plays.
  next(): void {
    const playing = this.playing();
    const first = this.waiting()[0];
    const updates: Record<string, unknown> = {};
    if (playing) {
      updates[`queue/${playing.id}/status`] = 'played';
      const histKey = push(ref(this.db, 'history')).key;
      updates[`history/${histKey}`] = {
        name: playing.name,
        game: this.settings().activeGame,
        playedAt: Date.now(),
      };
    }
    if (first) updates[`queue/${first.id}/status`] = 'playing';
    if (Object.keys(updates).length) update(ref(this.db), updates);
  }

  reset(): void {
    remove(ref(this.db, 'queue'));
  }

  setActiveGame(name: string): void {
    update(ref(this.db, 'settings'), { activeGame: name });
  }

  setQueueLimit(n: number): void {
    if (!isNaN(n) && n >= 0) update(ref(this.db, 'settings'), { queueLimit: n });
  }

  toggleWrGame(game: string): void {
    const hidden = this.settings().wrHidden ?? [];
    const next = hidden.includes(game) ? hidden.filter((g) => g !== game) : [...hidden, game];
    update(ref(this.db, 'settings'), { wrHidden: next });
  }

  setSiteText(
    patch: Partial<
      Pick<
        Settings,
        | 'siteTitle'
        | 'siteTitleEn'
        | 'tagline'
        | 'taglineEn'
        | 'aboutText'
        | 'aboutTextEn'
        | 'schedKey'
        | 'schedLabel'
        | 'schedLabelEn'
        | 'navTitle'
        | 'navLogo'
        | 'navXUrl'
        | 'navYtUrl'
        | 'navTwitchUrl'
        | 'navDonateUrl'
        | 'navDiscordUrl'
      >
    >,
  ): void {
    update(ref(this.db, 'settings'), patch);
  }

  setShowHands(v: boolean): void {
    update(ref(this.db, 'settings'), { showHands: v });
  }

  // Session cache so revisiting a folder shows content instantly (stale-while-revalidate)
  private driveCache = new Map<string, DriveListing>();

  cachedDriveListing(folder?: string): DriveListing | null {
    return this.driveCache.get(folder || 'root') ?? null;
  }

  async listDriveImages(folder?: string): Promise<DriveListing> {
    const r = await fetch(`${DRIVE_API}/list${folder ? '?folder=' + folder : ''}`);
    if (!r.ok) throw new Error('list failed');
    const data: DriveListing = await r.json();
    this.driveCache.set(folder || 'root', data);
    return data;
  }

  async uploadDriveImage(file: File, folder?: string): Promise<DriveImage> {
    const u = this.user();
    if (!u) throw new Error('not signed in');
    const token = await u.getIdToken();
    const fd = new FormData();
    fd.append('file', file);
    if (folder) fd.append('folder', folder);
    const r = await fetch(`${DRIVE_API}/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || 'upload failed');
    return body;
  }

  async createDriveFolder(name: string): Promise<void> {
    const u = this.user();
    if (!u) throw new Error('not signed in');
    const token = await u.getIdToken();
    const r = await fetch(`${DRIVE_API}/folder`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'create folder failed');
  }

  // folder = target folder id, null = back to the root folder
  async moveDriveImage(id: string, folder: string | null): Promise<void> {
    const u = this.user();
    if (!u) throw new Error('not signed in');
    const token = await u.getIdToken();
    const r = await fetch(`${DRIVE_API}/file/${id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ parent: folder || 'root' }),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'move failed');
  }

  async renameDriveImage(id: string, name: string): Promise<void> {
    const u = this.user();
    if (!u) throw new Error('not signed in');
    const token = await u.getIdToken();
    const r = await fetch(`${DRIVE_API}/file/${id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error((await r.json()).error || 'rename failed');
  }

  async deleteDriveImage(id: string): Promise<void> {
    const u = this.user();
    if (!u) throw new Error('not signed in');
    const token = await u.getIdToken();
    const r = await fetch(`${DRIVE_API}/file/${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error((await r.json()).error || 'delete failed');
  }

  setFlag(patch: Partial<Pick<Settings, FeatureFlag>>): void {
    update(ref(this.db, 'settings'), patch);
  }

  setCharPos(
    patch: Partial<
      Pick<
        Settings,
        | 'charX'
        | 'charY'
        | 'charScale'
        | 'regCharX'
        | 'regCharY'
        | 'regCharScale'
        | 'regWrX'
        | 'regWrY'
        | 'regHandScale'
        | 'regHandLX'
        | 'regHandLY'
        | 'regHandRX'
        | 'regHandRY'
      >
    >,
  ): void {
    update(ref(this.db, 'settings'), patch);
  }

  setRegCharImg(url: string): void {
    let u = normalizeImageUrl(url.trim());
    if (u.startsWith(DRIVE_API)) u += '?s=2500';
    update(ref(this.db, 'settings'), { regCharImg: u || null });
  }

  setHandImg(field: 'regHandLeft' | 'regHandRight', url: string): void {
    update(ref(this.db, 'settings'), { [field]: normalizeImageUrl(url.trim()) || null });
  }

  // Clears the given settings fields so their defaults apply again
  resetSettings(fields: readonly (keyof Settings)[]): void {
    const patch: Record<string, null> = {};
    for (const f of fields) patch[f] = null;
    update(ref(this.db, 'settings'), patch);
  }

  setHeroButtons(list: HeroButton[]): void {
    update(ref(this.db, 'settings'), { heroButtons: list.length ? list : null });
  }

  setNavFeatureItems(list: HeroButton[]): void {
    update(ref(this.db, 'settings'), { navFeatureItems: list.length ? list : null });
  }

  setCharImg(url: string): void {
    // empty input clears the override (falls back to the default asset)
    let u = normalizeImageUrl(url.trim());
    // hero renders big — ask the image proxy for a larger size than its 1000px default
    if (u.startsWith(DRIVE_API)) u += '?s=2500';
    update(ref(this.db, 'settings'), { charImg: u || null });
  }

  setLanyard(patch: Partial<Pick<Settings, 'lanyardOff' | 'lanyardFront' | 'lanyardBack'>>): void {
    // Google Drive share links get rewritten to their direct-image endpoint
    if (patch.lanyardFront) patch.lanyardFront = normalizeImageUrl(patch.lanyardFront);
    if (patch.lanyardBack) patch.lanyardBack = normalizeImageUrl(patch.lanyardBack);
    update(ref(this.db, 'settings'), patch);
  }

  setListOpacity(v: number): void {
    if (!isNaN(v) && v >= 0 && v <= 1) update(ref(this.db, 'settings'), { listOpacity: v });
  }

  addGame(name: string): void {
    name = name.trim();
    if (name) push(ref(this.db, 'games'), { name });
  }

  removeGame(id: string): void {
    remove(ref(this.db, `games/${id}`));
  }

  clearHistory(): void {
    remove(ref(this.db, 'history'));
  }

  addTerm(text: string): void {
    text = text.trim();
    if (text) push(ref(this.db, 'terms'), text);
  }

  removeTerm(id: string): void {
    remove(ref(this.db, `terms/${id}`));
  }

  addAdmin(email: string): void {
    email = email.trim().toLowerCase();
    if (email) set(ref(this.db, `adminEmails/${encodeEmail(email)}`), email);
  }

  removeAdmin(email: string): void {
    remove(ref(this.db, `adminEmails/${encodeEmail(email)}`));
  }

  async loginGoogle(): Promise<void> {
    const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
    // Bootstrap: first Google login ever claims admin (rules only allow this
    // write while adminEmails is still empty)
    if (cred.user.email) {
      const snap = await get(ref(this.db, 'adminEmails'));
      if (!snap.exists()) this.addAdmin(cred.user.email);
    }
  }

  logout(): Promise<void> {
    return signOut(this.auth);
  }
}
