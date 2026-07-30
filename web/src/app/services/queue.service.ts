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
import { DRIVE_API, DriveImage, normalizeImageUrl } from '../shared/drive-url';

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
  siteTitle?: string; // home hero title override
  tagline?: string; // home tagline override
  aboutText?: string; // nav About dropdown override
  lanyardOff?: boolean; // hide the 3D lanyard badge on home
  lanyardFront?: string; // card front image URL (ID-1 ratio, cover-fit)
  lanyardBack?: string; // card back image URL
}

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

  setSiteText(patch: Partial<Pick<Settings, 'siteTitle' | 'tagline' | 'aboutText'>>): void {
    update(ref(this.db, 'settings'), patch);
  }

  setShowHands(v: boolean): void {
    update(ref(this.db, 'settings'), { showHands: v });
  }

  async listDriveImages(): Promise<DriveImage[]> {
    const r = await fetch(`${DRIVE_API}/list`);
    if (!r.ok) throw new Error('list failed');
    return r.json();
  }

  async uploadDriveImage(file: File): Promise<DriveImage> {
    const u = this.user();
    if (!u) throw new Error('not signed in');
    const token = await u.getIdToken();
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`${DRIVE_API}/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || 'upload failed');
    return body;
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
