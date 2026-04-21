import { Injectable, inject, signal } from '@angular/core';
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

import { FirebaseService } from './firebase.service';
import { UserService } from './user.service';

export interface RankingEntry {
  nickname: string;
  score: number;
  date: Date;
  country?: string;
  city?: string;
}

@Injectable({ providedIn: 'root' })
export class RankingService {
  private readonly firebase = inject(FirebaseService);
  private readonly users = inject(UserService);

  private readonly _entries = signal<RankingEntry[]>([]);
  private readonly _loading = signal(false);
  private _currentGameType = '';

  readonly entries = this._entries.asReadonly();
  readonly loading = this._loading.asReadonly();

  private async fetchLocation(): Promise<{ country?: string; city?: string }> {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) return {};
      const data = await res.json();
      return {
        country: (data.country_code as string) || undefined,
        city: (data.city as string) || undefined,
      };
    } catch {
      return {};
    }
  }

  async saveScore(gameType: string, score: number): Promise<void> {
    const user = this.users.currentUser();
    const nickname = user?.nick?.trim() || 'anonymous';
    const { country, city } = await this.fetchLocation();
    const col = collection(this.firebase.firestore, 'rankings', gameType, 'scores');
    const payload: Record<string, unknown> = { nickname, score, date: serverTimestamp() };
    if (country) payload['country'] = country;
    if (city) payload['city'] = city;
    await addDoc(col, payload);
  }

  async loadRanking(gameType: string): Promise<void> {
    if (this._currentGameType === gameType && this._entries().length > 0) return;
    this._currentGameType = gameType;
    this._loading.set(true);
    try {
      const q = query(
        collection(this.firebase.firestore, 'rankings', gameType, 'scores'),
        orderBy('score', 'desc'),
        limit(100),
      );
      const snap = await getDocs(q);
      this._entries.set(
        snap.docs.map((doc) => {
          const d = doc.data();
          const ts = d['date'] as Timestamp | null;
          return {
            nickname: (d['nickname'] as string) || 'anonymous',
            score: d['score'] as number,
            date: ts ? ts.toDate() : new Date(),
            country: (d['country'] as string) || undefined,
            city: (d['city'] as string) || undefined,
          };
        }),
      );
    } catch (err) {
      console.error('Failed to load ranking', err);
      this._entries.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  async refreshRanking(gameType: string): Promise<void> {
    this._currentGameType = '';
    await this.loadRanking(gameType);
  }
}
