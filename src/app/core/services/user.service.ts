import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ConfigService } from './config.service';
import { FirebaseService } from './firebase.service';
import { User, HighScore } from '../models/user.model';
import { Plan, Scenario } from '../models/scenario.model';

const LS_LAST_USER = 'last_user';

/**
 * Stores the signed-in user plus their saved plans and finished-game history.
 * Data is persisted in localStorage, scoped per user email, matching the original
 * `userService` behaviour. The backend call for "consent" and "score" is preserved
 * but non-blocking; errors are logged only (as in the AngularJS version).
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly firebase = inject(FirebaseService);

  // ── Reactive state ────────────────────────────────────────────────────
  private readonly _currentUser  = signal<User | null>(null);
  private readonly _savedPlans   = signal<Plan[]>([]);
  private readonly _history      = signal<Scenario[]>([]);

  readonly currentUser = this._currentUser.asReadonly();
  readonly savedPlans  = this._savedPlans.asReadonly();
  readonly history     = this._history.asReadonly();
  readonly isSignedIn  = computed(() => this._currentUser() !== null);

  constructor() {
    const raw = localStorage.getItem(LS_LAST_USER);
    if (raw) {
      try {
        const user = JSON.parse(raw) as User;
        if (user?.email) this.setCurrentUser(user, false);
      } catch {
        // ignore corrupt payload
      }
    }
  }

  // ── Auth / identity ──────────────────────────────────────────────────
  setCurrentUser(user: User, sendToBackend = true): void {
    this._currentUser.set({ ...user });
    localStorage.setItem(LS_LAST_USER, JSON.stringify(user));
    if (sendToBackend) {
      this.sendToBackend(user);
      this.saveUserToFirestore(user);
    }
    this.restoreStateFromStorage();
  }

  resetLastSignedUser(): void {
    this._currentUser.set(null);
    localStorage.setItem(LS_LAST_USER, '');
  }

  // ── Plans ────────────────────────────────────────────────────────────
  savePlan(scenario: Scenario): void {
    if (!scenario.plan) return;
    this.removeSavedPlan(scenario.id);
    const plan: Plan = JSON.parse(JSON.stringify(scenario.plan));
    plan.id = scenario.id;
    plan.name = scenario.name;
    this._savedPlans.update((list) => [...list, plan]);
    this.saveStateToStorage();
  }

  removeSavedPlan(id: number): void {
    this._savedPlans.update((list) => list.filter((p) => p.id !== id));
    this.saveStateToStorage();
  }

  getSavedPlan(id: number): Plan | undefined {
    return this._savedPlans().find((p) => p.id === id);
  }

  // ── History ──────────────────────────────────────────────────────────
  addToHistory(scenario: Scenario): void {
    const snapshot: Scenario = JSON.parse(JSON.stringify(scenario));
    this._history.update((list) => [...list, snapshot]);
    this.saveStateToStorage();
  }

  // ── Persistence ──────────────────────────────────────────────────────
  private saveStateToStorage(): void {
    const u = this._currentUser();
    if (!u?.email) return;
    localStorage.setItem(`${u.email}_saved_scenarios`, JSON.stringify(this._savedPlans()));
    localStorage.setItem(`${u.email}_history`,         JSON.stringify(this._history()));
  }

  private restoreStateFromStorage(): void {
    const u = this._currentUser();
    if (!u?.email) return;

    const plansRaw = localStorage.getItem(`${u.email}_saved_scenarios`);
    if (plansRaw) {
      try { this._savedPlans.set(JSON.parse(plansRaw) as Plan[]); }
      catch { this._savedPlans.set([]); }
    } else {
      this._savedPlans.set([]);
    }

    const histRaw = localStorage.getItem(`${u.email}_history`);
    if (histRaw) {
      try { this._history.set(JSON.parse(histRaw) as Scenario[]); }
      catch { this._history.set([]); }
    } else {
      this._history.set([]);
    }
  }

  // ── Firestore (best-effort, fire-and-forget) ─────────────────────────
  private async saveUserToFirestore(user: User): Promise<void> {
    try {
      const payload: Record<string, unknown> = {
        nick: (user.nick || '').slice(0, 64),
        function: user.function,
        createdAt: serverTimestamp(),
      };
      if (user.email) payload['email'] = user.email.slice(0, 256);
      if (typeof user.termsAccepted === 'boolean') {
        payload['termsAccepted'] = user.termsAccepted;
      }
      await addDoc(collection(this.firebase.firestore, 'users'), payload);
    } catch (err) {
      console.log('error saving user to Firestore', err);
    }
  }

  // ── Backend (best-effort, fire-and-forget) ───────────────────────────
  private sendToBackend(user: User): void {
    const params = new HttpParams()
      .set('stan',    'zgoda')
      .set('email',   user.email)
      .set('nick',    user.nick)
      .set('funkcja', user.function);

    this.http.post(`${this.config.backendUrl}/ajax.php`, null, { params })
      .subscribe({
        next:  () => console.log(`User ${user.email} sent to backend`),
        error: (err) => console.log('error requesting backend', err),
      });
  }

  sendHighScore(score: HighScore): void {
    const u = this._currentUser();
    if (!u) return;

    const params = new HttpParams()
      .set('stan',   'koniec')
      .set('r',      Math.round(score.points).toString())
      .set('spi',    Math.round(score.spi).toString())
      .set('cpi',    Math.round(score.cpi).toString())
      .set('poziom', (score.level + 11).toString())
      .set('nick',   u.nick);

    this.http.post(`${this.config.backendUrl}/ajax.php`, null, { params })
      .subscribe({
        next:  () => console.log(`High score of user ${u.nick} sent to backend`),
        error: (err) => console.log('error requesting backend', err),
      });
  }
}
