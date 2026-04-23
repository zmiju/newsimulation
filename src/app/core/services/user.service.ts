import { Injectable, inject, signal, computed } from '@angular/core';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { User } from '../models/user.model';
import { Plan, Scenario } from '../models/scenario.model';

const LS_LAST_USER = 'last_user';

/**
 * Stores the signed-in user plus their saved plans and finished-game history.
 * Data is persisted in localStorage, scoped per user email, matching the original
 * `userService` behaviour. Firestore is used for remote persistence when the user
 * signs in; there is no legacy PHP endpoint.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
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
  setCurrentUser(user: User, persistToCloud = true): void {
    this._currentUser.set({ ...user });
    localStorage.setItem(LS_LAST_USER, JSON.stringify(user));
    if (persistToCloud) {
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
}
